# D2NN 科普视频服务器演示 Runbook

本手册只部署一篇 D2NN 论文的人工审阅样片。它验证服务器 CPU 渲染和
Nginx Range 播放，不表示 RO 已能自动生成图片或视频。演示不读取私有 RO，
只使用原创图、固定脚本和预先生成的旁白。

## 前置检查

1. 用户已明确授权本次部署；记录当前 Git full SHA、`/opt/openscience/.release-id`
   与 `/opt/openscience/.rollback-id`。本脚本不会修改这两个 marker 或 active release。
2. 用不可变 Git release 构建镜像 `openscience-media-demo:<full-git-sha>`。镜像的
   ENTRYPOINT 必须接受 `--input /input --output /output`，运行时不下载依赖或模型。
   Dockerfile从ECS现有 `openscience-scansci-mcp:390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7`
   复制完整headless-shell目录，而非重复下载Chromium。浏览器Chrome151.0.7922.34/
   revision1234与playwright-core1.62.1匹配；仅补完整FFmpeg、中文字体与运行库。
   源镜像是本地tag，构建前须确认存在；不自动换浏览器或进入运行中的ScanSci执行渲染。
   最终镜像应实测ldd无缺库、浏览器版本和实际截图/编码。
3. 仓库主配置可预先包含以下一行；若当前运行配置尚未包含，部署脚本只在唯一
   `location = /__release {` 前插入它：

   ```nginx
   include /etc/nginx/snippets/science-video-demo*.location.conf;
   ```

   脚本会为主配置和 snippet 分别创建带 run ID 的备份。首次运行若 snippet 不存在，
   会先建立只有受管标记的 inert 文件；原始模板中的 `__RUN_ID__` 只在渲染成功后
   替换。主配置已有一个精确 include 时不重复插入；同一 include 的其他写法、重复
   include 或缺少唯一 release location 都会拒绝执行。备份保存在新 run 的
   `nginx-backups/` 证据目录，不放进 Nginx glob。不要把 location 追加到 ACME、
   证书或 Cloudflare 配置。
4. 创建唯一 run ID，格式为 `<7-40位小写Git SHA>-YYYYMMDDTHHMMSSZ`。将已审阅
   bundle 放到下列精确目录；不得使用符号链接：

   ```text
   /opt/openscience-demos/science-video/d2nn/staging/<run-id>/
   ├── input/                 # 固定脚本、原创图、预生成旁白；最多128文件/128MiB
   └── web/
       ├── index.html
       ├── styles.css
       └── player.js
   ```

   `index.html` 必须含属性
   `data-science-video-demo="d2nn-reviewed-sample"`，并清楚显示“人工审阅样片，
   尚非 RO 自动生成结果”。页面只引用同目录 CSS、JS、MP4 与 poster。
5. Renderer 必须输出以下四个普通文件：

   ```text
   d2nn-science-explainer-v2.mp4
   poster-v2.png
   storyboard.json
   metrics.json
   ```

   `metrics.json` 合同为：`schemaVersion=1`、1280×720、时长大于 0 且不超过
   60 秒、H.264/AAC、`yuv420p`、`fastStart=true`、`completeDecode=true`。
   其中 storyboard 与 metrics 只用于服务器验收，不对公网开放。
6. 在本机工作区先执行：

   ```powershell
   node --test infra/scripts/deploy-science-video-demo.test.mjs
   & 'C:\Program Files\Git\bin\bash.exe' -n infra/scripts/deploy-science-video-demo.sh
   ```

## 执行步骤

1. 只读确认应用版本、Nginx include、镜像和 staging bundle。所有远程命令均由
   PowerShell 显式调用项目 SSH runner：

   ```powershell
   & 'C:\Program Files\Git\bin\bash.exe' E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh 'cat /opt/openscience/.release-id; cat /opt/openscience/.rollback-id; grep -Fc "include /etc/nginx/snippets/science-video-demo*.location.conf;" /etc/nginx/conf.d/openscience.conf || true; docker image inspect openscience-media-demo:<full-git-sha> --format "{{.Id}}"; find /opt/openscience-demos/science-video/d2nn/staging/<run-id> -maxdepth 2 -type f -printf "%P %s bytes\n"'
   ```

2. 在服务器执行一次性部署脚本。脚本运行容器时强制无网络、只读根文件系统、
   非 root、无 host env/Secret、无 Linux capability，并限制为 4 CPU、4 GiB、
   256 PID 和 600 秒。超时后脚本只 stop 本 run 的精确容器名，不删除容器；输入
   只读，输出进入新的 run 目录。失败目录与停止容器会保留供诊断：

   ```powershell
   & 'C:\Program Files\Git\bin\bash.exe' E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh --confirm 'bash /opt/openscience-releases/<full-git-sha>/infra/scripts/deploy-science-video-demo.sh --confirm --run-id <run-id> --image openscience-media-demo:<full-git-sha>'
   ```

3. 脚本仅在 MP4/PNG magic、JSON 合同和完整解码指标通过后复制三个网页文件，
   再以同一事务安装受管 Nginx snippet 和有界的主配置候选。Nginx 语法或 reload
   失败时自动恢复两份备份，并在需要时重新 reload 旧配置。它不会覆盖已有 run ID，
   也不会清理历史 release 或容器。

   Nginx 事务会复用正式应用部署的
   `/run/lock/openscience-production-deploy/lock`，从应用 release 快照一直持有到
   reload 后复核。锁忙时非阻塞返回 73；这表示正式部署正在进行，应保留已完成的
   render 证据并稍后使用新的 run ID 重试，不要把它误判成 renderer 失败，也不要
   绕过锁直接修改 Nginx。

## 回滚步骤

1. 找到脚本输出 run ID 对应的两份精确备份：

   ```powershell
   & 'C:\Program Files\Git\bin\bash.exe' E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh 'ls -l /opt/openscience-demos/science-video/d2nn/releases/<run-id>/nginx-backups/science-video-demo.location.conf.before /opt/openscience-demos/science-video/d2nn/releases/<run-id>/nginx-backups/openscience.conf.before; test -f /opt/openscience-demos/science-video/d2nn/releases/<run-id>/nginx-backups/science-video-demo.location.conf.before; test -f /opt/openscience-demos/science-video/d2nn/releases/<run-id>/nginx-backups/openscience.conf.before'
   ```

2. 恢复该备份，先验语法再 reload。保留本次 release、staging、备份与停止容器，
   不执行删除：

   ```powershell
   & 'C:\Program Files\Git\bin\bash.exe' E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh --confirm 'cp -p /opt/openscience-demos/science-video/d2nn/releases/<run-id>/nginx-backups/science-video-demo.location.conf.before /etc/nginx/snippets/science-video-demo.location.conf; cp -p /opt/openscience-demos/science-video/d2nn/releases/<run-id>/nginx-backups/openscience.conf.before /etc/nginx/conf.d/openscience.conf; nginx -t && systemctl reload nginx'
   ```

3. 再次检查应用 release marker 与部署前记录一致。若不一致，按应用部署事务
   单独调查，不以本 demo 的 Nginx snippet 回滚应用 release。

## 验证命令

1. 检查 Nginx、应用版本和精确文件暴露：

   ```powershell
   & 'C:\Program Files\Git\bin\bash.exe' E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh 'nginx -t; cat /opt/openscience/.release-id; test -f /opt/openscience-demos/science-video/d2nn/releases/<run-id>/output/d2nn-science-explainer-v2.mp4; test -f /opt/openscience-demos/science-video/d2nn/releases/<run-id>/output/poster-v2.png'
   ```

2. 公网首页应为 200，视频 HEAD 应为 `video/mp4`，单 Range 应为 206 且带
   `Content-Range`；内部 storyboard/metrics 与 staging 路径应为 404：

   ```powershell
   curl.exe -fsS -o NUL -w "%{http_code}`n" https://openscience.428312321.xyz/demos/science-video/d2nn/
   curl.exe -fsSI https://openscience.428312321.xyz/demos/science-video/d2nn/d2nn-science-explainer-v2.mp4
   curl.exe -fsS -H "Range: bytes=0-1023" -D - -o NUL https://openscience.428312321.xyz/demos/science-video/d2nn/d2nn-science-explainer-v2.mp4
   curl.exe -sS -o NUL -w "%{http_code}`n" https://openscience.428312321.xyz/demos/science-video/d2nn/metrics.json
   curl.exe -sS -o NUL -w "%{http_code}`n" https://openscience.428312321.xyz/demos/science-video/d2nn/input/
   ```

3. 用真实桌面和移动视口播放，验证 poster、字幕、音频、暂停、跳转与 seek。
   最后再次读取公网 `/__release`；其值必须与部署前应用 release 相同。

## Historical first verified run

独立服务器演示已部署：source 6a1b848a3df109098e5f1b9721e6c4df06c2c6d0，run 6a1b848-20260905T081000Z；公网 /demos/science-video/d2nn/。复用ScanSci Chrome151完整headless bundle，CPU渲染22.80秒生成46.25秒720p/H264/AAC视频（4,814,309 bytes），无新增付费API调用。全片解码、五项资源200、Range206、实际首播/章节seek、390px无溢出及零页面异常通过；内部路径最终404（input/先308规范化）。应用release仍390afc0。

## Storage and runtime reuse

2026-09-05 用户明确批准仅清理未使用Docker构建缓存，已执行docker builder prune --force。Docker回收报告7.517GB；df可用字节102607519744→107878596608，实际增加5271076864 bytes（4.91GiB），剩余100.47GiB。镜像21、运行容器13、生产390afc0均不变，构建缓存计费大小0B。用户要求PyTorch等基础依赖支持后续复用：先盘点现有embedding-worker CPU PyTorch版本/层，优先固定版本公共基础镜像，模型独立挂载，兼容后共享层；不共享可变site-packages、不继承BGE权重来运行TTS。本轮未安装TTS。

## Qwen CPU audition trial

### Preconditions

- Existing BGE runtime uses torch2.13 CPU, transformers5.16.1 and accelerate1.14; these are not the Qwen dependency set. No reusable tagged intermediate exists after cache cleanup. Keep BGE unchanged.
- Model: Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice at 0c0e3051f131929182e2c023b9537f8b1c68adfe; host /opt/openscience-models/qwen3-tts-customvoice-0c0e305. Files total approximately4.52GB. ModelScope weight revision ae999bce1d1356e93686274865bc72744daab1a5 has identical published weight SHA256; verify after cross-source resume to avoid mixed files.

### Execution

1. Build infra/tts-audition/Dockerfile.base as openscience/python-ml-cpu:py312-torch2.11.0-cpu; Qwen child inherits that reusable layer. Model weights are not copied into either image.
2. Build infra/tts-audition/Dockerfile; pip check and import checks must pass, package freeze remains in /opt/tts-lock.
3. Run a bounded one-off container with network none, read-only root, user10001,4CPU,12GiB memory/no additional swap,256PIDs,/tmp tmpfs. Mount model read-only to /models/qwen3-tts-12hz-1.7b-customvoice and dedicated output writable to /output. Set --speaker Serena, Uncle_Fu or Vivian; reuse one model directory.

### Rollback

Stop only the named trial container. Existing application, BGE, gateway and video assets are unchanged. Retain diagnostics and model files; further deletion needs explicit approval.

### Verification

Run audition_test.py; check saved waveform finite/nonzero, full WAV decode and listen to complete narration. Read per-voice metrics for duration/load/generation/maxRSS, df and image size for disk. A sample file does not establish automatic RO/Hermes integration or acceptable real-time latency.

### Verified audition results

Qwen三音色已在ECS CPU完成：Serena15.92s/生成39.57s、Uncle_Fu15.68s/39.45s、Vivian17.68s/43.99s；峰值进程RSS5.22–5.31GiB，4线程/BF16/SDPA，付费API调用0。三段WAV全片解码、有限非零波形通过；自然度与内容完整性待用户试听，不能把生成成功当作听感验收。基础镜像971705460bytes；子镜像2043364436bytes已含基础层；模型4520217432bytes。df可用101313294336bytes（94.36GiB），较清理后占用增加约6.11GiB；公网/loopback200、应用390afc0不变。

Post-audition review fixed rollback of a newly-created WAV when metrics publication fails (4/4 local and ECS tests). Abrupt process death between two publications still requires a fresh output directory. Original generation script retained at /opt/openscience-trials/tts/audition.sample-run.py; current script is bind-mounted from source for trial execution, so the image tag alone does not identify trial code.

### Naturalness A/B audition

配音自然度二轮：用户反馈第一轮仍机械；复用Serena/seed42，新增可选script/delivery。A原文+聊天指令14.88s/生成37.07s，B口语短句+同指令21.84s/54.37s；ECS离线CPU完成、两段完整WAV解码通过，无新增依赖/模型/付费调用。自然度尚待用户试听，不宣称已解决；原音频保留。

Use --delivery conversational --script original for A, and --delivery conversational --script spoken for B. Separate host outputs output-v2-direction / output-v2-spoken avoid overwriting previous samples. Evidence: ignored science-video/tts-v2-{direction,spoken}/ WAV and metrics.

## Historical conversational-demo run

历史独立视频演示：source617ed1ca4365d67c1e363b200e14fd39ef4f9f57，run617ed1c-20260905T101000Z；用户认可B口语方式后，五段Qwen/Serena旁白总长37.12秒、生成耗时91.82秒，新视频40.00秒/4,422,573bytes/720p，ECS渲染20.52秒。字幕按场景真实音频时长显示，手机另有同步可读字幕；章节0/7.541667/16.291667/25.75/32.166667。公网资源200、Range206、实际首播/跳转、手机字幕内容与无横溢出、完整解码均通过；应用390afc0/回滚c07c8d1保持不变。此前6a1b848-20260905T081000Z的46秒系统配音版保留，可按runbook回退；当时新增版本CI待完成；当前最终main CI已通过。

## 连续配音对照（2026-09-05）

2026-09-05 用户否定完整视频配音：音色不一致、停顿/转折做作。发现五次独立生成与每段额外0.55秒padding；前者是音色漂移候选原因，未作因果定论。新增 continuity_audition.py，保持同文/Serena/seed42，全文单次生成：continuous沿用原指令39.20s/生成98.37s；plain简短平实指令39.84s/99.70s。ECS现有离线CPU环境、无新增依赖或付费调用，完整WAV解码均通过；自然度/音色/漏读须用户听验，尚未替换视频。证据ignored science-video/voice-v3/和voice-v3.log。下一步先听验再对齐画面，图片风格后置。

复现使用原有4CPU/12GiB、network none、只读root、非root10001试听容器，将整个infra/tts-audition目录只读挂载到/app，以python /app/continuity_audition.py作为入口，/output使用新的空目录，模型沿用既有只读挂载。外层timeout600秒；保留旧试听。实际本轮执行脚本voice-v3.py与整理后的仓库脚本使用相同推理参数，原脚本保存在ignored证据目录。无生产路由修改，无需回滚；验证全片解码后仍须听验全文完整性与一致音色。

用户反馈连续配音已明显改善、仍需更自然。v4仅修改讲稿（取消设问、连贯因果句），保持Serena/seed42/平实指令与全文单次生成；ECS音频41.28秒、生成103.41秒，完整解码通过，无新增安装/付费调用。试听与实际脚本在ignored science-video/voice-v4/、voice-v4.py；未替换公网视频，待用户听感反馈。

用户已接受v4连续旁白41.28秒作为当前版本，后续再优化自然度。本轮将原WAV整段直接混入视频，不重新合成、不切分、不插静音；按语句停顿同步五段画面与字幕，候选章节0/6.45/11/20.56/31.81秒。部署完成前，公网仍是617ed1c旧五段配音。

连续模式使用 input/narration.wav + narration.json（五段绝对start、段内cues）及source-artwork.png；旧五WAV模式保留。原音轨41.28秒，画面最多向上补足一帧，音频不增加段间padding。复现已接受讲稿可用 continuity_audition.py --variant relaxed，但部署复用已试听原WAV，避免重新采样改变声音。

历史技术风格视频：f4b4db3df77c7568b0c2a7e266035dc6f5f42303，run f4b4db3-20260905T113000Z。用户已接受v4完整配音；原WAV41.28秒逐字节一致，直接AAC封装，无分段/补静音/变速。视频41.292秒/991帧/4,432,202bytes，ECS渲染20.50秒。字幕依据语句停顿，章节0/6.45/11/20.56/31.81；10项渲染测试、音频4项、lint/docs、独立发布复审、全片解码、公网200/Range206/实际播放跳转/390px字幕无溢出/零页面错误均通过。应用390afc0/回滚c07c8d1不变，旧demo617ed1c保留。当时PR88 CI待完成，现已通过。下一步图片/画面艺术风格，声音后续微调。

## Watercolor style evaluation

2026-09-05: optional narration.json visualStyle=watercolor adds original pencil/watercolor panorama, cached grayscale-to-color reveal, contained framing, graphite contours and deterministic paper grain. Existing technical mode remains the default. No new server software/model download; exact accepted continuous WAV and chapter times retained. Generated asset is ignored apps/web/test/visual/out/science-video/d2nn-watercolor-v1.png, copied from the built-in image generation output; one built-in image generation was used, so renderer freshPaidApiCalls=0 describes rendering only, not free image creation. No MiniMax API invocation.

Reference: https://github.com/gnipbao/story-to-handdrawn-video — studied DESIGN.md and skill-package/story-to-handdrawn-video/SKILL.md (MIT repository), specifically full-image contain and monochrome-to-color reveal. This iteration adapts those visual techniques in our existing renderer; it does not install or claim to run the upstream Remotion stack.

Image prompt: original panoramic scientific editorial illustration on ivory watercolor paper, graphite pencil contours, translucent teal and muted amber washes; one input numeral7 mask, exactly five individually countable diffractive plates, spreading wavefronts, one output with two rows of five regions, third lower cell glowing. No labels, extra intermediate plates, lenses, neurons, or experimental-photo claim. Output2172x724; plate/cell count inspected. Runtime derivatives are Canvas animation, not new image-model edits.

Rollback uses the existing managed-demo release transaction and preserves f4b4db3 technical output. Validate five-scene screenshots, source counts, caption readability, same full audio, server render/decode, public playback/Range/mobile and unchanged application release.

淡彩独立演示发布时验收（应用版本为当时状态，当前应用见文末RO接入验收）：source381705a32deeed38fb94564eccbcbb2c66fb7739，run381705a-20260905T121000Z；原创2172x724五层/十探测区全景、线稿显色、纸张与石墨质感。用户已认可的v4原WAV保持逐字节一致；视频41.292s/3,203,000bytes，ECS渲染37.76s。11项测试、ESLint/docs、独立复审（technical兼容/画面确定性/无裁切）、服务器build/全解码/public200/Range206/播放跳转/手机字幕无溢出/健康通过。应用390afc0及回滚c07c8d1不变；原技术风格f4b4db3保留。一次内置生图，无新增服务器依赖，render模型调用0不代表图片生成免费。视觉效果待用户验收；下一步按反馈优化或接入RO/Hermes媒体能力。

## RO reviewed-media import

Preflight: administrator actor must also own/write the active workspace, exact version draft and sourceClaims succeeded. Existing PNG/MP4 must be reviewed, regular non-symlink files,32bytes..10MiB; content magic and existing fast scan apply. No caller-supplied HTML or remote fetching.

Run the immutable API image with existing production env/networks and read-only mounts for the exact media and manifest; do not write active source tree. CLI: `node scripts/import-presentation-media.mjs --manifest /input/manifest.json --file /input/media.png` is dry-run; append `--confirm` to create draft. Manifest fields: userId,researchObjectId,versionId,kind,sourceClaimIds,generator,generatorVersion,importRun,sourcePaperUrl. Kind is image or video, URL is HTTPS attribution only. Record the generated-image tool and CPU renderer truthfully.

Rollback: keep imported draft or reject through existing transition; never silently delete rows/objects. Exact replay returns existing status, including rejected; new editorial work needs distinct reviewed content. Same bytes with mismatched provenance/Claims conflicts. Storage-before-transaction may leave a private unreferenced object on failure, same existing worker limitation.

Verification: two concurrent imports must yield one asset per media and one set of Claim joins/audit; repeat dry-run/confirm is idempotent. Native private video must play/seek with200/206 while anonymous access is401; corrupt content must not bypass full digest viaRange. Admin with writer membership approves explicitly; source Claim edits reject associated drafts/approvals. Capability canTransition prevents ordinary writers from being offered admin-only media approval. Full buffer reader remains bounded16MiB; no unbounded streaming claim.

CLI运行时修正：根目录没有所有workspace包别名，维护脚本按已有脚本模式从../packages/*/dist/index.js加载，部署前运行node --test scripts/import-presentation-media.test.mjs。源代码编译检查不能替代实际CLI启动。

完整应用部署仍要求每个候选SHA的document-parser16-case验收report，须在正式事务前执行accept-document-parser-release.sh并核对源/image绑定。d174b1f首次事务停在缺少report的前置检查，未进入应用切换；先补齐最终候选report再部署，禁止绕过验收标记。

## RO integration acceptance — 2026-09-05

Application83b2933f204894cda43f4bb0d0f8d0c4cbc7b06d is deployed; rollback390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7. Demo381705a remains separate. Final main/PR CI and server full build passed. Exact Parser report:14 succeeded,2 needsReview,0 failed/falseReady,0 external calls. Core36/search2 migrations current;13 running containers, all10 configured healthchecks healthy; public/loopback release agree and journal/retention complete.

The controlled private RO bcbf1586-b6bd-44b6-ab66-c675fcddce78 contains the reviewed watercolor image and video. Real two-client database concurrency produced one asset/audit and three Claim links per kind. Browser verified source hashes, image decode, video41.291667s and28s seek, authenticated206, anonymous401, independent approvals and390px no overflow. Editing a Claim rejected both media; restoring its original text did not revive them. Session logged out. Final test assets remain rejected; approved screenshots capture the earlier approval state, not current status. The controlled account is not the user's personal RO and no research publication occurred.

Preflight container lifecycle: use `docker run --rm` for task-owned one-off import checks. Two earlier exited, read-only, no-volume d174 CLI checks blocked retention and caused a verified rollback before a successful retry. Their exact IDs/state/mounts were checked before `docker rm` without force/volume flags; all five temporary import containers from this task are now removed. Do not broadly prune or delete release reports to bypass retention. When a stopped preflight container blocks retention, verify ownership, exit status and mounts, clean only that task-owned container, verify rollback/journal state, then retry the canonical transaction.

Evidence stays ignored under apps/web/test/visual/out/science-video/: ro-media-browser-evidence.json, ro-media-approved-desktop.png, ro-media-approved-mobile.png, ro-import-final-concurrent.log, ro-media-final-parser.log and ro-media-final-deploy-retry.log. Local source-artwork.png and d2nn-science-explainer-v2.mp4 are older demo files: use d2nn-watercolor-v1.png and the exact381705a server release path when verifying the watercolor assets.
