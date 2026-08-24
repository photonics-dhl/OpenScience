# Runbook: 部署（Deployment）

> 状态：**CURRENT**。2026-08-24 验收的 active application release 为 `33418fdf9e4c13cd3e34eba0a15f6f0208fc5183`，rollback tree 为 `2abfe42e56881ae7b7a3e7f0a0b3a97b31762326`；2026-08-25 mouth-anchored speech application source `eb55820ee67d00b0924797ccbbd1db395412f07a` 已完成本地门禁，尚未部署。docs-only HEAD 不得冒充 application source。
> 格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 部署属 Spec §20.5"询问"级操作：执行前需用户确认，必须走 `infra/scripts/deploy.sh` + CI/CD，禁止手工改服务器代码。

## 1. 前置检查

- [ ] 目标 release ref 已 CI 绿灯（lint/typecheck/unit/build）
- [ ] 云上集成测试已全绿（`test:integration`，跑前全量 `build`）
- [ ] `document-parser` 隔离解析 sidecar 已包含在生产 compose，`agent-worker` 仅通过 128 MiB `parser-jobs` tmpfs 卷交换请求；sidecar 必须使用自包含镜像，且保持无宿主源码/Secret 挂载、无网络、只读 rootfs、非 root 与 512MB/64 PID 上限
- [ ] Parser 镜像构建使用 host network + `127.0.0.1:7891` Squid 访问 apt/npm；这只作用于构建，运行时仍必须是 `network_mode:none`
- [ ] `object-storage` 使用固定版本/摘要，仅在 `data_net`，`seaweed-data` 命名卷存在
- [ ] `.env.prod` 已有 `S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`；只检查变量名存在，不输出值
- [ ] 巡检基线 `infra/scripts/checkup.sh` 无告警
- [ ] 备份确认（`docs/runbooks/backup-restore.md`）
- [ ] P1A-8 追加：API 反代 `infra/nginx/openscience.conf` 的 SSL 证书已签发（`~/.acme.sh`）

### 1.1 Windows 必须用 Git Bash 执行 SSH 脚本

Windows 上不要用系统 `bash.exe`、WSL 或 `wsl bash` 调用 `infra/scripts/ssh-run.sh`、`checkup.sh` 和部署脚本。WSL 的 HOME 是 `/root`，看不到 Windows SSH 配置；Windows 挂载的 `C:/Users/Mac/.ssh/id_ed25519_xgs` 在 WSL 中又显示为 `0777`，OpenSSH 会以私钥权限过宽为由拒绝加载。

在 PowerShell 中显式调用 Git for Windows Bash：

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/checkup.sh
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/ssh-run.sh '<read-only command>'
```

Git Bash 会沿用 Windows 用户目录中的 SSH 配置和项目专用密钥。出现“SSH 认证失败”时，先检查实际调用的是不是 `C:\Program Files\Git\bin\bash.exe`；不要改用密码，不要复制、打印或放宽私钥权限。2026-08-24 09:22 +08 已用上述 `checkup.sh` 命令完成只读复验。

## 2. 执行步骤

### 2.1 同步代码（`scripts/cloud-sync.mjs`）

```bash
infra/scripts/deploy.sh --rollback-ref <known-good-ref> <release-ref> # dry-run
infra/scripts/deploy.sh --confirm --rollback-ref <known-good-ref> <release-ref>
# deploy 只接受 clean HEAD；完整 git archive 落到 /opt/openscience-releases/<40-char-sha>。
# 不使用文件白名单；.dockerignore 等所有 tracked build input 必须进入归档。
# /opt/openscience/.env.prod 与 .release-id 是稳定运行状态，不进入 release 目录。
```

### 2.2 安装依赖 + 全量构建（云上）

```bash
ssh-run.sh "cd /opt/openscience-releases/<sha> && npx pnpm@9.15.0 install && npx pnpm@9.15.0 --filter @openscience/database generate && npx pnpm@9.15.0 build"
# clean Git archive 不含生成的 Prisma Client；先 generate，再做解析到各包 dist 的全量 build。
```

### 2.3 迁移部署 + seed（如需）

```bash
# 只通过 deploy.sh 的 versioned Compose `run --rm --no-deps` 路径执行；不要在宿主直连 DB。
```

生产栈数据库没有宿主端口映射，实际执行必须通过 API 容器，并从服务器 `.env.prod` 注入容器内 `DATABASE_URL`；`infra/scripts/deploy.sh` 已封装该路径。

生产 Web/API/Agent Worker 以非 root 从 `XGS_RELEASE_ROOT` 只读挂载到容器内 `/opt/openscience`；Web 只有独立 bounded cache 可写。Worker/Parser image tag 等于 `XGS_RELEASE_IMAGE_TAG` SHA，`document-parser` 仍是自包含镜像。`deploy.sh` 先完成 install、全量 build 与 image build，再执行迁移并切换服务；Parser 先 healthy，随后 `api web agent-worker` 强制重建并硬等待。后续回滚使用上一 release 自己的 Compose；首次版本化切换因 legacy Compose 不支持 release 变量，显式使用新 Compose 适配器，并从正在运行的容器 image ID 保存 rollback images。公网健康与 `/__release` 精确 SHA 通过前，ERR handler 保留可验证上一 release；同 SHA 只验证并 no-op。禁止以仅同步文件、仅执行 `up -d` 或忽略 HTTP 状态作为发布完成证据。

Release SHA 目录是 write-once：已存在目录只核验 marker 与输入 archive，不会自动删除或替换。若存在 `/opt/openscience/.release-failed`，或 `.release-id` 缺失但仍有容器挂载 `/opt/openscience-releases/*`，部署必须硬停止；运维人员需先核对容器、Compose、Nginx 和实际 SHA，完成显式恢复后再清理故障标记。不得用再次部署代替恢复。

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
release_sha="$(cat /opt/openscience/.release-id)"
release_root="/opt/openscience-releases/$release_sha"
XGS_RELEASE_ROOT="$release_root" XGS_RELEASE_IMAGE_TAG="$release_sha" docker compose --env-file /opt/openscience/.env.prod \
  -f "$release_root/infra/compose/docker-compose.prod.yml" config --quiet
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
ssh-run.sh 'sha=$(cat /opt/openscience/.release-id); root=/opt/openscience-releases/$sha; cd "$root" && XGS_RELEASE_ROOT="$root" XGS_RELEASE_IMAGE_TAG="$sha" docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml ps api web agent-worker document-parser object-storage postgres redis'
ssh-run.sh 'sha=$(cat /opt/openscience/.release-id); root=/opt/openscience-releases/$sha; cd "$root" && XGS_RELEASE_ROOT="$root" XGS_RELEASE_IMAGE_TAG="$sha" docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml logs --tail=100 agent-worker'
```

预期：`object-storage`、API、Web、`agent-worker` 与 `document-parser` 均为 `healthy`；worker 日志出现启动行，不出现模块、Prisma、Redis、Storage 或 parser sidecar 连接错误。另以 `docker inspect` 确认 `document-parser` 的网络模式为 `none`、用户为 `node`、rootfs 只读、memory 为 512MB、PID 上限为 64，Mounts 中只有 `parser-jobs` 且 Config.Env 不含生产数据库、对象存储或 MiniMax Secret。

## 3. 回滚步骤

- 应用回滚：部署脚本在公网验收前自动恢复上一 SHA 自己的 Compose、只读 bind root、SHA-tagged images 与 Nginx；只有恢复成功才原子更新 `.release-id`。恢复失败必须删除不可信 `.release-id` 并写入 `.release-failed` 供人工诊断。首次版本化切换是唯一使用新 Compose 兼容适配器的例外。手工回滚仍需为目标和回退点同时提供明确 Git ref；不得原地改 release 目录。
- 故障态恢复：`.release-failed` 是阻断标记，不得直接删除后盲目重跑。先确认实际容器 image/mount、目标 release 自身 Compose 与 Nginx，再恢复一个可信 `.release-id`；任何 release SHA 目录都不得自动覆盖。
- nginx 回滚：恢复上一版 `openscience.conf`（`cp` 备份），`nginx -t && systemctl reload nginx`。
- 迁移回滚：应用自动回滚不撤销数据库变更。先按 migration `rollback.sql` 与备份评估兼容性；破坏性迁移未经单独确认不得上线。
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

Historical note for the 2026-08-11 release: it used fixed worker tags and a writable application bind. ADR-011 supersedes that deployment topology for future releases; do not reuse this historical paragraph as a current instruction.

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

> Deployed as release `b93fa9d`; rollback release is `48809d6`.

#### Pre-deployment checks

- Verify `apps/web/lib/optical-lab/asset-manifest.mjs` contains each canonical
  PNG's complete SHA-256 and embeds its first 16 hexadecimal digits in the URL.
- Run the cache contract, complete Web tests, typecheck, production build,
  canonical lint, and docs gates.
- Confirm dynamic HTML/API and canonical PNG paths are absent from immutable
  header rules.

#### Execution and rollback

1. Run the standard checkup and database backup.
2. Run the deployment dry-run, then `deploy.sh --confirm --skip-migrate`.
3. Do not purge old hashed URLs. A new digest publishes updated content at a
   new URL; rollback HTML continues to reference the preceding valid URL.

#### Verification

- Versioned PNGs return `200` and
  `Cache-Control: public, max-age=31536000, immutable`.
- Canonical paths are not immutable; `/` remains non-cacheable and anonymous
  `/auth/me` remains `401`.
- A second public request reaches Cloudflare `HIT` with non-zero `Age`.

#### Deployment evidence

- Release `b93fa9d` used `--skip-migrate`; backup and pre/post checkup passed.
- Both versioned PNGs progressed from `MISS` to `HIT`, with observed `Age`
  values `13` and `12`.
- Public `/`, `/explore`, the asset Lab, and the Landing browser matrix passed.

### 5.9 Hermes real-page motion and field guidance deployment (2026-08-17)

> Deployed release `aa1c8af`; rollback `c9df24d`.

- The release persists an explicit Hermes full/reduced motion choice, exposes
  an accessible enable-motion control, keeps a real Assistant Drawer on RO
  creation/edit routes, and advances semantic guidance from title to import
  and the selected SDF field. No schema, migration, seed, provider prompt,
  permission, Nginx or Secret contract changed.
- Pre-deploy checkup passed and the database backup returned
  `BACKUP_OK size=376K files=7/7`. Dry-run preceded
  `deploy.sh --confirm --skip-migrate`; no migration or seed ran.
- The local deployment invocation reached its 604-second client ceiling near
  the final restart, so completion was established independently rather than
  inferred: the remote Stage SHA-256 `febedc9d144596f9624fa8cf3646d95938195ca980385f37dd4afb59b6b07219`
  matches the release, Web/API/Worker were freshly restarted, Parser and data
  services are healthy, and recent critical-error counts are zero.
- Parser isolation remains `network=none`, `user=node`, read-only rootfs,
  `512MiB`, `64` PIDs, with only `parser-jobs` mounted. Public `/` and
  `/api/explore` return `200`; anonymous `/api/workspaces` and `/auth/me`
  return `401`. A public-domain production-browser matrix passed `6/6` for
  motion persistence, route continuity, creation/import guidance, selected
  SDF field guidance, callable Drawer and reduced-motion actions.

### 5.10 Hermes default-visible motion and docs routing release (2026-08-18)

> Deployed release `017bf1e`; rollback `aa1c8af`.

- Scope: first-use Hermes motion defaults to `full`; a persistent full/reduced
  control remains visible; hydration starts static until the saved preference
  resolves; approval and explicit reduced remain fully still. The same release
  hardens docs-sync with worktree-first routing, one CURRENT handoff, bounded
  reads, and a branch/HEAD/release/rollback tuple.
- Pre-deploy evidence on the merged tree: canonical lint/docs-sync, Web
  `300/300`, Web typecheck, and the 17-page production build passed. No schema,
  migration, seed, provider, permission, or Secret change was included.
- Operation: pre/post checkup passed; DB backup returned
  `BACKUP_OK size=384K files=7/7`; dry-run preceded
  `deploy.sh --confirm --skip-migrate 017bf1e`. The ECS full-workspace build,
  Parser-first health wait, application restart, Nginx validation, and hard
  HTTP checks completed successfully.
- Source integrity: remote/local SHA-256 values match for
  `HermesWorkspaceStage.tsx` (`8414f18f...a9507`) and
  `motion-preference.ts` (`72fd4924...adc6`). Parser remains `network=none`,
  `user=node`, read-only, 512MiB/64 PID, `cap_drop=ALL`, with only
  `/parser-jobs` mounted.
- Public verification: `/`, `/explore`, `/auth/login`, and `/api/explore`
  return `200`; anonymous `/auth/me` and `/admin/` return `401`. The deployed
  Dashboard's 90-second renderer gate passed with 28 actions, 13 distinct
  actions, 22 micro, 6 signature, a 4358ms maximum gap, patrol return,
  six-action whole-character motion, and pointer response.

### 5.11 Hermes form-clear hit area hotfix (2026-08-18)

> Deployed release `1b76b46`; rollback `017bf1e`.

- Scope: Hermes' transparent 288px stage no longer intercepts Workspace form
  controls. Pointer input is restricted to the visible rig, motion control, and
  guide bubble; keyboard invocation, character drag, pointer response, and
  guide actions remain available. No API, schema, permission, provider, or
  production topology changed.
- Evidence: PR runtime/test head `fdba093` passed final GitHub CI run
  `32096174871`; local Web
  `295/295`, product release `27/27`, Hermes aggregate `144.9s`, typecheck,
  lint/docs-sync, and the 17-page production build passed. Parser cancellation
  and breathing gates now wait on deterministic publication/joint state rather
  than scheduler timing.
- Operation: pre/post checkup passed; DB backup returned
  `BACKUP_OK size=384K files=7/7`; dry-run preceded
  `deploy.sh --confirm --skip-migrate 1b76b46`. No migration or seed ran.
- Verification: remote/local SHA-256 values match for
  `HermesWorkspaceStage.tsx` (`c2d44c43...835c6`) and `globals.css`
  (`a8aa0f86...5ab17`). A production-browser mobile proposal-ready test loaded
  the public build and passed `1/1`, including the formerly blocked AI Extract
  click. ECS services, Cloudflare ingress, and local HTTPS remain healthy.

### 5.12 Hermes real-account living-motion repair (2026-08-18)

> Deployed release `39c752b`; rollback `1b76b46`.

- Scope: Dashboard `needs_review` is an active `suggesting` state rather than
  approval-still; the real six-field approval route owns stillness only while
  server task state is `needs_review`. The renderer replaces repeated
  whole-image ellipse deformation with one normalized bind-UV semantic-part
  displacement, and publishes draw heartbeat/fallback diagnostics with bounded
  context-loss recovery. No API, schema, provider, permission, Secret, or
  topology changed.
- Evidence: merged Web `308/308`, typecheck, 17-page build, production E2E
  `14/14`, Hermes real-pixel/affine-mutation/performance gate, root lint/docs,
  and independent review passed. Pre/post checkup was healthy; DB backup was
  `BACKUP_OK size=384K files=7/7`; dry-run preceded
  `deploy.sh --confirm --skip-migrate 39c752b`.
- Public real-account verification: nine real `needs_review` tasks produced
  `presentation=suggesting`, `preference=full`, `renderer=ready`,
  `inputReady=true`, no fallback reason, and zero browser errors. Renderer
  heartbeat advanced by 516.6ms; idle pose/PNG and pointer PNG changed, with
  pointer gesture `focus`. The short-lived verification session was deleted.
- Source integrity: remote/local SHA-256 matched for `part-rig-shaders.ts`,
  `pet-mesh-renderer.ts`, `hermes-state.ts`, and the real Hermes approval page.
  `/`, `/dashboard`, and `/explore` returned `200`; anonymous `/auth/me`
  returned expected `401`.

### 5.13 Readable Workspace and blank-RO guidance release (2026-08-19)

> Deployed release `06072c1`; rollback `8ecf96c`.

- Scope: readable three-surface controls, non-obstructive Hermes field guidance,
  evidence-backed field diffs, durable one-task recovery, and draft SDF support
  for explicitly unresolved fields. Non-draft full-core validation, permissions,
  credit, idempotency, optimistic locking, audit, and version boundaries remain.
- Operation: read-only checkup passed; the final DB backup was 433,513 bytes
  with 7 retained rotations. Both release candidates used clean full-SHA
  materialization, full install/build, SHA Worker/Parser images, Parser-first
  health, application restart, Nginx validation, hard public checks, and an
  explicit rollback ref. Migration status is 27/27 current.
- Public acceptance: `https://openscience.428312321.xyz/__release` returned the
  exact full SHA. A real administrator and real MiniMax created retained private
  RO `ad35cac3-cbd9-4a2a-9a00-9762fcc15e91` with one task and no network
  interception. Five suggestions carried source locators, Results stayed
  explicitly missing, unsupported claims were zero, and edit-accept, accept,
  reject, save, reload, audit, credit, and immutable version 2 all passed.
  Hermes published `idle`, `travel`, `working`, and still `review` states.
- Recovery evidence: the first run exposed a real `PUT /sdf` 400 because draft
  save reused the non-empty publication validator. TDD split draft shape
  validation from non-draft completeness in `06072c1`, then the same public gate
  passed. Temporary verification sessions were removed; ignored video, PNG, and
  metrics remain local evidence only.

### 5.14 Hermes production-ratio movable companion release (2026-08-24)

> Deployed release `5f4e73c`; rollback `c97926a`.

- Scope: exact `360px` desktop / `200px` compact-mobile Hermes, anchored by
  default and movable by whole-character drag; real actor/bubble/guide geometry
  avoids semantic Dashboard work. Compact ink-edge speech uses one four-second
  atomic autonomous beat while priority interaction, task, approval, writing,
  guide and reduced states interrupt immediately. The v09 model, textures,
  motions, hat, tassel, lamp and smoke bytes are unchanged.
- Local evidence: Web `390/390` plus five Node contracts, typecheck, the 18-page
  production build, Live2D/work-assistant gates and canonical product E2E
  `40/40` passed. Live2D first-ready was 906ms; idle/pointer recorded zero
  dropped frames. Independent Sol High review reported no Critical, Important
  or Minor findings.
- Operation: pre/post read-only checkup and the exact dry-run passed before
  `deploy.sh --confirm --skip-migrate --rollback-ref c97926a... 5f4e73c...`.
  Server full-workspace build, SHA-tagged Worker/Parser images, Parser-first
  switching, Nginx validation and hard release checks passed. No migration or
  seed ran; read-only status reports 27/27 migrations current. Latest retained
  DB backup is 441,411 bytes; 2026-08-24 09:02 +08 fresh read-only audit confirms the configured seven retained DB dumps.
- Runtime evidence: all production services are running and health-checked;
  Parser remains `user=node`, read-only, `network=none`, 512MiB and 64 PID.
  `.release-failed` is absent and `/__release` returns the exact full SHA.
  Public SHA-256 values for Cubism Core, `.moc3`, model JSON and both textures
  match the immutable release tree byte for byte.
- Public UI acceptance: the deployed Dashboard passed click, drag, persisted
  dock, reload, 640px breakpoint resize, autonomous bubble/dismiss, Create and
  protected-geometry checks at `1440×900`, `1920×1080` and `390×844`. API
  responses/writes were intercepted to avoid production data mutation; this is
  deliberately not recorded as a real-account/database vertical gate. The
  latter requires an existing test session token and remains optional evidence.

### 5.15 Hermes warm-paper workbench visual-review candidate (2026-08-24)

> Final authorized release `b73a9dd` is active with rollback `02d3dd9`.

- Scope: anonymous, `noindex`, no-write `/_visual/research-workbench` route with
  six deep-linked review scenes, real v09 Hermes at exact `360/200px`, desktop
  context click plus `Shift+F10`/Menu key, mobile long press, and an isolated
  ordinary-click assistant dialog fixture. It changes no authenticated product
  route, API, migration, seed or stored research data.
- Visual boundary: daylight warm paper across work and reading; `19px / 1.72`
  long-form type; deep graphite limited to evidence inspection. Radix provides
  menu/dialog accessibility behavior only. The route contains no gradient,
  glass blur, glow, purple, emoji, pill cluster or per-menu-item card styling.
- Fresh local evidence before candidate commit: reducer `5/5` with a killed
  mutation, Web `395/395` plus five Node contracts, focused Playwright `5/5`,
  typecheck and the 19-page production build passed. Six ignored real-WebGL
  screenshots were inspected at original detail and corrected for actor
  obstruction, mobile clipping, premature canvas capture and focus appearance.
- Operation: run the canonical Git Bash checkup and database backup, then exact
  dry-run and confirmed `deploy.sh --skip-migrate` using active release
  `5f4e73c...` as explicit rollback. Record candidate SHA, backup size/retention,
  container health, public HTTP 200, exact `/__release`, absent failure marker
  and retained rollback tree only after those checks actually pass.
- Initial operation evidence: backup `432K files=7/7`; exact server build and
  healthy container switch passed; public route returned 200; `/__release`
  returned `02d3dd9c495fda18025d9f1698cf41a247094052`; `.release-failed` was absent
  and the `5f4e73c...` rollback tree remained. The first public E2E was `4/5`
  because rapid scene switching exposed an async same-route query race. The
  hotfix synchronizes reducer state and query via History API. Exact hotfix
  `b73a9dd5d6dc95b57349682a09e72525b8c033b2` then passed dry-run, confirmed
  `--skip-migrate` deployment, 19-page server build, healthy service switch,
  public route 200 and exact release identity. Public full E2E passed `5/5` and
  the keyboard scenario passed three additional concurrent repeats; failure
  marker remained absent and rollback `02d3dd9...` remained present.

### 5.16 Hermes Research Session Folio visual-review release (2026-08-24)

> Active release `bba5f14`; rollback `68d8be7`.

- Scope remains the anonymous, `noindex`, no-write
  `/_visual/research-workbench` route. The folio orders active research, open
  decision, evidence and next version before review utility, and places exact
  `360/200px` Hermes in the research margin. No authenticated route, API,
  migration, seed or stored research data changed.
- Local evidence before the first release: route E2E `7/7`, Web `395/395` plus
  five Node contracts, typecheck, 19-page build, root lint, docs gates and diff
  check passed. An independent read-only review found no remaining issue after
  CTA, Chinese Portal tracking and project UI-font corrections.
- Operation evidence: Git Bash checkup passed; DB backup returned
  `432K files=7/7`. Exact `68d8be7` deployed with `--skip-migrate`; its immediate
  public suite was `5/7` because CTA/right-click tests operated before hydration.
  The CTA was converted to a real `href` with enhanced in-place navigation, and
  the context-menu test now waits for Hermes readiness.
- Exact hotfix `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf` passed dry-run and
  confirmed `--skip-migrate` deployment with `68d8be7...` as rollback. Server
  build generated 19 pages; 27 migrations remained current; target containers
  were healthy; route returned 200; `/__release` matched; `.release-failed` was
  absent; rollback tree was present; stable public no-write E2E passed `7/7`.

### 5.17 Research Folio whole-product release (2026-08-24)

> Active release `33418fd`; rollback `2abfe42`. Visual-review hotfix application
> source is `56f6cf4`.

- Scope: all real non-Landing product surfaces now share the warm-paper Research
  Folio information hierarchy, evidence-only graphite tools and reserved Hermes
  research margin. Identity, Dashboard, create/import RO, every RO workspace
  plane, Explore, Collections, Settings, Admin and public reading are included;
  Landing is unchanged.
- Initial operation evidence: canonical checkup and backup
  `432K files=7/7` passed; exact `2abfe42...` `--skip-migrate` deployment built
  19 web pages on ECS. All target services were running/healthy, 27 migrations
  remained current, real routes and Live2D runtime assets returned 200,
  `/__release` matched, `.release-failed` was absent and rollback `bba5f14...`
  remained present. Public no-write acceptance passed `57/57` outside the
  Nginx-protected Admin route; the complete local release matrix passed `60/60`.
- Post-release visual inspection found one issue the automated performance-bubble
  selector did not cover: the legacy adapter nudge appeared automatically inside
  the anchored Hermes rail and obscured labels. Hotfix `56f6cf4` suppresses all
  unsolicited anchored speech/nudges while retaining explicit field guides,
  context menu, drawer and selected-action feedback. Fresh screenshots show no
  obstruction; Web `402/402` plus five Node contracts, typecheck, 19-page build,
  focused Hermes `3/3` and the full production matrix `60/60` pass.
- Hotfix operation: fresh pre/post checkup and DB backup `432K files=7/7`
  passed. Exact `33418fdf9e4c13cd3e34eba0a15f6f0208fc5183` deployed with
  `--skip-migrate` and `2abfe42...` as rollback. The server full-workspace build
  generated 19 Web pages; target runtime is healthy; 27 migrations remain
  current; release/failure/rollback markers, real routes and Live2D assets pass.
  Public Dashboard plus three Hermes interaction gates pass `4/4`. No migration,
  seed or research-data write ran.
