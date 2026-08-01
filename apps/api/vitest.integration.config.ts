import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    // 集成文件共享同一 PG/Redis 且 afterAll 全表清理（设计如此：每个文件假设独占干净库），
    // 必须串行——并行会让先完成文件的 cleanup 抹掉进行中文件的夹具（2026-08-01 实证：并发双 accept 用例被打挂）。
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
