# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-05 +08。应用83b2933已部署，rollback390afc0。后续文档提交不改变生产；历史过程由Git保存。

## Media-first layout in progress

- 用户批准继续优化媒体页：媒体先于表单、全宽桌面双列/手机单列、来源按需展开、任务与错误保持可见；沿用暖白/朱红与原生控件，无新增依赖。9项组件测试、Web499+5项测试、10项浏览器流程、build/typecheck/lint通过；真实插图尺寸已检查，本地代理视频读取不稳定，最终播放在ECS直接验收。应用仍83b2933/rollback390afc0。

## Reviewed RO media delivered

- PR88/89/main83b2933：管理员+workspace写权限的受审PNG/MP4导入，默认dry-run、精确版本/Claims、真实来源、草稿/审计/幂等；原生视频预览、安全单Range和canTransition。没有打开任意论文媒体生成器。
- 全仓build/typecheck/test/lint、focused领域/API/UI和实际CLI入口测试、独立复审、PR88/89及最终main CI均通过。
- ECS最终source83b2933f204894cda43f4bb0d0f8d0c4cbc7b06d，rollback390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7；全build、Parser16-case验收14成功/2需复核/0失败/0错误ready、0外部模型调用；BGE真实向量和ScanSci运行依赖通过，canonical部署/retention完成且journal清除。
- 新备份core28M/search20K，7/7；首轮部署因本轮旧预检容器引用d174候选而回滚390，精确移除两个已退出无卷容器后重试成功。其余三个成功导入检查容器也已清理；未删除业务数据或广泛prune。
- 受控管理员私有RO bcbf1586-b6bd-44b6-ab66-c675fcddce78 / version57d10269-2ba7-4eaa-88fc-622a00d20ef5，两种媒体各以两个独立DB连接并发导入，最终各1asset/1audit/3Claim关联。
- 真实browser：准确文件hash、图片解码、41.291667秒视频播放/28秒seek、Range206/1024bytes、匿名401、图片与视频分别批准、390px无横溢出、Claim修改使两素材失效且恢复不复活。测试会话注销、Claim原文恢复；素材最终rejected，approved截图是失效测试前状态。未公开论文/修改用户权限。
- 证据：ignored apps/web/test/visual/out/science-video/ro-media-browser-evidence.json、ro-media-approved-{desktop,mobile}.png、ro-import-final-concurrent.log、ro-media-final-parser.log、ro-media-final-deploy-retry.log。

## Accepted visual and audio foundation

- 淡彩demo381705a/run381705a-20260905T121000Z，/demos/science-video/d2nn/?v=watercolor-v1；2172×724五层/十探测区原创图、线稿显色、纸张质感；41.292秒视频3,203,000bytes，ECS渲染37.76秒。
- 用户接受v4 Serena完整41.28秒WAV，全文单次生成103.41秒CPU；直接AAC封装，无分段、补静音或变速。字幕按语句停顿，不声称音素对齐。技术风格f4b4db3保留。
- 借鉴story-to-handdrawn-video的构图/显色，复用Canvas/Chromium，不安装上游Remotion。一次内置生图；本轮RO接入无新增模型调用。
- 已有torch2.11CPU共享基础层约0.97GB；Qwen子镜像约2.04GB含基础层；模型4.52GB。BGE依赖不同，不混合可变环境。无GPU，无新增模型/浏览器安装。

## Next and limits

- RO界面仍有通用Diagram措辞、素材位置与编辑区层级待优化。下一步整理媒体页，再接有来源的叙事/分镜、媒体provider/隔离CPU渲染、Hermes修订。当前不等于任意论文自动生图/视频。
- 现有PDF→Hermes→Editor保留源文件→人工Claims流程已部署；method/results/reproducibility提取空缺仍需改进，演示补充明确人工核对。
- Storage写入后DB失败可能留下私有无引用对象；公开review digest未纳入媒体的历史债务在扩大公开发布前复核。
- 唯一CURRENT交接：docs/handoff/2026-08-16-hermes-2d-pet-handoff.md。根目录旧checkout和用户未提交资料未动；用户已授权继续实施/合入/部署。已有每日前端分支巡检，不重复创建。
