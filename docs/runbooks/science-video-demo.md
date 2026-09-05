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

## Latest verified run

独立服务器演示已部署：source 6a1b848a3df109098e5f1b9721e6c4df06c2c6d0，run 6a1b848-20260905T081000Z；公网 /demos/science-video/d2nn/。复用ScanSci Chrome151完整headless bundle，CPU渲染22.80秒生成46.25秒720p/H264/AAC视频（4,814,309 bytes），无新增付费API调用。全片解码、五项资源200、Range206、实际首播/章节seek、390px无溢出及零页面异常通过；内部路径最终404（input/先308规范化）。应用release仍390afc0。
