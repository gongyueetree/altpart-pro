const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {signAnalysisContext,verifyAnalysisContext,signingConfigured}=require('../api/_lib/analysis-context');

test('deployment provider credential signs a stable snapshot when dedicated secret is absent',()=>{
 const keys=['ANALYSIS_CONTEXT_SECRET','EZPLM_API_KEY','GEMINI_API_KEY'];const old=keys.map(k=>process.env[k]);
 try{
  keys.forEach(k=>delete process.env[k]);assert.equal(signingConfigured(),false);
  process.env.EZPLM_API_KEY='private-provider-credential-with-at-least-32-bytes';
  const original={partNumber:'TL431ACD',parameters:[{id:'param_5',name:'Reference voltage',value:'2.495',unit:'V'},{id:'param_6',name:'Noise',value:'N/A'}]};
  const token=signAnalysisContext(original,original.partNumber);
  assert.ok(token);assert.equal(signingConfigured(),true);
  original.parameters[0].value='99';
  assert.equal(verifyAnalysisContext(token,'TL431ACD').original.parameters[0].value,'2.495');
  assert.equal(verifyAnalysisContext(token,'TL431B').code,'part_mismatch');
  process.env.EZPLM_API_KEY='another-provider-credential-with-at-least-32-bytes';
  assert.equal(verifyAnalysisContext(token,'TL431ACD').code,'bad_signature');
  process.env.ANALYSIS_CONTEXT_SECRET='short';assert.equal(signingConfigured(),false);
 }finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]})}
});

test('production pipeline accepts known N/A priority IDs but rejects truly unknown IDs',async()=>{
 const filename=require.resolve('../api/_lib/pipeline');const source=fs.readFileSync(filename,'utf8');let calls=0;
 const sandbox={module:{exports:{}},exports:{},console:{log(){},warn(){}},process,setTimeout,require(name){
  if(name==='./gemini')return {...require('../api/_lib/gemini'),getCandidates:async()=>{calls++;throw new Error('REACHED_CANDIDATES')}};
  if(name==='./cache')return {cache:{get:()=>null,set(){}}};
  return require(require.resolve(name,{paths:[require('node:path').dirname(filename)]}));
 }};vm.runInNewContext(source,sandbox,{filename});
 const run=sandbox.module.exports.runPipeline;
 const args={partNumber:'TL431ACD',originalData:{partNumber:'TL431ACD',parameters:[{id:'param_1',name:'Voltage',value:'2.495',unit:'V'},{id:'param_5',name:'Noise',value:'N/A'}]},priorityOrder:['param_5','param_1'],constraints:{}};
 await assert.rejects(run(args),/REACHED_CANDIDATES/);assert.ok(calls>0);
 calls=0;await assert.rejects(run({...args,priorityOrder:['param_999']}),/未知参数/);assert.equal(calls,0);
});
