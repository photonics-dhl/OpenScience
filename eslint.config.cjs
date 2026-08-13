const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
  {
    // .worktrees 是本地隔离工作区；.agents/.superpowers 是 agent skill 与临时验收脚本，均非产品源码。
    // tmp/ 与 apps/web/tmp/ 只保存本地浏览器探针/日志证据；正式门禁脚本仍位于 apps/web/test/visual/ 并继续受 lint。
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      'infra/**',
      '**/.worktrees/**',
      '.agents/**',
      '.superpowers/**',
      'tmp/**',
      'apps/web/tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    files: ['**/*.cjs'],
    // .cjs 配置文件本身是 CommonJS（require/module 合法）
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
    // flat config / 工具配置在 .cjs 中使用 require 是 Node 约定，非应禁模式
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/*/scripts/**/*.mjs'],
    // 运维脚本运行在 Node 上；手工声明所需全局量，避免仅为 console/process 引入 globals 依赖
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['packages/database/src/migrate-cli.ts'],
    // migrate-cli 在运行时用 require.resolve 定位 prisma CLI 入口（同步、避免 ESM/CJS 互操作问题），属有意为之；
    // 源码内遗留的 no-var-requires 禁用注释在 typescript-eslint v8 中已无对应规则，一并豁免未使用指令告警
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['packages/database/src/redis.ts'],
    // redis.ts 有意挂空 error listener（防止 redis 不可用时未处理 error 事件打挂宿主进程），见源码注释
    rules: { '@typescript-eslint/no-empty-function': 'off' },
  },
];
