# D2NN 科普视频服务器演示 Runbook

本手册只部署一篇 D2NN 论文的人工审阅样片。它验证服务器 CPU 渲染和
Nginx Range 播放；独立于本样片，管理员 RO 单幕 Codex 生图已验证，通用 RO 自动视频仍未实现。演示不读取私有 RO，
只使用原创图、固定脚本和预先生成的旁白。

<a id="minimax-cloud-configuration"></a>

## MiniMax 云视频配置（2026-09-28）

本节记录已授权的按量试镜配置，与下方历史 D2NN 演示分开。原配置和视频列表鉴权已有证据；单次提交/续查入口在既有 Gateway 与视频执行器目录，实际提交、部署、音画质量只见 [Hermes CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)。此操作入口尚不是 Hermes 任意论文自动视频产品。

### 前置条件

- 用户明确提供视频按量凭据并要求服务器配置；M3 文本主备槽保持原用途。
- 文档依据为服务器当前 release 的部署/能力文档；模型参数补核 MiniMax 国内官方[创建任务](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create)和[任务列表](https://platform.minimax.cn/docs/api-reference/video-generation-v2-list)。
- 保留现有 `/opt/openscience-video` 权限和消费者；`secrets` 子目录 root/0700，密钥与配置 root/0600。旧 video runner 的 TTS、renderer 镜像缺失仍需修复，不能凭 active/accepting 判可用。

### 已执行配置

1. 经项目 SSH 包装器的 stdin 在内存传递本次凭据，原子创建 `/opt/openscience-video/secrets/minimax-video.key`；无凭据进入 argv、Git 或日志。已存在且内容不同的文件拒绝覆盖，中断后完整文件可复用并补齐配置。
2. 创建 `/opt/openscience-video/minimax-cloud.json`，包含 `baseUrl=https://api.minimax.cn`、`apiKeyFile` 路径、`model=MiniMax-H3` 和嵌套 `pilot={duration:10,resolution:"768P",ratio:"16:9",maxCreateRequests:1}`。普通 Worker 未消费此配置；下述 root 操作入口读取它，不修改文本主备槽。
3. GET `/v2/query/video_generation?page_num=1&page_size=1&filter.model=MiniMax-H3` 验证鉴权，随后从已写服务器文件重新读取凭据再验证，均为 HTTP 200。使用正常 TLS 及禁止重定向，不输出已有任务正文或下载地址。

### 单次提交与续查

从干净、已推送的完整 SHA 通过既有 `scripts/cloud-sync.mjs` 物化不可变发布源；源码的 Gateway 依赖按现有服务器缓存构建。此操作不切换科研应用版本、不重启科研服务，也不启动失效的离线 TTS runner。设置操作 shell 的 `video_source=/opt/openscience-releases/<完整SHA>`，确认该源的完整性和审查/定向 CI；不得在未知原任务状态下另建试镜目录。

1. 在 root/0600 的私密请求文件保存经审查的纯文本品牌概念与普通话旁白，格式严格为 `{model:"MiniMax-H3",content:[{type:"text",text:"..."}],resolution:"768P",duration:10,ratio:"16:9"}`；不含未公开论文和用户数据。执行 `node "$video_source/infra/codex-image-runner/minimax-video-pilot.mjs" prepare --request-file /opt/openscience-video/pilot-request.json`，只保存原请求，零模型调用。
2. 执行同一命令并将 `prepare` 替换为 `submit`。固定 `/opt/openscience-video/minimax-h3-pilot/create-attempt` 使用独占创建、文件和父目录 fsync，完成后才 POST；并发、重启、换输入路径都不能获得第二次提交。此标记用于防止已观察到的会话中断重复收费；此前只有配置上限，没有实际消费者保障。
3. 执行 `node "$video_source/infra/codex-image-runner/minimax-video-pilot.mjs" status`，只 GET 已保存的原 `taskId`；成功/失败终态缓存于 root 私密目录。标准输出仅参数、状态、任务 ID 和白名单错误码，媒体签名 URL 仅留 `terminal.json`，不输出密钥、旁白或供应商正文。
4. 原任务成功后执行同一入口的 `download`。只使用已保存终态，不读取 API key、不查询或创建另一任务。Gateway 对 HTTPS 主机解析后固定公开 IPv4，保持 TLS 校验，不跟随重定向；DNS 与传输共用 90 秒上限，响应最多 64 MiB。验证 HTTP 长度和 MP4 容器边界后才独占发布 root/0600 的 `minimax-h3-pilot/source.mp4`；再次执行复用原片，并发不能覆盖，失败保留原 task/receipt。该容器检查不是完整解码或音画质量验收；超时、过期签名或被拒原片须核原结果，不重新 POST。原片异常时保留证据，不能用静默覆盖冒充续取成功。
5. `uncertain`、`rejected`、`query_failed` 与供应商失败均为非零退出。查询失败保留原 ID 可续查；创建标记存在但收据缺失时仅报告 unknown，必须人工对账，不删除标记来重试。准备后请求变化必须先解释变更；已提交请求不可修改。

### 回滚与恢复

- 没有替换旧凭据、修改应用环境、重启服务或改变 release 标记，因此无需回滚科研应用。若后续配置有误，先核对是否已有消费者；本次仅新建的文件在无人使用时按明确路径撤销，不能删除整个 video/private/results 目录。
- 鉴权失败保留脱敏失败状态和非零退出码；配置落盘与鉴权通过分别判断。若提交生成超时，先保留并恢复同一上游 `task_id`；请求状态未知时不得重复提交。代码回退不删除 `minimax-h3-pilot`、`create-attempt`、请求、任务收据或终态；停用本入口只需停止调用，不能用回滚重新获取一次额度。

### 验证与未完成项

- fresh evidence：独立 High 增量审查、Node/Python 语法检查通过；服务器文件读回鉴权 HTTP 200。脱敏收据位于 `secrets/minimax-config-receipt.json`，本地归档在 ignored `tmp/minimax-server-config-20260928/`。收据为本次观测，不是实时余额或自动健康证明。
- 定向测试为 `node --test infra/codex-image-runner/core.test.mjs infra/codex-image-runner/video-runner.test.mjs infra/codex-image-runner/minimax-video-pilot.test.mjs infra/codex-image-runner/minimax-video-download.test.mjs` 与 Gateway 的 `test/minimax-video.test.ts`、`test/minimax-video-download.test.ts`；Linux 下 runner 真实 owner/fsync 路径在隔离 CI 以 root 执行，所有 provider/Docker 操作均由 mock 代替。下载用例共用 16×16 H.264 测试片（既有 FFmpeg 生成并完整解码），验证同长度截断、私网、无凭据、超时及完整原片并发保存；测试片不作产品成片。视频专属工作流覆盖原发布分支 CI 未监听的视频文件；不替代服务器和音画验证。
- 实际视频须检查完整解码、画幅/时长、连续运动、真实音轨与完整旁白、字幕和手机可读性。旧 Qwen TTS 镜像缺失仍须独立恢复，不能把 H3 试镜成功算作离线配音恢复。当前 POST 数量及结果见 CURRENT；清理仍按[综合计划 Task 4](../plans/2026-09-05-integrated-research-product-plan.md#task-4-视频)的引用和任务终态要求，保留原片、已采用资产与 unknown 收据。

## 论文独立旁白试片（2026-09-30）

本路径沿既有 Gateway、视频操作目录和 media-demo 渲染器制作私有试片。输入为已保存、已审的论文叙事与原图；口播改编有明确来源记录，不冒充新一轮 Hermes 自动全文分析或任意 RO 的按钮接线。结果及当前源版本只见 CURRENT。

### 旁白前置条件

使用干净已推送源和现有国内 MiniMax 按量配置。`minimax-cloud.json` 及其指定密钥保留 root/0600；不打印密钥、不安装第二套配音模型。只读输入请求包含 text、voiceId 及可选 speed/vol/pitch，正文最多 2000 字符；当前选择官方系统声音，不克隆真人。语音由 Gateway 的 `minimax-speech.ts` 固定调用 `speech-2.8-hd`，请求和响应均有大小、时间及来源边界。

### 旁白执行步骤

1. 在上述不可变源下执行 `node infra/codex-image-runner/video-narration-pilot.mjs prepare --request-file /opt/openscience-video/narration-request.json`。它只在原视频目录内准备固定的私有 `minimax-ro-narration-pilot`，不调用模型。
2. 执行同一入口的 `submit`。root/0600 的独占 create-attempt 在付费 POST 前写入并 fsync；中断、并发或重复调用都不能自动再次收费。原 H3 试镜标记不动。正文、原 MP3、metadata 和字幕地址只留私有目录，对外日志不含密钥或地址。
3. `status` 只读原结果；成功后 `subtitles` 只下载原请求已生成的字幕 JSON，无新配音调用、无 API Key 外传，不允许私网下载或重定向。
4. 用原媒体镜像把原 MP3 解码为 WAV；按供应商实际字幕时间建立原 `storyboard.json`。`artwork-explainer-v1` 支持 1–6 幕、90 秒内的原图主画面、明确的原图裁取范围和来源文字，不生成科学轨迹或替换原图像素。使用原隔离非 root、无网渲染入口生成 MP4。

### 旁白回滚与验证

失败或 unknown 保留 create-attempt、原音频和收据，不改请求或删除标记重新提交。停用只需停止调用这个操作入口；科研应用版本、H3 原片与 Qwen 权重不变。必须检查 MP4 完整解码、声音时长、实际字幕顺序及逐幕图像；模型成功与像素检查不等于声音已获用户认可。新文件验证沿视频 CI 与定向 speech/operator/artwork 用例，生成任务的真实结果记录于 CURRENT。

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

Historical integration release83b2933f204894cda43f4bb0d0f8d0c4cbc7b06d; rollback then390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7. Current application is recorded below. Demo381705a remains separate. Final main/PR CI and server full build passed. Exact Parser report:14 succeeded,2 needsReview,0 failed/falseReady,0 external calls. Core36/search2 migrations current;13 running containers, all10 configured healthchecks healthy; public/loopback release agree and journal/retention complete.

The controlled private RO bcbf1586-b6bd-44b6-ab66-c675fcddce78 contains the reviewed watercolor image and video. Real two-client database concurrency produced one asset/audit and three Claim links per kind. Browser verified source hashes, image decode, video41.291667s and28s seek, authenticated206, anonymous401, independent approvals and390px no overflow. Editing a Claim rejected both media; restoring its original text did not revive them. Session logged out. Final test assets remain rejected; approved screenshots capture the earlier approval state, not current status. The controlled account is not the user's personal RO and no research publication occurred.

Preflight container lifecycle: use `docker run --rm` for task-owned one-off import checks. Two earlier exited, read-only, no-volume d174 CLI checks blocked retention and caused a verified rollback before a successful retry. Their exact IDs/state/mounts were checked before `docker rm` without force/volume flags; all five temporary import containers from this task are now removed. Do not broadly prune or delete release reports to bypass retention. When a stopped preflight container blocks retention, verify ownership, exit status and mounts, clean only that task-owned container, verify rollback/journal state, then retry the canonical transaction.

Evidence stays ignored under apps/web/test/visual/out/science-video/: ro-media-browser-evidence.json, ro-media-approved-desktop.png, ro-media-approved-mobile.png, ro-import-final-concurrent.log, ro-media-final-parser.log and ro-media-final-deploy-retry.log. Local source-artwork.png and d2nn-science-explainer-v2.mp4 are older demo files: use d2nn-watercolor-v1.png and the exact381705a server release path when verifying the watercolor assets.

## Media-first page acceptance — 2026-09-05

Application64ae87252ebf183742bb0cdfa96941be0fea3cf6 deployed by canonical transaction; rollback83b2933f204894cda43f4bb0d0f8d0c4cbc7b06d. Exact Parser source/image report, full server build, BGE vectors and ScanSci runtime/OA passed. Public/loopback/active agree, journal absent and retention complete; core36/search2 migrations current,13 containers running and10 configured checks healthy. Disk available93.8GiB. No dependency/model/media regeneration.

Direct public browser en/zh at1440/390 passed contained image decoding, gallery-first responsive layout,41.291667s video playback and28s seek, native keyboard disclosures, rejected assets without approval and no overflow. Session closed; existing invalidation-test assets remain rejected. Evidence under the ignored science-video directory: media-layout-browser-evidence.json, media-layout-{en,zh}-{1440,390}.png, media-layout-parser.log and media-layout-deploy.log. The local buffered proxy had video timeouts; direct production acceptance supersedes that harness limitation.

## Sourced storyboard release — 2026-09-06

Current application d6507eaa07edfdacabe135fd30ff9f91183e0c02; rollback64ae87252ebf183742bb0cdfa96941be0fea3cf6. Canonical deployment, source/image-bound Parser report, BGE vectors, ScanSci OA/runtime, public/loopback and13-running/10-healthy checks passed; core36/search2 current. No migration or new model. Demo/voice unchanged.

Precondition: active writer membership, exact draft version,1–12 succeeded Claims and positiveAI credit balance. In the RO visual-explanations source section, select Claims and generate a plan with locale/style/instruction. Each task costs1 product credit; replay the same idempotency key after an uncertain transport result. Feedback against a non-rejected plan creates a separate draft; inspect comparison and approve explicitly. Approval of a base during generation is safe; rejecting it prevents completion. Claims changes invalidate linked plans. Rollback application through canonical explicit rollback; do not erase retained drafts or objects.

Acceptance: controlled private RO bcbf1586-b6bd-44b6-ab66-c675fcddce78 has initial72bfd097-68cd-4b75-8d39-1ce465a14e10, revisione959a696-22a0-477c-b2ab-03bb2474f3ef and scientifically corrected74ef00f4-be7e-4a95-9256-c22dbee7ad33. Only the corrected plan is approved. Three charges/generation audits,4 MiniMax-M3 calls including one structured retry; dollar cost unavailable (logged as null), not zero. Initial unsupported independent-validation wording was corrected by feedback before approval. Six scenes/45s are planned duration only.

Direct browser en/zh at1440/390 verified plan display/comparison, approval reload, stable replay, no overflow, original image decode and41.291667s video playback; session logged out. Evidence ignored science-video directory: storyboard-browser-evidence.json, storyboard-audit-evidence.json, storyboard-approved-{1440,390}.png, storyboard-parser.log and storyboard-deploy.log. This account/RO is controlled and private, not the normal user account. Automatic image/video/global-dialogue integration remains next.

## RO scene-image generation rollout

### 前置检查

Application candidate adds one-image generation from one approved storyboard scene; video rendering remains separate. No new dependency/model/container or migration is required. Production Compose explicitly enables MINIMAX_IMAGE_ENABLED for API and Worker; library/dev default remains disabled. AI_ENABLED must be true, a trimmed MINIMAX_API_KEY or MINIMAX_API_KEY_2 must exist, and AI_DISABLED_PROVIDERS must not disable minimax-image. Credentials stay in the existing Secret injection. Optional MINIMAX_IMAGE_REGION accepts global/cn, default global, independently from Vision configuration. Do not print Secret values to diagnose readiness.

### 执行步骤

1. Verify local build/typecheck/lint/tests and independent review; retain full logs under ignored science-video output. Merge exact reviewed source, materialize through scripts/cloud-sync.mjs and run the canonical Parser source/image acceptance on that SHA.
2. Use infra/scripts/deploy.sh --confirm --require-parser-acceptance --skip-migrate --rollback-ref with the measured old release and exact merged application SHA. No migration changes exist in this slice.
3. In the controlled administrator RO, choose a scene of the approved plan and submit via the real UI. One task costs one product credit; prompt condensation may call text generation and one image call consumes provider quota. Audit unavailable dollar cost as null, not zero. Do not batch scenes before visual review.
4. Check returned image in zh/en at desktop/390px, actual browser decode and natural dimensions1280x720, exact parent link, independent draft/approval, anonymous denial and existing video playback. Approve only after scientific/visual inspection.

### 回滚步骤

Use the canonical application rollback transaction to the saved old SHA. The rollout flag is in the reviewed Compose source, so rollback restores the prior configuration; no Secret edit is needed. Generated drafts remain private records and must not be deleted merely to hide a failed acceptance.

### 验证命令

Run the standard checkup and exact public/loopback release checks. Verify core36/search2 migrations and configured container health, plus an in-container boolean-only API readiness check. Ignored scene-image-browser.mjs requires `--run --release <exactsha>`; its durable key prevents duplicate task charging. It first leaves the real image draft for review; --approve-reviewed is only used after visual inspection. The Gateway validates bounded raster container structure and PNG scanlines, not a full JPEG/WebP pixel decode; actual browser decoding supplies runtime image evidence. Provider call recovery is deliberately conservative: if Worker executionAttempt exceeds1 and there is no existing asset, no additional image request is sent. A successful paid response followed by a crash can therefore require manual assessment rather than automatic retry.

### Scene-image runtime acceptance — 2026-09-06

PR95/main CI33986402240通过；全仓build/typecheck/test/lint、Web504+5与12E2E通过（原有search测试8项跳过）。服务器全build、Parser16、BGE/ScanSci、core36/search2、13运行/10健康及公网/loopback精确版本通过。 Production615ca2d/rollbackd6507ea. Initial materialization EPIPE occurred before journal/switch; canonical retry completed. No confirmed root cause for the transient pipe closure.

The existing credential uses CN: global image request failed. Read-only CN token_plan/remains returned200/code0. Under the existing deployment lock, append only nonsecret MINIMAX_IMAGE_REGION=cn to server config and recreate only agent-worker with exact active image, --pull never/--no-deps; verify CN boolean, image ID, health, public/loopback SHA and no journal. API readiness does not use region. Preserve this setting on subsequent deployments.

Controlled second task/asset9cccb431-7e41-4d2a-bc01-5116902516de succeeded (M3 2.791s, image-01 27.588s), with3 Claim links and one generation audit. Both first failed and second successful tasks have a one-credit reservation; no dollar cost is available. Browser zh/en×1440/390, anonymous401 and logout passed. Existing media-demo Chromium151 decoded1280×720/3,686,400bytes in a temporary network-none bounded container; no runtime installed. The illustration remains draft because causal structure is too abstract; real approval intentionally not performed. Evidence: ignored scene-image-browser-evidence.json, scene-image-attempts-evidence.json, scene-image-audit-evidence.json, scene-image-ecs-decode.json and scene-image-artwork.png.

### Composition comparison, not a release

Concrete-composition candidate (basef7a80ea, production615ca2d/rollbackd6507ea unchanged): five-field brief with explicit string schema, subject placement and causal screen output. Worker529 tests, focused44, workspacebuild/typecheck/lint and independent review passed. Real planning initially failed schema (3 text calls); one additional text-only diagnostic found subjects array/overlength, prompting a schema example and concise budgets. Final candidate used2 text calls (one structured retry) and1 image-01 call; image is still scientifically insufficient (screen lost, floating patches), so no deploy or approval. Same1351-character prompt in one built-in imagegen call better retained plates, wavefronts and receiving screen; this single sample is a comparison, not a provider benchmark or a production integration. Existing Worker OPENAI_API_KEY/GEMINI_API_KEY readiness booleans were false; no secrets printed. No models or runtimes installed.

Official MiniMax image-to-image docs describe subject_reference as character reference; do not assume this provides scientific-layout conditioning: https://platform.minimaxi.com/docs/api-reference/image-generation-i2i . Evaluation scripts use canonical SSH with code through stdin (long quoted command hit remote shell parsing); secrets remain in Worker env, candidate runs do not replace active source. Preserve unsuccessful image and billed-call audit; no automatic image retry.

### MiniMax retest and paused CPU preparation

2026-09-06 user steering: PAUSE local model preparation; retest MiniMax before any further installation. Exact download container stopped; about1.1GB archive/partial remains under /opt/openscience-evals/local-image, no weights complete and no inference/runtime install executed. Do not resume automatically. Production615ca2d/rollbackd6507ea unchanged.

Existing Gateway validation/audit was reused in an isolated eval process with explicit model/optimizer/seed overrides, not production code. image-01 A/B seed42 returned in33.039s/58.000s; both retained receiving screens but still failed scientific visual acceptance. image-01-live C failed88.899s (not established as a timeout), no retry. API/model costs remain null. Evidence ignored minimax-retest-audit.json and minimax-retest-{A,B}.jpg.

Codex login feasibility sources: https://learn.chatgpt.com/docs/auth ; matching CLI0.153.0 gate in https://github.com/openai/codex/blob/rust-v0.153.0/codex-rs/core/src/tools/spec_plan.rs ; image API https://developers.openai.com/api/docs/guides/image-generation ; billing https://help.openai.com/en/articles/9039756 . CLI ChatGPT authentication may expose imagegen when account/provider/model gates pass; lack of API key alone is not disproof. Server ChatGPT login and one image output verified (see latest checkpoint below), and production service support is a separate question.

### Historical server Codex login checkpoint — superseded by the verified result below

Official npm @openai/codex0.153.0 isolated at /opt/openscience-evals/codex-image/runtime,320MiB; exact existingNode image9aa184189f478192a37d9f5e318aef6bb25690db294b0857c3ea798d76b1bbc7, version command verified. Preflight state/work UID1000 mode0700; inherited setgid2700 removed explicitly before exact permission check. Login-only xgs-codex-device-login: nonroot/read-only/capdrop/no-new-privileges/1CPU/1GiB/128pids, separateCODEX_HOME,15min timeout, hostnetwork solely for officialdeviceauth viaexistingSquid. No model task or production mount. Show one-time device code only to requesting user; never persist it in docs.

Verification after user action: inspect container status, run codex login status with sameCODEX_HOME, inspect auth file permissions only; never read auth.json or codex-login.log. Stop exact login container if necessary; retain isolated runtime/state pending user decision, do not revoke other devices. Directbridge authroot403/chatgpttimeout means generation egress remains unverified; no hostnetwork generation. Publicapp release615ca2d/rollbackd6507eaunchanged.

### Historical Codex proxy investigation — superseded by the verified result below

Existing SSH reverse tunnel maps ECS127.0.0.1:7890 to local v2ray127.0.0.1:7890; Squid127.0.0.1:7891 prefers that parent. Fresh check-egress-path returned HTTP204/FIRSTUP_PARENT. An unauthenticated request to chatgpt.com/backend-api/codex/models through Squid returned401, while isolated bridge direct access timed out after12s. This verifies the existing tunnel route, not image generation or subscription eligibility.

Squid also listens on172.24.0.1:7891 for ScanSci with separate source/listener/parent ACLs; do not attach Codex to that production retrieval network. A dedicated restricted proxy attachment remains unimplemented. Security review requires host-access isolation as well as CONNECT destination restrictions: an internal bridge alone still exposes gateway services. No new proxy, firewall rules or network were installed during this investigation. Preserve existing tunnel; local PC/v2ray availability remains an evaluation dependency.

### Server built-in image result — 2026-09-06

Successful attempt: xgs-codex-image-v3, CLI0.153.0, exit0, 02:57:48.950–02:58:44.962UTC (56.012s whole run). PNG1536×1024,2261484bytes; ECS /opt/openscience-evals/codex-image/egress-v3/state/generated_images/01a074a6-9d5a-7061-802a-db5404b0d947/exec-a118e44a-3173-4052-9183-caf4bf462116.png; local ignored apps/web/test/visual/out/science-video/codex-server-builtin-v1.png. PNGsignature/dimensions/size checked and visuallyinspected. Oneoutputverified; CLIreportsoneimagecall, but JSONLdoesnotinclude nestedtool audit, so exacttoolcountisnotindependentlyproven. Textusage21205input/417output, cache9216; no dollar orimagequota claim.

Execution used networknone/nonroot/read-onlyroot/resourcebounds, TCPloopback→Unixsocket→trustedhostnetworkCONNECTproxy→existingSquid→SSH→localv2ray. Proxy mounts only publicscripts/socket; exactchatgpt.com443/auth.openai.com443 only. Nohostportlistener/firewallchange/productionnetworkattachment. ab.chatgpt.com denied; output succeeded. Runtime/auth/scripts/socket read-only, freshcache andwork writable; nested auth.json kernelRO andoriginalmode0600. Code-modehost is alreadybundled in pinned officialplatformpackage; enabledonlythat host whileordinarycode_mode/shell/unifiedexec/MCP/plugins/browser/web/view_image remainoff. apply_patch mayremainregistered butwritesremainconfined/denied.

Earlier attempts preserved: v1 readonlycache blockedappserverbeforemodel, v2 textturn completed19205input/420output butdisabledhost preventedimage. Noimagefromeither. v3 isfreshstate/work. Temporaryproxyv1/v2/v3 stopped, modelcontainers exited; nofilesdeleted, noROimport/approval/deployment. Production .release-id/public615ca2d reconfirmed; directport3000/__release404waswrongprobe, notservicefailure.

Scripts codex-egress-{proxy,client,launch,result,docs}.cjs are ignoredexperimenthelpers, notproductionintegration. The launcher isattempt-specific andnotidempotent; preserve evidence andusefreshpaths/socket forfuturetests. Successprovescontrolledservercapability, notofficialsupport for apublicHermesbackend. Next: uservisualreview andscientificstructure refinement, then decidecontrolledassetimport path.

### Refined image imported as private RO draft — 2026-09-06

Two further controlled server runs reused the reviewed socket proxy and official CLI. Attempt v4 generated a 1672×941 PNG with dense wavefronts (2407115 bytes; 61.110 seconds). Attempt v5 reduced the drawing to three representative wavefront groups (1875121 bytes; 65.309 seconds). These are conceptual samples of a continuous phase surface, not holes, numerical simulation or measured data. Both files were visually inspected; only v5 was imported. Evidence: ignored codex-server-builtin-v2.png and codex-server-builtin-v3.png. The latter is server attempt v5; image filenames count successful outputs, not runtime attempts.

The existing scripts/import-presentation-media.mjs from immutable production source615ca2d passed dry-run and created standalone draft666606ad-4f4a-45e6-ae7f-d8ff29ebfa28 in the controlled private RO. Content hash ddda065bad842416433559b703738d4375b18282d8c2a85b0c7054625e3847c1; three exact source Claim links and one presentation_asset.reviewed_import audit were independently checked. Generator is OpenAI Codex built-in imagegen; assistant visual review, version CLI0.153.0. No human approval, publication or synthetic AgentTask was created. The import schema does not support storyboard-parent/scene binding; do not infer that association or claim Gateway integration. The legacy reviewedBy field identifies the importing admin actor; generator wording clarifies the actual review source.

Browser acceptance: desktop and390px card renders, PNG decoding1672×941, mobile document width390, authenticated download200 with matching SHA256, anonymous401, session logged out. Evidence files: codex-ro-browser-evidence.json, codex-ro-audit.json, codex-ro-draft-desktop.png, codex-ro-draft-mobile.png and codex-ro-import-{dry,confirm}.log. Audit helper initially failed on top-level await inside eval before querying; async wrapper corrected it. No import replay was needed.

Temporary model/proxy containersv4/v5 exited; production .release-id remains615ca2d. CPU model download remains paused. Do not reuse attempt-specific helper paths or stale Unix sockets. Next step is user visual acceptance and further storyboard assets/video through the controlled workflow; automatic Hermes-to-Codex product integration is not implemented.

### Administrator Codex runner — installation and activation

Preflight: ADR-013 applies; user authorized controlled account validation. Keep CPU image installation paused. Verify actual app release, backup health and existing Squid egress. Require pinned CLI0.153.0 runtime, UID1000/mode0600 regular auth file (metadata only), and the two existing image IDs in install.sh. Complete canonical source build and exact-source parser acceptance before activation. No dependency reinstall or credential display.

Execution (operator shell on ECS; substitute the final verified 40-character Git SHA):

1. Materialize and build the immutable source through the canonical release workflow.
2. Run `bash /opt/openscience-releases/<sha>/infra/codex-image-runner/install.sh --confirm --source /opt/openscience-releases/<sha>`. It verifies the archive manifest, creates a versioned runner bundle, preserves the old unit, and requires a newly created ready marker.
3. Under the existing production deployment lock, append the nonsecret selector `HERMES_SCENE_IMAGE_PROVIDER=codex` to the production environment without displaying its contents. Run canonical app deployment with the actual rollback ref. API and Worker must use the same selector; only Worker mounts the inbox/results.
4. Submit one approved-storyboard scene-image task as the existing controlled administrator. Verify task, one credit reservation, Gateway provider audit, exact parent/Claims, draft state and normalized1280×720 PNG before visual acceptance. Do not automatically repeat uncertain/failed paid jobs.

Rollback: restore the previous selector (MiniMax, or disabled) under the same production lock and use canonical application rollback/redeploy. Stop the runner after its active request settles; preserve private results/started markers. Installer failure restores the previous unit and enabled/active state; failed bundles remain for inspection. Do not reuse a failed bundle path without diagnosis. An unavailable runner fails closed before model execution; the UI provider flag alone is not a runtime health proof.

Validation commands: `systemctl is-active openscience-codex-image`; `stat -c '%Y %u %a' /opt/openscience-codex/results/.ready` (fresh within60s); `journalctl -u openscience-codex-image --since '-10min' --no-pager` (content-free task status only); existing `checkup.sh`, actual `/__release`, migration/worker/parser/runtime checks and authenticated/anonymous media tests. Never display private model logs or account files.

The new demo accepts optional `scene3-artwork.png` within the existing bounded input tree; it affects only demo index2, not the six-scene RO storyboard's numbering. Copy the accepted original inputs plus the reviewed illustration into a fresh staging run. Reuse the existing renderer image as a base for source-only updates; run canonical demo deployment and compare narration hashes, duration, full decode and public playback.

Server candidate7e1b6ea installation found a missing public Gateway export for validateImageBytes. The service failed at module load before any model task; installer restored inactive/no-unit state. A complete runner-import regression reproduced the failure, and explicitly exporting the existing validator fixed it (runner10/10). Gateway-only prebuild first required Prisma generation for its observability dependency; generate before scoped build. Failed runner bundle retained, provider still not enabled.

Demo candidate7e1b6ea run7e1b6ea-20260906T044500Z deployed successfully using the existing renderer as a source-only base. Server render39.101s,991frames,41.292s,2532823bytes; complete decode true, no paid call. Original narration WAV/JSON and opening artwork compare byte-identical. Public browser1280×720/41.291667s, scene3 screenshot visually verified,390px no overflow and range206 passed. Evidence codex-video-deploy.log, codex-video-browser-evidence.json and codex-video-scene3.png.

Before the first model task, a no-model server probe under the service umask0027 confirmed another runtime issue: root-created input/request.json was0640 root:root and unreadable by UID1000. The runner now explicitly owns that file as1000:1000 with0400 permissions; no account/task content is printed. This check uses invalid image configuration and never starts a model. The2c4cf4d runner reached heartbeat but no generation was submitted; install the corrected bundle before application activation.

### Current deployed Codex acceptance — 2026-09-06

Application/main/runner3d518af1433e4e1e91de0ebbb0d9a12d4bedfa52, rollback615ca2dc22bcceabc99562a31340053725a81098. PR97 is merged at the exact tested SHA; PR CI34010770869 and main CI34011369239 succeeded. Canonical server build, source/image-bound Parser16, core36/search2, BGE vectors, ScanSci OA/runtime and health/public/retention passed. First local sync attempt hit EPIPE before any transaction; source and old release integrity verified, canonical retry succeeded. Activation was initially attempted before the final parser report existed and exited before installation; retry occurred only after the report/contract completed.

Controller is active with HERMES_SCENE_IMAGE_PROVIDER=codex in API and Worker. Controlled task/asset4661e80a-526e-4a4a-8b11-47359e9c1f6b generated a1280×720 PNG in66.103s image Gateway latency,1298085bytes. Independent audit:1task,1attempt,0retry,1Credit debit,1generation audit,1successful codex-image audit; approved parent74ef00f4-be7e-4a95-9256-c22dbee7ad33/index3 and3exactClaims preserved. Spool prompt hash equals the asset promptHash, started marker exists, exactly1raw PNG. All temporary task containers removed; controller remains active. No dollar/token figure is available, and nested image-tool count is not independently measured.

Asset remains draft after visual inspection, not published or human-approved. Browser zh/en×1440/390 decoded the PNG without overflow; content200, anonymous401, session logout passed. Evidence codex-scene-browser-evidence.json, codex-scene-audit-evidence.json, codex-spool-audit.log and codex-scene-artwork.png. Existing private control RO is not a user-accessible demo link.

Demo source7e1b6ea/run7e1b6ea-20260906T044500Z remains independent of app. Actual new/old AAC streams both hash2f5f144657fbbe27a23ff1d37e2c01ecb121640b169bd0560705aef2dcc077cf; accepted audio is unchanged after encoding. Current public entry: /demos/science-video/d2nn/?v=codex-mechanism-v1. Generic RO video automation and global Hermes conversation edits remain next work.

## Generic file-driven rendering (development slice)

### Preconditions

This opt-in CLI is a rendering primitive, not an authenticated RO generation endpoint. A supplied manifest does not certify approval. Use existing isolated media runtime and manually reviewed inputs; no model installation or API call is required. Keep production app and public demo unchanged during evaluation.

### Execution

Place `storyboard.json`, `narration.wav` and `scene-0.png` through `scene-N.png` in a read-only input directory. The manifest has schemaVersion1, title, locale(zh/en), style(technical/watercolor/ink), provider, speaker and3–6 scenes. Each scene has title, artwork(exact local filename), start(seconds in full WAV) and cues(relative start/end/text). Starts begin at0, strictly increase and stay within the measured WAV; cues may not overlap or cross scenes.90seconds maximum. PNG files are bounded10MiB/8192px/16M pixels. Palette choices preserve supplied artwork; they do not turn technical images into newly generated watercolor art.

Run existing renderer `node /opt/renderer/render.mjs --input /input --output /output` under the same network-none, non-root, read-only,4CPU/4GiB/256PID/600second limits used above. Mount only input read-only and a fresh output directory. Reuse an existing media image as a source-only build base. Never pass user HTML/scripts, DB/model credentials or the Docker socket into the renderer.

### Rollback

This evaluation does not switch app/demo releases or Nginx. Stop the exact evaluation container if needed; preserve its output/logs and use a fresh directory for retry. Existing accepted demo remains available.

### Verification

Require `ro-science-explainer.mp4`, poster-v2.png and metrics.json:1280x720/24fps/H264/AAC/yuv420p, fastStart and completeDecode true. Compare input WAV with accepted source; mux adds no silence/splits/time scaling. Inspect representative frames and transitions. Integration with approved RO assets, asynchronous tasks, Qwen synthesis/alignment and draft review remains subsequent work.

Isolated ECS acceptance2026-09-06: renderer source049e544f7742c063d95e2915a48f661aa6816f2d, existing7e1b6ea image reused as source-only base. Five-scene fixture uses pre-reviewed D2NN art and byte-identical continuous Serena v4 WAV; no new model calls/downloads.41.292s/991frames/8080238bytes, render37.95s,1280x720/24fps/H264/AAC/yuv420p, full decode and fast-start passed. Representative scene and transition inspected; single crisp title, contained artwork. Appf144eb7/rollbackb23102b and public demo unchanged. Evidence: ignored generic-server-eval.log and generic-server-*.png. Staging must stay immutable on the host; read-only container mounts alone do not prevent host mutation. Maximum aggregate six16MP image memory/output was not stress-tested;4GiB runtime limits remain mandatory. This is a renderer test, not a completed arbitrary-RO workflow.

## Repeated-image evaluation correction

The049e544 generic evaluation is visually rejected: its untracked staging script copied the panorama into four scenes, and the generic renderer had no scientific animation. Format/codec tests did not establish visual equivalence. Do not link generic-server-evaluation.mp4 as the corrected science animation.

Precondition: use immutable previously reviewed D2NN continuous inputs and existing media image. Preparation: run `node apps/media-demo/prepare-animated-demo.mjs --input <reviewed-input> --output <fresh-staging-input>`; this copies the exact narration WAV/JSON, panorama and optional third-scene artwork and refuses a generic storyboard input. Run canonical independent demo build/deploy above. `metrics.renderMode=d2nn-scientific-animation` distinguishes this from `illustrated-storyboard-preview`.

Verify five scene midpoints, training/propagation/detector distinction and motion, unchanged WAV, decode/seek/Range/mobile. Roll back through the existing independent demo run, leaving app release untouched. This restores the accepted fixed-paper animation, not arbitrary-RO animation or automatic media jobs.

Restored demo acceptance2026-09-06: source9848411d1419a0dd690f74cca9042369b651f7b2, run9848411-20260906T074017Z, previous7e1b6ea-20260906T044500Z retained. Canonical sync/source manifest/build/deploy passed; no app container/schema change.41.292s/991frames/2532823bytes, render39.06s, mode d2nn-scientific-animation; H264/AAC/fastStart/full decode passed. Original WAV/JSON/panorama/scene3 PNG compare byte-identical. Public five-scene capture, actual play, chapter seek,Range206 and390px captions/layout passed with zero page errors. Training and detector scenes retain motion; third scene retains the accepted static mechanism illustration. No new model/API calls or dependencies. App/public release remainsf144eb7, rollbackb23102b. Evidence ignored animated-fix-sync.log, animated-fix-deploy.log, animated-restored-browser-evidence.json and animated-restored-scene-*.png. PR101 merged; CI34019708441 passed at this checkpoint.
