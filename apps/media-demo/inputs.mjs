import { lstat, realpath, readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const INPUT_FILES = ['source-artwork.png', ...Array.from({ length: 5 }, (_, i) => `voice-${i}.wav`)];
export const VIDEO_FILE = 'd2nn-science-explainer-v2.mp4';

export function parseArguments(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--input', '--output'].includes(key)) throw new Error(`Unknown argument: ${key}`);
    if (result[key.slice(2)]) throw new Error(`Duplicate argument: ${key}`);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    result[key.slice(2)] = value;
  }
  if (!result.input || !result.output) throw new Error('Usage: node render.mjs --input /input --output /output');
  return result;
}

function contains(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

export async function validatePaths(inputArgument, outputArgument) {
  const input = await realpath(resolve(inputArgument));
  if (!(await lstat(input)).isDirectory()) throw new Error('Input must be a directory');
  for (const name of INPUT_FILES) {
    let info;
    try { info = await lstat(resolve(input, name)); } catch { throw new Error(`Missing required input: ${name}`); }
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 64 * 1024 * 1024) {
      throw new Error(`Input must be a nonempty regular file of at most 64 MiB: ${name}`);
    }
  }
  const requested = resolve(outputArgument);
  let output;
  let existing = false;
  try { output = await realpath(requested); existing = true; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    output = resolve(await realpath(dirname(requested)), basename(requested));
  }
  if (contains(input, output) || contains(output, input)) throw new Error('Input and output directories must not overlap');
  if (existing) {
    if (!(await lstat(output)).isDirectory()) throw new Error('Output must be a directory');
    const names = await readdir(output);
    if (names.includes(VIDEO_FILE)) throw new Error('Final video already exists; use a new output directory');
    if (names.length) throw new Error('Output directory must be empty; retain prior artifacts and use a new directory');
  }
  return { input, output };
}
