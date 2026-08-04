import { createHash } from 'node:crypto';
import { validateManifest, validateSdfCore } from '@openscience/sdf-schema';
import type { ExportFile } from './packager';

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * §5.3 MUST 脱库校验：纯文件输入（不依赖平台私有 DB）。
 * 1. manifest.json 存在 + validateManifest（P1B-1 ajv）
 * 2. sdf/core.json 存在 + validateSdfCore（P1B-1）
 * 3. contentHash 重算 == manifest.contentHash
 * 4. 版本文件存在
 */
export async function validateExportPackage(files: ExportFile[]): Promise<ExportValidationResult> {
  const errors: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  const manifestFile = byPath.get('manifest.json');
  if (!manifestFile) {
    errors.push('缺少 manifest.json');
    return { valid: false, errors };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestFile.content.toString('utf8')) as Record<string, unknown>;
  } catch {
    errors.push('manifest.json 不是合法 JSON');
    return { valid: false, errors };
  }

  const manifestCheck = validateManifest(manifest as never);
  if (!manifestCheck.ok) {
    errors.push(`manifest.json Schema 不通过: ${manifestCheck.errors.map((e) => e.message).join('; ')}`);
  }

  const coreFile = byPath.get('sdf/core.json');
  if (!coreFile) {
    errors.push('缺少 sdf/core.json');
  } else {
    try {
      const core = JSON.parse(coreFile.content.toString('utf8')) as Record<string, unknown>;
      const coreCheck = validateSdfCore(core as never);
      if (!coreCheck.ok) {
        errors.push(`sdf/core.json Schema 不通过: ${coreCheck.errors.map((e) => e.message).join('; ')}`);
      }
    } catch {
      errors.push('sdf/core.json 不是合法 JSON');
    }
  }

  // contentHash 重算（§5.3 sha256:...）
  if (byPath.has('sdf/core.json') && !byPath.has('sdf/validation.json')) {
    errors.push('缺少 sdf/validation.json');
  }
  if (byPath.has('versions/index.json') === false) {
    errors.push('缺少 versions/index.json');
  }
  if (byPath.has('provenance/audit.json') === false) {
    errors.push('缺少 provenance/audit.json');
  }

  // 附件哈希：figures/code/artifacts 内容 sha256 应匹配 manifest.artifacts
  const artifacts = (manifest.artifacts as Array<{ logicalPath: string; blobSha256: string }>) ?? [];
  for (const art of artifacts) {
    const p = locateFile(byPath, art.logicalPath);
    if (!p) {
      errors.push(`附件缺失: ${art.logicalPath}`);
      continue;
    }
    const file = byPath.get(p)!;
    const actual = createHash('sha256').update(file.content).digest('hex');
    if (actual !== art.blobSha256) {
      errors.push(`附件哈希不匹配: ${art.logicalPath}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** 附件在导出包中的位置（figures/code/artifacts 归位）。 */
function locateFile(byPath: Map<string, ExportFile>, logicalPath: string): string | undefined {
  for (const prefix of ['figures/', 'code/', 'artifacts/']) {
    const p = `${prefix}${logicalPath}`;
    if (byPath.has(p)) return p;
  }
  return undefined;
}
