import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function manifestReferences(model) {
  const references = model.FileReferences ?? {};
  return [
    references.Moc && { kind: 'moc', path: references.Moc },
    ...(references.Textures ?? []).map((texture) => ({
      kind: 'texture',
      path: texture,
    })),
    references.Physics && { kind: 'physics', path: references.Physics },
    references.DisplayInfo && {
      kind: 'display info',
      path: references.DisplayInfo,
    },
    references.Pose && { kind: 'pose', path: references.Pose },
    references.UserData && { kind: 'user data', path: references.UserData },
    ...Object.values(references.Expressions ?? {}).map((expression) => ({
      kind: 'expression',
      path: expression.File,
    })),
    ...Object.values(references.Motions ?? {})
      .flat()
      .map((motion) => ({ kind: 'motion', path: motion.File })),
  ].filter(Boolean);
}

function inspectPng(filePath, relativePath) {
  const bytes = readFileSync(filePath);
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 26 || bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`texture is not a PNG: ${relativePath}`);
  }
  const colorType = bytes[25];
  return {
    path: relativePath,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

export function verifyCubismExport(exportRoot) {
  const root = path.resolve(exportRoot);
  const modelFile = readdirSync(root)
    .filter((file) => file.endsWith('.model3.json'))
    .sort()[0];
  if (!modelFile) {
    return { ok: false, errors: ['missing model3.json'] };
  }

  const model = JSON.parse(readFileSync(path.join(root, modelFile), 'utf8'));
  const errors = [];
  const references = manifestReferences(model);
  const closedReferences = [];
  for (const reference of references) {
    const resolved = path.resolve(root, reference.path);
    if (
      path.isAbsolute(reference.path) ||
      (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))
    ) {
      errors.push(
        `model3.json ${reference.kind} reference escapes export root: ${reference.path}`,
      );
      continue;
    }
    if (!existsSync(resolved)) {
      errors.push(
        `model3.json references missing ${reference.kind}: ${reference.path}`,
      );
      continue;
    }
    closedReferences.push(reference);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const displayInfoPath = model.FileReferences?.DisplayInfo;
  const displayInfo = displayInfoPath
    ? JSON.parse(readFileSync(path.resolve(root, displayInfoPath), 'utf8'))
    : { Parameters: [], Parts: [] };

  return {
    ok: true,
    errors: [],
    inventory: {
      modelFile,
      moc: model.FileReferences?.Moc ?? null,
      referencedFiles: closedReferences
        .map((reference) => reference.path)
        .sort(),
      textures: closedReferences
        .filter((reference) => reference.kind === 'texture')
        .map((reference) =>
          inspectPng(path.resolve(root, reference.path), reference.path),
        ),
      parameterIds: (displayInfo.Parameters ?? []).map(({ Id }) => Id),
      partIds: (displayInfo.Parts ?? []).map(({ Id }) => Id),
    },
  };
}
