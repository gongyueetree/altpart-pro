# ezPLM API 对接说明

对照《API 密钥查询接口用户操作手册》实现。ezPLM 仅开放两个只读接口。

## 鉴权

四个请求头缺一不可：

```
X-API-Key     组织的 API Key（服务端持有，绝不下发到浏览器）
X-Timestamp   Unix 秒级时间戳
X-Nonce       随机串，一次性，防重放
X-Signature   HMAC-SHA256 签名，base64url
```

签名串顺序（手册规定）：

```
METHOD \n PATH \n 排序后的query \n X-Timestamp \n X-Nonce
```

`排序后的query` 规则：过滤空值 → 键字典序（键相同则按值）→ `encodeURIComponent` 拼接。
**`cursor` 参与签名**，翻页时每页都要重新签名。

实现见 `api/ezplm.js` 的 `canonicalQuery()` / `buildSignature()`。

## 两个接口

| 接口 | 参数 | 用途 |
|---|---|---|
| `GET /api/v1/api-key/parts` | `keyword` `cursor` `pageSize` | 物料查询（仅白名单供应商） |
| `GET /api/v1/api-key/reference-designs` | `partlibId`(必填) `cursor` `pageSize` | 参考设计 |

调用顺序固定：先查 `parts` 拿到 `id`，再用该 `id` 作 `partlibId` 查参考设计。

## 分页

返回结构为 `{ data: [...], meta: { timestamp, nextCursor, hasMore } }`。

`callEzplmPaged(path, params, maxPages, fetcher)` 自动按 `meta.nextCursor` 翻页。

> **为什么必须翻页**：TL431 这类系列在 ezPLM 有数百个订货号，
> 精确型号 `TL431ACDBVRG4` 可能落在第二页之后。早期实现只取首页，
> 导致明明收录的器件被判为"未收录"。

`maxPages` 是配额保护：单次查询最多翻 N 页，超出时返回 `truncated: true`。
当前设置：精确检索 3 页 / 同族检索 4 页 / 参考设计 2 页（pageSize=50）。

## 错误处理

| 状态 | 含义 | 本系统行为 |
|---|---|---|
| 400 / 401 | 缺签名头或签名错误 | 返回 `kind: upstream_status` + 提示检查 `EZPLM_API_KEY` 与服务器时钟 |
| 404 | `partlibId` 不存在 | 返回空参考设计列表 |
| **429** | **当日调用次数达上限** | 记录 `quotaExhaustedUntil`，**熔断至次日**不再空转；`/api/health` 可查 `ezplmQuota` |
| 空列表 | 关键词不匹配 **或** 供应商不在白名单 | 日志区分两种可能，不当作"型号不存在" |

## 环境变量

```
EZPLM_API_KEY      必填，服务端持有
EZPLM_BASE_URL     可选，默认 https://www.ezplm.cn（手册示例为 http）
```

## 自检

```bash
curl -s https://<你的域名>/api/ezplm?path=status            # {"configured":true}
curl -s "https://<你的域名>/api/ezplm?path=parts&keyword=RP2350B&pageSize=10"
npm run verify:live https://<你的域名>                       # 覆盖 ezPLM 连通与字段结构
```

## 已知限制

手册仅开放 `parts` 与 `reference-designs` 两个只读接口，**没有**：
批量查询、按参数条件检索、库存价格、PackageVariant、PinDefinition、厂商国别主数据。

因此数据库驱动的候选召回（110 万型号库）暂时无法实现，
所需接口契约见 `docs/EZPLM_API_REQUIREMENTS.md`。
