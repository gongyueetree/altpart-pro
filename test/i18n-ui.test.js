const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const wait=async predicate=>{const deadline=Date.now()+3000;while(!predicate()){if(Date.now()>deadline)throw new Error('UI wait timed out');await new Promise(r=>setTimeout(r,10));}};
function setup({analyze}={}){
  const errors=[],requests=[];
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://partbridge.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window;
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.fetch=async(url,options={})=>{
    requests.push({url,body:options.body});
    if(url==='/api/v2/analyze' && analyze)return {ok:true,headers:{get:()=> 'application/json'},json:async()=>analyze(JSON.parse(options.body))};
    if(url==='/api/health')return {ok:true,json:async()=>({service:'PartBridge v7.1.0'})};
    if(url==='/api/v2/translate')return {ok:true,json:async()=>({success:true,translations:JSON.parse(options.body).texts.map(text=>({text:text.replace(/[\u3400-\u9fff]+/g,'Translated'),status:'machine_translated'}))})};
    return {ok:false,status:503,headers:{get:()=> 'application/json'},json:async()=>({success:false})};
  };
  // Execute the exact React version loaded by production, and the actual production bundle.
  for(const name of ['react','react-dom'])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(name)),`umd/${name}.production.min.js`),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'public/i18n/en.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'public/i18n/runtime.js'),'utf8'));
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const bundle=html.match(/src="\.\/(dist\/app\.[^"]+\.js)"/)[1];
  w.eval(fs.readFileSync(path.join(root,'public',bundle),'utf8'));
  return {w,dom,errors,requests,button:text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text)};
}
test('production UI switches languages, preserves input and never requests AI for homepage labels',async()=>{
  const s=setup();try{
    await wait(()=>s.button('English'));
    s.button('STM32F103C8T6').click();await wait(()=>s.w.document.querySelector('input').value==='STM32F103C8T6');
    s.button('English').click();await wait(()=>s.w.document.documentElement.lang==='en');
    await wait(()=>s.button('Search part'));
    assert.match(s.w.document.querySelector('h2').textContent,/Component search/);
    assert.equal(s.w.document.querySelector('input').value,'STM32F103C8T6');
    assert.equal(s.w.document.querySelector('input').placeholder,'Enter a part number, e.g. STM32F103C8T6');
    assert.equal(s.w.document.querySelector('[data-app-version]').textContent,'PartBridge');
    const visible=s.w.document.body.textContent.replace('中文','');
    assert.doesNotMatch(visible,/[\u3400-\u9fff]/);
    assert.equal(s.requests.filter(r=>r.url==='/api/v2/translate').length,0);
    s.button('中文').click();await wait(()=>s.button('查询参数'));
    assert.equal(s.w.document.querySelector('input').value,'STM32F103C8T6');
    assert.match(s.w.document.querySelector('h2').textContent,/查询元器件/);
    assert.deepEqual(s.errors,[]);
  }finally{s.dom.window.close()}
});
test('production workbench keeps procurement controls and original MPN across language switches',async()=>{
  const s=setup();try{
    await wait(()=>s.button('English'));s.button('STM32F103C8T6').click();
    await wait(()=>s.w.document.querySelector('input').value==='STM32F103C8T6');s.button('查询参数').click();
    await wait(()=>s.w.document.querySelector('.workbench'));
    const originalInputs=[...s.w.document.querySelectorAll('input,select')];
    const values=originalInputs.map(e=>e.value);
    s.button('English').click();await wait(()=>s.button('🚀 Find alternatives'));
    assert.match(s.w.document.body.textContent,/Mainstream Cortex-M3 microcontroller/);
    assert.match(s.w.document.body.textContent,/Operating voltage/);
    assert.match(s.w.document.body.textContent,/STM32F103C8T6/);
    assert.deepEqual([...s.w.document.querySelectorAll('input,select')].map(e=>e.value),values);
    originalInputs.forEach(e=>assert.equal(e.isConnected,true));
    s.button('中文').click();await wait(()=>s.button('🚀 AI 智能推荐'));
    assert.match(s.w.document.body.textContent,/主流型Cortex-M3微控制器/);
    assert.deepEqual([...s.w.document.querySelectorAll('input,select')].map(e=>e.value),values);
    assert.deepEqual(s.errors,[]);
  }finally{s.dom.window.close()}
});

test('choosing a variant fetches new parameters and forwards its signed snapshot',async()=>{
 const calls=[];
 const s=setup({analyze:({partNumber})=>{
  calls.push(partNumber);
  return {success:true,analysisContext:partNumber+'-signed',original:{partNumber,manufacturer:'TI',parameters:[{id:partNumber==='TL431'?'param_5':'param_17',name:partNumber==='TL431'?'Family parameter':'Exact variant parameter',value:'2.495',unit:'V'}],variants:[{pn:'TL431ACD',package:'SOIC-8'},{pn:'TL431B',package:'SOT-23'}]}};
 }});
 try{
  await wait(()=>s.button('TL431'));s.button('TL431').click();await wait(()=>s.w.document.querySelector('input').value==='TL431');s.button('查询参数').click();
  await wait(()=>[...s.w.document.querySelectorAll('div')].some(e=>e.textContent==='TL431ACD'));
  [...s.w.document.querySelectorAll('div')].find(e=>e.textContent==='TL431ACD' && e.children.length===0).parentElement.parentElement.click();
  await wait(()=>s.w.document.querySelector('.workbench'));
  assert.deepEqual(calls,['TL431','TL431ACD']);assert.match(s.w.document.body.textContent,/Exact variant parameter/);assert.doesNotMatch(s.w.document.body.textContent,/Family parameter/);
  s.button('🚀 AI 智能推荐').click();await wait(()=>s.requests.some(r=>r.url==='/api/v2/recommend'));
  const sent=JSON.parse(s.requests.find(r=>r.url==='/api/v2/recommend').body);
  assert.equal(sent.partNumber,'TL431ACD');assert.equal(sent.analysisContext,'TL431ACD-signed');assert.deepEqual(sent.priorityOrder,['param_17']);
 }finally{s.dom.window.close()}
});
