import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const root = resolve(args.get('--root') ?? '');
const ref = args.get('--ref');
if (!root || !ref) throw new Error('usage: verify-release-source.mjs --root <repo> --ref <ref>');

const git = (...gitArgs) => execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8' }).trim();
const releaseSha = git('rev-parse', `${ref}^{commit}`);
const headSha = git('rev-parse', 'HEAD');
if (releaseSha !== headSha) throw new Error(`release ref ${releaseSha} does not match source HEAD ${headSha}`);
if (git('status', '--porcelain', '--untracked-files=normal') !== '') {
  throw new Error('release source must have no tracked or untracked changes');
}

process.stdout.write(`${releaseSha}\n`);
