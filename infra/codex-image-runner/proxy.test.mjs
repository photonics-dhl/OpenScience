import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAuthority } from './proxy.mjs';
test('CONNECT policy allows only exact approved TLS authorities',()=>{
 assert.equal(allowedAuthority('chatgpt.com:443'),true);assert.equal(allowedAuthority('auth.openai.com:443'),true);
 for(const s of ['127.0.0.1:443','169.254.169.254:80','chatgpt.com.evil.test:443','user@chatgpt.com:443','chatgpt.com.:443','chatgpt.com:80','ab.chatgpt.com:443','CHATGPT.COM:443','chatgpt.com:443\r\nX: y'])assert.equal(allowedAuthority(s),false);
});
