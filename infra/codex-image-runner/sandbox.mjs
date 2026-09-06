import { isAbsolute } from 'node:path';
import { UUID } from './core.mjs';

export function containerArgs(kind,config,job){
 if(!UUID.test(job.id))throw Error('INVALID_ID');
 for(const p of [config.runtime,config.auth,config.scripts,job.dir])if(!isAbsolute(p)||/[,:\n\r]/.test(p))throw Error('INVALID_PATH');
 for(const image of [config.nodeImage,config.rendererImage])if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('INVALID_IMAGE');
 const name='xgs-codex-'+kind+'-'+job.id;
 const common=['run','--pull','never','--name',name,'--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','1','--pids-limit','128','--ulimit','fsize=33554432:33554432','--label','openscience.role=codex-image-evaluation'];
 if(kind==='proxy')return [...common,'-d','--network','host','--memory','128m','--memory-swap','128m','-v',config.scripts+':/scripts:ro','-v',job.dir+'/socket:/proxy:rw',config.nodeImage,'node','/scripts/proxy.mjs'];
 if(kind==='model')return [...common,'--network','none','--memory','1g','--memory-swap','1g','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=128m','-e','CODEX_HOME=/state','-v',config.runtime+':/runtime:ro','-v',job.dir+'/state:/state:rw','-v',config.auth+':/state/auth.json:ro','-v',job.dir+'/work:/work:rw','-v',job.dir+'/input:/input:ro','-v',config.scripts+':/scripts:ro','-v',job.dir+'/socket:/proxy:ro','-w','/work',config.nodeImage,'timeout','--signal=TERM','--kill-after=5','540','node','/scripts/container-client.mjs'];
 if(kind==='normalize'){
  if(!isAbsolute(job.rawImage)||/[,:\n\r]/.test(job.rawImage))throw Error('INVALID_PATH');
  return [...common,'--network','none','--memory','512m','--memory-swap','512m','--entrypoint','/usr/bin/ffmpeg','-v',job.rawImage+':/input.png:ro','-v',job.dir+'/normalized:/output:rw',config.rendererImage,'-v','error','-nostdin','-threads','1','-i','/input.png','-map_metadata','-1','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xf7f2e8','-frames:v','1','-threads','1','-pix_fmt','rgb24','/output/result.png'];
 }
 throw Error('INVALID_CONTAINER_KIND');
}
