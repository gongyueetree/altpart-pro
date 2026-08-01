// pin-normalize.js — 引脚号规范化（前端与测试共用同一实现）
// 符号写 "3"、封装写 3 或 " 03 "，EP/PAD/NC 大小写不一，必须归一后才能双向联动。
function normPin(v){
  const s=String(v??"").trim().toUpperCase();
  if(!s)return "";
  if(/^(EP|E\.?P\.?|PAD|THERMAL(PAD)?|EXPOSED(PAD)?)$/.test(s))return "EP";
  if(/^(NC|N\.?C\.?|DNC|NOCONNECT)$/.test(s))return "NC";
  return s.replace(/^0+(?=\d)/,"");
}
const samePin=(a,b)=>{const x=normPin(a),y=normPin(b);return !!x&&x===y;};

module.exports = { normPin, samePin };
