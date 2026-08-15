# Runbook: 部署（Deployment）

> 状态：部分填充（P1A-8 补 API 反代 + /admin basic_auth 部署步骤；CI/CD 自动化归 2.9 填充 deploy.sh）。
> 格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 部署属 Spec §20.5"询问"级操作：执行前需用户确认，必须走 `infra/scripts/deploy.sh` + CI/CD，禁止手工改服务器代码。

## 1. 前置检查

- [ ] 目标 release ref 已 CI 绿灯（lint/typecheck/unit/build）
- [ ] 云上集成测试已全绿（`test:integration`，跑前全量 `build`）
- [ ] `agent-worker` 解析服务已包含在生产 compose，且 parser 依赖可在服务器 release 目录解析
- [ ] `object-storage` 使用固定版本/摘要，仅在 `data_net`，`seaweed-data` 命名卷存在
- [ ] `.env.prod` 已有 `S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`；只检查变量名存在，不输出值
- [ ] 巡检基线 `infra/scripts/checkup.sh` 无告警
- [ ] 备份确认（`docs/runbooks/backup-restore.md`）
- [ ] P1A-8 追加：API 反代 `infra/nginx/openscience.conf` 的 SSL 证书已签发（`~/.acme.sh`）

## 2. 执行步骤

### 2.1 同步代码（`scripts/cloud-sync.mjs`）

```bash
node scripts/cloud-sync.mjs
# tar-over-ssh 同步到 /opt/openscience；排除 .env/.git/node_modules/dist
# 隔离 worktree 部署时设置 XGS_CONFIG_ROOT=/e/Miscellaneous/XGS，服务器配置与 release 源码分离。
# 干净 release 预部署时设置 XGS_REMOTE_ROOT=/opt/openscience-next，先在 staging 目录 build 再切换。
```

### 2.2 安装依赖 + 全量构建（云上）

```bash
ssh-run.sh "cd /opt/openscience && npx pnpm@9.15.0 install && npx pnpm@9.15.0 build"
# 跨包 import 解析到目标包 dist，必须全量 build（AGENTS.md 坑）
```

### 2.3 迁移部署 + seed（如需）

```bash
ssh-run.sh "cd /opt/openscience && node packages/database/dist/migrate-cli.js deploy"
ssh-run.sh "cd /opt/openscience && node scripts/seed-quota.mjs --confirm"   # P1A-7 配额占位值
```

生产栈数据库没有宿主端口映射，实际执行必须通过 API 容器，并从服务器 `.env.prod` 注入容器内 `DATABASE_URL`；`infra/scripts/deploy.sh` 已封装该路径。

生产应用源码与构建产物以 bind mount 进入长期运行容器。`docker compose up -d` 在 Compose 配置未变化时不会切换 Node 进程，因此 `deploy.sh` 会在栈收敛后显式重启 `api web agent-worker`；PostgreSQL、Redis 与对象存储不在该重启集合中。禁止以仅同步文件或仅执行 `up -d` 作为发布完成证据，必须继续完成内部 live route 探针。

### 2.4 初始化生产对象存储（首次）

```bash
# 1) 可恢复备份 Secret 文件；不输出任何值
cp -a /opt/openscience/.env.prod \
  "/opt/openscience/.env.prod.pre-s3-$(date +%Y%m%d-%H%M%S)"

# 2) 缺失时在服务器生成凭据；umask 保证新文件/追加内容仅 owner 可读
umask 077
grep -q '^S3_ACCESS_KEY=' /opt/openscience/.env.prod || \
  printf 'S3_ACCESS_KEY=%s\n' "$(openssl rand -hex 16)" >> /opt/openscience/.env.prod
grep -q '^S3_SECRET_KEY=' /opt/openscience/.env.prod || \
  printf 'S3_SECRET_KEY=%s\n' "$(openssl rand -hex 32)" >> /opt/openscience/.env.prod
grep -q '^S3_BUCKET=' /opt/openscience/.env.prod || \
  printf 'S3_BUCKET=openscience-prod\n' >> /opt/openscience/.env.prod
chmod 600 /opt/openscience/.env.prod

# 3) 经既有代理隧道拉镜像，再验证 compose；命令不得回显 resolved env
with-proxy docker pull chrislusf/seaweedfs:4.41
docker compose --env-file /opt/openscience/.env.prod \
  -f /opt/openscience/infra/compose/docker-compose.prod.yml config --quiet
```

回滚：恢复刚创建的 `.env.prod.pre-s3-*`，切回上一 release compose；`seaweed-data` 卷保留，未经用户明确批准不得删除。

### 2.5 API 反代配置（首次上线或变更时）

```bash
# 1) 上传 nginx 配置到 /etc/nginx/conf.d/openscience.conf（经 ssh-run.sh 或 scp）
# 2) 签发证书——用 DNS-01（Cloudflare API），HTTP-01 被阿里云 403 拦（2026-08-03 实证）：
#    export CF_Token=<token> CF_Zone_ID=<zone-id>
#    ~/.acme.sh/acme.sh --issue -d OpenScience.428312321.xyz --dns dns_cf --server letsencrypt
#    ~/.acme.sh/acme.sh --install-cert -d OpenScience.428312321.xyz \
#      --key-file /etc/nginx/ssl/openscience/key.pem \
#      --fullchain-file /etc/nginx/ssl/openscience/fullchain.pem \
#      --reloadcmd "systemctl reload nginx"
# 3) /admin 强认证凭据（P1A-8，ADR-003）：
#    htpasswd -bc /etc/nginx/.htpasswd-admin <admin-user> '<强密码>'
#    chmod 640 /etc/nginx/.htpasswd-admin && chown root:nginx /etc/nginx/.htpasswd-admin
# 4) 配置生效：
#    nginx -t && systemctl reload nginx
```

### 2.6 启动 API（systemd 或 nohup）

```bash
# 服务单元（见 infra/ 说明）；env 从服务器 Secret 注入，不入库
ssh-run.sh "systemctl restart openscience-api"
```

### 2.7 验证对象存储与 Hermes worker

```bash
ssh-run.sh "cd /opt/openscience && docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml ps api web agent-worker object-storage postgres redis"
ssh-run.sh "cd /opt/openscience && docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml logs --tail=100 agent-worker"
```

预期：`object-storage` 与 API 为 `healthy`，`agent-worker` 为 `Up`；worker 日志出现启动行，不出现模块、Prisma、Redis 或 Storage 连接错误。

## 3. 回滚步骤

- 代码回滚：`node scripts/cloud-sync.mjs` 同步旧 release ref，重新 install + build，重启服务；对象卷保留。
- nginx 回滚：恢复上一版 `openscience.conf`（`cp` 备份），`nginx -t && systemctl reload nginx`。
- 迁移回滚：`node packages/database/dist/migrate-cli.js status` 确认；破坏性迁移先备份（`docs/runbooks/backup-restore.md`）。
- 判定：`checkup.sh` 复跑 + API 健康检查（见 §4）。

## 4. 验证命令

- API 健康：compose healthcheck 以 `/auth/me` 的 401 为健康；`curl -sI https://OpenScience.428312321.xyz/auth/me` → 401（未登录，服务在）
- API 命名空间：`curl -sS https://OpenScience.428312321.xyz/api/explore?limit=1` → 200，且 JSON 包含 `items`/`nextCursor`；禁止把 `/api` 原样转给 Fastify。
- 身份页面：`curl -sI https://OpenScience.428312321.xyz/auth/login` 与 `/auth/register` → 200；页面精确 location 必须优先于直连 Fastify 的 `/auth/*` API location。
- 受保护读取：`curl -sI https://OpenScience.428312321.xyz/api/workspaces` → 401 而不是 404。
- /admin 强认证：`curl -sI -u <admin-user> https://OpenScience.428312321.xyz/admin/` → basic_auth 放行后 401（API 层判未登录）或 200/403
- 安全响应头：`curl -sI https://OpenScience.428312321.xyz/auth/me` → 含 `X-Content-Type-Options: nosniff`、CSP `default-src 'none'`
- 限流：连续打 `/auth/login` 5+ 次 → 429 + `Retry-After`
- 巡检复跑：`infra/scripts/checkup.sh` 无新增告警
- Nginx 合同：`node --test infra/nginx/openscience.test.mjs` → 5/5；每次部署必须同步仓库配置，不得“文件已存在则跳过”。
- 对象存储：运行 adapter put/head/get smoke，输出仅 pass/fail；不得输出凭据、object 内容或 endpoint 值。
- worker 验证：按 §2.7 执行，确认 parser 依赖在服务器可加载；图片 OCR 服务未通过独立验收前不得解除生产门禁。

## 5. Latest Optical Editorial Acceptance (2026-08-11)

- Release ref: `f5bb6e7`; rollback ref: `53d5cbf`.
- Before deployment: database backup passed at 232K with 7/7 retention slots.
- Source verification: remote and local SHA-256 for `apps/web/components/brand/OpticalField.tsx` match after deployment; the pre-deploy remote hash matched the rollback ref.
- Deployment command used the isolated worktree as `XGS_SOURCE_ROOT` and the main repository as `XGS_CONFIG_ROOT`; no `.env`, credentials, screenshots or agent state were synchronized.
- On Windows, invoke `C:/Program Files/Git/bin/bash.exe` explicitly. The system `bash.exe` resolves to WSL in this environment and cannot translate the project SSH-key path.
- Services after activation: API, PostgreSQL, Redis, object storage and malware scanner healthy; Web and agent worker running; no fatal/uncaught/module/connection-refused worker log in the 15-minute acceptance window.
- Public probes: Landing, Explore, Ultrafast Science Collection and the canonical demo Public RO return 200; unauthenticated `/auth/me` returns 401.
- Real-browser flow: sign-in, Dashboard, seven RO product surfaces, three-format Intake, async `needs_review`, Hermes confirmation, version creation and Publish-ready surface passed. The synthetic acceptance object must not be publicly published.

Current infrastructure uses pinned base/worker images with bind-mounted application code. Until a dedicated immutable-image migration is implemented, the verified Git ref plus remote source hash is the rollback anchor; do not describe the Web/API deployment as a per-release immutable image.

### 5.1 Final Hermes refinement (2026-08-11)

- Release ref: `0c79aa2`; pre-deploy database backup: 272K, 7/7 retention.
- No schema change; deployment used `--skip-migrate` and still performed full workspace build.
- Remote `HermesVisualAdapter.tsx` SHA-256 matched the local release source after activation.
- API/Web/agent-worker restarted; API and all data dependencies healthy; worker critical-error count 0.
- Server-side TLS probes for Landing, Login, Explore, Collection and Public RO returned 200.
- Chromium against the public domain verified Dashboard 1440×900 and 390×844 with status 200, overflow 0 and browser errors 0. The browser requests used synthetic route fixtures and created no production records; the preceding Task 15 acceptance remains the real-account product-journey evidence.

### 5.2 Fixed glyph diffraction correction (2026-08-11)

- Release ref: `cd5be36`; rejected visual baseline: `b45e002`.
- Pre-deploy checkup passed; database backup: 276K, 7/7 retention.
- No schema or API change; deployment used `--skip-migrate`, completed the full workspace build, and restarted only API/Web/agent-worker.
- Nginx configuration test passed; public `/` and `/explore` returned 200, while unauthenticated `/auth/me` returned the expected 401.
- Chromium against the public domain passed 1440×900, 1920×1080 and 390×844 normal/reduced/Open RO cases plus independent pointer-left/slit/right frames at 60/150/300ms. Human inspection found no pointer-centered particle disk, moving optical axis, or quadratic fan.

### 5.3 Accepted shared optical surface deployment (2026-08-14)

> Release `b6a41da`; rollback `cd5be36`. The physical-mobile performance gate
> was explicitly waived for this release only; simulated mobile evidence is not
> described as physical hardware.

- Local source promotes the accepted amplified asset composition through one
  shared `AcceptedOpticalSurface` consumed by Landing and the isolated asset
  Lab. It retains the public shell/navigation/CTA/Latest Research contract and
  removes the legacy `OpticalHeadline` runtime from `/` without deleting its
  source files.
- Task 19 local acceptance is GREEN: focused `12/12`, Web `239/239`, typecheck,
  production build, canonical lint/docs sync, product release `27/27`, Landing
  desktop/mobile/reduced/pointer/idle, exact Lab native interaction/lifecycle
  matrix and byte-identical accepted reduced frame.
- The final renderer uses `5px` pointer-local follow and a `10px` combined local
  displacement cap without global title/camera motion. Native A/B evidence
  registers exactly `+5px`; the `10→14px` mutation exposes the forbidden extra
  `+4px`. The complete matrix keeps the `.16–.20` halo at `2/16` sectors.
- The independent overlay alpha mask is pointer-centred (`<=.04`); final
  authored+overlay centroid is `<=.08` with locality `>=.80`. Overlay-disable
  is enforced by a real WebGL skip-draw mutation that suppresses `487` draws
  and fails upper/lower pixels. Same-RAF local recovery completes at `767.8ms`
  after exact local zero at `700ms` while ambient motion continues. Idle frames
  omit the zero-alpha overlay draw and retain authored ambient motion.
- ADR-009 now authorizes the shared Landing/Lab OGL production exception and
  records the WebGL2/static/reduced failure policy, continuous visible ambient
  owner, browser-only/ECS boundary and measured bundle/static asset budget.
- Hardware Chrome 150 selected the physical D3D11 RTX 4060 rather than
  SwiftShader. Over the active Windows Remote Display cadence of about `32Hz`,
  the 15-second resting and pointer intervals both measured `31.2ms` median,
  `31.9ms` p95 and `0` cadence-relative dropped frames at DPR 1/fixed-full
  quality. This is not a 60Hz local-console measurement.
- **Accepted risk:** no connected physical mobile was discoverable through ADB
  or Windows portable-device enumeration. The user explicitly waived this
  release gate on 2026-08-14 and authorized deployment after all remaining
  local gates. Simulated mobile/reduced evidence must not be described as a
  physical-mobile performance result.
- Pre-deploy checkup passed; database backup returned
  `BACKUP_OK size=280K files=7/7`. The approved dry-run preceded
  `deploy.sh --confirm --skip-migrate`; no migration or seed ran and no schema,
  Nginx, Compose, topology or secret changed.
- Remote full-workspace build passed and API/Web/agent-worker restarted. Post
  checkup shows API/PostgreSQL/Redis/object storage/malware scanner healthy;
  Nginx and Cloudflare ingress are active. Critical API/Web/worker log matches
  in the deployment window: `0`.
- Public `/`, `/_visual/optical-lab?candidate=asset` and `/explore` return 200;
  unauthenticated `/auth/me` returns 401. Remote `asset-overlay.ts` SHA-256
  `4f2674b3c041416074b97df27245ee82062a45981fa439f0e9d8979f5554d633`
  matches the local release.
- Chromium against the public domain passed 1672×941 and 390×844 normal and
  reduced modes: one semantic `h1`, retained navigation/CTA/Latest Research,
  zero overflow/errors, normal idle pixel changes in all four quadrants and
  pointer response; reduced mode creates no interaction canvas.

### 5.4 Stronger idle optical flow deployment (2026-08-14)

> Release `28c7789`; rollback `b6a41da`. The same one-release physical-mobile
> performance waiver remains in force; simulated mobile is not hardware proof.

- The no-input authored displacement is `4.5px` on a `5s` cycle with the
  existing `.05` vector cap. Pointer response/caps, overlay ownership and exact
  `700ms` local zero are unchanged. Previous-local persistence remains `.985`
  inside its support and is suppressed outside it, avoiding whole-frame ambient
  duplication.
- Local acceptance passed focused `14/14`, Web `241/241`, typecheck, canonical
  lint/docs sync, production build, two consecutive full native matrices,
  reduced exact-static, Landing desktop/mobile normal/reduced/pointer/three idle
  windows and product release `27/27`. Independent review returned APPROVE.
- Pre/post checkup passed. Database backup returned
  `BACKUP_OK size=280K files=7/7`; dry-run preceded
  `deploy.sh --confirm --skip-migrate`. The remote full-workspace build passed
  and Web/API/agent-worker restarted; no migration or seed ran.
- Public `/`, asset Lab and `/explore` return `200`; unauthenticated `/auth/me`
  returns `401`. The four changed renderer/source SHA-256 values match locally
  and remotely. Public Chromium passed 1672×941 and 390×844 normal/reduced,
  three consecutive `360ms` idle windows with at least `1%` changed pixels in
  every window/all four quadrants, pointer response and exact reduced fixture.
- Restart logs contain the expected prior-process `SIGTERM`; stale Server Action
  requests occurred before the final Ready marker. No new runtime error appears
  after the deployed server became ready.

### 5.5 Perceptible Landing idle current deployment (2026-08-14)

> Release `8edf6fa`; rollback `28c7789`. This release changes only the Landing
> optical presentation and its browser evidence; no schema, API, Compose,
> Nginx or secret contract changed.

- A Landing-only `3.4s` cool-white-warm light current now moves across the
  central title at rest and pauses during renderer-owned local interaction.
  Reduced motion remains exact static. The operating-system arrow is hidden
  only over the Landing optical stage.
- Local acceptance passed focused `14/14`, Web `241/241`, typecheck, canonical
  lint/docs sync, 16-page build, full native Lab matrix, reduced exact-static,
  Landing desktop/mobile normal/reduced/pointer/idle evidence and product
  release `27/27`. Independent review returned APPROVE with 0
  Critical/Important findings.
- Pre/post checkup passed. Database backup returned
  `BACKUP_OK size=280K files=7/7`; dry-run preceded
  `deploy.sh --confirm --skip-migrate`. No migration or seed ran.
- Public `/`, asset Lab and `/explore` return `200`; unauthenticated `/auth/me`
  returns `401`. Public Chromium passed desktop/mobile normal/reduced and three
  consecutive `360ms` central-title-band windows at RGB delta `>=3`. Retained
  screenshots were inspected for complete glyphs, visible resting motion and
  absence of the black arrow cursor.

### 5.6 Unified water material and clean target deployment (2026-08-14)

> Deployed release `744c631`; rollback `8edf6fa`.

- Task 22 removes the superseded `3.4s` CSS sweep. The existing WebGL flow uses
  a continuous, non-wrapping shader clock on a ten-second scale; derivative
  curvature gates the narrow caustic crest so no independent broad wash can
  appear. Pointer caps and exact `700ms` local recovery are unchanged.
- The full-page target reference is constrained to title-only contribution in
  both CSS and flipped-Y shader coordinates. The new browser gate proves zero
  static contamination-zone pixels and zero bright lower-left pixels in the
  renderer-owned same-RAF PNG.
- Required pre-deploy evidence: focused/Web/typecheck/lint/build; Landing
  desktop/mobile normal/reduced/idle/pointer; full native interaction/lifecycle;
  product release `27/27`; independent review with no Critical/Important.
- The product owner renewed the unavailable physical-mobile performance waiver
  through Task 22. Emulated mobile remains layout/behavior evidence only.
- Execute the existing pre-checkup, database backup, dry-run and
  `deploy.sh --confirm --skip-migrate` sequence. Do not run migration or seed.
  After deployment, verify `/`, asset Lab and `/explore` return `200`, anonymous
  `/auth/me` returns `401`, and rerun the public Landing browser gate before
  recording release/rollback/backup identifiers here.
- Actual operation: pre/post checkup passed; the same release window's database
  backup was `BACKUP_OK size=280K files=7/7`. Dry-run preceded two
  `deploy.sh --confirm --skip-migrate` hotfix deployments; neither ran migration
  nor seed. Intermediate `8fe2094`, `3edfd03`, and `68920c3` were rejected by
  public phase coverage (`.20096`, `.22907`, `.21292` row ratios against `.20`).
  Final `744c631` keeps the curvature-light intensity but uses near-neutral
  cool/warm white; local and public Landing gates each passed five consecutive
  runs. `/`, asset Lab and `/explore` return `200`; anonymous `/auth/me` returns
  `401`. Remote composite SHA-256 matches local
  `3d7e8439dcae1612f76cb546cdcb246d14e9b47665d6ca2203e15878800213c0`.

### 5.7 Perceptually visible idle presentation deployment (2026-08-15)

> Deployed release `48809d6`; rollback `744c631`.

- Task 23 corrects the acceptance boundary from raw transparent-canvas motion
  to the final composed `AcceptedOpticalSurface`. Landing alone receives full
  presentation alpha, `2.2px` non-linear idle drift, centre curvature breathing,
  and sparse glyph-edge shimmer; all presentation accents yield under local
  input and evaluate to zero in Lab. No schema, API, dependency, asset, route,
  texture, framebuffer, owner, Nginx, Compose, or Secret changes are included.
- The product owner approved the visual candidate and deployment after the
  Lab PNG completion timing RED was disclosed (`956.7ms > 900ms`, recovered
  max delta `9`); this remains accepted timing risk, not a GREEN native matrix.
  The owner separately renewed the unavailable physical-mobile performance
  waiver for Task 23. Simulated mobile remains layout/behavior evidence only.
- Required evidence before the server write: focused/Web/typecheck/canonical
  lint/build, final-surface Landing desktop/mobile normal/reduced/idle/pointer,
  product release `27/27`, docs gates, and independent review with no
  Critical/Important findings. Use checkup, DB backup, dry-run, then
  `deploy.sh --confirm --skip-migrate`; do not run migration or seed.
- After deployment verify `/`, asset Lab and `/explore` return `200`, anonymous
  `/auth/me` returns `401`, rerun the public final-surface Landing gate, compare
  the remote composite shader hash with the release, and record the actual
  release/rollback/backup/checkup evidence here.
- Actual operation: pre/post checkup passed; DB backup returned
  `BACKUP_OK size=280K files=7/7`; dry-run preceded
  `deploy.sh --confirm --skip-migrate`. Remote full-workspace and 16-page Web
  builds passed; no migration or seed ran. Public `/`, asset Lab and `/explore`
  return `200`, anonymous `/auth/me` returns `401`. Remote/local composite
  SHA-256 both equal
  `277f77ffe1e9269e3ce58d3ebf0aaba88bd6c9c959fb5bcc382425dd8f66b272`.
  The first public browser run timed out at `networkidle` before assertions;
  the unchanged rerun passed desktop/mobile normal/reduced/idle/pointer and the
  final-surface `1200ms` salience/band contract. Public screenshots were
  inspected without clipping, cursor/status contamination, hard halo, or broad
  chromatic bands.

### 5.8 Content-addressed optical asset cache (2026-08-16)

> Local candidate only; production deployment requires a separate confirmation.

#### Pre-deployment checks

- Verify `apps/web/lib/optical-lab/asset-manifest.mjs` contains the complete
  SHA-256 of each canonical PNG and that the versioned URL embeds its first 16
  hexadecimal digits.
- Run the focused cache contract, complete Web tests, typecheck, production
  build, canonical lint, and docs gates.
- Confirm `/`, `/api/*`, and canonical `/optical-lab/*.png` paths are absent
  from the one-year immutable header rules.

#### Execution

1. Run the standard checkup and database backup even though this change has no
   schema or data mutation.
2. Run the deployment dry-run, then `deploy.sh --confirm --skip-migrate`.
3. Do not purge old hashed URLs. New content receives a different URL and old
   cached bytes are harmless.

#### Rollback

- Redeploy the preceding release. Its HTML and WebGL bundle reference the prior
  hashed URLs, which remain valid in Cloudflare and at the canonical source.
- Do not rename or delete canonical PNG files during rollback.

#### Verification

- `curl -sSI` for each versioned PNG must return
  `Cache-Control: public, max-age=31536000, immutable` and `200`.
- The canonical PNG paths must not return `immutable`; `/` must remain
  `private, no-cache, no-store`, and anonymous `/auth/me` must remain `401`.
- A second public request should progress from `MISS`/`REVALIDATED` to `HIT`
  with a non-zero `Age`; cache propagation is verified without purging.
