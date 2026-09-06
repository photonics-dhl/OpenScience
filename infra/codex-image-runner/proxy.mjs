import http from 'node:http';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const allowed = new Set(['chatgpt.com:443', 'auth.openai.com:443']);
export const allowedAuthority=value=>allowed.has(value);
export function startProxy(){
let active = 0;
const sockets = new Set();
const server = http.createServer({maxHeaderSize: 8192}, (_, res) => {res.writeHead(405); res.end();});
server.on('connect', (req, client, head) => {
  if (!allowedAuthority(req.url) || active >= 6 || head.length) {
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    console.log('CONNECT_REJECTED '+(/^(?:[a-z0-9-]+\.)*(?:openai\.com|chatgpt\.com|oaistatic\.com|oaiusercontent\.com):443$/.test(req.url) && req.url.length<100 ? req.url : 'invalid-authority')); return;
  }
  active++;
  let done = false;
  const finish = () => {if (!done) {done = true; active--;}};
  client.once('close', finish);
  client.on('error', () => client.destroy());
  const request = http.request({host:'127.0.0.1',port:7891,method:'CONNECT',path:req.url,headers:{Host:req.url},timeout:15000});
  request.on('connect', (res, upstream, upstreamHead) => {
    if (res.statusCode !== 200 || upstreamHead.length) {upstream.destroy(); client.destroy(); return;}
    console.log('CONNECT_OK '+req.url);
    sockets.add(upstream); upstream.once('close',()=>sockets.delete(upstream));
    let bytes = 0;
    const count = chunk => {bytes += chunk.length; if (bytes > 64*1024*1024) {upstream.destroy(); client.destroy();}};
    upstream.on('data',count); client.on('data',count);
    upstream.on('error',()=>client.destroy());
    client.once('close',()=>upstream.destroy()); upstream.once('close',()=>client.destroy());
    upstream.setTimeout(180000,()=>upstream.destroy()); client.setTimeout(180000,()=>client.destroy());
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    client.pipe(upstream); upstream.pipe(client);
  });
  request.on('timeout',()=>request.destroy());
  request.on('error',()=>client.destroy()); request.end();
});
server.on('clientError',(_,socket)=>socket.destroy());
server.listen('/proxy/egress.sock',()=>{fs.chmodSync('/proxy/egress.sock',0o600);console.log('PROXY_READY');});
setTimeout(()=>{for(const s of sockets)s.destroy();server.close();process.exit(0);},600000);

return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)startProxy();
