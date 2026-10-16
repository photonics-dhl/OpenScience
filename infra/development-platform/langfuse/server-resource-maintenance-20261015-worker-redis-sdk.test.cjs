'use strict';
// Offline actual-compiled-source regression tests. No app/DB/provider/network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {createRequire}=require('node:module');
const assert=require('node:assert/strict'),{test}=require('node:test');
const prefix=path.join(__dirname,'server-resource-maintenance-20261015-');
const mode=process.env.XGS_LIFECYCLE_TEST_MODE||'candidate';
const files={instrumentation:prefix+(mode==='original'?'installed-instrumentation.js':'candidate-instrumentation.js'),
 shutdown:prefix+(mode==='original'?'installed-utils-shutdown.js':'worker-redis-candidate-shutdown.js')};
if(process.env.XGS_LIFECYCLE_IMAGE_SDK==='1'){
 files.instrumentation='/app/worker/dist/instrumentation.js';
 files.shutdown='/app/worker/dist/utils/shutdown.js';
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return {promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function evaluate(file,require){const exports={};vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,require,URL,Map,Promise,process:{exit(){throw Error('ForcedExitForbidden');}}},{filename:file});return exports;}
function setup(options={}){
 const order=[],logs=[];let sdkCalls=0;
 const sdk=options.sdk||{start(){order.push('sdk:start');},shutdown(){sdkCalls++;order.push('sdk:shutdown');return options.sdkGate?.promise||Promise.resolve();}};
 const logger={info:s=>logs.push(s),error:s=>logs.push(s),debug:()=>{}};
 class Instrumentation{}
 const instrumentation=evaluate(files.instrumentation,id=>{
  if(id==='dd-trace')return {init:()=>order.push('dd:init')};
  if(id==='@opentelemetry/sdk-node')return {NodeSDK:class{constructor(config){return options.sdkFactory?.(config)||sdk;}}};
  if(id==='@opentelemetry/exporter-trace-otlp-proto')return {OTLPTraceExporter:class{constructor(){return options.exporter||{};}}};
  if(id==='@opentelemetry/resources')return {resourceFromAttributes:()=>({}),envDetector:{}};
  if(id==='@opentelemetry/resource-detector-aws')return {awsEcsDetector:{}};
  if(id==='@opentelemetry/resource-detector-container')return {containerDetector:{}};
  if(id==='@langfuse/shared/instrumentation/bootstrap')return {ioredisRequestHook:()=>{}};
  if(id==='./env')return {env:{OTEL_SERVICE_NAME:'offline-fixture',BUILD_ID:'fixture',OTEL_EXPORTER_OTLP_ENDPOINT:'http://127.0.0.1:1'}};
  if(id.startsWith('@opentelemetry/instrumentation-')||id==='@prisma/instrumentation'||id==='@appsignal/opentelemetry-instrumentation-bullmq')return new Proxy({},{get:()=>Instrumentation});
  throw Error('UnexpectedInstrumentationImport:'+id);
 });
 const server={logger,redis:{disconnect(){order.push('redis:disconnect');}},disconnectAllRedisInstances(){order.push('redis:disconnect');},ClickHouseClientManager:{getInstance(){return {async closeAllConnections(){order.push('ch:close');}};}}};
 const shutdown=evaluate(files.shutdown,id=>{
  const modules={
   '@langfuse/shared/src/server':server,
   '../services/ClickhouseWriter':{ClickhouseWriter:{getInstance(){return {shutdown(){order.push('writer:shutdown');return options.writerGate?.promise||Promise.resolve();}};}}},
   '../features/health':{setSigtermReceived(){order.push('sigterm');}},
   '../index':{server:{close(){order.push('http:close');}}},
   '../features/tokenisation/usage':{freeAllTokenizers(){order.push('tokenizers:free');}},
   '../features/tokenisation/async-usage':{getTokenCountWorkerManager(){return {async terminate(){order.push('tokenizers:terminate');}};}},
   '../queues/workerManager':{WorkerManager:{closeWorkers(){order.push('workers:close');return options.workersGate?.promise||Promise.resolve();}}},
   '../features/blobstorage/inFlightExports':{logInFlightBlobExportsOnShutdown(){}},
   '../features/in-app-agent/executeInAppAgentRun':{abortActiveInAppAgentRuns(){}},
   '@langfuse/shared/src/db':{prisma:{async $disconnect(){order.push('prisma:disconnect');}}},
   '../backgroundMigrations/backgroundMigrationManager':{BackgroundMigrationManager:{async close(){order.push('migration:close');}}},
   '../app':{batchProjectCleaners:[],batchDataRetentionCleaners:[],monitorRunners:[]},
   '../instrumentation':instrumentation,
  };
  if(!(id in modules))throw Error('UnexpectedShutdownImport:'+id);
  return modules[id];
 });
 return {order,logs,instrumentation,shutdown,sdkCalls:()=>sdkCalls};
}
async function child(kind){
 const retained=setInterval(()=>{},100);let exported=0,disposed=0;
 let sdk,exporter,sdkFactory;
 if(kind==='native'){
  const local=process.env.XGS_LIFECYCLE_IMAGE_SDK==='1'
   ?require.resolve('@opentelemetry/sdk-node',{paths:['/app/worker/dist']})
   :path.join(__dirname,'../node_modules/.pnpm/@opentelemetry+sdk-node@0.203.0_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-node/build/src/sdk.js');
  const nativeRequire=createRequire(local),{NodeSDK}=nativeRequire(local);
  // Native installed local SDK; resource/instrumentation discovery is disabled
  // and exporter is an explicit external-I/O boundary, not a network endpoint.
  exporter={export(spans,callback){exported+=spans.length;setTimeout(()=>callback({code:0}),20);},shutdown(){disposed++;clearInterval(retained);return Promise.resolve();}};
  sdkFactory=config=>{
   const actual=new NodeSDK({traceExporter:config.traceExporter,instrumentations:[],autoDetectResources:false,
    logRecordProcessors:[],metricReaders:[]});
   const start=actual.start.bind(actual);actual.start=()=>{start();nativeRequire('@opentelemetry/api').trace.getTracer('offline').startSpan('preserved-fixture').end();};
   return actual;
  };
 }else sdk={start(){},shutdown(){disposed++;clearInterval(retained);return new Promise(resolve=>setTimeout(resolve,30));}};
 const context=setup({sdk,exporter,sdkFactory});
 await context.shutdown.onShutdown('SIGTERM');
 console.log(JSON.stringify({complete:context.logs.includes('Shutdown complete, exiting process...'),exported,disposed}));
}
if(process.argv[2]==='--child'){
 child(process.argv[3]).catch(error=>{console.error(error.name+':'+error.message);process.exitCode=1;});
}else{
 test('SDK cleanup follows actual business drain and waits before completion',async()=>{
  const workersGate=deferred(),writerGate=deferred(),sdkGate=deferred();
  const c=setup({workersGate,writerGate,sdkGate});const pending=c.shutdown.onShutdown('SIGTERM');
  await tick();assert.equal(c.sdkCalls(),0);assert(c.order.includes('workers:close'));
  workersGate.resolve();await tick();assert(c.order.includes('writer:shutdown'));assert.equal(c.sdkCalls(),0);
  writerGate.resolve();await tick();assert.equal(c.sdkCalls(),1,'started SDK must be shut down');
  assert(!c.logs.includes('Shutdown complete, exiting process...'));
  assert(c.order.indexOf('tokenizers:free')<c.order.indexOf('sdk:shutdown'));
  sdkGate.resolve();await pending;assert(c.logs.includes('Shutdown complete, exiting process...'));
 });
 test('concurrent SDK shutdown requests share one pending cleanup',async()=>{
  const gate=deferred(),c=setup({sdkGate:gate});
  assert.equal(typeof c.instrumentation.shutdownInstrumentation,'function');
  const a=c.instrumentation.shutdownInstrumentation(),b=c.instrumentation.shutdownInstrumentation();
  assert.strictEqual(a,b);await tick();assert.equal(c.sdkCalls(),1);gate.resolve();await a;
 });
 test('SDK rejection propagates without successful completion or forced exit',async()=>{
  const gate=deferred(),c=setup({sdkGate:gate}),failure=Error('exporter-close-failed');
  const pending=c.shutdown.onShutdown('SIGTERM');await tick();gate.reject(failure);
  await assert.rejects(pending,e=>e===failure);await assert.rejects(c.shutdown.onShutdown('SIGINT'),e=>e===failure);
  assert.equal(c.sdkCalls(),1);assert(!c.logs.includes('Shutdown complete, exiting process...'));
 });
 test('a synchronous SDK cleanup failure is retained and not retried',async()=>{
  let calls=0;const failure=Error('sync-exporter-failure'),c=setup({sdk:{start(){},shutdown(){calls++;throw failure;}}});
  assert.equal(typeof c.instrumentation.shutdownInstrumentation,'function');
  const a=c.instrumentation.shutdownInstrumentation(),b=c.instrumentation.shutdownInstrumentation();
  assert.strictEqual(a,b);await assert.rejects(a,e=>e===failure);assert.equal(calls,1);
 });
 test('earlier business drain failure prevents telemetry completion',async()=>{
  const gate=deferred(),c=setup({workersGate:gate}),failure=Error('business-drain-failed');
  const pending=c.shutdown.onShutdown('SIGTERM');gate.reject(failure);
  await assert.rejects(pending,e=>e===failure);assert.equal(c.sdkCalls(),0);
  assert(!c.logs.includes('Shutdown complete, exiting process...'));
 });
 for(const kind of ['synthetic','native'])test('real child naturally exits after '+kind+' SDK-owned resource is disposed',t=>{
  const r=cp.spawnSync(process.execPath,[__filename,'--child',kind],{encoding:'utf8',timeout:2000,
   env:{...process.env,XGS_LIFECYCLE_TEST_MODE:mode,OTEL_SDK_DISABLED:'false',OTEL_TRACES_EXPORTER:'none',OTEL_LOGS_EXPORTER:'none',OTEL_METRICS_EXPORTER:'none'}});
  assert.equal(r.stderr,'','child must reach real drain without setup errors');
  if(r.error){
   assert.deepEqual(JSON.parse(r.stdout.trim()),{complete:true,exported:0,disposed:0},'old business drain completed but SDK ownership was not disposed');
   assert.equal(r.error.code,'ETIMEDOUT');
   t.diagnostic('CONTROL_DRAIN_COMPLETE:'+kind);
  }
  assert.equal(r.error,undefined,'retained SDK resource prevents natural exit: '+r.error?.code+'; child='+r.stdout.trim());
  assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout.trim());assert.equal(result.complete,true);assert.equal(result.disposed,1);
  if(kind==='native')assert.equal(result.exported,1,'pending fixture span must be exported before process ends');
 });
}
