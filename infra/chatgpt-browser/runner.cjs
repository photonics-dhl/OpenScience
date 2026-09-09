// Private operator runner; not a production AI Gateway provider.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/app/node_modules/playwright-core');
const [mode, id] = process.argv.slice(2);
if (!['prepare', 'send', 'status', 'download', 'execute', 'resume'].includes(mode) || !/^[a-f0-9-]{36}$/.test(id || '')) process.exit(64);
const dir = path.join('/jobs', id);
function read(name) {
  const file = path.join(dir, name);
  if (!fs.lstatSync(file).isFile()) throw Error('INVALID_JOB_FILE');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function once(name, data) {
  const fd = fs.openSync(path.join(dir, name), 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
async function waitAndDownload(browser, page) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw Error('PAGE_CLOSED_NO_RESEND');
    const generated = page.getByRole('button', { name: /^Generated image:/ });
    if (await generated.count() === 1 && await generated.isVisible()) {
      // Resolve an optimistic /c/WEB: URL through the matching visible history entry.
      if (new URL(page.url()).pathname.startsWith('/c/WEB:')) {
        const title = await page.title();
        const link = page.getByRole('link', { name: title, exact: true });
        if (await link.count() === 1) {
          const href = await link.getAttribute('href');
          if (/^\/c\/[a-f0-9-]{36}$/.test(href || '')) {
            once('canonical-conversation.json', { url: 'https://chatgpt.com' + href });
          }
        }
      }
      await downloadImage(browser, page);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw Error('RESULT_TIMEOUT_NO_RESEND');
}
async function downloadImage(browser, page) {
  if (fs.existsSync(path.join(dir, 'result.json'))) throw Error('OUTPUT_EXISTS');
  const generated = page.getByRole('button', { name: /^Generated image:/ });
  if (await generated.count() !== 1) throw Error('EXPECTED_ONE_GENERATED_IMAGE');
  const dialog = page.getByRole('dialog');
  if (await dialog.count() === 0) await generated.click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).waitFor();
  const output = path.join(dir, 'output');
  fs.mkdirSync(output, { mode: 0o700 });
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: output, eventsEnabled: true });
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('DOWNLOAD_TIMEOUT')), 60000);
    cdp.on('Browser.downloadProgress', event => {
      if (event.state === 'completed') { clearTimeout(timer); resolve(event.guid); }
      if (event.state === 'canceled') { clearTimeout(timer); reject(Error('DOWNLOAD_CANCELED')); }
    });
  });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const guid = await completed;
  if (!/^[a-zA-Z0-9-]+$/.test(guid)) throw Error('INVALID_DOWNLOAD_ID');
  const file = path.join(output, guid);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 30 * 1024 * 1024) throw Error('INVALID_IMAGE');
  const data = fs.readFileSync(file);
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('EXPECTED_PNG');
  const finalPath = path.join(output, 'image.png');
  if (fs.existsSync(finalPath)) throw Error('OUTPUT_EXISTS');
  fs.renameSync(file, finalPath);
  once('result.json', { state: 'downloaded', provider: 'chatgpt_web', conversation: page.url(), file: 'output/image.png',
    bytes: stat.size, width: data.readUInt32BE(16), height: data.readUInt32BE(20), scientificReview: 'pending' });
  console.log('DOWNLOADED_REVIEW_PENDING');
}
(async () => {
  if (fs.lstatSync(dir).isSymbolicLink()) throw Error('INVALID_JOB_DIRECTORY');
  const request = read('request.json');
  if (request.id !== id || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 30000
    || Object.keys(request).some(k => !['id', 'prompt', 'source'].includes(k))) throw Error('INVALID_REQUEST');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9233');
  const context = browser.contexts()[0];
  if (mode === 'status' || mode === 'download' || mode === 'resume') {
    const { url } = read('conversation.json');
    const parsed = new URL(url);
    if (parsed.origin !== 'https://chatgpt.com' || !parsed.pathname.startsWith('/c/')) throw Error('INVALID_CONVERSATION');
    const page = context.pages().find(p => p.url() === url);
    if (!page) throw Error('EXACT_CONVERSATION_NOT_FOUND');
    if (mode === 'download') { await downloadImage(browser, page); process.exit(0); }
    if (mode === 'resume') { await waitAndDownload(browser, page); process.exit(0); }
    const tree = await page.locator('main').ariaSnapshot();
    console.log(tree.split('- heading "ChatGPT said:"').at(-1));
    process.exit(0);
  }
  if (fs.existsSync(path.join(dir, 'submitted.json'))) throw Error('SUBMITTED_DO_NOT_RESEND');
  const page = context.pages().filter(p => p.url() === 'https://chatgpt.com/').at(-1);
  if (!page) throw Error('NEW_CHAT_NOT_FOUND');
  const prompt = '请直接使用图像生成工具生成一张图片，不要只回复文字说明。\n' + request.prompt;
  const composer = page.locator('#prompt-textarea');
  if (mode === 'prepare' || mode === 'execute') {
    await composer.fill(prompt);
    console.log('PREPARED');
    if (mode === 'prepare') process.exit(0);
  }
  {
    const normalize = s => s.replace(/\s+/g, ' ').trim();
    if (normalize(await composer.innerText()) !== normalize(prompt)) throw Error('PROMPT_CHANGED');
    const send = page.getByRole('button', { name: 'Send prompt', exact: true });
    if (!await send.isEnabled()) throw Error('SEND_NOT_READY');
    once('submitted.json', { phase: 'submitted', submittedAt: new Date().toISOString(), source: request.source });
    await send.click();
    await page.waitForURL('https://chatgpt.com/c/**', { timeout: 30000 });
    once('conversation.json', { url: page.url() });
    console.log('SUBMITTED');
    if (mode === 'execute') await waitAndDownload(browser, page);
  }
  process.exit(0);
})().catch(error => {
  // Never print page contents, login data, request payload, or CDP transport errors.
  console.log(JSON.stringify({ state: fs.existsSync(path.join(dir, 'submitted.json')) ? 'ambiguous_no_resend' : 'not_submitted', error: /^[A-Z_]+$/.test(error.message) ? error.message : error.name }));
  process.exit(1);
});
