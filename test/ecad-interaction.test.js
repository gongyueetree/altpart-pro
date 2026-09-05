const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const jsx = require('acorn-jsx');

// Execute the production renderers and event handlers, not a second pin-matching implementation.
const html = fs.readFileSync(require.resolve('../public/index.src.html'), 'utf8');
const code = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const names = ['normPin', 'samePin', 'bindEcadPin', 'sexprBlocks', 'renderFootprintToSvg',
  'renderSymbolToSvg', 'renderKicadSymTo', 'renderEcadPreview', 'attachViewport'];
const ast = acorn.Parser.extend(jsx()).parse(code, {ecmaVersion:2022, sourceType:'script'});
const extracted = ast.body.filter(n => names.includes(n.id?.name || n.declarations?.[0]?.id?.name))
  .map(n => code.slice(n.start,n.end)).join('\n');

function setup() {
  const document = {activeElement:null};
  class Element {
    constructor(tag) { this.tagName=tag; this.attrs={}; this.children=[]; this.handlers={}; this.style={}; }
    setAttribute(k,v) { this.attrs[k]=String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    appendChild(e) { e.parent=this; this.children.push(e); return e; }
    set innerHTML(_) { this.children.forEach(e=>e.parent=null); this.children=[]; }
    get viewBox() { const [x,y,width,height]=(this.getAttribute('viewBox')||'0 0 800 520').split(/\s+/).map(Number); return {baseVal:{x,y,width,height}}; }
    contains(el) { return el===this || this.children.some(c=>c.contains(el)); }
    all() { return this.children.flatMap(c=>[c,...c.all()]); }
    querySelectorAll(selector) { assert.equal(selector,'.ecad-pin'); return this.all().filter(e=>e.getAttribute('class')==='ecad-pin'); }
    focus() { document.activeElement=this; }
    addEventListener(type,fn,capture=false) { (this.handlers[type]??=[]).push({fn,capture:capture===true}); }
    emit(type,fields={}) {
      const e={button:0,pointerId:1,clientX:400,clientY:260, ...fields, target:this,
        preventDefault(){this.defaultPrevented=true;}, stopPropagation(){this.stopped=true;}};
      const path=[]; for(let n=this;n;n=n.parent)path.push(n);
      for(const capture of [true,false])for(const n of capture?[...path].reverse():path) {
        for(const h of n.handlers[type]||[])if(h.capture===capture)h.fn(e);
        if(e.stopped)return e;
      }
      return e;
    }
    setPointerCapture(id) { this.captured=id; }
    releasePointerCapture() { this.captured=null; }
    getBoundingClientRect() { return {left:0,top:0,width:800,height:520}; }
    getScreenCTM() {
      const {x,y,width,height}=this.viewBox.baseVal, s=Math.min(800/width,520/height);
      const tx=(800-width*s)/2-x*s, ty=(520-height*s)/2-y*s;
      return {inverse:()=>({s,tx,ty})};
    }
    createSVGPoint() { return {x:0,y:0,matrixTransform(m){return {x:(this.x-m.tx)/m.s,y:(this.y-m.ty)/m.s};}}; }
  }
  document.createElementNS=(_,tag)=>new Element(tag);
  const api=vm.runInNewContext(extracted+'\n;({'+names.join(',')+'})',{document});
  return {...api, document, svg:()=>new Element('svg')};
}
const sym={shapes:[{kind:'rect',x1:-5,x2:5,y1:-5,y2:5}],pins:[
  {number:'8',name:'VIN',x:-7.54,y:2.54,angle:0,length:2.54,unit:1},
  {number:'9',name:'MODE',x:-7.54,y:0,angle:0,length:2.54,unit:1},
  {number:'15',name:'OUT',x:7.54,y:0,angle:180,length:2.54,unit:2},
]};
const footprint=`(footprint "test"
  (pad "08" smd rect (at -3 0) (size 1.2 0.35))
  (pad "9" smd rect (at -3 0.635) (size 1.2 0.35))
  (pad "15" smd oval (at 3 0 90) (size 1.2 0.35)))`;
const pins=svg=>svg.querySelectorAll('.ecad-pin');
const chosen=svg=>pins(svg).filter(p=>p.getAttribute('aria-pressed')==='true').map(p=>p.getAttribute('data-pin'));
const pin=(svg,n)=>pins(svg).find(p=>p.getAttribute('data-pin')===n);

test('ordinary pointer click reaches the pin and highlights both views; second click clears both',()=>{
  const a=setup(),s=a.svg(),f=a.svg();let selected=null,unit=1;
  const choose=n=>{selected=a.samePin(selected,n)?null:n; const p=sym.pins.find(p=>a.samePin(p.number,n));if(p)unit=p.unit;draw();};
  const draw=()=>{
    a.renderEcadPreview(s,sym,unit,()=>a.renderKicadSymTo(sym,s,choose,selected,unit));
    a.renderEcadPreview(f,footprint,0,()=>a.renderFootprintToSvg(footprint,f,choose,selected));
  };
  draw();
  const p=pin(s,'8');p.emit('pointerdown');
  assert.equal(s.captured,undefined,'pointerdown must not retarget click to the SVG');
  p.emit('pointerup');p.emit('click');
  assert.deepEqual(chosen(s),['8']);assert.deepEqual(chosen(f),['8']);
  pin(f,'9').emit('click');assert.deepEqual(chosen(s),['9']);assert.deepEqual(chosen(f),['9']);
  pin(f,'9').emit('click');assert.deepEqual(chosen(s),[]);assert.deepEqual(chosen(f),[]);
  pin(f,'15').emit('click');assert.equal(unit,2);assert.deepEqual(chosen(s),['15']);assert.deepEqual(chosen(f),['15']);
});

test('selected symbol mark stays on the pin; hit target stays transparent and labels belong to the pin',()=>{
  const a=setup(),s=a.svg();a.renderKicadSymTo(sym,s,()=>{},'8');
  const p=pin(s,'8'),lines=p.children.filter(e=>e.tagName==='line'),circles=p.children.filter(e=>e.tagName==='circle');
  assert.equal(lines[0].getAttribute('stroke'),'transparent');
  assert.ok(Number(lines[1].getAttribute('stroke-width'))<=0.4);
  assert.equal(circles.length,1,'no oversized halo');assert.equal(circles[0].getAttribute('r'),'0.35');
  assert.equal(p.children.filter(e=>e.tagName==='text').length,2);
  assert.equal(pin(s,'9').getAttribute('aria-pressed'),'false');
});

test('selected footprint keeps the exact pad geometry and no neighboring-pad halo',()=>{
  const a=setup(),f=a.svg();a.renderFootprintToSvg(footprint,f,()=>{},'8');
  const p=pin(f,'8'),shapes=p.children.filter(e=>e.tagName!=='text');
  assert.equal(shapes.length,1);assert.equal(shapes[0].getAttribute('width'),'1.2');
  assert.equal(shapes[0].getAttribute('height'),'0.35');assert.equal(shapes[0].getAttribute('stroke-width'),'.04');
  assert.equal(shapes[0].getAttribute('fill'),'#006cff');assert.deepEqual(chosen(f),['8']);
});

test('drag begins after the threshold; drag never selects a pin and small jitter leaves the view unchanged',()=>{
  const a=setup(),s=a.svg();let calls=0;
  a.renderKicadSymTo(sym,s,()=>calls++,null);a.attachViewport(s,true);
  const p=pin(s,'8'),before=s.getAttribute('viewBox');
  p.emit('pointerdown');p.emit('pointermove',{clientX:402});
  assert.equal(s.getAttribute('viewBox'),before);assert.equal(s.captured,undefined);
  p.emit('pointermove',{clientX:420});assert.equal(s.captured,1);assert.notEqual(s.getAttribute('viewBox'),before);
  s.emit('pointerup');p.emit('click');assert.equal(calls,0);
  p.emit('pointerdown');p.emit('pointerup');p.emit('click');assert.equal(calls,1);
});

test('selection preserves zoom, pan, drawing scale and keyboard focus; changing content resets fit',()=>{
  const a=setup(),f=a.svg();
  const draw=sel=>a.renderEcadPreview(f,footprint,0,()=>a.renderFootprintToSvg(footprint,f,()=>{},sel));
  draw(null);const transform=f.children[0].getAttribute('transform');
  f._vp.zoomIn();pin(f,'8').focus();const view=f.getAttribute('viewBox');
  draw('8');assert.equal(f.getAttribute('viewBox'),view);assert.equal(f.children[0].getAttribute('transform'),transform);
  assert.equal(a.document.activeElement,pin(f,'8'));
  draw('9');assert.equal(f.getAttribute('viewBox'),view);f._vp.reset();assert.equal(f.getAttribute('viewBox'),'0 0 800 520');
  f._vp.zoomIn();a.renderEcadPreview(f,footprint+'\n',0,()=>a.renderFootprintToSvg(footprint,f,()=>{},null));
  assert.equal(f.getAttribute('viewBox'),'0 0 800 520');
});

test('Space and Enter activate a normalized pin and suppress page scrolling',()=>{
  const a=setup(),f=a.svg(),calls=[];a.renderFootprintToSvg(footprint,f,n=>calls.push(n),null);
  for(const key of [' ','Enter'])assert.equal(pin(f,'8').emit('keydown',{key}).defaultPrevented,true);
  assert.deepEqual(calls,['8','8']);
});

test('legacy symbol renderer also emits normalized, linked pin events',()=>{
  const a=setup(),s=a.svg(),calls=[];
  a.renderSymbolToSvg('DRAW\nS -200 200 200 -200 1 1 10 f\nX VIN 08 -300 0 100 R 50 50 1 1 I\nENDDRAW',s,1,n=>calls.push(n),'8');
  assert.deepEqual(chosen(s),['8']);pin(s,'8').emit('click');assert.deepEqual(calls,['8']);
});
