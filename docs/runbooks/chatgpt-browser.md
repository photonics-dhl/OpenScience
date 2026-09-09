# Server ChatGPT browser — operator login research

Status: server browser running, host bridge active, localhost noVNC page HTTP200 (2026-09-09). Login, webpage generation and image return remain pending; not a production image provider.

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
- UI accepts only localhost Host and same-origin requests; WebSocket requires same-origin. No Docker published ports, no CDP port, no public VNC.
- Proxy logs only denied CONNECT hostnames. It never logs headers, cookies, content, or full URLs.
- Fresh validation is limited to actual startup/login/image workflow; no tests or preflight suites.

Sources: https://playwright.dev/docs/docker ; https://github.com/novnc/websockify ; https://help.openai.com/en/articles/11084440-chatgpt-images-faq .

## Startup repair evidence (2026-09-09)
- Failed initialization: openat2 returned EPERM then init exited255. After allowing it, Node clone3 EPERM caused SIGABRT; ENOSYS enables fallback to existing clone. Chrome then hit pkey_alloc/chroot denials; targeted allowances restored startup. Nonroot/capdropALL/NNP/network-none/Chrome sandbox retained; independent High review accepted the scoped change.
- Raw-argument, failed-syscall-only trace used briefly for the known startup failure; tracing detached, no credential/page contents collected. No test suite or local runtime executed.
- Failed containers retained stopped for diagnosis; active container22176c5c uses image272a5ed57d27 and persistent private profile. No browser redownload.
