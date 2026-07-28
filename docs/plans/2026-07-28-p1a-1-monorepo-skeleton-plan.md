# P1A-1 Monorepo Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化 OpenScience pnpm Monorepo 全量占位骨架，锁定 apps/packages/infra 模块边界，不写业务逻辑。

**Architecture:** 方案 A：一次性创建全部占位目录与最小可构建包。web/api 最小可启动，agent-worker/science-worker/sandbox-controller 仅空壳入口；packages 全部占位，本任务不填充 domain/database/auth/storage 等实现；infra 只建目录占位。

**Tech Stack:** Node.js >= 20, pnpm 9.15.0（经 `npx pnpm@9.15.0` 调用，不全局安装）, TypeScript 5.5.4, Next.js 14.2.35（web 空壳）, Fastify 4.28.1（api 空壳）, ESLint 8.57.0。

## Global Constraints

- 只做 P1A-1 骨架：不实现 SDF/编辑器（1B）、协作（1C）、Hermes/发布（1D）、可视化沙箱（1E）和 Spec §19 Phase 2 功能。
- 模块边界对齐 ADR-001：Provider SDK 不得进入业务代码；本任务不创建任何 Provider SDK 调用。
- 工具可迁移性对齐 ADR-002：不全局安装工具；pnpm 一律用 `npx pnpm@9.15.0`；密钥不写入仓库。
- 不读取/打印 `.env`；不执行 `git commit`/`git push`；验收以文件存在与命令输出为准。
- Windows/Git Bash 环境；所有命令在 `E:/Miscellaneous/XGS` 执行。

## File Structure

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.cjs`, `.npmrc`
- Create: `scripts/verify-workspace.mjs`
- Create: `apps/web/**` 最小 Next.js 空壳
- Create: `apps/api/**` 最小 Fastify 空壳
- Create: `apps/agent-worker/**`, `apps/science-worker/**`, `apps/sandbox-controller/**` 空壳 TS 包
- Create: `packages/{domain,database,auth,sdf-schema,versioning,storage,ai-gateway,search,ui,config,observability}/**` 占位 TS 包
- Create: `infra/{compose,nginx,sandbox,scripts,migrations}/.gitkeep`
- Modify: `project_index.md`, `docs/progress.md`, Memory, task-master status（执行后）

---

### Task 1: Root workspace + failing structure test

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `scripts/verify-workspace.mjs`
- Test: `scripts/verify-workspace.mjs`

**Interfaces:**
- Consumes: none
- Produces: root scripts `verify:workspace`, `build`, `typecheck`, `lint`; workspace globs `apps/*`, `packages/*`, `infra/*`

- [ ] **Step 1: Write the failing structure test**

Create `scripts/verify-workspace.mjs`:

```js
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'apps/web/package.json',
  'apps/api/package.json',
  'apps/agent-worker/package.json',
  'apps/science-worker/package.json',
  'apps/sandbox-controller/package.json',
  'packages/domain/package.json',
  'packages/database/package.json',
  'packages/auth/package.json',
  'packages/sdf-schema/package.json',
  'packages/versioning/package.json',
  'packages/storage/package.json',
  'packages/ai-gateway/package.json',
  'packages/search/package.json',
  'packages/ui/package.json',
  'packages/config/package.json',
  'packages/observability/package.json',
  'infra/compose/.gitkeep',
  'infra/nginx/.gitkeep',
  'infra/sandbox/.gitkeep',
  'infra/scripts/.gitkeep',
  'infra/migrations/.gitkeep'
];

const missing = required.filter((p) => !existsSync(p));
if (missing.length) {
  console.error('MISSING_WORKSPACE_FILES');
  for (const p of missing) console.error(`- ${p}`);
  process.exit(1);
}

const root = JSON.parse(readFileSync('package.json', 'utf8'));
if (root.private !== true || !root.workspaces?.includes('apps/*') || !root.workspaces?.includes('packages/*')) {
  console.error('BAD_ROOT_PACKAGE');
  process.exit(1);
}
console.log('WORKSPACE_STRUCTURE_OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/verify-workspace.mjs`
Expected: FAIL with `MISSING_WORKSPACE_FILES`

- [ ] **Step 3: Write root workspace files**

Create `package.json`:

```json
{
  "name": "openscience",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "workspaces": [
    "apps/*",
    "packages/*",
    "infra/*"
  ],
  "scripts": {
    "build": "pnpm -r --if-present build",
    "typecheck": "pnpm -r --if-present typecheck",
    "lint": "node scripts/verify-workspace.mjs",
    "verify:workspace": "node scripts/verify-workspace.mjs"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "eslint": "8.57.0",
    "typescript": "5.5.4"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `.npmrc`:

```ini
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 4: Run test to verify it still fails**

Run: `node scripts/verify-workspace.mjs`
Expected: FAIL with `MISSING_WORKSPACE_FILES`（apps/packages/infra 尚未创建）

- [ ] **Step 5: No commit**

Do not run `git add`/`git commit`. 验收保留命令输出。

---

### Task 2: Shared TypeScript/ESLint baseline

**Files:**
- Create: `tsconfig.base.json`
- Create: `eslint.config.cjs`
- Test: `scripts/verify-workspace.mjs`

**Interfaces:**
- Consumes: Task 1 root `package.json`
- Produces: shared compiler options used by every `tsconfig.json`; flat ESLint config that ignores build outputs

- [ ] **Step 1: Write shared TS config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Write flat ESLint config**

Create `eslint.config.cjs`:

```js
module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', 'infra/**']
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {}
  }
];
```

- [ ] **Step 3: Run workspace test**

Run: `node scripts/verify-workspace.mjs`
Expected: still FAIL（apps/packages/infra 未创建）

---

### Task 3: apps placeholders (web/api startable, workers empty)

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/tsconfig.json`, `apps/web/app/page.tsx`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`
- Create: `apps/agent-worker/package.json`, `apps/agent-worker/tsconfig.json`, `apps/agent-worker/src/index.ts`
- Create: `apps/science-worker/package.json`, `apps/science-worker/tsconfig.json`, `apps/science-worker/src/index.ts`
- Create: `apps/sandbox-controller/package.json`, `apps/sandbox-controller/tsconfig.json`, `apps/sandbox-controller/src/index.ts`
- Test: `scripts/verify-workspace.mjs`

**Interfaces:**
- Consumes: Task 2 `tsconfig.base.json`
- Produces: app package names `@openscience/web`, `@openscience/api`, `@openscience/agent-worker`, `@openscience/science-worker`, `@openscience/sandbox-controller`

- [ ] **Step 1: Create web empty shell**

`apps/web/package.json`:

```json
{
  "name": "@openscience/web",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "next": "14.2.35",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0"
  }
}
```

`apps/web/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "plugins": [{ "name": "next" }],
    "lib": ["dom", "dom.iterable", "es2022"]
  },
  "include": ["next-env.d.ts", "app/**/*.ts", "app/**/*.tsx"],
  "exclude": ["node_modules", ".next"]
}
```

`apps/web/app/page.tsx`:

```tsx
export default function Page() {
  return <main>OpenScience web placeholder</main>;
}
```

- [ ] **Step 2: Create api empty shell**

`apps/api/package.json`:

```json
{
  "name": "@openscience/api",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "fastify": "4.28.1"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`apps/api/src/index.ts`:

```ts
import Fastify from 'fastify';

const app = Fastify();
app.get('/health', async () => ({ ok: true }));

if (process.env.NODE_ENV !== 'test') {
  app.listen({ port: 4010, host: '127.0.0.1' }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default app;
```

- [ ] **Step 3: Create three worker empty shells**

For each of `agent-worker`, `science-worker`, `sandbox-controller`, create same shape with names `@openscience/agent-worker`, `@openscience/science-worker`, `@openscience/sandbox-controller`:

`package.json`:

```json
{
  "name": "@openscience/agent-worker",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`src/index.ts`:

```ts
export const placeholder = true;
```

Repeat the same three files for `science-worker` and `sandbox-controller`, changing only the package `name`.

- [ ] **Step 4: Run workspace test**

Run: `node scripts/verify-workspace.mjs`
Expected: FAIL only for missing `packages/*/package.json` and `infra/*/.gitkeep`

---

### Task 4: packages placeholders

**Files:**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts`
- Create: same triplet for `database`, `auth`, `sdf-schema`, `versioning`, `storage`, `ai-gateway`, `search`, `ui`, `config`, `observability`
- Test: `scripts/verify-workspace.mjs`

**Interfaces:**
- Consumes: Task 2 `tsconfig.base.json`
- Produces: package names `@openscience/domain`, `@openscience/database`, `@openscience/auth`, `@openscience/sdf-schema`, `@openscience/versioning`, `@openscience/storage`, `@openscience/ai-gateway`, `@openscience/search`, `@openscience/ui`, `@openscience/config`, `@openscience/observability`

- [ ] **Step 1: Create eleven placeholder packages**

For each package `<name>` in `domain database auth sdf-schema versioning storage ai-gateway search ui config observability`, create:

`packages/<name>/package.json`:

```json
{
  "name": "@openscience/<name>",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/<name>/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`packages/<name>/src/index.ts`:

```ts
export const placeholder = true;
```

- [ ] **Step 2: Run workspace test**

Run: `node scripts/verify-workspace.mjs`
Expected: FAIL only for missing `infra/*/.gitkeep`

---

### Task 5: infra placeholders + full local verification

**Files:**
- Create: `infra/compose/.gitkeep`, `infra/nginx/.gitkeep`, `infra/sandbox/.gitkeep`, `infra/scripts/.gitkeep`, `infra/migrations/.gitkeep`
- Test: `scripts/verify-workspace.mjs`

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: `WORKSPACE_STRUCTURE_OK`; root `build/typecheck/lint` pass

- [ ] **Step 1: Create infra placeholders**

Run:

```bash
mkdir -p infra/{compose,nginx,sandbox,scripts,migrations}
touch infra/{compose,nginx,sandbox,scripts,migrations}/.gitkeep
```

- [ ] **Step 2: Run structure test**

Run: `node scripts/verify-workspace.mjs`
Expected: `WORKSPACE_STRUCTURE_OK`

- [ ] **Step 3: Install dependencies without global pnpm**

Run: `npx pnpm@9.15.0 install`
Expected: lockfile `pnpm-lock.yaml` created, install completes

- [ ] **Step 4: Run build/typecheck/lint**

Run:

```bash
npx pnpm@9.15.0 build
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
```

Expected: all exit 0；`lint` 输出 `WORKSPACE_STRUCTURE_OK`

- [ ] **Step 5: Smoke check api health module without leaving process running**

Run:

```bash
NODE_ENV=test node -e "import('./apps/api/dist/index.js').then(() => console.log('API_IMPORT_OK'))"
```

Expected: `API_IMPORT_OK`

- [ ] **Step 6: No commit**

Do not run `git add`/`git commit`. 汇总验证输出，准备更新 `project_index.md`、`docs/progress.md`、Memory、task-master。

## Self-Review

- Spec coverage: P1A-1 只覆盖 Monorepo 骨架、共享 tsconfig/eslint、apps/packages/infra 占位、最小 build/typecheck/lint；未覆盖 P1A-2+ 的数据库/Redis/Storage/Auth/CI。
- Placeholder scan: 无 TBD/TODO；空壳包明确为 placeholder，且不实现业务逻辑。
- Type consistency: 所有 TS 包统一 `extends: ../../tsconfig.base.json`、`include: src/**/*.ts`、脚本 `build/typecheck`；web 使用 Next 专用 `noEmit` 配置，api/workers/packages 使用 NodeNext 构建配置。
