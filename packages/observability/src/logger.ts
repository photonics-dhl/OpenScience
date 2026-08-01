import { pino, type Logger, type LoggerOptions } from 'pino';

/** pino/fast-redact 路径表（第一闸）：已知敏感字段整体替换。 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'body.password',
  'body.code',
  'body.token',
  '*.password',
  '*.passwordHash',
  '*.codeHash',
  '*.sessionToken',
  '*.accessKey',
  '*.secretKey',
];

const SENSITIVE_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
  /\b\d{17}[\dXx]\b/g, // 身份证 18 位
  /\b\d{15}\b/g, // 身份证 15 位
  /\b[0-9a-fA-F]{32,}\b/g, // 长 hex（token/secret 样式）
];

/** 第二闸：任意字符串值中的敏感样式打码（防业务代码把密钥塞进任意字段）。 */
export function redactSensitiveString(input: string): string {
  let out = input;
  for (const pattern of SENSITIVE_PATTERNS) out = out.replace(pattern, '[Redacted]');
  return out;
}

export function sanitizeValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return redactSensitiveString(value);
  // Error 实例原样直通：message/stack 不可枚举，递归复制会掏空，交给 pino err serializer 处理。
  if (value instanceof Error) return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out = value.map((v) => sanitizeValue(v, seen));
    seen.delete(value);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    // 环检测：formatters.log 先于 serializers 执行，真实请求的 req/res 对象成环（socket.parser.socket）。
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeValue(v, seen);
    seen.delete(value); // 递归结束后移除，避免兄弟节点误判
    return out;
  }
  return value;
}

export interface CreateLoggerOptions {
  level?: string;
  base?: Record<string, unknown>;
  /** 测试注入捕获流；缺省 pino 默认 stdout。 */
  destination?: NodeJS.WritableStream;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const opts: LoggerOptions = {
    level: options.level ?? 'info',
    base: options.base ?? {},
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    formatters: { log: (obj) => sanitizeValue(obj) as Record<string, unknown> },
  };
  return options.destination ? pino(opts, options.destination) : pino(opts);
}
