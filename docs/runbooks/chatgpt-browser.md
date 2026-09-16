# Server ChatGPT browser — operator login research

- 当前版本、原任务期限与用户决定仅见[CURRENT handoff](../handoff/2026-09-10-hermes-web-image-handoff.md)。2026-09-15峰值取证：/dev/shm用满512MiB，与Mojo管道失败及173次ERR同步；事后余量不能排除峰值。1GiB现已运行，同六页首次加载峰值882MiB、资源错误0，4GiB总内存/沙箱保持。用户“你来判断”后私有备份、三锁下复用现有镜像/挂载/provider切换；六URL/登录/草稿正文已恢复，Chat段落格式不同，原文备份保留。旧容器停止供回退；回退容器不等于原DOM还在，备份才是恢复依据。不热remount、不杀NetworkService、不重置过期标记或重发。Library仍须精确绑定原结果。
- HISTORICAL 2026-09-13：base bundle d1630135 / rollback92cc416e；当时image broker运行patches/b78fb94d568840f4ef686eee76645ec86ed62acf/bundle，image/review runner501da7a3，page-lifecycle d369ccc2。各patch/before与deployment.json保留回滚；浏览器镜像8aa21251，07:55:11Z自行重启保留登录，应用08ed不变。真实5260只提交一次、原图回收/规范化/产品succeeded100%/draft；这些是历史证据，不得作为现行版本。
- 历史人工恢复的活动判断复用review-runner.cjs既有可见Stop/停止按钮，再读取composer和未保存表单；不得以整页“生成中/generating”等历史文字阻止恢复。旧generatingPages=1即此误判。此次14页均无Stop/composer/dirty，取得三锁且队列空、确认profile/jobs持久化后才重启；证据/jobs/hermes-browser-{actual-state,pre-restart-actual,restart-container}-20260913b.json。
- 已固化：正常键盘输入→Control+End→picture_v2工具，严格正文/模式校验；原Save弹窗不可用时，仅从唯一主图实际同源/estuary/content取PNG，禁止redirect、限30MiB后走原隔离normalize。download只在原deadline+1h内取已有结果；late marker不重复触发浏览器，但已保存结果可reconcile，保留错误/uncertain与原始marker。
- 页面生命周期：page-lifecycle.cjs在创建/认领时记录instance+target+job；连接前仅回收相同provider中归属严格匹配、未submitted且失败/过期的about:blank。Chat首页和已提交会话可能有后来人工草稿，即使已有结果也不能按任务账本自动关闭。正常runner自身收尾保持；未知/异常会话留给明确处理。固定localhost CDP、每请求2s、轮次有界，close需等target消失再写closed审计；当前模块patch及回滚副本见CURRENT。
- 部署按image→science→shared三锁，先装page-lifecycle再装runner；回滚恢复各patch/before中的脚本，b78还需恢复service并daemon-reload。仅处理本任务页面，不因attach失败批量reload/关页/重启，不重放原已提交请求。旧页无归属记录时只做精确诊断；不能按conversation URL直接自动关闭用户页。

- 最新2026-09-11：第二账号已正常登录，实际账户设置与用户指定账号匹配（Pro）；noVNC实际可视可操作。旧“等用户密码”状态已完成，不要再次要求登录。6Pro截图规划会话6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581已回复。
- 新模型菜单使用Thinking effort→Power，键盘右移到第5档时实际显示6 Pro。收起后正文可能分成6换行Pro，识别需允许空白。不要因菜单变化降级模型或反复重发。
- noVNC故障恢复仅操作x11vnc，未关闭Chrome会话。一次后续启动日志显示5900已占用，现有进程随后正常传输画面；根因未完全确定，不重复盲重启或添加无证据参数。

HISTORICAL（旧任务记录，以CURRENT handoff为准）: production `9b97522f…`, provider `f4832487…` (2026-09-11). Deep-sub-cycle has two real draft images of six planned. The old usage-limit conversation was reconciled without resending. A group retry reached version8 then failed before web submission because image mode shows Extra High, not the science planner label 6 Pro (run now failed/version9). The provider-only fix removed that incorrect image-mode requirement while retaining 6 Pro for scientific review. A new scene0 task `8b0ca4c9-eb20-4478-a79c-d1b8e0dadc25` then succeeded through the product button: Hermes prompt, native web image generation, download, storage and automatic gallery display. Scientific review and publication remain pending.

## 当前截图与操作方式
- Chrome125%下截图用Page.getLayoutMetrics的非css layoutViewport尺寸作Page.captureScreenshot clip，已取得完整1424×816画面；旧截图裁切不等于网站溢出。
- 打开Hermes模态Drawer后先用其关闭按钮退出再导航；Next链接点击后等待目标URL再截图，旧页面同名标题不能当新路由已完成。

## 历史产品观察
- 2026-09-11账号切换：用户授权指定第二账号。当前服务器账户菜单未出现Add account，故按正常退出/登录处理；输入目标邮箱后OpenAI转Google OAuth。bridge明确拒绝accounts.google.com:443；随后认证页停在Loading，唯一外部AccountsSignInUi脚本www.gstatic.com也被拒。仅补这两个精确域名，保留443和其余allowlist限制。其他Google/字体/头像域未放行。实际部署/登录完成状态见CURRENT handoff；不会自动跨账号重放旧会话。
- A failed AgentTask/run can coexist with its already-persisted image after an old completion conflict. Read product presentation-assets before assuming the PNG needs importing.
- Terminal rate-limit text occurs inside the assistant turn, not necessarily an alert. The broker now preserves USAGE_LIMIT without restarting or resending.
- Recovery compares the stored canonical URL directly; unrelated product and /images tabs must not be passed to a throwing canonical parser.
- Two failed 7d8 recovery markers were renamed to `*.invalid-target-archived` before one same-conversation reconciliation. No request deadline or prompt was rewritten.
- The current image visibly includes internal production instructions and an orphan numerical annotation. It remains draft: successful transport is not scientific or visual approval.

## Prerequisites
- Read server-capabilities.md first. Reuse the installed ScanSci image's full Chrome revision1234, Xvfb and libraries, plus existing Node/media-font layers. Only x11vnc/noVNC/websockify are additional packages; do not download Chromium again.
- User authorized a server-hosted interactive browser for the existing account. Login/MFA/challenge stays with the user; no copied Codex credentials or cookie extraction.
- Existing Docker and localhost Squid127.0.0.1:7891. This installation does not modify production networks, application services, or Squid configuration.
- Dedicated UID11040, private profile/downloads under /opt/openscience-chatgpt-browser; never include them in repository or general artifact uploads.
- Browser network none, readonly rootfs, limited RAM/CPU/pids/tmpfs, Chromium sandbox enabled with Microsoft's Playwright v1.62.1 seccomp profile plus traced runtime compatibility rules (openat2; clone3 returns ENOSYS; pkey_alloc/free/mprotect; chroot). Never fall back to no-sandbox or privileged.

## Execution
1. Transfer infra/chatgpt-browser to a dedicated server staging directory through the project SSH wrapper; do not mount the application checkout into the browser.
2. On server run `bash <staging>/install.sh --confirm`. The build uses the Aliyun Debian mirror with Debian signature verification intact and clears build-only HTTP proxy arguments. It builds the dedicated Debian browser image, starts the localhost bridge and isolated browser. It retains all profile/download data.
3. From Windows use explicit Git Bash and this worktree's `infra/scripts/ssh-run.sh --browser-tunnel`, with XGS_CONFIG_ROOT=E:/Miscellaneous/XGS. The only forwarding is local127.0.0.1:6081→server127.0.0.1:6081.
4. Open `http://127.0.0.1:6081/vnc.html?autoconnect=true&resize=scale`. User completes normal ChatGPT login in that remote browser. Do not enter credentials in conversation.
5. This is a private interactive session, not a server-triggered public API. Keep the approved Hermes image brief unchanged when later attempting one web generation. Do not mark the product flow complete until actual image return is observed.

## Recovery / rollback
- If the image build was interrupted before either the bridge unit or browser container exists, resume with `bash <staging>/install.sh --confirm --resume-build`. This mode refuses to overwrite a running installation or logged-in profile.
- Stop only openscience-chatgpt-browser container and openscience-chatgpt-browser-bridge service when retiring this research environment; keep profile/downloads and scripts intact.
- Do not restart production or overwrite its Codex auth. Existing image provider remains unchanged.
- A denied CONNECT log may identify a necessary hostname; review it before narrowly adding it. ChatGPT attachment storage uses dynamic regional subdomains, so the bridge permits `oaiusercontent.com` and legal subdomains with a DNS-label boundary; it does not permit arbitrary suffix matches. No wildcard proxy or direct-connect fallback.
- IPC socket pathnames may be renewed only after type checking that they are sockets; ordinary files are never removed.

## Observing actual operation
- Server container logs and bridge service status establish startup only, not successful login or image generation.
- A normal HTTP request receiving403/challenge does not establish browser failure. Observe the remote browser itself.
- UI accepts only localhost Host and same-origin requests; WebSocket requires same-origin. No Docker published ports or public VNC. CDP9233 is restricted to loopback inside the network-none container; no host relay.
- Proxy logs only denied CONNECT hostnames. It never logs headers, cookies, content, or full URLs.
- Fresh validation is limited to actual startup/login/image workflow; no tests or preflight suites.
- The science broker refreshes `.ready` every 15 seconds only while its flock-owned process is alive. The continuation identity includes parent attempt, candidate/source hashes, evidence manifest and supplemental contract version. A failed or invalid continuation preserves the initial review and blocks only fields explicitly scoped by `【影响…】`; an ambiguous scope blocks the bundle without deleting the stored drafts.

Sources: https://playwright.dev/docs/docker ; https://github.com/novnc/websockify ; https://help.openai.com/en/articles/11084440-chatgpt-images-faq .

## Startup repair evidence (2026-09-09)
- Failed initialization: openat2 returned EPERM then init exited255. After allowing it, Node clone3 EPERM caused SIGABRT; ENOSYS enables fallback to existing clone. Chrome then hit pkey_alloc/chroot denials; targeted allowances restored startup. Nonroot/capdropALL/NNP/network-none/Chrome sandbox retained; independent High review accepted the scoped change.
- Raw-argument, failed-syscall-only trace used briefly for the known startup failure; tracing detached, no credential/page contents collected. No test suite or local runtime executed.
- Failed containers retained stopped for diagnosis; active container22176c5c uses image272a5ed57d27 and persistent private profile. No browser redownload.

## Windows tunnel recovery
- Start infra/scripts/browser-tunnel.ps1 in a hidden PowerShell process. It runs the existing fixed-port SSH wrapper and reconnects after disconnects; it does not restart Codex or the server browser. Keep one instance only.
- 2026-09-09: original SSH connection reset left no local6081 listener. Reconnecting restored local page HTTP200; server bridge/browser remained running throughout.

## Login assets (2026-09-09)
- Unstyled OTP screen and unresponsive Continue coincided with70 denied CONNECTs to auth-cdn.oaistatic.com. Added that exact host and observed OpenAI hosts cdn.openai.com/api.oaistatsig.com/bzr.openai.com, consistent with OpenAI network recommendations. Restarted only bridge; browser/profile retained. User must refresh the remote Chrome page; login success not yet observed.
- Source: https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps . Never record OTP values.

## Server execution — actual result 2026-09-09
- User accepts the existing local proxy exit; do not treat independent server egress as a current blocker.
- Executor image9f44e1267fba reuses Playwright-core1.62.1 and full Chrome; internal CDP9233 only. jobs is an independent0700 bind mount. No local browser-control bridge is needed to execute the image task.
- Existing limit256 hit pids.events max1 with245 threads/processes. Increased to512, preserving2GiB memory limit. A subsequent browser restart restored stuck CDP/pages while preserving login. This establishes a resource-limit event, not proof of every previous SIGSEGV cause.
- OpenAI realtime host ws.chatgpt.com added from denied connection evidence. Direct Chat list/read successfully identified the submitted conversation; CUA failure is not Chat unavailability.
- Actual job f6f29af4-b3c8-4609-93ac-4572970cc4b8, approved Hermes source scene10f36f01-3521-47b5-bdbd-f491ec3f5b8a. Submitted once via normal webpage Send; no Codex image call or API-billing fallback.
- Canonical conversation https://chatgpt.com/c/6aa162f9-d0e4-83ea-afbf-243f7aae8a22 (“生成科研机制图”). Initial /c/WEB:d9d90bec-6b4a-4ac4-9979-4a612e80b883 was an optimistic URL, not a second submission.
- Normal fullscreen Save downloaded `/opt/openscience-chatgpt-browser/jobs/f6f29af4-b3c8-4609-93ac-4572970cc4b8/output/image.png`:1556710bytes, PNG1225x1284. Request/submission/conversation/result records retained privately. Do not read auth storage or log OTP/cookies.
- Scientific review: revision required. Image adds a plate/aperture geometry and field lines despite the brief requesting abstract objects without reconstructed geometry. Not published to product gallery and not approved as scientific evidence.

## Reusable runner
- `infra/chatgpt-browser/runner.cjs` provides prepare/send/status/download plus execute (prepare→send→wait→download), resume (wait/download only) and recover (open the exact stored canonical conversation and download only). Current server copy `/jobs/runner.cjs`; canonical image installs `/app/runner.cjs`.
- Trusted operator exports only `{id,prompt,source}` to `/jobs/<UUID>/request.json`. Prompt comes from the already approved Hermes request; caller owns authorization/scene identity. Do not expose this runner as a public endpoint.
- Run only with `docker exec openscience-chatgpt-browser flock -n /jobs/runner.lock node /jobs/runner.cjs <mode> <UUID>` (use `/app/runner.cjs` after canonical image rollout). UUID/mode are fixed validated arguments; no prompt in argv, no arbitrary URLs/selectors/scripts accepted.
- Submitted marker is exclusive and fsynced before Send. A timeout/crash after submission may restart the browser once and recover only from the exact stored canonical conversation; it must never resend. Human should not manipulate the same page during execution.
- Production task `eb48809b-c402-4983-969d-ee82d0fe6200` completed end-to-end. Gateway recovery verifies request/result/provider/task/prompt hash and PNG identity, then reuses the original prompt/result without replanning. Result is a draft product asset pending user review. No tests were run.
## 2026-09-09 Product page control
- Added exact OpenScience hostname to CONNECT allowlist for actual product-page review. No other egress widening. Landing and login loaded on server; screenshot showed the transparent Hermes illustration (no brown panel).
- Playwright browser-wide CDP initialization hung after WebSocket connected (8s then25s). Browser946MiB/2GiB,277/512pids, no OOM/pids events. Do not diagnose quota/network/memory without evidence.
- Standard `/json/list` plus the selected page's CDP WebSocket successfully read visible login DOM and captured its screenshot immediately. This is server-local page control, not authentication storage/API access. Browser remains open; no restart/relogin of Chat was needed.
- User completed the separate OpenScience server login; authenticated dashboard observed. Chat remains logged in and direct Chat interface sent/received two product discussions. No password/OTP read or transferred.
- Screenshot upload encountered an explicit regional asset CONNECT rejection; added only sdmntprwestus.oaiusercontent.com:443 and restarted the host bridge without restarting Chrome. No attachment preview has appeared yet; screenshot review is not complete. Chat text DOM and direct discussion remain usable. Page.captureScreenshot later timed out independently.

- After normal Chat page reload, screenshot attachment preview appeared and dashboard-c2d11326.jpg was sent once for 6 Pro review. Do not repeat that request; reply pending.

## Production web image provider
- Distinct chatgpt-web Gateway provider reuses the existing request/result spool and pending scientific-review asset pipeline. It never approves assets or publishes automatically.
- Install from built immutable release with install.sh --confirm-provider --source /opt/openscience-releases/<SHA> --renderer-image <existing immutable FFmpeg image digest>; then select HERMES_SCENE_IMAGE_PROVIDER=chatgpt-web for API/worker. No account/profile reinstallation is needed.
- Results root:1000 mode2750 propagates worker-readable group ownership; only worker mounts inbox rw/results ro. Broker uses the shared browser lock, one exclusive submission marker, strict canonical conversation, and aspect-preserving padding.
- First attach failure may trigger one Chat-target reload and one attach retry only before any submission. A submitted job may restart the browser once and run `recover` against its exact canonical conversation; it never reloads the composer or resends. Production execution succeeded on 2026-09-10: canonical `6aa23223-62f8-83e9-9b43-19d424eb51a6`, PNG 1280×720/971354 bytes, product asset/task `eb48809b-c402-4983-969d-ee82d0fe6200` in `draft`.

## Scientific review execution — 2026-09-11
- The original 3770010-byte PDF uploaded successfully after replacing the single `sdmntprwestus.oaiusercontent.com` host entry with the bounded `oaiusercontent.com` subdomain rule. Regional hosts observed in prior failures remain covered without opening unrelated egress.
- A 6 Pro response can exceed the previous 10-minute protocol window. The scientific-review request and systemd service now allow 1800 seconds; image generation remains 660 seconds.
- A recovered response may be reused only for the exact stored attempt when the freshly computed candidate hash equals `reviewedCandidateHash`. A mismatch creates one new content-bound review with the original PDF; it never adapts or copies the old answer.
- Long 6 Pro turns can expose a visible Copy control beneath a transparent action layer. The runner invokes the uniquely anchored button's DOM handler instead of pointer hit-testing, and exits explicitly after persisting the response so the broker publishes immediately.
- science-v4 defines all six SDF fields as user-facing whole-paper syntheses. Missing a same-named section or complete implementation disclosure is not a field absence; reproducibility includes a bounded reconstruction recipe plus disclosed gaps. `needsMoreEvidence` now carries structured `affectedFields` and is reserved for unreadable/missing source needed to judge a core claim.
- Production task `1e324308-fd26-4cc1-8612-8a1c269909a9`, attempt `6cc0a17c-e4df-5655-8819-34788e45bced`, returned `review_received`, six nonempty summaries and no supplemental request. The visible product proposal matches the stored result; no canonical write occurred.
- Product task `f95761f7-1b2a-468a-99fe-70826af34d1e` completed initial review `1b0bbec7…` and PDF supplement `42674980…`. Both responses are stored. The supplement contained one raw control character inside a JSON string; deterministic string-only escaping is pending deployment, after which the same responses can be consumed without another Chat request.
