/**
 * P1E-6 产物收集（2026-08-06 补闭环）。
 *
 * 决策依据：P1E-4 设计文档只定义了 SandboxArtifact 数据模型（§4.2），
 * 未规定产物产出机制。采用最简单约定：脚本把产物文件写到容器内 `/output`
 *（tmpfs 挂载，见 sandbox-controller.ts），执行结束后用 docker getArchive
 * 拉取该目录 tar 包、解包落库 sandbox_artifacts。
 *
 * 本模块不依赖 dockerode 类型，便于注入 fake 容器单测。
 */

/** 收集到的单个产物（与 domain NewSandboxArtifact 结构一致）。 */
export interface CollectedArtifact {
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

/** getArchive 最小接缝（dockerode Container 同名方法的结构子集）。 */
export interface ArchiveSource {
  getArchive(options: { path: string }): Promise<NodeJS.ReadableStream>;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.html': 'text/html',
  '.pdf': 'application/pdf',
};

export function mimeTypeFor(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

interface TarEntry {
  name: string;
  data: Buffer;
}

function parseOctal(field: Buffer): number {
  const str = field.toString('ascii').replace(/[\0 ]+$/g, '').trim();
  return str ? parseInt(str, 8) : 0;
}

/**
 * 最小 ustar 解包：仅取普通文件（typeflag '0'/'\0'），目录与其他类型跳过。
 * 支持 ustar prefix 拼接与 GNU 长名（'L'）；pax 扩展头（'x'）忽略——
 * 沙箱产物文件名由用户脚本生成，常规短名为主，长路径场景降级为跳过。
 */
export function extractTarEntries(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingLongName: string | null = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    // 全零块 = 归档结束
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseOctal(header.subarray(124, 136));
    const typeflag = String.fromCharCode(header[156]);
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');

    offset += 512;
    const data = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (typeflag === 'L') {
      pendingLongName = data.toString('utf8').replace(/\0.*$/s, '');
      continue;
    }
    if (typeflag === '0' || typeflag === '\0') {
      const fullName = pendingLongName ?? (prefix ? `${prefix}/${name}` : name);
      entries.push({ name: fullName, data: Buffer.from(data) });
    }
    pendingLongName = null;
  }
  return entries;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * 从容器 /output 目录收集产物。目录不存在/读取失败 → 返回空数组
 *（产物收集失败不应把已成功执行的作业判负，调用方自行决定是否记录）。
 */
export async function collectArtifacts(container: ArchiveSource): Promise<CollectedArtifact[]> {
  try {
    const stream = await container.getArchive({ path: '/output' });
    const tar = await streamToBuffer(stream);
    return extractTarEntries(tar)
      .filter((e) => e.name.length > 0 && !e.name.endsWith('/'))
      .map((e) => {
        const filename = e.name.split('/').pop() ?? e.name;
        return { filename, mimeType: mimeTypeFor(filename), size: e.data.length, data: e.data };
      });
  } catch {
    return [];
  }
}
