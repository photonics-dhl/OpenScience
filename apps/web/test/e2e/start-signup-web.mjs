import { spawn } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';

const mode = process.env.PLAYWRIGHT_WEB_MODE === 'production' ? 'start' : 'dev';
process.stdout.write(`Playwright web server: next ${mode}\n`);
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', mode, '-p', '3010'],
  {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, API_ORIGIN: 'http://127.0.0.1:3101' },
    stdio: 'inherit',
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
