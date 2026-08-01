# ezPLM API 需求（数据库驱动推荐）

> 以下接口**目前均不存在**。本文档描述实现"110 万型号库程序化候选召回"所需的契约，
> 供 ezPLM 侧评估。当前 AltPart Pro 的候选仍由 LLM 生成，属已知限制。

## 现状

官方仅开放两个只读端点（HMAC-SHA256 签名）：

```
GET /api/v1/api-key/parts?keyword=&pageSize=
GET /api/v1/api-key/reference-designs?partlibId=&pageSize=
```

`parts` 仅支持关键词模糊搜索，无法按参数条件检索，因此无法支撑候选召回。

## 需要新增

### 1. 精确 MPN 查询

```
GET /api/v1/parts/exact?mpn=TPS62160DGKR&manufacturer=Texas%20Instruments
→ { part: PartIR } | 404
```
需返回是否 exact match，避免模糊结果冒充精确匹配。

### 2. 品类参数模板

```
GET /api/v1/categories/{categoryId}/template
→ { categoryId, name, parameters: [
     { code:"OPAMP.GBW_TYP", name:"增益带宽积", unit:"Hz",
       comparisonSemantics:"higher_better", critical:true }
   ] }
```
参数需带**稳定 code**（非动态 param_1）与规范单位。

### 3. 候选条件检索 ← 最关键

```
POST /api/v1/parts/search
{
  categoryId, 
  filters: [
    { code:"PKG.PIN_COUNT", op:"eq", value:20 },
    { code:"SUPPLY.VMIN", op:"lte", value:3.0, unit:"V" },
    { code:"TEMP.MIN", op:"lte", value:-40, unit:"°C" }
  ],
  exclude:["AD8331ARQZ"],
  manufacturerCountry:["CN"],
  lifecycle:["active"],
  page, pageSize
}
→ { total, items:[PartIR], nextCursor }
```
需支持 50–200 条返回与游标分页。

### 4. PackageVariant / PinDefinition

```
GET /api/v1/parts/{partId}/variants
→ [{ variantId, orderingCode, packageName, pinCount, tempGrade, landPattern }]

GET /api/v1/variants/{variantId}/pins
→ [{ number, name, electricalType, description, isEP, isNC, evidence }]
```
同一芯片不同封装的 Pin Map 必须分开，不能只按基础型号存一套。

### 5. 厂商主数据（国产替代需要）

```
GET /api/v1/manufacturers/{id}
→ { id, name, countryCode, brandOwner, aliases[] }
```
用于确定性判断"是否国产"，替代按品牌名猜测。

### 6. 生命周期与证据

```
GET /api/v1/parts/{partId}/lifecycle
→ { status, source, updatedAt, evidenceUrl }
```

所有返回体建议统一带：

```json
{ "evidence": { "sourceType":"ezplm", "retrievedAt":"...", "confidence":0.98, "verified":true } }
```

## 适配策略

代码侧应先建立 `CandidateRepository` 接口，用 fixture 实现上述能力；
ezPLM 落地后替换实现，无需改动评分与推荐层。**当前尚未建立该接口（见 Backlog）。**
