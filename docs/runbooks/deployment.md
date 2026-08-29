# Runbook: 部署（Deployment）

> 状态：**CURRENT**。active immutable release / application source 为 `28a3d5ca681b7744fae521dfa9154100a24e8845`，rollback tree 为 `c5817121bddbd065c5ecb38811da8e707e6e5d17`。post-deploy docs-only HEAD 不得冒充 application source。
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

若日志先出现 `wsl: Failed to translate '<Windows path>'`，根因已经确定为裸 `bash` 命中了 WSL，并非 SSH key 失效。立即停止该诊断路径，改用下方固定 Git Bash 命令；不得重建、复制、打印、改权限或替换项目密钥。

在 PowerShell 中显式调用 Git for Windows Bash：

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/checkup.sh
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/ssh-run.sh '<read-only command>'
```

自动化执行器的 `shell`/`shell=` 参数不视为“显式调用”：2026-08-26 实测该抽象层仍可能落到 WSL，并把 Git worktree 路径拼成 `/mnt/e/.../E:/...`。Windows 自动化必须让 PowerShell 直接执行 `& 'C:\Program Files\Git\bin\bash.exe' ...`；先以 `& 'C:\Program Files\Git\bin\bash.exe' --version` 确认输出包含 `x86_64-pc-msys`，再运行 Git/SSH 命令。

Git Bash 会沿用 Windows 用户目录中的 SSH 配置和项目专用密钥。出现“SSH 认证失败”时，先检查实际调用的是不是 `C:\Program Files\Git\bin\bash.exe`；不要改用密码，不要复制、打印或放宽私钥权限。2026-08-26 已再次复现“裸 `bash` → WSL 误报”，并用同一密钥、上述显式 Git Bash 命令完成只读复验。

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
- Historical source integrity at that release matched the then-active part-rig
  shader, pet mesh renderer, Hermes state and real approval page. Superseded
  unreferenced renderer files were removed in the 2026-08-28 hygiene pass.
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

### 5.18 Hermes mouth-anchored speech release (2026-08-25)

> Active immutable release `3010903e3058ba49c6d6dceb7fa938ea2fd0eb3e`;
> rollback `33418fdf9e4c13cd3e34eba0a15f6f0208fc5183`; application source
> `eb55820ee67d00b0924797ccbbd1db395412f07a`.

- Scope: real non-Landing Hermes explicit feedback now uses one mouth-anchored
  warm-paper sentence with calibrated desktop/mobile tails. Its carried-tool
  menu is one continuous ruled ledger, including a 224px mobile form; right
  click, `Shift+F10`, ContextMenu key, long press and ordinary-click drawer
  semantics remain. Landing is unchanged.
- Local release evidence: targeted `14/14`, Web `403/403` plus five Node
  contracts, current Hermes aggregate `19+3`, work-assistant three viewports,
  product release `60/60`, full root typecheck/lint/docs-sync/test/build and
  independent architecture/Hermes reviews passed. The ECS build generated 19
  Web routes.
- Operation: canonical preflight and backup `432K files=7/7` passed. The exact
  release was deployed through `deploy.sh --confirm --skip-migrate` with the
  exact rollback above. API, Agent Worker and Document Parser are healthy; Web
  is running; 27 migrations remain current. Runtime dependencies load from the
  immutable release, and Parser remains non-root/read-only/network-none with a
  512MiB/64-PID bound.
- Acceptance: Cloudflare and loopback HTTPS return 200; real identity,
  Dashboard, create, Explore and Live2D model/moc routes return 200;
  `/__release` matches the full SHA; `.release-failed` is absent and the rollback
  tree remains. Public no-write browser checks for desktop pointer/keyboard,
  mobile long press and editor feedback pass `3/3`; native-size screenshot review
  confirms the feedback remains inside the Hermes research margin and does not
  cover editor text.
- No migration, seed or research-data write ran. The public check uses no-write
  API interception and is not a claim of a fresh real-account/database vertical
  journey; that remains optional when a safe existing test session is available.

### 5.19 Hermes orbit actions release (2026-08-25)

> Application source `e4a19d4aff0d2cc9e324a8275cb156f938ffccc0`;
> immutable release `7165e9b73df55b00d907080d300ccf97476575e8`;
> rollback `3010903e3058ba49c6d6dceb7fa938ea2fd0eb3e`.

- Scope: Dashboard two-beat mouth speech; eight companion and four real-work
  actions around the native `360px` Wanko; mobile/compact `200px` grouped menu;
  original/compact/quiet control; input/modal suppression; real Hermes, Files
  and Versions destinations. Landing, schema and API contracts are unchanged.
- Local evidence: Web `406/406` plus five Node contracts; Hermes aggregate
  runtime/guide `19/19` plus product interaction `5/5`; full root typecheck,
  lint/docs-sync, test and build; independent repair review Ready. Runtime
  first-ready `889ms`; idle and pointer samples had zero dropped frames.
- Operation: canonical Git Bash pre/post checkup and DB backup
  `432K files=7/7` passed. The first confirmed invocation stopped before upload
  because the isolated worktree had no `.cloud-sync-env`; setting the documented
  `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS` allowed the exact same clean release to
  use the main repository's deployment configuration without reading it.
- Exact `7165e9b...` then deployed through `--skip-migrate`. Server full build
  generated 19 Web pages; 27 migrations are current; API, Agent Worker and
  Document Parser are healthy and Web is running. Parser is `node`, read-only,
  network-none, 512MiB/64 PID, with only `/parser-jobs` mounted.
- Acceptance: Cloudflare and loopback HTTPS, identity, Dashboard, create,
  Explore, model/moc assets and exact `/__release` passed; failure marker is
  absent and rollback tree remains. Public no-write desktop/keyboard, input
  suppression, mobile long press, editor geometry and research navigation pass
  `5/5`. No migration, seed or research-data write ran.

### 5.20 Hermes carried tool sheet release (2026-08-25)

> Application source `1b3badaec5af3330e10b8ca0abb9163ff2af0883`;
> immutable release `8ed2f3cb895e46cd1b355db0e40883c703140b22`;
> rollback `7165e9b73df55b00d907080d300ccf97476575e8`.

- Scope: replace the orbit display with one opaque warm-paper carried tool
  sheet that remains at least `32px` above the exact `360/200px` Hermes. The
  compact tool band exists only while open and counter-scroll keeps the actor
  visually stationary. Twelve catalog entries now lock action ID, Live2D
  motion and exact Chinese/English response; mouth-relative bottom anchoring
  keeps short and long feedback attached to the actor. Landing, API, schema,
  voice and TTS are unchanged.
- Local evidence: Web `408/408` plus five Node contracts; Hermes current
  runtime/guide `19/19` plus product interactions `5/5`; product release
  `62/62`; full typecheck, lint/docs-sync and production build passed. Native
  desktop/mobile screenshots were inspected for actor/menu intersection,
  protected-copy overlap, clipped labels, focus, closed-state dead space,
  actor jumps and detached speech tails.
- Operation: preflight and DB backup `432K files=7/7` passed. The first
  confirmed candidate stopped before service switching when an unproxied
  `npx` registry request timed out, leaving `7165e9b...` active and healthy.
  Release `8ed2f3c...` adds `with-proxy` to both immutable release build paths;
  its 15 deployment contracts and Shell syntax passed before a new dry run and
  confirmed `--skip-migrate` deployment.
- Server evidence: the full 19-workspace install/build and 19-page Next build
  passed; API, Web, Agent Worker and Document Parser converged healthy; 27
  migrations are current; Cloudflare and loopback ingress pass; `/__release`
  is exact, `.release-failed` is absent and the rollback tree remains. Public
  no-write Hermes acceptance passes `5/5`. The full public matrix passes
  `59/62`; only the three `/admin` viewports are intentionally stopped by
  production Nginx Basic Auth with 401 before the application shell.
- No migration, seed or research-data write ran. Optional native dependencies
  attempted local rebuilds without `g++`, but pnpm treated them as optional and
  the full production build completed; this is not a runtime failure.

### 5.21 Hermes continuous-speech correction (2026-08-25)

> Active release `cbf5737bdffd50e9ba6d629d4ea9c5e006226263`;
> rollback `cc6cff6275b069c8ad89eddcfcda0e3d6011b0bf`;
> application `9a7263e41f78b250f11b2f8e3413ddc997def8a4`.

- The first correction release replaced the split CSS bubble and free-floating
  menu tether with one closed SVG contour, visible-mouth calibration and a
  crown-relative `24–48px` tool sheet. Pre/post checkup, backup `432K files=7/7`,
  full 19-workspace/19-page build, 27 current migrations, healthy targets,
  exact release/failure/rollback checks, runtime assets and public Hermes `5/5`
  passed without migration, seed or research-data writes.
- The design gate did not accept that first release. Public original-scale
  screenshots showed the still-wide tail covering the hat/face, and one editor
  screenshot captured before the real Wanko renderer was ready. Local hotfix
  `9a7263e` keeps the speech body above the visible crown, uses a slender tail,
  recedes Hermes labels/controls during the four-second response and makes
  renderer-ready screenshots mandatory. Web `408/408` plus five Node contracts,
  root lint/typecheck, 19-page build, product release `62/62` and the three-
  viewport Hermes gate pass.
- The exact `cbf5737...` release then passed dry-run and confirmed
  `--skip-migrate` deployment with `cc6cff6...` as rollback. Server full build,
  target health, 27 current migrations, model/moc assets, Parser non-root/
  read-only/network-none/512MiB/64-PID bounds, loopback/Cloudflare ingress,
  exact release identity, absent failure marker and rollback tree pass. Public
  renderer-ready Hermes scenarios pass `5/5`, and their desktop/mobile/editor
  screenshots were opened at original scale. User visual acceptance remains
  pending; no migration, seed or research-data write ran.

### 5.22 Hermes viewport-safe lively interaction release (2026-08-25)

> Application source `8d1409e`; active immutable release `6b804f7`; rollback
> `cbf5737`.

- Scope is Web-only: real portal/protected-region menu measurement, exact scroll
  restoration, twelve action-first Wanko performances, three localized lines
  per action with consecutive no-repeat, and interruption-safe delayed speech.
- Local evidence: Web `411/411` plus five Node contracts, product release
  `65/65`, focused Live2D/work-assistant gates, full root typecheck/lint/test/
  build, diff check and independent review all pass.
- Operation: canonical pre/post checkup passed; backup returned `432K files=7/7`.
  Exact dry-run preceded the confirmed `--skip-migrate` deployment with
  `cbf5737` as rollback. Server full workspace/19-page build, healthy target
  containers, 27/27 current migrations, Cloudflare/loopback ingress, real
  Dashboard/model/moc/motion assets, exact release, absent failure marker and
  retained rollback tree pass. Public no-write Hermes acceptance is `6/6`.
- Original current-viewport and actor captures show Wanko and mouth-linked
  speech together. The blank actor in a full-page stitched screenshot was
  reproduced as Playwright clearing an offscreen WebGL buffer; full-page WebGL
  composites are not valid actor-presence evidence. No migration, seed or
  research-data write ran.

### 5.23 Hermes short-viewport collision correction (2026-08-25)

> Application source `5323ba8`; active immutable release `bf54eaa`;
> rollback `6b804f7`.

- Scope is Web-only: jointly stabilize the real portalled menu, visible crown,
  actor bottom, visual viewport and protected geometry; respond to upstream
  reflow; make the first correction synchronous; restore translate, scroll and
  keyboard focus on close. No API, schema, migration, seed or data write.
- Local preflight: Web `411/411` plus five Node contracts, critical repeat
  `10/10`, Hermes `9/9`, full product release `66/66`, work-assistant three
  viewports, 19-page build and independent review Ready.
- Operation passed through canonical Git Bash scripts: pre/post checkup, backup
  `432K files=7/7`, exact dry-run, then confirmed `deploy.sh --skip-migrate`
  with `6b804f7...` as rollback. Server full 19-workspace/19-page build, 27/27
  current migrations, healthy API/Web/Worker/Parser/data services, Parser
  `node/read-only/network-none/512MiB/64PID`, Cloudflare/loopback Dashboard 200,
  real Wanko/Cubism/model/moc/motion assets 200, exact release, absent failure
  marker and retained rollback tree pass. Public no-write Hermes is `9/9`,
  including `1612×729 / DPR 1.875`. No migration, seed or research-data write.

### 5.24 Hermes detached-dock composition correction (2026-08-26)

> Active release `8395b4d5cc11cb444aac3b638cff4ccc993ef9f2`;
> rollback `bf54eaa2cd499f68eee8ce311a1ed178027a5348`;
> application `9aef5c4d54d10b27a59389fa6865d179feb1891a`.

- Scope is Web-only: include persisted detached docks in the portal/crown/
  travel-hull stabilizer; bound temporary movement by visual viewport and
  protected surfaces; use side or shorter wide-folio geometry only when the
  normal `24–48px` attachment is physically impossible. Restore dragged
  position, scroll and focus on close. No API/schema/migration/seed/data write.
- Local preflight: the old production build reproduces `menu.top=-31.7px` in
  the exact custom-dock state. Final critical repeats are `10/10`, constrained
  repeats `5/5`, product release `67/67`, Web `411+5`, root test/typecheck/lint,
  19-page build and diff check GREEN; independent review is Ready.
- Operation: canonical Windows Git Bash scripts used
  `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS`, exact release `8395b4d...`,
  `--skip-migrate` and explicit rollback `bf54eaa...`. Preflight and backup
  `432K files=7/7` passed; the server completed its full workspace/19-page build.
- Post-deploy evidence: 27/27 migrations are current; target services are
  healthy; Parser is `network=none`, read-only, UID 1000, 512 MiB and 64 PIDs;
  Cloudflare/loopback Dashboard and model/moc/motion assets return 200. Exact
  release/source, absent failure marker, rollback tree and rollback images pass.
  Public no-write Hermes acceptance is `10/10`, including the reported detached
  high-DPI geometry. No migration, seed or research-data write ran.

### 5.25 Landing motion and product-route continuity (2026-08-26)

> Active release `263c78372a1a6114016bba9ca3d8dbfce94ee0ce`;
> rollback `8395b4d5cc11cb444aac3b638cff4ccc993ef9f2`;
> application `c80f739072054e6ababfee511a6a9ecbaa296020`.

- Scope is Web-only: freeze Hermes; preserve the approved Landing optical
  implementation and add final-composite visible-motion coverage; add shared
  first-level navigation to non-Landing product shells and retain RO mode links.
- Local evidence: Web `420+5`, canonical product release `72/72`, full root
  typecheck/lint/test/build/docs gates and 19-page build pass. Original-size
  320/390px review fixed a real 6px navigation clip before release.
- Operation used canonical Git Bash scripts with
  `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS`, exact dry-run, pre/post checkup,
  backup `432K files=7/7`, `--skip-migrate` and explicit rollback `8395b4d...`.
- Server evidence: full workspace/19-page build, 27/27 current migrations,
  healthy target services, Parser network-none/read-only/512MiB/64PID,
  Cloudflare/loopback routes, exact release/source, absent failure marker and
  retained rollback tree pass. Public no-write matrix passes all 69 anonymous
  cases, including Landing normal/reduced and five 320px shells; three Admin
  viewports correctly stop at production Basic Auth 401 and pass locally 3/3.
  No migration, seed or research-data write ran.

### 5.26 Landing water regression recovery (2026-08-26)

> Active release `73677d57ef9afd55fb75fd027cb4c514a7b7f544`;
> rollback `263c78372a1a6114016bba9ca3d8dbfce94ee0ce`;
> application `47c8aa9e6b78c3ec26e4d0320097e1c5260d794a`.

- Scope is Web-only and restores the existing OGL water: preserve the approved
  Landing composition, Hermes and navigation; restore the operating-system
  cursor, ordinary slow-pointer wake and a readable seven-second ambient cycle.
- Local evidence: canonical Landing desktop/wide/mobile normal+reduced `6/6`,
  focused `23/23`, Web `421+5`, full workspace test/build, Web typecheck,
  lint/docs gates and original-size desktop/mobile review pass.
- Operation used exact dry-run, pre/post checkup, DB backup `436K files=7/7`,
  `--skip-migrate` and explicit rollback `263c783...`. Server full workspace /
  19-page build, 27 current migrations, healthy targets, exact release/failure/
  rollback markers and retained rollback tree pass. Parser remains network-none,
  read-only, non-root, 512 MiB and 64 PIDs.
- Public canonical Landing normal/reduced matrix passes `6/6`, including visible
  system cursor, connected 650ms idle motion, slow/fast wake ordering and
  recovery. No migration, seed or research-data write ran.

### 5.27 Landing WebGL-unavailable water continuity (2026-08-26)

> Active release/application `29344767b350e0a44ef74c04b9b5a55b342ef011`;
> rollback `58614c07951374537ed146f164f8568e9957a9b5`.

- The user-visible static state was reproduced by denying WebGL/WebGL2. OGL
  remains unchanged when available; normal-motion unavailable contexts mount
  the retained Canvas field, while reduced motion remains exact and canvas-free.
- Public screenshot review rejected the first continuity release because the
  static typography plate remained under the moving layer. The final hotfix
  makes Canvas the only visible typography plate during fallback and adds that
  condition to the production browser gate.
- Local shots, Web `421+5`, typecheck, root lint/docs-sync/build and original-size
  desktop/390px/reduced review pass. Public normal/no-WebGL/mobile/reduced,
  system cursor, bright-glyph motion and viewport leave/re-entry pass.
- Pre/post checkup, backup `436K files=7/7`, server full workspace/19-page build,
  27 current migrations, healthy targets, Parser network-none/read-only/non-root/
  512MiB/64PID, exact release/failure marker and rollback tree/images pass. Both
  switches used `--skip-migrate`; no migration, seed or research-data write ran.

### 5.28 Landing static-water browser preference diagnosis (2026-08-26)

- Do not purge Cloudflare merely because desktop is static while mobile moves.
  First compare desktop/mobile response headers and hashed app chunks. In the
  confirmed incident both were `CF-Cache-Status: DYNAMIC`, `no-store`, with the
  same HTML and chunks; cache was not the cause.
- Probe `matchMedia('(prefers-reduced-motion: reduce)').matches`. The deployed
  contract intentionally keeps reduced motion exact, static and canvas-free;
  public Chromium verification showed changing frames for `no-preference` and
  byte-stable frames for `reduce` on the same release.
- If Windows animation is enabled but Chrome still reports `true`, open DevTools
  Rendering and set the `prefers-reduced-motion` emulation to `No emulation`,
  then restart Chrome. If it persists, inspect `chrome://version` for
  `--force-prefers-reduced-motion` before investigating the application.
- The user confirmed normal motion returned after the Chrome-specific override
  was removed. No CF purge, source change or deployment was required.

### 5.29 Historical — Research Intelligence core/search foundation (2026-08-26)

> **HISTORICAL / SUPERSEDED by §5.30.** Former application/release `e0828a6118c92c87b7869493413441bba0e76a95`;
> former rollback `29344767b350e0a44ef74c04b9b5a55b342ef011`.

- All Docker, database, image-build and runtime acceptance operations ran on
  ECS. Windows invoked the canonical scripts only through explicit Git for
  Windows Bash; local Docker is outside this workflow.
- Exact SHA `e0828a6` passed GitHub CI run `32977425693`: build, typecheck,
  lint, unit, product visual and Hermes release gates. The same release includes
  the context-loss recovery-control accessibility fix without changing the
  accepted Hermes/Landing composition.
- A disposable ECS PostgreSQL rehearsal applied core migration 28 and search
  baseline 1, verified five core tables and nine scoped constraints, rolled
  both ledgers back, re-applied them, and removed only the two temporary
  databases created for the rehearsal.
- Production search database `openscience_search` was created separately from
  core. `SEARCH_DATABASE_URL` was injected without displaying its value;
  `/opt/openscience/.env.prod` remained mode `600`, with rollback copy
  `/opt/openscience/.env.prod.pre-search-e0828a6`.
- Pre-deploy checkup and backup passed (`436K files=7/7`). The exact release ran
  the server full workspace/19-page build, SHA-tagged Worker/Parser image build,
  physical core/search isolation, core and search migrations, and the existing
  idempotent quota seed `8/8`. It ran no research-data seed and wrote no real
  research content.
- Independent post-deploy verification found current-repository core migrations
  `28/28`, search `1/1`, and no failed migrations. Core has 29 active ledger
  rows because historical `20260809010000_ro_create_idempotency` is preserved;
  do not delete or rename that ledger row merely to force a 28-row count.
- API, Web, Worker, PostgreSQL, Redis and object storage are healthy. Parser is
  `network=none`, read-only, non-root, capped at 512 MiB, mounts only
  `/parser-jobs`, exposes no secret-named environment key, and uses the exact
  SHA image. Public `/` is 200; protected auth/admin probes are 401; the release
  marker is exact and `.release-failed` is absent.

#### Search backup follow-up

The daily `backup.sh --db` path currently backs up only core PostgreSQL. The
search database presently contains only an empty, reproducible baseline, so
Task 2 may ship with this limitation recorded. Before Task 6 writes search
business data or sends real traffic to it, extend backup/restore to address the
search database independently and complete a server-side restore rehearsal.
Until that gate passes, do not describe the storage-separation backup boundary
as complete.

### 5.30 DocumentSourceMap contract deployment (2026-08-27)

> Application/immutable release `ef043ebb8e51332effe75a5639cb207aec7bfc47`; reviewed implementation parent `c47b3f182ba857897c3c33ee21c250f6b4db3f3c` (the release commit is an identical-tree empty CI marker); rollback `e0828a6118c92c87b7869493413441bba0e76a95`.

- **Precheck:** exact GitHub Actions run `32992769105` succeeded in 12m18s with build, typecheck, lint, unit, product visual and Hermes gates, despite a temporary Actions major outage. Fresh local gates passed: domain `429/429`, worker `95/95`, full typecheck/lint/unit/build/diff; local Docker was not started. ECS preflight recorded disk 22%, available memory 26GiB, ingress 200 and egress 204.
- **Execution:** after backup `452K files=7/7`, use the canonical Bash `deploy.sh --skip-migrate` for the exact SHA. This contract-only release has no migration, seed or research-data write; never substitute a docs-only HEAD for the application SHA.
- **Rollback:** retain the immutable `e0828a6...` release tree and use the canonical deploy rollback route; no database reversal is required for this release. Do not delete the historical extra core ledger entry.
- **Verification:** current-repo core `28/28`, search `1/1`, failed `0/0`; target containers healthy and agent/parser exact-SHA images. Parser is network none, read-only, user `node`, 512MiB/64PID, only `/parser-jobs`, no secret-named environment, and production worker emits `DOCUMENT_PARSER_CONTRACT_OK`. Public/loopback probes return 200, auth/admin 401, release marker is exact and `.release-failed` absent.

### 5.31 AI Gateway LLM OCR routing deployment (2026-08-27)

> Application/immutable release `f9659668b237b70b4c018b866e20498689d327c2`;
> rollback `ef043ebb8e51332effe75a5639cb207aec7bfc47`.

- Exact GitHub Actions run `33002216562` succeeded in 12m22s with build,
  typecheck, lint, unit, product visual and Hermes gates. Independent
  architecture/security review returned `DEPLOYABLE / CLEAN`; local AI Gateway
  `48/48`, Worker `102/102`, full workspace and docs gates passed. Local Docker
  was not started.
- Pre/post canonical checkup passed at 22% disk and 26 GiB available memory;
  backup returned `452K files=7/7`. The fixed worktree intentionally does not
  duplicate ignored deployment credentials, so PowerShell set
  `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS` only for the Git Bash deploy process;
  no config value was copied or printed.
- The exact dry-run preceded confirmed `deploy.sh --skip-migrate`. ECS performed
  the full workspace/19-page build and SHA-tagged Worker/Parser image build.
  No migration, seed, research-data write or provider call ran; core remains
  `28/28`, search `1/1` and both schemas are current.
- ECS focused mocked gates passed: AI Gateway OCR/provider/boundary `36/36` and
  Worker gateway configuration `9/9`; the production Worker emitted
  `AI_GATEWAY_OCR_CONTRACT_OK`. MiniMax key presence was verified without
  outputting it, while the Vision route remains disabled. Tavily and Semantic
  Scholar keys are not present in production and must wait for Task 10's actual
  consumer and permission boundary.
- API, Web, Worker, Parser and data services are healthy. Parser remains
  `network=none`, read-only, user `node`, 512 MiB/64 PID and mounts only
  `/parser-jobs`. Public `/` is 200, protected auth/admin probes are 401, the
  exact release marker matches, `.release-failed` is absent and the rollback
  release tree remains available.

### 5.32 Docling CPU candidate build diagnosis (2026-08-27)

**Status:** mitigation implemented, exact-SHA ECS revalidation pending. This is
an isolated evaluation image, not a production deployment.

- **Problem:** the first ECS build stopped before corpus execution because pip
  rejected the shortened `docling.whl` filename. After preserving the official
  wheel filename, dependency resolution showed default PyPI Torch selecting
  CUDA 13, cuDNN and NCCL packages on the CPU-only host; the build was
  immediately interrupted. A separate PyPI read timeout was transient: ECS
  egress remained 204, `files.pythonhosted.org` returned HTTP 200, and an
  unchanged retry progressed beyond the prior dependency.
  A later CPU-only attempt installed the correct Torch wheels but then lost the
  entire layer when Docling dependency resolution returned no `pydantic`
  candidate.
- **Root cause:** wheel tags are parsed from the local filename, and the default
  Linux PyPI Torch distribution is not a CPU-only dependency boundary. Merely
  setting `AcceleratorDevice.CPU` at runtime cannot prevent GPU packages from
  entering the image.
- **Resolution:** retain the official Docling wheel filename and SHA-256; install
  pinned `torch 2.13.0+cpu` and `torchvision 0.28.0+cpu` from the official
  PyTorch CPU index in a dedicated cacheable layer before installing Docling
  from the explicit official PyPI index. The image build asserts
  `torch.version.cuda is None` and rejects CUDA/NVIDIA/ROCm/Triton distributions;
  the bounded pre-corpus lock independently requires `computePlatform=cpu` and
  `gpuPackageCount=0`.
- **Validation:** build and run only from a new content-addressed ECS evaluation
  root. Before any corpus case, preserve `candidate-lock.json`, verify the exact
  image digest, package/model manifest hashes, non-root/read-only/network-none
  sandbox, and zero GPU packages. A failed lock must stop the evaluation and
  leave production release `f965966...` unchanged.

### 5.33 Detached ECS evaluation and exact-SHA discipline (2026-08-27)

**Status:** required for every long parser/model build. Candidate evaluation is
isolated from production and does not change the application release.

- A foreground Docling build was attached to the SSH session for several hours.
  When that connection reset, Docker discarded the uncommitted dependency layer;
  this was an SSH lifetime failure, not a public-key failure. The previously
  committed CPU Torch image layer remained reusable.
- Windows must invoke `infra/scripts/ssh-run.sh` through the explicit Git for
  Windows Bash path. Start long builds and evaluations as named `systemd` units,
  then inspect bounded `systemctl show` and `journalctl -n` output through short
  SSH connections. Never keep a model download dependent on one interactive SSH
  process.
- Obtain the candidate identifier with `git rev-parse HEAD`, verify the same
  object after the ECS fetch, and use that exact 40-character value for the
  evaluation root and unit metadata. Never expand or guess a short SHA. Preserve
  failed content-addressed roots as diagnostic evidence unless deletion is
  explicitly approved.
- The current exact evaluator source is
  `efa6367ef4d0bf18a9c4e1c6e073ba338bfe7ee1`, materialized under
  `/opt/openscience-evals/document-parser/<exact-sha>/source`. The detached
  attempt `openscience-parser-eval-docling-efa6367-a2.service` reused the pinned
  CPU Torch, SciPy and OpenCV layers but failed in the isolated RapidOCR layer
  when `files.pythonhosted.org` metadata exceeded pip's read timeout. ECS egress
  and production remained healthy; no image/quality/RSS acceptance exists from
  a2. Retry the unchanged exact source with a new named unit so prior evidence
  remains intact; `openscience-parser-eval-docling-efa6367-a3.service` is that
  bounded retry and reuses the completed layers. Build completion alone is not
  acceptance: the source lock, sandbox, seven-PDF corpus, locator, latency and
  peak-RSS gates must all complete.

### 5.34 Secret-safe migration drills and release identity recovery (2026-08-27)

**Status:** mandatory for database credential operations and disposable migration
drills. Production application release remains `f965966...`; search migration 2
has not been applied to production.

- Never place `DATABASE_URL`, `SEARCH_DATABASE_URL`, passwords or API keys in
  `docker run -e NAME=value`, process arguments, unit descriptions or diagnostic
  process listings. A temporary migration command violated this rule; treat any
  such URL as compromised even when it only appeared in controlled tool output.
- Stop the affected unit, clean its disposable database, and rotate the
  application database credential with
  `infra/scripts/rotate-database-credentials.sh --confirm`. The script sends SQL
  over stdin, atomically rewrites the server-only environment file, recreates
  consumers, waits for health and rolls back on failure. It must use the Compose
  file under `/opt/openscience-releases/<active-release>/`, never the mutable
  legacy `/opt/openscience` tree.
- Reconcile all production consumers from the active immutable release after a
  credential rotation. API, Worker and Web must mount that exact release root;
  Worker and Parser image tags must equal the release SHA. The Parser is a
  self-contained image: it must not mount the release root and must have exactly
  one `/parser-jobs` mount.
- Verify the public release endpoint as plain text, not JSON. Require target
  container health, exact images/mounts, loopback/public 200 and exact public
  release before closing the incident.
- For a disposable migration drill, pipe only the required environment entry to
  Docker stdin and use `--env-file /dev/stdin`, or pass a protected env-file path.
  Mount exact-SHA source read-only, use the production data network without
  published ports, and apply CPU/memory/PID/capability limits. Never inspect that
  process's environment or full arguments.
- Accepted credential/version evidence: credential rotation unit
  `openscience-db-credential-rotation-20260827-a2.service`; version identity
  `f965966...` exact and healthy. Accepted migration evidence is
  `openscience-search-migration-drill-c8fc590-a4.service` using exact source
  `c8fc590...`: forward `2/5/1/3`, rollback `1/0/0/0`, redeploy `2/5/1/3`
  for migrations/tables/GIN/revised columns, followed by disposable database
  cleanup. Production search remains `1/1`.

### 5.35 Exact-SHA lexical retrieval ECS drill (2026-08-27)

**Status:** accepted candidate evidence only. This drill does not deploy an
application release, apply search migration 2 to production, or enable a
retrieval route. Accepted unit `openscience-search-lexical-drill-7d489c5-a1`
used exact source `7d489c51e0005206b2714283ae722df1354b1eed`; production
application remained `f965966...` and production search remained `1/1`.

#### Preflight

1. Run `infra/scripts/checkup.sh` from explicit Git for Windows Bash and record
   the active release, public/loopback status, disk and memory.
2. Require a pushed immutable commit and a new
   `/opt/openscience-evals/search-lexical/<sha>/` root. Never patch an older
   exact-source root or delete failed evidence.
3. Confirm the disposable database name matches
   `^openscience_search_test_[a-z0-9]{8,48}$`; tests must also require
   `SEARCH_TEST_MUTATION_CONFIRM=DISPOSABLE_SEARCH_DB` and reject the production
   URL.
4. Send multiline scripts through the canonical SSH wrapper with CR removal:
   PowerShell here-string → explicit `C:/Program Files/Git/bin/bash.exe` →
   `tr -d "\r"` → `infra/scripts/ssh-run.sh "bash -s"`. A path ending in
   `\r` is a shell transport error, not an SSH-key failure.

#### Execution

1. Fetch `https://github.com/photonics-dhl/OpenScience/archive/<sha>.tar.gz`
   only through server `with-proxy`, extract with one stripped path component,
   and run `with-proxy npx pnpm@9.15.0 install --frozen-lockfile`.
2. A clean archive has no generated core Prisma client. Before the full build,
   run the project-local binary for both schemas in this order:
   `./node_modules/.bin/prisma generate --schema infra/schema.prisma`, then
   `./node_modules/.bin/prisma generate --schema infra/search/schema.prisma`.
   Run `with-proxy npx pnpm@9.15.0 build` only after both succeed.
3. Use the Compose file under the active immutable release to identify the
   production PostgreSQL container and its internal data network. Pass only the
   required protected environment line through stdin and Docker
   `--env-file /dev/stdin`; never put a URL or password in argv/logs.
4. Create the uniquely named disposable database, apply search migrations,
   assert `2/5/1/3` for migrations/tables/GIN/contract columns, run the checked-in
   reverse migration and assert `1/0/0/0`, then redeploy and reassert `2/5/1/3`.
5. Run `packages/search/test/storage.integration.test.ts` in a read-only,
   capability-dropped Node container with bounded tmpfs, 2 CPU, 2 GiB and 256
   PIDs. The five gates cover tenant isolation/ranking, cross-tenant global-ID
   collision, malformed TF availability, logical hydration bytes and exact SQL
   GIN/BitmapOr eligibility.

#### Rollback

1. Install an EXIT trap before database creation. Terminate sessions to the
   approved disposable name and drop only that database, whether the drill passes
   or fails.
2. Because production schema/release are never mutated, rollback is cleanup plus
   verification, not a production rollout. Preserve failed unit logs and eval
   roots; do not delete them without explicit authorization.
3. If any production marker, search ledger or container identity differs from
   preflight, stop and use the active immutable release runbook before making a
   completion claim.

#### Verification

1. Require full workspace build success, migration assertions
   `2/5/1/3 → 1/0/0/0 → 2/5/1/3`, integration `5/5`, zero disposable databases
   and zero `xgs-search-*` candidate containers.
2. Re-run `checkup.sh`; require healthy production containers, public and
   loopback 200, exact `/__release`, absent `.release-failed`, production search
   migration count `1` and production retrieval-table count `0`.
3. The GIN test establishes index eligibility under a bounded same-tenant corpus;
   it is not representative-scale performance acceptance. Task 9 must still run
   `EXPLAIN (ANALYZE, BUFFERS)` and latency/RSS gates with the final corpus.

### 5.36 BGE-M3 hybrid retrieval production deployment (2026-08-28)

- Application/release `8163f8b4218e529ee4be41bb9fc732ff6497931a` was deployed with canonical `deploy.sh`; rollback is `f9659668b237b70b4c018b866e20498689d327c2`. Server full build, core `29/29`, search `2/2`, quota seed, physical database isolation, nginx reload, public/loopback release markers and all container health gates passed. No local Docker was used.
- Exact BGE-M3 revision is `5617a9f61b028005a4858fdac845db406aefb181`; model manifest is `08cc5a668e899e216e8ce66e7f3a5e144cefd9600a082997483c5dd0c66478e4`, package freeze is `dc2bc38e5ddda73889d15265eac0cdfa8eaaebe311bc2e63a9b2e32e19cd0fc3`, and the production image digest is `sha256:137352df4cb1c0937693f3b61d897d22c578232cc8ac15c5a088d0fcb08a0a3e`.
- ECS exact-SHA evaluation used 16 self-authored chunks and 24 queries: nDCG@10 `0.996655`, Recall@10 `1`, P50 `232 ms`, P95 `240 ms`, peak RSS `2,244,235,264` bytes and GPU package count `0`. Production isolation is internal network only, no published port, user `10001:10001`, read-only rootfs, cap-drop ALL, no-new-privileges, 2 CPU, 6 GiB and 128 PIDs.
- Failure drill stopped the production embedding worker and verified a real worker response of `lexical_only / embedding_unavailable` with a lexical candidate. Restart plus strict model-identity vector canary returned `EMBEDDING_RUNTIME_OK`; the drill used fake storage and wrote no production search data.
- `/usr/local/bin/backup.sh --db` published atomic dual-database set `db-set-20260827T155422Z-1676593`. Checksums, 0700/0600 permissions and release binding passed; both dumps restored into isolated retained databases and schema/data fingerprints matched (search schema after PostgreSQL deparse normalization).
- Operational warning: when a multi-command remote script itself arrives through stdin, `docker compose exec -T` can consume the remaining script. Redirect non-input exec calls from `/dev/null`, or send steps separately. Never place database URLs or passwords in argv or logs.
- Rollback options are immediate lexical-only routing via `BGE_M3_ENABLED`, or immutable release `f9659668…`.
- 2026-08-28 authorized hygiene pass removed 7 exited candidate containers, 6 temporary restore/test databases, 3 unreferenced volumes, obsolete BGE/LiteParse/app image generations and build cache. Docker footprint changed from `35.63 GB` images + `11.44 GB` volumes to `12.56 GB` images + `6.754 GB` volumes; only the active versioned BGE model volume, production worker image, rollback images and accepted LiteParse candidate remain. Post-cleanup release markers, container health and strict CPU vector canary returned `8163f8b…` / `EMBEDDING_RUNTIME_OK`.

### 5.37 Repository hygiene deployment and document canary (2026-08-28)

- Hygiene implementation `d37d7a8acb4ff74e8f7b511e518fc84b888065f8` was deployed with its docs closure as immutable application/release `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback is `8163f8b4218e529ee4be41bb9fc732ff6497931a`. No migration or seed ran.
- The isolated worktree must set the already documented `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS` so `cloud-sync.mjs` can reuse the main checkout's untracked deployment configuration without reading or copying it. Missing this variable is a local pre-upload failure, not an SSH-key failure and does not switch production.
- ECS full build generated 19 Web pages; Parser, Agent Worker, BGE worker, API and Web passed SHA-tagged image/health gates. Core `29/29` and search `2/2` status are current; `.release-id`, public `/__release`, absent `.release-failed`, Cloudflare/loopback 200 and post-deploy checkup all matched `e2c0eaf…`.
- A no-database-write production canary submitted the tracked `OpenScience_Kimi_Development_Spec.docx` through the Agent Worker `/parser-jobs` boundary to the networkless sidecar. It returned `DOCUMENT_PARSE_CANARY_OK|kind=docx|chars=18118`; the strict BGE vector canary separately returned `EMBEDDING_RUNTIME_OK`. This proves the current DOCX path is live, not that Task 4 complex-layout/OCR cascade is complete.

### 5.38 Task 8 parser acceptance and single-runner release transaction (2026-08-29)

- Candidate code `82e99869a87ac025000aa3edefc851fe85b03303` passed exact Ubuntu CI run `33192991542`, including real `flock`, ownership, signal, durable-journal and active-CAS tests. This is predeploy evidence only; production remains `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f` until ECS Phase B and the confirmed transaction both succeed.
- Before any write, refresh checkup and require the execution-time active release to equal the supplied `--rollback-ref`; require no `.release-failed` or `/opt/openscience/.deploy-transaction.json`, no candidate/stage collision, sufficient disk/RAM, and a fresh atomic database backup. Core/search status is the current `29/29` and `2/2`, not the stale counts embedded in older plans.
- Phase B first materializes the exact candidate, performs the server install/full build and exact Worker/Parser image build without switching production, exports the canonical 16-case corpus, and runs `accept-document-parser-release.sh <sha>` to produce the schema-v3 report. The current profile is `hermes-parser-14-2-v1`; old schema-v2 reports fail closed. The only success marker is `TASK8_PARSER_ACCEPTANCE_OK`; require the fixed report path `/opt/openscience-acceptance/document-parser/<sha>/report.json`, zero owned temporary containers/volumes/run directories, and unchanged production release.
- Confirmed deploy requires all three arguments: `--confirm --require-parser-acceptance --rollback-ref <current-active> <candidate-sha>`. The launcher may perform only immutable cloud-sync before opening one foreground SSH that executes the exact candidate's `production-deploy-transaction.sh` with stdin disconnected.
- The remote runner owns `/run/lock/openscience-production-deploy/lock` on inherited FD 9. Under that same FD it revalidates source manifest, active/rollback, formal acceptance report, runtime snapshot and final image IDs; then performs build, optional migration, parser-first switch, actual container `.Image` checks, capability/Nginx publication, expected-only active CAS, public health and backup-script refresh. A second SSH/coprocess/lease proof is not an accepted substitute.
- Before the first production mutation the runner atomically publishes `/opt/openscience/.deploy-transaction.json`. Catchable failures roll back while FD 9 remains held; SIGKILL/host loss leaves the journal, and the next deploy must fail closed rather than guess recovery. Never delete the journal or `.release-failed` merely to retry: inspect the recorded candidate/previous/phase, restore and verify the exact previous release, then use the checked-in recovery contract.
- Final acceptance requires `.release-id` and public `/__release` equal the candidate, absent failure/journal markers, exact running Worker/Parser images equal the acceptance report, healthy isolated Parser, public/loopback routes, core/search ledgers up to date, strict BGE runtime canary, and post-checkup cleanliness. Any mismatch blocks completion and preserves production evidence.

### 5.39 CPU parser cascade production rollout and recovery (2026-08-29)

- Candidate `0b431ef40e601ff69021673ae51de1e18f6d401b` passed exact CI, ECS 16-case acceptance and the formal deploy contract, but its newly started Agent Worker became unhealthy. The FD9 transaction automatically restored `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; active/public release, prior containers and journal cleanliness were reverified before retrying.
- An isolated ECS run of the exact Worker/Parser images found the startup scan fixture was too brittle: Tesseract returned split blocks `ULF`, `t2`, `FS`, so the exact-string self-test failed even though the canonical acceptance scan and cross-block locator path were healthy. This was a runtime fixture/locator-semantic defect, not a local/server dependency mismatch and not an SSH-key failure.
- TDD release `c5817121bddbd065c5ecb38811da8e707e6e5d17` made startup reuse the byte-identical canonical 612×792 acceptance scan and validate text through the same cross-block locator reproduction while still requiring Tesseract `5.3.0`, confidence and bbox round-trip. Focused regression, full Worker and release-contract gates passed; exact GitHub Actions run `33221760698` was green.
- The successful ECS acceptance returned `TASK8_PARSER_ACCEPTANCE_OK` and `PARSER_ACCEPTANCE_DEPLOY_CONTRACT_OK`: 10 succeeded / 6 needs_review / 0 failed / 0 false-ready, P50 `151.9 ms`, P95 `1255.32 ms`. Accepted images were Agent Worker `sha256:ae98ea5ffeebb16c145b60207ca7a3b0499afd6e6e370c2c94ad61a45dc7cbe8` and Parser `sha256:0ac86bfc6dbcda36765f0829550735a1c7c6fb248d3d4006d26dc8611d7dc902`.
- Canonical deployment with `--confirm --require-parser-acceptance --rollback-ref e2c0eaf... c581712...` passed runtime snapshot, database isolation, core `29/29`, search `2/2`, quota, BGE, parser-first switch, exact running-image, Nginx, active CAS, public release and journal-clear gates. A fresh production scan startup test passed text/locator/Tesseract/confidence/bbox; `.release-id`, loopback and public `/__release` all matched `c581712...`.
- Use the real search Prisma entry when checking the separate ledger: `node node_modules/prisma/build/index.js migrate status --schema /opt/openscience/infra/search/schema.prisma`. `packages/search/dist/migrate-cli.js` does not exist; attempting that path is an operator command error, not a search-database failure.
- Authorized hygiene removed only a 12-SHA failed-candidate whitelist under release/acceptance roots, matching candidate image tags and exact diagnostics. It preserved active/rollback, production volumes and Git history. Final audit: stale release/acceptance/image/diagnostic counts `0`, backup sets `7`, available disk `72G`. Deletion is not recoverable from the host, but every source SHA remains in Git.
- A redundant systemd cleanup unit later failed before deletion because systemd interpreted Bash array syntax incorrectly; the primary cleanup had already completed and the final read-only audit proved zero targets. Do not treat that quoting failure as cleanup rollback or rerun broad prune commands.

### 5.40 Parser 14/2 closeout and read-only disk inventory (2026-08-29)

**Prechecks.** Exact GitHub Actions run `33235948918` is green for application
SHA `28a3d5ca681b7744fae521dfa9154100a24e8845`. Canonical schema 3 profile
`hermes-parser-14-2-v1` passed 14 succeeded / 2 intentional needs review / 0
failed / 0 false-ready, structured fake gateway 14 / external provider 0.
Production and application source are exact `28a3d5c…`; rollback is
`c581712…`; core/search are `29/29` and `2/2`; runtime and release markers are
green. This audit authorizes no deletion.

**Read-only execution.** From PowerShell, use only explicit Git for Windows
Bash and the canonical wrappers:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/checkup.sh
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/ssh-run.sh 'df -B1 /; du -x -s -B1 /opt/openscience-releases /opt/openscience-evals /opt/openscience-acceptance /root/.local/share/pnpm/store; du -x --apparent-size -s -B1 /opt/openscience-releases /opt/openscience-evals /opt/openscience-acceptance /root/.local/share/pnpm/store; docker system df'
```

The fresh audit at 13:58 +0800 produced the following byte inventory. `du`
child rows can share hardlinks; Docker images can share layers. Therefore rows
and standalone release sizes must not be summed into a reclaimable total. A
single ordered cross-root `du` (releases → evals → acceptance → pnpm)
is the non-duplicated physical/apparent view.

| Category | Physical / apparent evidence | Class | Disposition |
|---|---:|---|---|
| Root filesystem | total `158,132,850,688`; used `77,656,059,904`; free `73,816,707,072` bytes (52%) | `KEEP` | Capacity fact only |
| `/opt/openscience-evals` | `15,406,067,712` / `13,083,532,536` bytes | `INVESTIGATE` | Preserve until each historical evaluator has an exact evidence-retention decision; child directories overlap through hardlinks |
| Failed parser eval `63eb6b2…` / `9e9a0e8…` | each `90,112` / `23,081` bytes | `DELETE_CANDIDATE` | Failed candidates, not accepted evidence |
| Accepted parser eval / acceptance `28a3d5c…` | eval `90,112` / `23,081`; acceptance `180,224` / `110,495` bytes | `KEEP` | Formal active-release evidence |
| `/opt/openscience-acceptance` | `634,880` / `287,173` bytes | mixed | Keep `28a3d5c…`; failed `9e9a0e8…` path (`90,112` / `23,081`) is `DELETE_CANDIDATE`; `63eb6b2…` is absent |
| `/opt/openscience-releases` | `22,499,897,344` / `19,399,624,994` bytes; 41 trees = 1 active + 1 rollback + 39 other | mixed | Keep `28a3d5c…` and `c581712…`; failed `63eb6b2…` and `9e9a0e8…` are `DELETE_CANDIDATE`; other 37 are `INVESTIGATE` |
| Release non-duplicate ordered allocation | active `2,997,968,896`; rollback incremental `619,380,736`; other incremental `18,882,543,616` bytes | evidence | Order is active → rollback → other; do not use standalone release `du` as reclaimable space |
| Cross-root non-duplicate allocation | releases `22,499,897,344` / `19,399,624,994`; eval incremental `12,947,496,960` / `10,800,309,307`; acceptance incremental `634,880` / `287,173`; pnpm incremental `3,593,535,488` / `3,570,062,172` bytes | evidence | This ordered row prevents hardlink double counting; do not add the standalone rows |
| Root pnpm store | standalone `6,052,106,240` / `5,853,285,401`; cross-root incremental `3,593,535,488` / `3,570,062,172` bytes | `DELETE_CANDIDATE` | Regenerable build cache; exact path `/root/.local/share/pnpm/store`; approval still required |
| Docker images / build cache | images `16.14GB`, reclaimable `6.336GB`; build cache `2.317GB`, all reclaimable | mixed | Keep active/rollback/BGE/runtime images; build cache is `DELETE_CANDIDATE` |
| Failed candidate image tags | Worker unique `0B`, Parser unique `195.3MB` per `63eb6b2…` and `9e9a0e8…` | `DELETE_CANDIDATE` | Exact four SHA tags only; shared sizes are not additive |
| Dangling images | three IDs: `ea452b0…` unique `195.3MB`, `16f7e83…` `862MB`, `6d00f2d…` `55.75MB` | `DELETE_CANDIDATE` | Docker-reported unique total is about `1.11305GB`; already included in Docker reclaimable size |
| Server dev stack | four containers; three volumes total `71,417,856` physical bytes | `INVESTIGATE` | Not used by production, but confirm integration-test need before exact teardown approval |
| Production volumes | six volumes total `4,873,039,872` physical bytes | `KEEP` | Includes versioned BGE `4,587,413,504`, PostgreSQL, Redis, SeaweedFS, ClamAV and parser-jobs |
| Monitoring/Portainer volumes | five volumes total `1,681,838,080` physical bytes | `KEEP` | Netdata, vnStat and Portainer operational state |
| Logs | `/var/log` `526,389,248` physical bytes; journal `422.9M`; Docker JSON logs `24,062,642` bytes | `KEEP` | Apply existing rotation only; no ad-hoc deletion |
| Backups | `7,946,240` / `7,757,118` bytes; seven backup-set directories | `KEEP` | Preserve verified core/search backups and release binding |
| Regenerable caches | `/var/cache/dnf` `63,049,728`; `/root/.npm` `194,285,568` physical bytes | `DELETE_CANDIDATE` | Exact caches only; do not broaden to `/var/cache` or `/root` |
| Tool cache | `/root/.cache` `421,773,312` / `392,015,749` bytes | `INVESTIGATE` | Attribute contents before any whitelist request |

**Rollback.** The audit made no server mutation, so rollback is not applicable.
A future cleanup is not host-recoverable: request user approval for an exact
path/image/cache whitelist, preserve active/rollback, accepted report,
production/BGE/monitoring volumes, logs under rotation and all seven backups,
and never run a broad prune or wildcard release deletion.

**Verification.** After any separately approved cleanup, rerun canonical
`checkup.sh`, confirm active/public/loopback release `28a3d5c…`, rollback tree
`c581712…`, absent failure/journal markers, healthy production containers,
core/search `29/29` and `2/2`, `PARSER_ACCEPTANCE_DEPLOY_CONTRACT_OK`,
`EMBEDDING_RUNTIME_OK`, seven backups and a fresh non-duplicated disk audit.
