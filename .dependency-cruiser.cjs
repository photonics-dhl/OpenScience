const path = require('node:path');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '工作区模块间禁止循环依赖',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-package-relative-imports',
      severity: 'error',
      // 跨包引用必须走包名（@openscience/*），禁止相对路径深入其他包的 src；
      // $2 回引 from.path 的第 2 捕获组（包目录名），豁免包内相对引用
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: {
        path: '^(packages|apps)/([^/]+)/',
        pathNot: '^(packages|apps)/$2/',
        dependencyTypes: ['local'],
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      // 占位包（9 个 placeholder 包与各 app 入口）当前天然 orphan，属已知基线；
      // 仅告警不失败，P1B 接线后应清零再考虑升级为 error
      from: {
        orphan: true,
        pathNot: [
          '(^|/)(test|__tests__)/', // 测试文件本就是入口
          '\\.(spec|test)\\.[jt]sx?$',
          '[/.-]config\\.[cm]?[jt]s$', // vitest/next 等配置文件由工具加载
          '/(layout|page|route|loading|error|not-found|template|default)\\.[jt]sx?$', // Next.js App Router 入口由框架加载
          '^apps/web/scripts/', // package scripts are command entrypoints
          '^packages/ui/src/index\\.ts$', // package entrypoint retained while the shared UI package is staged
          '^apps/sandbox-controller/src/index\\.ts$', // declared app entrypoint; implementation currently lives in science-worker
          '^(packages/storage/src/types|packages/observability/src/audit|apps/agent-worker/src/parsers/types)\\.ts$', // type-only contract modules are not roots
        ],
      },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: '源码（非测试/配置）不得依赖 devDependencies',
      from: {
        pathNot: [
          '(^|/)(test|__tests__)/',
          '\\.(spec|test)\\.[jt]sx?$',
          '[/.-]config\\.[cm]?[jt]s$',
          '^apps/web/scripts/',
        ],
      },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    // The Web workspace owns the monorepo's only path alias (`@/*`). Loading its
    // tsconfig keeps those dependency edges visible to circular/orphan rules.
    tsConfig: { fileName: path.resolve('apps/web/tsconfig.json') },
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '(^|/)(dist|\\.next)(/|$)',
        '^packages/search/(src/)?generated/',
        '\\.d\\.ts$',
      ],
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
