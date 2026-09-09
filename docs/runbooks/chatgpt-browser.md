# Server ChatGPT browser — operator login research

Status: server browser running, host bridge active, localhost noVNC page HTTP200 (2026-09-09). User login and one actual webpage generation/download completed; not yet an integrated production image provider.

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
- A denied CONNECT log may identify a necessary hostname; review it before narrowly adding it. No wildcard proxy or direct-connect fallback.
- IPC socket pathnames may be renewed only after type checking that they are sockets; ordinary files are never removed.

## Observing actual operation
- Server container logs and bridge service status establish startup only, not successful login or image generation.
- A normal HTTP request receiving403/challenge does not establish browser failure. Observe the remote browser itself.
- UI accepts only localhost Host and same-origin requests; WebSocket requires same-origin. No Docker published ports or public VNC. CDP9233 is restricted to loopback inside the network-none container; no host relay.
- Proxy logs only denied CONNECT hostnames. It never logs headers, cookies, content, or full URLs.
- Fresh validation is limited to actual startup/login/image workflow; no tests or preflight suites.

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
- `infra/chatgpt-browser/runner.cjs` provides prepare/send/status/download plus execute (prepare→send→wait→download) and resume (wait/download only). Current server copy `/jobs/runner.cjs`; canonical image installs `/app/runner.cjs`.
- Trusted operator exports only `{id,prompt,source}` to `/jobs/<UUID>/request.json`. Prompt comes from the already approved Hermes request; caller owns authorization/scene identity. Do not expose this runner as a public endpoint.
- Run only with `docker exec openscience-chatgpt-browser flock -n /jobs/runner.lock node /jobs/runner.cjs <mode> <UUID>` (use `/app/runner.cjs` after canonical image rollout). UUID/mode are fixed validated arguments; no prompt in argv, no arbitrary URLs/selectors/scripts accepted.
- Submitted marker is exclusive and fsynced before Send. A timeout/crash after submission must be investigated/resumed, never blindly re-executed. Human should not manipulate the same page during execution.
- Actual prepare/send/download operations above succeeded. General execute/resume orchestration is saved but has not been independently run end-to-end; no tests performed. Production Hermes queue/Gateway provider and asset-import identity checks remain separate required integration work.
## 2026-09-09 Product page control
- Added exact OpenScience hostname to CONNECT allowlist for actual product-page review. No other egress widening. Landing and login loaded on server; screenshot showed the transparent Hermes illustration (no brown panel).
- Playwright browser-wide CDP initialization hung after WebSocket connected (8s then25s). Browser946MiB/2GiB,277/512pids, no OOM/pids events. Do not diagnose quota/network/memory without evidence.
- Standard `/json/list` plus the selected page's CDP WebSocket successfully read visible login DOM and captured its screenshot immediately. This is server-local page control, not authentication storage/API access. Browser remains open; no restart/relogin of Chat was needed.
- User completed the separate OpenScience server login; authenticated dashboard observed. Chat remains logged in and direct Chat interface sent/received two product discussions. No password/OTP read or transferred.
- Screenshot upload encountered an explicit regional asset CONNECT rejection; added only sdmntprwestus.oaiusercontent.com:443 and restarted the host bridge without restarting Chrome. No attachment preview has appeared yet; screenshot review is not complete. Chat text DOM and direct discussion remain usable. Page.captureScreenshot later timed out independently.

- After normal Chat page reload, screenshot attachment preview appeared and dashboard-c2d11326.jpg was sent once for 6 Pro review. Do not repeat that request; reply pending.

## Production web image provider candidate
- Distinct chatgpt-web Gateway provider reuses the existing request/result spool and pending scientific-review asset pipeline. It does not mark the previous failed Codex task succeeded, approve assets, or publish automatically.
- Install from built immutable release with install.sh --confirm-provider --source /opt/openscience-releases/<SHA> --renderer-image <existing immutable FFmpeg image digest>; then select HERMES_SCENE_IMAGE_PROVIDER=chatgpt-web for API/worker. No account/profile reinstallation is needed.
- Results root:1000 mode2750 propagates worker-readable group ownership; only worker mounts inbox rw/results ro. Broker uses the shared browser lock, one exclusive submission marker, strict canonical conversation, and aspect-preserving padding.
- First attach failure may trigger one Chat-target reload and one attach retry only before any submission. Submitted jobs never use recovery reload/resend. Static High review completed; production execution is still pending.
