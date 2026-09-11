# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 连续研究工作台：上传/预览→Hermes全文凝练与用户确认→核心图→预览发布。用户可直接编辑，或让Hermes修改同一草稿；科研阅读公开页优先。核心图优先，旧六场景不是门槛。
- 本机仅编辑/静态阅读；不跑测试、预检、CI。服务器执行必要构建/启动和实际产品操作。用户已授权Codex充当真实审核发布用户；不能公开已知错误。视频、批量冷启动暂停。
- 保留原文科学条件和精炼六字段，详细制作提示只供AI使用。复用高级解析，不重跑OCR。无新服务/插件/模型安装。

## Version tuple
- worktree: E:/Miscellaneous/XGS/.worktrees/onchip-video-release
- branch: codex/onchip-video-release
- application HEAD / production: 52a52829d06c198d2671d7ff7caf54732443a0a3
- application rollback: d6dce2e2852dd3154f8698f02659088cc196b934
- browser provider: f48324870f25b50c3a21eaad898beea87fb0aa1d / provider rollback: 48d9fa65db134575f53cf2a30724aa47a14eeea4
- 默认分支草稿同步、选择性继承审核、两栏布局CSS、小屏入口及方案审核按钮已通过Sol High静态复核，服务器构建部署完成（exit 0）；无测试/CI。

## Actual product facts (2026-09-11)
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8。Deep-sub-cycle高级解析 task 1e324308-fd26-4cc1-8612-8a1c269909a9，原6字段/54证据已完成；本轮无重跑。
- v1: 4ed2b16d-0c5f-41a5-a57d-54eff5dbab11；旧run436ff261-1f49-42ea-827a-cccfb2fce45b仍failed/version9。保留历史，不自动恢复六图。
- v1两图8b0ca4c9-eb20-4478-a79c-d1b8e0dadc25、36a4f82b-10bc-40f4-b43c-bc1d8990f6c9已在04:07被设approved（本轮live API核实，早前“均draft”记录不再有效）。前者球面/散射源几何有疑点，后者制作指令外露；不能因状态approved便公开。
- 已实际使用新工作台：Hermes修改“问题”字段→正文同步→撤销恢复原稿→人工补回“强度半高全宽”科学定义→确认进入制作。d6dce2e2下共编成功，其他五字段不改。首次661d0926调用曾JSON/schema失败，已修正提示合同及纠错反馈。
- 新v2 b0c9d2c0-37ce-4980-a095-be115c2437cf；commit3246c609-6e8d-428c-9848-a92585f38b14，2026-09-11T05:13:55Z；仍draft、无新图片。新问题文本已写入快照。
- v2暴露旧衔接故障：createCommit未同步live SDF；carryVersionEvidence把12条继承Claim全部降needs_review。已执行单事务定向恢复：5条未改Claim、50条对应Evidence恢复原状态，改动problem和原pending保留；AuditLog action maintenance.repair_version_carry保存前后状态，冻结v2未改。正常carry修复已部署，勿重跑恢复。
- 52a52829下正常创建v3 e9a168a4-8314-47c8-ad9a-11e77ec9ffd2 / commit0ca271fc-0d41-45fe-8ebd-76b256ca304d，2026-09-11T05:42:44Z；刷新后live SDF保留正确新问题，制作页5条可选材料，仍draft。
- 制作/发布CSS从主栏160px修成两栏，服务器实际DOM为819.2px+320px。截图需先bringToFront；后台tab截图会超时，不等于Chat/CDP故障。
- v3单图方案45e2f739经Hermes修订为253e0750-0b5d-4a7a-bc36-fe2413901dd2，已批准；删除易误读的汇聚波前/接收弧面，保留三联机制与异号旁瓣。图片任务3814f844-cb8e-41b9-b403-74d6a0d40eb9已实际提交服务器网页，会话6aa3963b-63bc-83ea-87a3-a0900002008f明确返回“You’ve hit your rate limit.”。任务failed/10%，无新图片，不重发；v3尚未发布。
- 网页最初空白但出现Like this image，随后原会话恢复显示限额；服务器恢复关闭了产品tab，已复用原登录重开。产品任务目前保留通用错误“image generation failed”，后置恢复原因尚未同步到任务展示。
- 小屏正文存在，首张截图渲染不完整；DOM证实preview正文2672px高。真实header问题是固定操作区挤掉标题，已改成小屏两行并收紧三步导航，待最后部署。

## Chat / routing
- Chrome6Pro会话 https://chatgpt.com/c/6aa2df58-0c20-83ea-838d-4e1129091d79 已给出本轮连续工作台/共编/公开布局规划；追加复核明确限流，没有重发。
- SolHigh workbench_boundary_review已关闭共编/发布四处异步边界问题，2文件提交/继承修复最终复核通过；未跑测试。
- Sol medium draft_commit_sync实现仅两个Domain文件；主线程整合前端和部署。无测试/模型A-B，无节省比例声称。
- 服务器网页生图仍走既有Create image provider；科学规划6Pro与原生图片模式独立。现有图片是真实服务器Hermes→网页→下载/存储→画廊，不是Codex手工导入。

## Next actions
1. 完成当前界面小修部署与手机实际页面观察；勿重跑共编/OCR。
2. 图片额度恢复后由产品重试当前已批准方案253e0750；当前3814f844已明确限额，不是仍在生成，不可盲目恢复/重发或换账号。
3. 新图科学/视觉核对通过后审核发布v3，再看公开RO。不要公开旧两图或凑六图；视频、批量冷启动暂停。尚未完成项另含后置限额原因同步到产品错误文案。

## Changed surfaces
- /edit持有共享草稿并组合ResearchPresentation/ResearchPublication；旧路由仍可用。
- 公共API列表和直接下载均排除内部storyboard；公开画廊图片contain、元信息折叠，版本数据按冻结记录展示。
- 恢复上次Hermes结果不自动写入；明确改稿才apply，字段冲突保留用户修改，undo不覆盖后续修改。
- 服务器入口和复用位置见 docs/runbooks/server-capabilities.md；旧任务细节从Git历史按需查，不恢复旧next action。
