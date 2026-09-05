const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.src.html'), 'utf8');
const source = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const ast = acorn.Parser.extend(jsx()).parse(source, {ecmaVersion:2022});
const viewer = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'Step3DViewer');
const load = viewer.body.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'load');
const loadTry = load.body.body.find(n => n.type === 'TryStatement' && n.block.body.some(s =>
  s.type === 'VariableDeclaration' && s.declarations.some(d => d.id.name === 'dynImport')));
const declaration = loadTry.block.body.find(n => n.type === 'VariableDeclaration' &&
  n.declarations.some(d => d.id.name === 'dynImport')).declarations.find(d => d.id.name === 'dynImport');
const loader = source.slice(declaration.init.start, declaration.init.end);

for (const built of [false, true]) {
  test(`STEP module loader works without string evaluation (${built ? 'production JSX build' : 'source'})`, () => {
    // Compile the actual viewer using the same settings as scripts/build.mjs.
    // Extract the loader from that compiled viewer, then run a real module import.
    let expression = loader;
    if (built) {
      const output = babel.transformSync(source.slice(viewer.start, viewer.end), {
        presets:[['@babel/preset-react', {runtime:'classic'}]], sourceType:'script',
        babelrc:false, configFile:false,
      }).code;
      const tree = acorn.parse(output, {ecmaVersion:2022});
      const fn = tree.body[0].body.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'load');
      const block = fn.body.body.find(n => n.type === 'TryStatement' && n.block.body.some(s =>
        s.type === 'VariableDeclaration' && s.declarations.some(d => d.id.name === 'dynImport')));
      const d = block.block.body.find(n => n.type === 'VariableDeclaration' &&
        n.declarations.some(d => d.id.name === 'dynImport')).declarations.find(d => d.id.name === 'dynImport');
      expression = output.slice(d.init.start, d.init.end);
    }
    const run = spawnSync(process.execPath, ['--experimental-vm-modules', '-e', `
      const vm=require('node:vm'),fs=require('node:fs');
      const expr=fs.readFileSync(0,'utf8');
      const context=vm.createContext({}, {codeGeneration:{strings:false,wasm:false}});
      const script=new vm.Script('('+expr+')', {importModuleDynamically:u=>import(u)});
      const load=script.runInContext(context);
      load('node:path').then(m=>{
        if(m.basename('/fixtures/TQFP48.step')!=='TQFP48.step')throw Error('module did not load');
        console.log('module loaded');
      }).catch(e=>{console.error(e);process.exitCode=1;});
    `], {input:expression, encoding:'utf8', timeout:10000});
    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /module loaded/);
  });
}

test('CSP permits the pinned Embind runtime and WebAssembly, while keeping script sources restricted', async () => {
  const config = JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const policy = config.headers.find(h=>h.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value;
  const directives = Object.fromEntries(policy.split(';').map(s=>s.trim().split(/\s+/)).map(([name,...values])=>[name,values]));
  const script = directives['script-src'];
  assert.deepEqual(script.filter(s=>!s.startsWith("'")), [
    'https://cdnjs.cloudflare.com','https://cdn.jsdelivr.net','https://esm.sh',
  ]);
  assert.ok(script.includes("'self'"));
  assert.ok(!script.includes("'unsafe-inline'"));
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'self'"]);
  // Emulate browser code-generation gates using the actual configured directives.
  const strings = script.includes("'unsafe-eval'");
  const wasm = strings || script.includes("'wasm-unsafe-eval'");
  const context = vm.createContext({}, {codeGeneration:{strings,wasm}});
  assert.equal(vm.runInContext('(new Function("return 42"))()', context), 42,
    'occt-import-js@0.0.23 requires JS invokers, not just wasm-unsafe-eval');
  const module = await vm.runInContext('WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]))', context);
  assert.ok(module);
});
