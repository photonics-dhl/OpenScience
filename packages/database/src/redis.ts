import { DEFAULT_DEV_REDIS_URL } from '@openscience/config';
import Redis from 'ioredis';

/**
 * 创建 ioredis 连接。默认挂空 error listener，避免 redis 不可用/重连时
 * 未处理的 'error' 事件直接打挂宿主进程；消费方可自行 client.on('error', ...)
 * 添加自己的处理（多个 listener 共存，互不影响）。
 */
export function createRedisClient(url?: string): Redis {
  const client = new Redis(url ?? process.env.REDIS_URL ?? DEFAULT_DEV_REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
  });
  client.on('error', () => {});
  return client;
}

export async function pingRedis(client: Redis): Promise<boolean> {
  const reply = await client.ping();
  return reply === 'PONG';
}
