import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync, realpathSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';

// Run on ECS via canonical ssh-run with stdin. No production mounts or credentials.
const root = '/opt/openscience-evals/local-image';
const base = 'sha256:ec24f9013c12d8093d262cb13c33ad2c5d2ae90233d15b801caa3c938751eacd';
const name = 'xgs-image-cpu-eval';
const maxMs = 600_000;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function availableMiB() {
  return Number(readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? 0) / 1024;
}
function health() {
  return docker('ps', '--filter', 'name=openscience-prod-', '--format', '{{.Names}} {{.Status}}')
    .split('\n').filter(line => /\((unhealthy|health: starting)\)/.test(line));
}
function checkAdmission() {
  if (realpathSync(root) !== root || availableMiB() < 20 * 1024 || health().length) throw Error('Resource admission failed');
  const free = Number(execFileSync('df', ['-B1', '--output=avail', root], { encoding: 'utf8' }).trim().split('\n').at(-1).trim());
  if (free < 70 * 1024**3 || Number(readFileSync('/proc/loadavg','utf8').split(' ')[0]) > 8) throw Error('Disk or CPU admission failed');
}
checkAdmission();
const run = join(root, 'run-512');
mkdirSync(run, {mode:0o750});
execFileSync('chown', ['1000:1000', run]);
const prompt = join(root, 'prompt.txt');
if (!statSync(prompt).isFile() || statSync(prompt).size > 6000) throw Error('Bounded prompt missing');
const before = readFileSync('/opt/openscience/.release-id','utf8').trim();
const logs = openSync(join(run, 'inference.log'),'wx',0o600);
const args = ['run','--pull','never','--name',name,'--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','12g','--memory-swap','12g','--cpus','6','--cpu-shares','128','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,size=128m','-v',root+':/models:ro','-v',run+':/output:rw','--entrypoint','/models/runtime/sd-cli',base,
  '--backend','cpu','--diffusion-model','/models/flux-2-klein-4b-Q4_0.gguf','--llm','/models/Qwen3-4B-Q4_K_M.gguf','--vae','/models/full_encoder_small_decoder.safetensors','--prompt',readFileSync(prompt,'utf8').trim(),
  '--width','512','--height','288','--steps','4','--cfg-scale','1','--sampling-method','euler','--seed','42','--threads','6','--diffusion-fa','--output','/output/image.png'];
const started=Date.now();let reason=null;let highLoad=0;let minAvailable=availableMiB();
const child=spawn('docker',args,{stdio:['ignore',logs,logs]});
const stop=why=>{if(reason)return;reason=why;try{docker('stop','--time','10',name);}catch{try{docker('kill',name);}catch{}}};
const timer=setInterval(()=>{
  try {
    const available=availableMiB();minAvailable=Math.min(minAvailable,available);
    highLoad=Number(readFileSync('/proc/loadavg','utf8').split(' ')[0])>12?highLoad+1:0;
    if(available<10*1024||health().length||highLoad>=2)stop('resource-or-health');
    if(Date.now()-started>maxMs)stop('timeout');
  }catch{stop('monitor-failed');}
},10_000);
process.once('SIGTERM',()=>stop('interrupted'));process.once('SIGINT',()=>stop('interrupted'));
const exit=await new Promise(resolve=>{child.once('exit',code=>resolve(code));child.once('error',()=>resolve(-1));});
clearInterval(timer);closeSync(logs);
let state;try{state=JSON.parse(docker('inspect','--format','{{json .State}}',name));}catch{state={};}
const report={before,after:readFileSync('/opt/openscience/.release-id','utf8').trim(),exit,reason,elapsedSeconds:(Date.now()-started)/1000,minimumHostAvailableMiB:Math.round(minAvailable),oomKilled:state.OOMKilled??null,productionUnhealthy:health(),width:512,height:288,steps:4,base,network:'none',memoryLimitGiB:12,cpuLimit:6};
writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
// Keep the stopped, bounded container for inspect evidence; no automatic deletion.
console.log(JSON.stringify(report));
process.exitCode=exit===0&&!reason&&report.before===report.after&&!report.oomKilled&&report.productionUnhealthy.length===0?0:1;
