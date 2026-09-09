const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translateTexts, protect, restore, localTranslation, _cache } = require('../api/_lib/translation');
const { createI18n } = require('../public/i18n/runtime');
const messages = require('../public/i18n/en');

test('interface glossary translates without calling AI and retains surrounding spacing', async () => {
  const result = await translateTexts([' 工作电压 ', '资源下载', 'STM32F103C8T6', '3.3 V'], {
    translator: () => { throw new Error('Must not call AI'); }
  });
  assert.deepEqual(result.map(r=>r.text), [' Operating voltage ', 'Downloads', 'STM32F103C8T6', '3.3 V']);
});
test('technical tokens survive translation exactly; changed, reordered and duplicated tokens fail', () => {
  const p = protect('低功耗 STM32F103C8T6，电压 -0.3–3.6 V，温度 -40 °C');
  const translated = p.masked.replace('低功耗','Low power').replace('电压','voltage').replace('温度','temperature');
  assert.equal(restore(translated,p), 'Low power STM32F103C8T6，voltage -0.3–3.6 V，temperature -40 °C');
  assert.throws(()=>restore(translated.replace(p.values[0].token,'NEW-MPN'),p));
  assert.throws(()=>restore(translated + p.values[0].token,p));
  assert.throws(()=>restore(translated.replace(p.values[0].token,'SWAP').replace(p.values[1].token,p.values[0].token).replace('SWAP',p.values[1].token),p));
  assert.throws(()=>restore(translated+' 99 MHz',p));
  assert.throws(()=>restore(p.masked,p));
});
test('unknown descriptions are batch translated and cached, without mutating input', async () => {
  _cache.clear();let calls = 0;
  const texts = ['超低耗电芯片 XYZ123，供电 3.3 V', '超低耗电芯片 XYZ456，供电 5 V'];
  const original = [...texts];
  const translator = async (system, input, tokens, search) => {
    calls++; assert.equal(search,false);
    return { translations: JSON.parse(input).texts.map(t=>t.replace('超低耗电芯片','Ultra-low-power chip').replace('供电','supply')) };
  };
  const first = await translateTexts(texts,{translator});
  const second = await translateTexts(texts,{translator});
  assert.equal(calls,1);assert.deepEqual(texts,original);
  assert.equal(first[0].text,'Ultra-low-power chip XYZ123，supply 3.3 V');
  assert.equal(first[0].status,'machine_translated');assert.equal(second[0].status,'cached');
});
test('malformed model result and altered technical data are never accepted', async () => {
  await assert.rejects(translateTexts(['新的未知字段'],{translator:async()=>({ translations: [] })}));
  const output = await translateTexts(['工作条件 ABC123 5 V'],{translator:async()=>({translations:['Operates at 9 V']})});
  assert.equal(output[0].status,'unavailable');assert.equal(output[0].text,'工作条件 ABC123 5 V');
});
test('language preference is persistent but translated database content is memory only', async () => {
  const saved = new Map();
  const storage = { getItem:k=>saved.get(k), setItem:(k,v)=>saved.set(k,v) };
  const doc = { documentElement: {}, title:'' };
  const i = createI18n({messages,storage,document:doc});
  assert.equal(i.read('资源下载'),'资源下载');
  i.setLanguage('en');assert.equal(i.read('资源下载'),'Downloads');assert.equal(doc.documentElement.lang,'en');
  assert.equal(createI18n({messages,storage}).language(),'en');
  assert.deepEqual([...saved.keys()],['partbridge.language']);
  i.setLanguage('zh');assert.equal(i.read('资源下载'),'资源下载');assert.equal(doc.documentElement.lang,'zh-CN');
});
test('unknown descriptions are deduplicated and translated in bounded batches', async () => {
  const sizes=[];
  const i = createI18n({messages,initialLanguage:'en',fetcher:async(url, options)=>{
    const texts=JSON.parse(options.body).texts;sizes.push(texts.length);
    assert.equal(url,'/api/v2/translate');assert.ok(texts.join('').length<=12000);
    return {ok:true,json:async()=>({success:true,translations:texts.map((t,index)=>({text:'Description '+index,status:'machine_translated'}))})};
  }});
  const texts=Array.from({length:70},(_,index)=>'未入词典的器件描述 '+index);
  await i.translateAll([...texts,texts[0]]);
  assert.deepEqual(sizes,[32,32,6]);assert.equal(i.read(texts[0]),'Description 0');
  assert.equal(i.failedCount(),0);
});
test('failed translation retains source and can be retried without a request loop',async()=>{
  let calls=0,success=false;
  const i=createI18n({messages,initialLanguage:'en',fetcher:async()=>{calls++;return {ok:success,json:async()=>({success:true,translations:[{text:'Translated description',status:'machine_translated'}]})}}});
  await assert.rejects(i.translateAll(['罕见器件说明']));
  assert.equal(i.read('罕见器件说明'),'罕见器件说明');assert.equal(i.failedCount(),1);
  await assert.rejects(i.translateAll(['罕见器件说明']));assert.equal(calls,1);
  success=true;i.retry();await i.translateAll(['罕见器件说明']);
  assert.equal(i.read('罕见器件说明'),'Translated description');assert.equal(i.failedCount(),0);
});
test('late English responses do not change Chinese presentation after a language switch',async()=>{
  let release;
  const i=createI18n({messages,initialLanguage:'en',fetcher:()=>new Promise(resolve=>{release=resolve})});
  const job=i.translateAll(['器件中文说明']);
  i.setLanguage('zh');
  release({ok:true,json:async()=>({success:true,translations:[{text:'Component description',status:'machine_translated'}]})});
  await job;
  assert.equal(i.read('器件中文说明'),'器件中文说明');
  i.setLanguage('en');assert.equal(i.read('器件中文说明'),'Component description');
});
test('translation route rejects oversized or invalid requests before invoking a provider',async()=>{
  const route=require('../api/v2/translate');
  for (const body of [{targetLanguage:'fr',texts:['参数']},{targetLanguage:'en',texts:[1]},{targetLanguage:'en',texts:Array(33).fill('参数')},{targetLanguage:'en',texts:['长'.repeat(2049)]}]) {
    const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
    await route({method:'POST',headers:{},body},res);assert.equal(res.code,400);
  }
});
test('translation route applies authentication policy',async()=>{
  const old=process.env.ALTPART_REQUIRE_AUTH;
  process.env.ALTPART_REQUIRE_AUTH='true';
  try {
    const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
    await require('../api/v2/translate')({method:'POST',headers:{},body:{targetLanguage:'en',texts:['参数']}},res);
    assert.equal(res.code,401);
  } finally {if(old===undefined)delete process.env.ALTPART_REQUIRE_AUTH;else process.env.ALTPART_REQUIRE_AUTH=old;}
});
