const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const wait=async predicate=>{const deadline=Date.now()+3000;while(!predicate()){if(Date.now()>deadline)throw new Error('UI wait timed out');await new Promise(r=>setTimeout(r,10));}};
function setup(){
  const errors=[],requests=[];
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://partbridge.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window;
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.fetch=async(url,options={})=>{
    requests.push({url,body:options.body});
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
