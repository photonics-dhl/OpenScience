# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-05 +08。历史由 Git 保存；当前应用390afc0已部署，后续文档提交不改变生产。

## Storage and reusable runtime

- 2026-09-05 用户明确批准仅清理未使用Docker构建缓存，已执行docker builder prune --force。Docker回收报告7.517GB；df可用字节102607519744→107878596608，实际增加5271076864 bytes（4.91GiB），剩余100.47GiB。镜像21、运行容器13、生产390afc0均不变，构建缓存计费大小0B。用户要求PyTorch等基础依赖支持后续复用：先盘点现有embedding-worker CPU PyTorch版本/层，优先固定版本公共基础镜像，模型独立挂载，兼容后共享层；不共享可变site-packages、不继承BGE权重来运行TTS。后续已安装隔离TTS试听环境，见下。

## Qwen CPU audition

- CURRENT独立视频：f4b4db3df77c7568b0c2a7e266035dc6f5f42303，run f4b4db3-20260905T113000Z。用户已接受v4完整配音；原WAV41.28秒逐字节一致，直接AAC封装，无分段/补静音/变速。视频41.292秒/991帧/4,432,202bytes，ECS渲染20.50秒。字幕依据语句停顿，章节0/6.45/11/20.56/31.81；10项渲染测试、音频4项、lint/docs、独立发布复审、全片解码、公网200/Range206/实际播放跳转/390px字幕无溢出/零页面错误均通过。应用390afc0/回滚c07c8d1不变，旧demo617ed1c保留。PR88新CI仍进行中。下一步图片/画面艺术风格，声音后续微调。

- 用户已接受v4连续旁白41.28秒作为当前版本，后续再优化自然度。本轮将原WAV整段直接混入视频，不重新合成、不切分、不插静音；按语句停顿同步五段画面与字幕，候选章节0/6.45/11/20.56/31.81秒。该接入已完成，公网以本节最新f4b4db3记录为准。

- 用户反馈连续配音已明显改善、仍需更自然。v4仅修改讲稿（取消设问、连贯因果句），保持Serena/seed42/平实指令与全文单次生成；ECS音频41.28秒、生成103.41秒，完整解码通过，无新增安装/付费调用。试听与实际脚本在ignored science-video/voice-v4/、voice-v4.py；未替换公网视频，待用户听感反馈。

- 2026-09-05 用户否定完整视频配音：音色不一致、停顿/转折做作。发现五次独立生成与每段额外0.55秒padding；前者是音色漂移候选原因，未作因果定论。新增 continuity_audition.py，保持同文/Serena/seed42，全文单次生成：continuous沿用原指令39.20s/生成98.37s；plain简短平实指令39.84s/99.70s。ECS现有离线CPU环境、无新增依赖或付费调用，完整WAV解码均通过；自然度/音色/漏读须用户听验，尚未替换视频。证据ignored science-video/voice-v3/和voice-v3.log。下一步先听验再对齐画面，图片风格后置。

- 配音自然度二轮：用户反馈第一轮仍机械；复用Serena/seed42，新增可选script/delivery。A原文+聊天指令14.88s/生成37.07s，B口语短句+同指令21.84s/54.37s；ECS离线CPU完成、两段完整WAV解码通过，无新增依赖/模型/付费调用。用户选择B更自然，但后续五段完整视频未通过听感验收；原音频保留。

- Qwen三音色已在ECS CPU完成：Serena15.92s/生成39.57s、Uncle_Fu15.68s/39.45s、Vivian17.68s/43.99s；峰值进程RSS5.22–5.31GiB，4线程/BF16/SDPA，付费API调用0。三段WAV全片解码、有限非零波形通过；自然度与内容完整性待用户试听，不能把生成成功当作听感验收。基础镜像971705460bytes；子镜像2043364436bytes已含基础层；模型4520217432bytes。df可用101313294336bytes（94.36GiB），较清理后占用增加约6.11GiB；公网/loopback200、应用390afc0不变。
- infra/tts-audition新增公共CPU基础、Qwen子镜像与试听脚本，4项测试本地/容器通过。原系统Huihui同文案样本保留；音频与validation.json在ignored science-video/tts-audition/。

## Server video demo acceptance

- 历史独立视频演示：source617ed1ca4365d67c1e363b200e14fd39ef4f9f57，run617ed1c-20260905T101000Z；用户认可B口语方式后，五段Qwen/Serena旁白总长37.12秒、生成耗时91.82秒，新视频40.00秒/4,422,573bytes/720p，ECS渲染20.52秒。字幕按场景真实音频时长显示，手机另有同步可读字幕；章节0/7.541667/16.291667/25.75/32.166667。公网资源200、Range206、实际首播/跳转、手机字幕内容与无横溢出、完整解码均通过；应用390afc0/回滚c07c8d1保持不变。此前6a1b848-20260905T081000Z的46秒系统配音版保留，可按runbook回退；新增版本CI待完成。

- 独立服务器演示已部署：source 6a1b848a3df109098e5f1b9721e6c4df06c2c6d0，run 6a1b848-20260905T081000Z；公网 /demos/science-video/d2nn/。复用ScanSci Chrome151完整headless bundle，CPU渲染22.80秒生成46.25秒720p/H264/AAC视频（4,814,309 bytes），无新增付费API调用。全片解码、五项资源200、Range206、实际首播/章节seek、390px无溢出及零页面异常通过；内部路径最终404（input/先308规范化）。应用release仍390afc0。
- PR #88上一版CI已通过；本次新增试听文件待新CI；已修复Nginx exact alias首页追加index.html问题，改root+try_files。部署脚本9例与renderer4例通过，独立复审通过。

## Current version tuple

- Worktree / branch: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance / codex/product-workflow-design；application HEAD 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7（PR #86），docs HEAD 从 Git 读取。
- Production active/public: 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7；rollback c07c8d15e5ba3b722577f42d6ad72af8c83189fe。
- 36/36 与2/2迁移、13运行容器、目标服务健康、公网/loopback、journal cleared 与 retention completed。
- 根目录旧 main b9616cb 及 memory/配置/用户资料保持原样。

## Delivered this slice

- 用户认可v1视频效果，要求更自然过渡和突出动效。v2样片已输出`d2nn-science-explainer-v2.mp4`，保留v1；新增0.6秒过渡、轻推镜头、逐层响应/波包与探测光斑脉冲，46.25秒/720p、4.80MB。渲染实测25.17秒；主线程完整解码exit0并抽取最终MP4第23秒核对，新增模型调用0，未部署。

- 最新用户反馈：卡片不符合图解要求；已认可生成式科普插图方向，批准同一D2NN论文做低成本本地动画样片，候选仓库按效果与成本自主选择。
- 样片已生成于ignored `apps/web/test/visual/out/science-video/`：46.25秒720p/H264/AAC中文旁白、1.78MB，复用插图+本机TTS/Chromium/局部FFmpeg，无新增MiniMax调用。主线程完整解码exit0、浏览器首播/seek正常、390px无溢出；正式RO/Hermes媒体接入仍未完成。
- 启动只读复验release/rollback仍390afc0/c07c8d1；16核30GiB、无NVIDIA工具、13容器运行，公网/loopback200；生产未变更。High独立审查确认内容简报、provider、Range播放与Evidence失效等缺口，详见当前计划Task4。

- RO 图解页面接通真实主张表单、版本/来源选择、生成/任务恢复、私有预览和批准；错误加载、角色/版本只读、跨版本异步结果、幂等重试与审批CAS冲突均有覆盖。
- Hermes→Editor 携带已确认源文件，并保留原 manifest 附件；Claim 编辑/删除在原事务中退役旧图解。新renderer换行、不夸大科学验证且拒绝过高输出；v1读取兼容。
- 摘录关键词额度修正；无新增依赖或迁移。用户已允许自主选择开源安装，本轮复用已有能力。

## Validation and real-paper findings

- 全仓 build/typecheck/lint/test GREEN；Web491+Node5、domain568、worker502、API130。原有 search storage 集成8例按无独立DB配置跳过，未新增跳过。
- 本地 browser98/99后修正模拟任务过快完成的测试时序，图解9/9重验；CI33947575816完整99/99及Hermes专项GREEN。独立复审无剩余产品阻断。
- ECS完整build、Parser16、ScanSci真实OA/Worker、BGE、迁移与健康验收通过；本轮运行文件闭包稳定。c07曾出现96518→96515，原始三路径未定位，不能宣称根因已修复。
- D2NN arXiv:1804.08711v2，20页/4,000,593 bytes：真实页面完成上传、确认、源文件入版本、3条人工主张、生成/预览/批准；匿名内容读取401。真实Claim编辑使已批准旧图rejected，重新生成批准成功。
- 新版本重跑同一PDF仍缺 method/results/reproducibility。展示版本三个字段保留人工补齐标识，未把人工内容冒称自动提取；91.75%数值准确率与88%选定物理样本一致率严格区分。
- 证据：ignored apps/web/test/visual/out/chart-workflow/ 的 real-chart.png/svg、桌面/手机截图、真实任务/提交/失效JSON和日志。受控私有账户会话均已注销，原PDF未公开，图解是主张摘要卡片。

## Product state and next action

- Research Intelligence Tasks1–12与前批UI已交付；不恢复旧MVP任务。frontend/nanqing@e5db5ae无新增，已有每日10:00巡检。
- 科普视频样片已交用户效果验收；下一段实现有来源的分镜与隔离渲染、RO播放和Hermes修订。Windows旁白需服务端替代；真实提取空缺和主张/证据自动衔接并行改进。用户已认可插图方向，视频尚待反馈。
- 保留界限：科学支持未经独立验证；媒体默认关闭/管理员限定；Worker拒绝可能留下无引用对象，charged-on-submit与并发模拟边界仍在。
- 先读CURRENT handoff和需求基线，生产状态必须由Git/服务器事实确定。
