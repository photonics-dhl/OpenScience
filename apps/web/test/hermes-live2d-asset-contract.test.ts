import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const runtimeRoot = path.resolve(process.cwd(), 'public/hermes/live2d/wanko');
const noticePath = path.resolve(process.cwd(), 'public/hermes/live2d/NOTICE.md');
const corePath = path.resolve(process.cwd(), 'public/hermes/live2d/live2dcubismcore.min.js');

const EXPECTED_HASHES: Readonly<Record<string, string>> = {
  'motion/idle_01.motion3.json': '732d91a814b2a5e460b1056d9f3cad3d11bb4ede2b4ec0695cc734ab685625d3',
  'motion/idle_02.motion3.json': '6253098cf2036dd8dcafc89271c83b371107b75e3d3deab497c18fc8bbd0fd14',
  'motion/idle_03.motion3.json': '85f1f26202a1f48e2b3776603d4ea35b3a687b61dd185fa70005f9ae38172dfd',
  'motion/idle_04.motion3.json': 'ef390659ebc380a2371b92d1c03032d357e9f0bc66b5a58380dd5ef859864a0c',
  'motion/shake_01.motion3.json': '9dff81cd613ed3784a0f74c7d656487c2d01ea268651e750a9051067b20312c6',
  'motion/shake_02.motion3.json': '5e3b95bdd93a08ac0e4555bc2c1ca2a01098ae6d29bf77f1c0fda8b50b7e7501',
  'motion/touch_01.motion3.json': '67530fbb58a8ccb84646b1d792e508bbcd40a63278948005b82269c89efa915e',
  'motion/touch_02.motion3.json': '399372b0ad251f4476edc0434dbbd8691d6a0b4b9a36a69cd3a77ca464c20615',
  'motion/touch_03.motion3.json': '46070d593ebee2fac69edda5a649e56b6886b8c808e6570d61c45ed747d6657e',
  'motion/touch_04.motion3.json': 'a8abbb63ab5b3363037df866bebc8f55d0c509b1d62106ce42780768f672458e',
  'motion/touch_05.motion3.json': '44775b40cb2074068df425078530528ead3b895f33f03d8509d9dc3e1f1775c5',
  'motion/touch_06.motion3.json': '365e23f9447dc5812d9e9f28b1dbcead52216f80274b90b0e82240a01ac6ae09',
  'wanko_touch.1024/texture_00.png': 'b7b032b8ebf5f96330e591e44f5c9b4c2347afacbc451355d4fb883af1905e8a',
  'wanko_touch.1024/texture_01.png': '0e6b4dff59c1d747a325c0be659e047a61b1a1ce888fdca125eea903c751e9af',
  'wanko_touch.cdi3.json': '8a85e6f0c7960e7a75092e19dc138e152e9f673e0fe21cc335ede0a7b3bace73',
  'wanko_touch.moc3': '2b19f248dac610569a0b90ef177247006c81f6e86aee0bc139b1475767349669',
  'wanko_touch.model3.json': '64f33a78c0a2587e052939d6cf1d8f639c1675e658387eec5d671a419faed493',
  'wanko_touch.physics3.json': '941fcfe315000b83d7b7eafdb2971301f1f9446e07eff437947e0f9e7bdbe849',
};

function listFiles(root: string, prefix = ''): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(path.join(root, entry.name), relative)
      : [relative];
  }).sort();
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

describe('Hermes Wanko Live2D runtime assets', () => {
  it('publishes only the pinned v09 browser runtime bytes', () => {
    expect(existsSync(runtimeRoot)).toBe(true);
    const actual = listFiles(runtimeRoot);
    expect(actual).toEqual(Object.keys(EXPECTED_HASHES).sort());
    expect(actual.some((file) => /\.(?:can3|cmo3|rar|zip)$/iu.test(file))).toBe(false);

    for (const [relative, expectedHash] of Object.entries(EXPECTED_HASHES)) {
      expect(sha256(path.join(runtimeRoot, relative)), relative).toBe(expectedHash);
    }
  });

  it('keeps every model reference inside the pinned runtime root', () => {
    expect(existsSync(runtimeRoot)).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(runtimeRoot, 'wanko_touch.model3.json'), 'utf8')) as {
      FileReferences: {
        DisplayInfo: string;
        Moc: string;
        Motions: Record<string, Array<{ File: string }>>;
        Physics: string;
        Textures: string[];
      };
    };
    const refs = [
      manifest.FileReferences.Moc,
      manifest.FileReferences.Physics,
      manifest.FileReferences.DisplayInfo,
      ...manifest.FileReferences.Textures,
      ...Object.values(manifest.FileReferences.Motions).flat().map(({ File }) => File),
    ];

    for (const reference of refs) {
      expect(path.isAbsolute(reference), reference).toBe(false);
      expect(reference.split(/[\\/]/u)).not.toContain('..');
      expect(existsSync(path.resolve(runtimeRoot, reference)), reference).toBe(true);
    }
  });

  it('records the upstream terms and blocks public release until operator review', () => {
    expect(existsSync(noticePath)).toBe(true);
    const notice = readFileSync(noticePath, 'utf8');
    expect(notice).toContain('https://www.live2d.com/en/learn/sample/wankoromochi/');
    expect(notice).toContain('https://www.live2d.com/en/learn/sample/model-terms/');
    expect(notice).toContain('https://www.live2d.com/en/sdk/license/');
    expect(notice).toContain('This content uses sample data owned and copyrighted by Live2D Inc.');
    expect(notice).toContain('PUBLICATION REVIEW: REQUIRED BEFORE PUBLIC DEPLOYMENT');
  });

  it('pins the proprietary Cubism Core byte used by the browser runtime', () => {
    expect(existsSync(corePath)).toBe(true);
    expect(sha256(corePath)).toBe('25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f');
  });
});
