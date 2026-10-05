# CURRENT Progress Window

动态状态以 Hermes CURRENT（docs/handoff/2026-09-10-hermes-web-image-handoff.md）为准；本页只保留最近检查点。

## 最近检查点
- 2026-10-06：线上 `4ed53b71faa11692756bcf79d5b3504e57581b19` 部署完成并通过 release/CAS、Nginx、容器启动健康和公网 `/__release` 复核，回退为 `7d208827d0e0bc41811b46dc1bf67231daf8230a`。Hermes 窄屏入口已改为右下角透明浮动邀请，不再生成全宽底栏；内容末尾保留透明安全区，390px 指南页滚动到底部与 CTA 重叠数为 0、无横向溢出，点击后展开 300px companion surface；桌面仍为 360px。Landing 保持不变。Parser/ScanSci/embedding 深层能力探针因本次 `--no-tests` 未验证。
- 2026-10-06：在现有已确认分镜上完成一次新的真实站内生图复测。RO 9067a2d5-42ad-4c06-b234-753728b71064 的 `presentation.generate` task `ead639dc-e480-4520-8f0c-691402c8b739` 单次执行 succeeded/100%，retry0、attempt1、error=null；Synclip `gpt-image-2` 资产已保存为私有 draft，Hermes/MiniMax-M3 图像审校 accepted，页面实际可见且人工核对公式、分区和曲线可读。
- 2026-10-05：线上 fcc8ad62357134cfe16238f6a04bf0e5b2598a64 完成第二篇真实入口部署；后续 UI 候选已合并至本次 7d208827 发布。
- RO 9067a2d5-42ad-4c06-b234-753728b71064 的 Hermes run 7a959a7f-dbcb-4dfa-afc1-28a12867cdbf 完成全文来源、独立 source-review 和4幕科学分镜；source task 8aa82e71-92e6-4bf5-86c6-bd5ecec07efb 为 review_received，分镜 task 7244a6c3-b166-4d09-8494-4e75f4eb4e23 为 succeeded/illustrationReview=accepted。
- Synclip gpt-image-2 四幕结果为3次供应商成功、其中2次图像审阅接受、1次图像审阅阻断；第四次 task 28ab61b0-7931-41d3-8200-2d63c1f986ad 为 UNCERTAIN，没有可安全重试的 task_id/receipt，run 为 failed。
- 真实结果说明传输链路当前可运行，但还不能称长期跨论文稳定：旧第四幕未知外部终态仍未分类；本次新图已完成一次实际像素核对，其他旧图的科学/像素结论仍按原记录处理。
- 只读服务器核查显示 timer/broker 正常，当前 Synclip GET 诊断请求返回404且约0.28秒；本次证据排除了“服务整体不可达”，但客户端仍缺少第四次 POST 的原始错误分类。
- 分镜完成后真实 run 自动开始了图像任务；本次复测没有自动公开，资产仍为私有 draft。另有生产日志出现 `/auth/me` 的重复 reply/HTTP 500，需要单独修复并验证，当前未证明它阻断了本次生图。
- `f52ee24c` 的 session guard 修复已随 `4ed53b71` 上线；线上未登录 `/auth/me` 返回统一401，发布后15分钟未再出现重复响应错误。定向 API 16/16、文件级 ESLint通过；API全包typecheck仍复现 journals/papers 的6个 HEAD既有错误。

## 后续
- 不重放未知 task；先确认 Synclip 的幂等/客户端关联合同，再决定最小 transport 诊断或恢复改动。
- 依照用户目标继续以Hermes作为论文理解与科学分镜主体；当前图像审阅由既有 imageReview/M3 步骤执行，Hermes独立像素核验尚未作为真实验收事实。图像API只处理已绑定的科学prompt；下一步先处理 `/auth/me` reply race，再用另一篇已确认分镜做第二次独立生图复测，不重放旧未知任务。
- 旧失败运行、Skills审阅和安装记录保留在Git历史与ignored tmp，不作为当前入口。
