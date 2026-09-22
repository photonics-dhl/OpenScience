# 2026-09-18 交接：Fig. 3 出图卡在 chatgpt-web 桥 + 本轮调试产物清理

## 2026-09-22 05:07Z — 原图下载与对话访问限制；末审检查点保留
- 第二篇82c6 exec2完成science/结构修复/art，完整storyboardCheckpoint保留；final 16K thinking-only length后32K调用300秒超时，run stopped/v43/max32。原GET无恢复，正在复用原output-resume续末审，不重做全文/设计；前次timeout为结果未知。
- 第三篇606已approved并发起5图，8d4f实图6Pro拒收G→j错误，c482实图像素accepted，但独立原文复核仍发现标题绑定、线性条件和固定箭头问题；不能发布。当前30条合法Evidence无导言具体类比，原SourceMap有该内容，两者不能混淆；旧冻结lineage不手补。
- 34d30e5c三次DOWNLOAD_TIMEOUT，原会话已显示唯一1672×941原图、output空；967已提交后失败/恢复超时但无Inspector crash事件，6cf未提交/BROWSER_ATTACH_TIMEOUT。05:07原34页出现明确Too many requests/temporarily limited access to your conversations，停止Chat追加请求，不用fetch绕过限制。未证明登录失败、OOM或新建对话是限制根因。
- runner.cjs候选只补原download no-send模式直接读取已显示原图，避免再点击Save；原同源/唯一图/PNG校验及一小时grace保持。访问限制独立为CONVERSATION_ACCESS_LIMIT，在任何Save或读取前终止，保留unknown而非误报生成额度耗尽。独立High指出限制DOM读取异常不能吞成未命中，已修并静态PASS；未部署，不测试/预检/CI。
- 用户询问会话续接：本机collaborate.mjs已固定exec resume；服务器同任务恢复用原会话，跨任务同图改稿仍缺parent task和新assistant图锚点。独立初稿/独立审阅与同图改稿分开说明，不冒称已支持后者。

## 2026-09-22 04:03Z — 同draft正文修复与原task规划恢复已交付
- a78fd5a910de0a30c72efbfc2bba0a0a8b689fe7正常服务器build/start exit0，rollback193fc645，独立marker正确/journal与failed均false，无迁移/测试/预检/CI。Gateway及依赖源码与193一致，复用其服务器dist；独立provider原空闲/三锁/备份安装a78、timers恢复active/enabled，无浏览器重启。备份provider-backup-20260922-composer-repair-a78fd5a9，部署日志/opt/openscience/observations/deploy-a78fd5a9-20260922.log。
- 原第二篇GET真实出现storyboard-planning/1，04:03:32Z按钮HTTP202，原task82c627a4-f253-4a10-94b3-716fa9708666/runv42开始再次规划，max32不变。/jobs/second-paper-art-timeout-resume-20260922.json已消费；不得重放。第三篇原6项science入口04:03:49Z按钮HTTP202→新plan606261f7-d539-465f-bc96-c79db549cfb2/runv39，/jobs/third-paper-symbol-source-replan-20260922.json已消费，两次真实模型规划在途。
- 第三篇来源独立只读复核：PINEM/Rabi和HHG/Compton类比在原SourceMap导言确实存在；cb2 candidate实际绑定1e07标题不能支持它。现有本地快照不足以重建当时允许supports池，不能断言intro当时已可绑定。原planner已要求完整原文支持描述，下一次可选有效supports或缩窄表达，无需新分析器或手补事实；只看新候选真实绑定是否匹配，不把审图建议当事实。

## 2026-09-22 — 新恢复真实结果与两个后续故障
- 第三篇technical subset四项真实完成：cc6e原cf6 PNG复用并正式6Pro blocked/null（方向索引k及卷积符号定义缺失）；cb450新PNG后6Pro blocked/null（节点语义、v/k方向、条件与具体类比的证据绑定）；092f新PNG/6Pro accepted；707新PNG已存但review not_submitted/EXECUTION_FAILED。原719仍accepted。run failed/v38/max31，原GET真实提供narrative-scientific-replan/6；该后续路径另由High静态复核PASS，未新增恢复模块。完整回执tmp/third-technical-subset-review-read-20260922.json，cc6e和092f实图已看。
- 队列新预算已有实际证据：65分钟总预算，cb450/092f等待8.50/9.71分钟后领取，各仍有10分钟执行；三张新PNG均已存，原请求不延长。tmp/third-subset-queue-budget-read-20260922.json是领取时快照，结果后由正式资产/任务确认。
- review安全诊断：707首attempt expected41721实际65，cb450首attempt expected41841实际65；实际均恰为保护前缀，composerConnected及attachmentsReady均true。707第二次SEND_NOT_READY，cb450原第二次成功提交。不是模型/token额度故障；无法据此区分fill、网页重渲染或交互责任。单文件review-runner候选在同一未提交draft对严格前缀丢失或全文相同但Send disabled一次keyboard完整重填，重验全文/附件/模型/模式/send/deadline；未知差异不覆盖、不新页面/任务、不延deadline。High静态PASS，tmp/review-composer-repair-20260922.patch，尚未安装。
- 第二篇82c6原science已主MiniMax-M3成功，65K/stop/303594ms；随后art16K/300004ms provider_timeout，task failed/exec1/retry0/resultNULL，无asset，run stopped/v41/max32，原GET无恢复。没有science中途checkpoint，不能伪造或重建；仅需再次配图规划，不重跑PDF/六维。High设计沿原storyboard_planning_retry新增精确pixel art-timeout分类：保留原两条terminal主审计、pixel/root/source/scene身份，priorSubmission必须标超时后结果未知，同task一次exec2/charge1/newTask0/max不变/primary-only；worker负责原Domain/handler两文件实施。全部本轮任务现自然终态，待候选冻结复核后正常交付。

## 2026-09-22 03:20Z — 子集恢复与队列修复已部署，原页面两次续作
- 193fc645af51a7d5b2acd295ada8fbcb3a480aa3正常服务器构建/启动exit0，rollback b285，独立marker正确/journal与failed均false，无迁移/测试/预检/CI。Gateway及依赖先服务器实际构建；原provider三锁/空闲/备份安装同SHA，provider-backup-20260922-subset-queue-193fc645，timers恢复原enabled/active，无共享浏览器重启。部署日志/opt/openscience/observations/deploy-193fc645-20260922.log。
- 独立High对技术候选两项修复增量PASS：technical exec2不误用completed-only收据；text/image/scientific_review分开，可信动态text最多两次，planningAuditIdentity纳入原快照深比较。队列两P1与science/final两句既有High PASS。所有候选现已交付，不将静态审查/编译当真实链路完成。
- 第三篇原GET真实显示image-render/4项，03:20:29Z原“保留初稿，继续制作”HTTP202/runv37。保留719和cb2；cf6 PNG复用到review-only cc6e78fa-5bde-42ad-bfda-81eef9fd9fe7，三个新图任务cb450919-527f-4c8c-bb53-5586ba05d553/092fdf4b-5156-402a-b703-9a0d7f4e12ee/707f7a11-8ee7-44c5-9e5e-fc13a959a386。/jobs/third-paper-technical-subset-resume-20260922.json已消费。
- 第二篇原v39/max27的科学返工入口03:20:52Z HTTP202，plan82c627a4-f253-4a10-94b3-716fa9708666/runv40；/jobs/second-paper-geometric-replan-20260922.json已消费。新生成/审阅在途，不重发；保留原来源/六维/Claims及所有旧图与公开版本，后续真实reader/发布尚待完成。

## 2026-09-22 — 当前四图终态、队列时限与技术子集恢复候选
- 第二篇cb342四图全部真实完成：459 accepted/approved；4c61因不可实现穿缝几何、无数据定量轮廓、来源限定丢失等科学blocked/null；7b73因构图要求N_SP说明却不在排他标签清单内blocked/null；a1因下标、箭头标签归属和渐变渲染blocked/有repair。run stopped/v39/max27，原GET为narrative-scientific-replan/5项。官方回执保存在tmp/current-encoding-image-review-read-20260922.json；4c61/7b73真实PNG已看，不发布拒收图。
- root两句science/final prompt只补几何可实现性和固定/扫描条件的视觉组归属，自检仍沿原模型阶段，High静态PASS。没有新增分析器、正则门禁或人工改写科学事实。
- root六文件队列候选High两项P1修复后PASS：沿private/started固定领取后10分钟；当前4worker总65分钟、最大8为125分钟，包含本波次原迟到恢复余量；Codex原10分钟不变。broker一次oneshot只执行慢恢复或新任务，避免5+10分钟超过原660秒service时限。旧request/hash/reservation/deadline不改，无新侧账；不保证任意旧积压或多生产者。冻结tmp/image-queue-deadline-review-20260922/candidate.patch。
- worker技术恢复沿原GET/retry-generation，cf6沿同objectKey/hash创建review-only替代任务，三个无PNG且可信not_submitted任务分别替代，719已审图/cb2方案/原任务历史保留。receipt/CAS/来源与实际任务数约束、noProviderSwitch由Gateway primary-only落实。High指出exec2错误进入completed-only和text规划审计误分类，worker已定向修复，原reviewer增量复核PASS；冻结tmp/narrative-technical-recovery-review-20260922及high-fixes.patch。
- 两篇当前真实任务都已自然终态；候选尚未部署。全部静态复核通过后从干净已推送SHA服务器构建Gateway，空闲/三锁/备份安装provider，再正常应用构建启动，无迁移/测试/预检/CI，浏览器不重启。先第三篇技术子集恢复，再第二篇科学返工，继续真实reader/新公开版本。用户不限额度授权持续有效，不重复询问；同图跨任务Chat对话延续尚未实现。

## 2026-09-22 02:33Z — 科学编码隔离上线、桥接操作修正与第二篇续作
- app b285正常服务器build/start exit0，独立marker release/rollback正确、journal/failed无。两prompt差异High静态PASS。第二篇02:33:28Z原按钮202→cb342f7d-554a-4f0e-89eb-daac26b9305d/runv35；receipt second-paper-current-encoding-replan-20260922已消费，不重放。
- 精确取证：77/a248按钮已唯一可见，随后plus.click actionability超时，仍余254/491秒；1ff page_selection失败与Mojo/seccomp同窗但无法绑定具体renderer；cf6正文42930字符/52409bytes且仍余1770秒，PROMPT_CHANGED真实字符原因未知，旧首错误遮住第二attempt且owned页已关闭。不能冒认缩放、OOM、排队或字符差异已确证。
- runner候选High静态PASS并从c855独立安装：plus改focus/Enter且仍核image mode；review最终读取失败不转成空正文，真正不一致仅记录长度/差异码点/连接和附件布尔值；各次失败独立安全诊断保留原错误。原三锁备份provider-backup-20260922-actionability-c8557f92/timer原状态恢复，无共享浏览器重启。Gateway及依赖源码/lock未改，复用b285服务器构建dist，未跑测试/预检/CI。
- 第三篇技术子集恢复设计沿原retry-generation：保留719和cb2，cf6复制原PNG到新审阅任务，三无PNG失败创建替代任务；旧reservation/deadline/资产不改，仅可信not_submitted旁证允许，新任务/收费/receipt链和CAS一致。候选实施中，尚未恢复或发布。最新所有状态见CURRENT。
## 2026-09-22 02:21Z — 当前9图终态与科学/艺术反馈隔离候选
- 第二篇f522当前四图：e8bdcff7 accepted，b3202126/3316f61a/2b4ec10a科学blocked且repair null。旧审查要求比例条，science已经改为等面积概念编码，但art再次生成1:36.4比例几何，现有M3末审漏掉冲突，真实6Pro阻断。最小候选仅illustration-planner/review：科学返工的旧原始反馈只供science，art-only反馈保留；当前encoding决定映射/尺度，原末审比较补比例与非比例冲突。冻结tmp/encoding-art-consistency-review-20260922，独立High进行中，无测试/新模型。
- 第三篇405a末审在出图前阻断无来源固定角度及速率/荧光增强混同；原按钮只追加1计划cb2（01:48:45Z/202），同一来源与六维保留，cb2 accepted。当前719a真实图/6Pro accepted；cf6已有PNG但review PROMPT_CHANGED且not_submitted；77/1ff/a248图像请求均not_submitted，故障阶段分别image_mode_plus、page_selection、image_mode_plus。run failed/v36/max27，尚无适用恢复入口；查原回执与现有恢复实现，不造科学拒收、不能盲重生整套。
- 719a单图领取至保存约8分16秒，串行provider与4个worker共享10分钟队列/执行预算存在排队风险；独立High提出分离整体排队与领取后10分钟执行预算的候选，但本批三图不是EXPIRED，尚未实施此方案。浏览器故障另行定位。
- 用户询问为何新建Chat对话：已解释当前新任务新会话、同任务恢复原会话；跨任务同图改稿需关联已校验父任务并绑定本轮assistant图片。当前尚未实现，不把问题当成重发或清除旧对话授权。

> 上游上下文：[CURRENT handoff](2026-09-10-hermes-web-image-handoff.md)（滚动状态与交付差额）、[docs/progress.md](../progress.md)（2026-09-18 各条目）、[能力台账](../runbooks/hermes-capability-registry.md)。本文件只记录本次会话实际发生的事、留存的证据、未结债务和下一步，不复制它们的表格。

## 2026-09-22 原图审阅恢复与混合终态修订（最新）
- 01:42Z交付：afedff应用正常服务器构建/启动exit0，独立marker release/rollback=afedff/1a2、journal/failed=false，无迁移/测试；日志/opt/openscience/observations/deploy-afedff5c-20260922.log。同SHA provider原三锁备份provider-backup-20260922-persistence-afedff5c后安装，timer恢复active/enabled，无浏览器重启。原页面第二01:40:43Z/第三01:40:51Z HTTP202，eb5/a82同task exec3/retry2 succeeded；/jobs/{second,third}-paper-review-persistence-resume-20260922.json已消费，原max17/20保持。
- 写回完成后原页面提供narrative-scientific-replan 5/6项；第二01:41:59Z HTTP202→f522ae8a-41a7-4903-96b9-2c326d2b0549/runv30，第三01:42:05Z→405a2581-7b27-4ec3-8a3d-f48718ffff1e/runv31。新/jobs/{second,third}-paper-complete-label-replan-20260922.json均已消费；继续原科学/艺术/完整末审、Chat图、6Pro像素链路，原全文/六维/Claims和已存图不重分析。
- 用户问为何GPT每次新对话：已解释新task目前空白对话，同task恢复沿canonical原会话，已存结果恢复不应另开页且本次已修。静态定位：Domain scene-image revisionAssetId血缘完整，handler只传prompt/task/style reference，spool未传continuation；runner整页唯一图片选择不支持多轮。后续同图续稿需沿原协议传已验证parent task/PNG身份，并绑定新user/assistant turn，不能把旧图冒充style reference或仅复用URL。目前尚未实现，不能声称支持连续会话改图；先完成当前两篇交付。
- 保存恢复候选已独立High PASS，冻结tmp/completed-review-persistence-review-20260922：原withPresentationAssetWrite只重试P2034，仍5次/Serializable/30秒/version fence，退避从总385ms改为50/100/250/500/1000ms并加有界随机错峰；模型不在事务内。原completed-only恢复允许唯一原收据+已知exec2/version.updateMany错误+无成功审阅写入+完整PNG/来源身份的同task一次exec3，零新任务/额度/模型提交，第二收据明确引用第一。reconcile保留无在途才终结，CAS同步全部真实failedsteps。handler原路径复用，未知错误/第四次执行拒绝。与broker已保存结果复用一起待正常服务器发布，无迁移/测试。
- 01:24Z检查点：app1a2/rollback2b17、providerdd6均已正式交付；正常服务器构建/启动及provider三锁空闲切换成功，无测试/迁移/浏览器重启。标签6/8数量限制已删除，单条/总预算保持；队列按执行优先与deadline处理、EXPIRED无job/started的旁证已为f0fd自然补齐；普通审图Send改焦点Enter。
- 8项一次性未提交恢复全部收据已消费，6份真实6Pro结果完成，1bbc提交标记存在但原页users0/无会话，a90无Send且失败，不重放。1354原结果完整但broker强制重开恢复页，目标E109ABFA3DE058C01551C33019EBB858被Inspector.targetCrashed确证；01:15:33Z按独立High批准精确关闭，/jobs/review-1354-crashed-target-close-20260922.json已消费，随后CDP连接成功。内存约3.8GiB/8GiB，旧oom计数1未增长，不能称新OOM或根治Chrome。broker直接复用严格验证的normal结果两行修复已High PASS，尚未部署。
- 原页面第三01:21:03Z HTTP202/v27，第二01:21:47Z HTTP202/v26恢复已保存审图，/jobs/{third,second}-paper-terminal-review-resume-20260922.json已消费。8fa/ba2/1354/b65 exec2/retry1 succeeded；a82/eb5 exec2在prisma.version.updateMany P2034死锁/写冲突失败，无需重新模型。run进入failed/v28及v27，max20/17保持，失败step残running：reconcile已等待无在途，但仅更新首个failed，moveRun又跳过已绑定asset的其余失败step。正在修已有持久化事务和精确已完成结果恢复资格；不得直接改数据库或放行失败。证据tmp/remaining-paper-progress-read-20260922.json。后两篇reader/新发布尚未完成。

- 01:02Z键盘提交候选High PASS：1354/b65/eb5原review恢复已真实完成。1bbc执行写submitted后没有canonical，原target1E5D0534C7ABDB9C21854A7DBE156460只读为Chat首页/users0/assistants0/composer41506/stop0；原因仍有不确定性，不重发或删除marker。未来正常review把Send.click换为同一已校验按钮focus+Enter，复用本浏览器125%下已成功的产品操作方式；prompt/附件/模型/模式/期限/提交收据不变。此修改不能用于重新execute已有submitted的1bbc。
- 01:00Z标签候选High PASS：真实1354与b65审图均blocked/null，排他六项遗漏z/t/θ或FWHM_T/工况信息；b65另把99as:3.6fs条带画成约1:10而非指定比例。两文件移除planner6/shared parser8的重复计数上限，仍每项80/单行非空/共享brief4000/原传输预算；science/art/反馈统一完整可见文字清单。clarification仅能改唯一既有label并重新核源/编译，正式issues36协议不变；比例长度/面积/距离一并纳入既有不得虚构定量图形的规则，需原图/数据渲染依据，否则用数字标签和明确不按比例的概念比较。冻结tmp/visible-label-count-review-20260922，未修改旧generated-image-review提示；待应用交付。
- 原文定向核验修正独立意见的措辞：第三篇f2856b30支持“任意介质、受边界条件约束”的模式定义，0ac3d115及SourceMap terms[5]限定MQED为线性介质；应区分两层，不把所有“任意介质”机械改成线性。第二篇p6 block4/017caf02仅固定same2-MeV electron bunch并扫描λ1–5，p7 block2/8c9bd9b0才为λ4.4的N_SP–ζ–FWHM_S条件；221d scene3 narration混同，encoding/composition已分开。
- 00:48Z：5544071b provider-only已安装，应用仍2b17。服务器依赖已按锁安装；首次构建因缺Prisma生成类型失败，补原database generate后ai-gateway及依赖build exit0，无测试/应用重启。安装原三锁备份至provider-backup-20260922-composer-5544071b，原timer恢复。High审查的一次性8项review恢复已开始（tmp/review-not-submitted-resume-20260922.py/log）；补无anchor证明后，1354于00:48:26Z真实提交、00:48:32Z取得canonical会话。每项private/operator-resume.started.json独占，仍原deadline，原失败/附件保留，不能重放已消费项。另f0fd1907无job/started，在队列中EXPIRED；候选修原排序与既有not-submitted旁证，不延长过期请求。
- 00:37Z定向修复：221d/53f方案均获M3末审accepted，新Chat实图已生成；正常review提交前连续PROMPT_CHANGED。原1354输入无Send复现证据/jobs/review-composer-exact-diagnosis-20260922.json：expected44042chars/74LF，composer44145chars/177LF，所有非空白内容一致；P/BR的innerText增加103换行，附件显示page-1(20260922-003433).png。只改review-runner全文空白归一（复用image-runner语义）及锚定时间戳后缀，非空白完整性/附件数量/hash/发送后anchor不变；High PASS。下一步独立provider安装及保留原PNG的未提交审阅恢复，应用不必重发。科学静态独立审查仍发现第二篇scene3 narration固定4.4又扫描1–5的条件矛盾、第三篇“任意介质”漏线性边界；不能因M3 accepted发布。
- 00:25Z交付检查点：2b17正常服务器build/start exit0，独立release/rollback=2b17/37048且journal/failed false；随后原三锁备份及timer空闲切换安装同SHA provider，原renderer与浏览器不变，原timer状态恢复，日志tmp/visual-narrative-provider-install-20260922.log。下述“候选/待部署”为此前过程，现均已交付。
- 第二篇原页面00:22:13Z HTTP202仅恢复080，task exec2/retry1成功，原6Pro正式blocked/null入库；新audit fc09766b-f338-4e9f-9788-91d55954178d仅73ms，selection为saved_scientific_review_recovery，零新provider发送。三条not-submitted旁证随后由自然broker补齐，GET第二/第三恢复资格5/6项。第三原页面00:24:44Z HTTP202→53f08786-01b4-4ef4-adba-9b44ecd41aad，第二00:24:58Z→221d52ce-eaab-4bc1-afdf-fba445524114；两run进入generating_storyboard。新收据/jobs/{second,third}-paper-mixed-terminal-replan-20260922.json与second-paper-completed-review-resume-20260922.json已消费，不能重放。第三第一次资格未齐前停在发送前且未留写收据；没有重复POST。后续仍须实图/审阅/reader/新发布。
- 第二篇新组run7e9e已failed/v19，两个PNG存在、两条生图未提交失败。08046c8b原6Pro请求23:18:49Z提交，23:19:39Z内核记录浏览器4GiB cgroup触顶并OOM-kill Chrome；随后36384cfa/ce336e79分别模式/attach超时。主机约30GiB、可用约15GiB，High批准在线提高到8GiB，原container ID与网络/安全/PID/shm不变，没有重启。完整资源收据`/opt/openscience/observations/browser-memory-20260922.json`，本机内核时间证据`tmp/browser-oom-time-read-20260922.json`。
- 080原target经`Inspector.targetCrashed`直接确证，原会话在新专用页可读完整blocked/null科学JSON；只关闭唯一已崩溃自有页，Playwright全局连接恢复。原broker于23:54:30Z自然保存`recovered-result.json`/948bytes response，零新请求。任务已failed，须沿原产品入口只消费已完成审阅，不能手工写formal review。477原图存在，审阅not_submitted/failed；原记录全部保留。
- 第三篇9eab55dc原唯一user turn只有图片，DOM/native-copy正文为0，原期望reviewPrompt41123字符；唯一assistant终态315bytes为询问要复核还是修改，不是正式JSON，原anchor不存在。已证“完整正文未提交”，上传hydration清空是机制推断。正常review-runner候选先上传再填完整正文，发送前精确核对正文/附件/6Pro/普通模式/Send，High PASS。原response不伪造成科学审阅，不新建continuation协议。
- 新04f已有11f正式accepted、95f/df0正式blocked/null；根本需要改科学方案。High批准复用原whole-set replan接受完整终态集合：正式审阅、failed+未审draft、可证not_submitted无图；至少一条真实科学blocked/null为依据，只传真实科学反馈。保存旧任务/图片/审计，原endpoint/CAS/精确1+N授权，新图仍完整审阅。混合终态Domain及完成审阅只读恢复候选审查中，未部署。旧“先补齐每张废弃图”的技术恢复候选仅留ignored冻结patch，不安装。
- Broker/Gateway候选在既有results追加not-submitted事实凭据，交叉核验原private/reservation/job/failed result及没有submitted/conversation/PNG；独占创建、不覆盖原结果，不允许同task重发。High PASS。第二组080的部分completed恢复仅消费原PNG/response，其余失败原位保留；API只读review-spool reader与consumer身份核对保留，不追加模型提交。待统一服务器交付后走原两产品页继续。
- 旧独立静态审查的MQED方向索引与自由/束缚过程类比疑点已由同一SourceMap全文撤销；正式6Pro的FDT/电流至矢势编码与相位匹配方向等问题仍有效。不得把旧误判复写进下一稿。
- 混合终态、not-submitted事实凭据、完成审阅只读consumer及正常composer修复已分别High PASS。为防M3末审再次放过字段自相矛盾，仅在现有narrative final-brief提示中要求逐场景核对密度/方向、固定与扫描参数、必要映射及生成文字labels一致性，paper-original保留原字；该单行也High PASS，无新分析器/模型阶段/schema。旧generated-image-review提示保持不变以消费080原收据。部分completed任务恢复的Domain/handler最终增量已High PASS，非visual旧replacement兼容保持；只读consumer和API callback/mount必须同批交付。

## 2026-09-22 第二篇实图审阅与第三篇全文成功（历史过程）

- 第二篇7bd6原task恢复的science65536请求36秒返回正文，既有schema修复8.6秒完成、art15.5秒完成。末审先16K thinking-only后32K返回blocked（脉宽排序）；自动修订c65a0488 science16K耗尽后32K成功，art及M3末审stop，20:58:23Z方案approved，run7e9e生成四图。全程主provider，未切换。
- c65独立High复核发现：I(t)强度不能证明单极电场/非零电面积；不同波长不能共用单条高斯绝对参考基线；时间映射须注明迟滞时间起点，不能承诺角积分后同形；旁白积分重复乘hν；固定4.4μm同时扫描1–5μm自相矛盾。19as<99as<3.6fs排序已修。计划accepted不等于科学正确。
- 四张真实Chat图1dcb1f66/b4744b85/34eb749e/4a4e115c均已保存；首图hash720a0bc8…于21:05:09Z结束真实6Pro审阅，decision blocked、repairInstruction null，指出电子路径穿实体、77nm与20nm未区分、30dB意义、单电子虚拟脉冲性质、收尖误示空间聚焦、φ=π/2正碰表述等。其余三图仍审阅中；没有发布。tmp/second-paper-image-reviews-read-20260922.json保留完整审计身份，查看摘要不要打印巨长parentIdentity。
- 第三篇composition1834e21d在20:51:11Z成功，13次text完成分窗/归并/六维；SourceMap仍e490409c…且sourceMapReused true，无新parser/OCR。后续8c87b54d v5在20:56:13Z成功：原主路由、65K ceiling、28,043输出tokens、294,816ms、stop；六维约657中文字符、5Claims，Version9373f1e6-9477-4e4a-9b45-b8efca244e70。tmp/third-paper-reviewed-core-read-20260922.json保留原结果。
- 第三篇初始分镜a4c5990b在20:58:52Z failed/exec1/retry0/resultNULL；570a4e5b/1dcb2639分别16K/32K、length/无正文/无fallback。run仍generating_storyboard/version8，尚不能点原failed恢复入口；正在核worker0长任务与reconcile的串行关系，不手工改DB。常规narrative science65K/600s/primary-only单行候选已实现，非narrative与art不变，独立High复核中；待在途自然结束后发布。
- 第三篇run自然收敛failed后，沿原可见“保留初稿，继续制作”按钮21:12:02Z恢复HTTP202/version10，同a4c5990b attempt2/retry1；/jobs/third-paper-science-resume-20260922.json已消费，不重放。原科学来源未重跑。
- 两处稳定性候选独立High PASS：illustration-planner仅将scienceRecovery条件改为settings.narrative，全叙事science使用65K/600s/primary-only，无升级；art/non-narrative原设置不变。index主入口poller皆runMaintenance false，startup恢复后单例顺序maintenance复用原5秒scheduler及outbox，按轮catch/约1秒间隔，与poller一同drain后断DB/Redis。代码确定旧lane0 handler阻塞maintenance；无lane日志不能断言具体哪张图占lane0。候选未部署，不跑测试。
- 正式6Pro scene2也blocked/repairInstruction null，确认跨工况共用Gaussian参照及未解释ζ/N_SP。旧科学返工只支持固定单图形态，High建议原retry-generation按1–6完整场景集合泛化、服务器计算1个计划+至多原scene数图片、同run/来源/CAS/审计，消费全部正式反馈；同一组只恢复一次，不重挂旧兄弟图到新parent。候选实施中，尚不可用。
- 21:15:10Z之前第二篇四图6Pro已全部完成blocked/repairInstruction null并由系统rejected，run stopped/version13/max9。scene1正式审阅指出无数据曲线/角积分后同形错误/强度电场混同/重复hν；scene3指出固定4.4μm又扫描波长、ζ/N_SP未解释、功率vs功率密度。正式反馈完整，generic科学返工可按全组推进，尚未执行。
- 第三篇exec2在21:15:08Z失败，三次65K调用均stop正文但结构守卫逐次失败。定向原worker日志只输出structured.output诊断：main_message:length_266_max_240、unknown_original_source、subject_requires_supporting_evidence。原task resultNULL、run failed/version11/max9；无被拒候选正文，不能追认具体sourceId/namespace。最小取证留tmp/third-paper-science-validation-diagnostics-20260922.txt，未重复模型；High研究现有source-binding反馈与失败规划恢复，supports约束不放宽。
- 稳定性两修复已提交推送61c440b2，尚未部署；当前额外源码仅原多场景科学返工及UI补接中的候选。生产/rollback仍按CURRENT，不用候选冒称上线。
- 第三篇planner反馈候选：原planning枚举仅upstream.sourcePassages中relation=supports的s编号，prompt区别paper.sourceContext引用编号；一次只读扫描所有scene/subject未知或非supports绑定并用固定路径/code反馈，长度扫描补mainMessage/audience，具体诊断优先于重复模板。原materializer、supports限制、重试次数、字段/总brief限制均不变，不自动替换引用或截断内容。候选未部署，High审查中；没有保存或臆造历史失败正文。
- 多场景科学返工三文件初稿已完成并冻结tmp/pixel-replan-review-20260922（基线61c440b2），交独立High审；Web只扩原run-view判别及按钮描述。实现者提示混合accepted/blocked旧兄弟图可能进入通用默认发布，High正在核最小退役/过滤方式，本次旧4图全rejected不混入。第三篇另High建议复用原planning retry、连续receipt/当前3次65K stop证据恢复同task至最多exec3，不新建候选持久化协议；增量实施中，planner binding反馈原supports规则不变且单场景兼容已补。
- Generic High发现两阻断：旧approved sibling可能进入默认发布；新科学计划再次blocked在动态额度下会落不可恢复failed。前者已在新parent批准同事务中按已验证source精确旧image IDs/contentHash/updatedAt CAS由approved→rejected并记录system superseded审计（actor null/authorizedByUserId/userAccepted false），保留原bytes/provenance/review及旧parentapproved；本次4图均rejected故无退役写入。后者正沿已有revisionTaskId/checkpoint/structured-review设计显式仅增1plan、原N图片预留保持的后续恢复；不部署已知阻断候选。
- 第三篇schema恢复候选ready，冻结tmp/third-schema-recovery-review-20260922；research-run共享连续收据/audit验证、handler每stage及final primary-only、domain导出及planner私有失败类union。已交另一High对generic冻结基线增量审查，无测试/构建/模型请求。待两项审查与generic第二阻断修复后统一交付。
- 第三篇增量High PASS：按actorId+metadata.taskId限定连续planning回执，已消费audit IDs/时间分组、原provider、source/payload身份及最多exec3均保留；remainingImageTasks由原payload取值，真实receipt为5，不固定6。真实唯一477aa866回执和最新3次65K/stop/primary调用已定向读回，tmp/third-paper-planning-receipts-read-20260922.json保留。planner来源反馈也High PASS。Generic旧approved sibling退役修复High PASS；blocked-plan显式续接仍在实现/审查。
- Generic P2实现冻结tmp/pixel-plan-revision-review-20260922，增量p2-and-receipt-scope.patch；历史回执与当前authority分开、原revisionTaskId还原上下文，正式blocked后stopped，显式+1计划/原N图预留不变、最多两级、每阶段及末审primary-only，独立High只审本增量。定向读取原两run仍stoppedv13/failedv11，无pending/running步骤；未发模型。
- P2最终增量独立High PASS：历史/当前authority、两级revision、仅追加1plan/继承N图、每阶段primary-only、幂等/CAS/outbox以及少于N场景处理均闭合；P1再确认保留。所有候选已完成静态审查，准备正常服务器build/start；无测试/预检/CI。
- 86a8正常服务器build/start exit0，release/rollback读回86a8/5b44、journal及真实.release-failed均absent；无测试/迁移/receiver更新。初次额外只读误用.rollback-release-id得到不存在，第二次读对.rollback-id但STDIN尾CR导致最后空行exit127；所需marker已读，独立正确failed路径再读exit0，不误报部署失败。日志/opt/openscience/observations/deploy-86a8f871-20260922.log。
- 第三篇22:05:22Z原按钮恢复HTTP202/runv12，同a4c exec3/retry2在途，新/jobs/third-paper-science-schema-resume-20260922.json已消费。第二篇原恢复writer在提交前RECOVERY_CHANGED保护停止，未生成收据/未POST；GET无canRetry。定向readNarrativePixelReplanSource返回valid/full4，RO draft但visibility public（已有v1），当前Version draft且publicVersionId/publicationNo均null；新root/P2 eligibility误把父RO可见性当当前Version发布状态，两行修复High PASS：当前draft/无公开编号、会员写权限/来源/CAS及原public researchRecord冻结仍保护。
- 第三篇exec3成功：65K科学172138ms+结构修复31077ms、art111634ms、M3末审73911ms，均主provider/stop；plan a4c hashca448fd865b67be9ffdbc54899bc36ff986e8400d771d8c043a023d2a17dc471，5场景。tmp/third-paper-planned-narrative-read-20260922.json保存原方案。五张Chat图片全部真实生成，原源码/任务没重分析论文。
- 第三篇正式6Pro全组结束：scene1 d6e75a46、scene3 666f1aef accepted；scene0 bbef0877补边接缝blocked/有repair，scene2 9a86fac1与scene4 ce332e5d科学blocked/repair null。后两者涉及相匹配与选择定则/方向关系、PINEM与Cherenkov并列通道、新型极化激元“待验证”范围、模式体积与实体体积。run stopped/v16/max9，现有generic入口chargeable6。独立静态tmp/third-paper-independent-plan-review-20260922.md另指出MQED(r,ω,k)与方向混淆、无依据的解析解承诺；正式scene1未阻断，下稿须定向核。666实图hash4a5fb044…/1196252bytes已从原权限content接口读回并看图，tmp/third-paper-scene3-666f1aef-20260922.png，原件不改。
- 对已判定补边接缝只读五图原始PNG头及画幅指令：bbef为1254²，d6/ce为1672×941，9a/666为1448×1086；broker contain到1280×720填平色是seam来源。最终prompt无16:9/横版要求，首次宽松regex误把“avoid unrelated landscape decoration”命中，精确读原句后收紧并确认全部false。scene-image共享wrapper补显式全画幅16:9、禁止嵌方纸/补边且不作为可见字，独立High PASS；两条prompt路径和总字节预算保持，不改科学/艺术字段、不裁切/拉伸、不扩协议/receiver、不保证模型一定遵守。后续由真实像素审阅继续判定。
- b7f834a2正常服务器build/start exit0，独立node白名单marker读取production b7/rollback86、journal/failed false；无迁移/测试/receiver更新。0d7源码曾物化但未部署，后随b7统一交付；tmp/deploy-0d7d0df7-20260922.sh未执行。原产品第二篇22:37:49Z HTTP202进入b88773b7-040e-4443-88d0-e03cb8e4bbe5（runv14/max14），第三篇22:38:01Z HTTP202进入04f19794-7c86-487b-8e37-aa265cc83a3d（runv17/max15）；/jobs/second-paper-pixel-set-replan-20260922.json与third-paper-pixel-set-replan-20260922.json已消费，新请求不得重放。模型工作在途，原来源/图片/公开历史未改。
- 两新generic根任务即刻failed exec1/retry0/resultNULL，error storyboard:request_values；run第二篇v15/max14、第三篇v18/max15，新task无Gateway调用。根因packages/domain/src/assets/storyboard.ts:137遗留revisionImageAssetId要求narrativeSceneLimit===1，generic生产者实际4/5，先前静态审查漏了共享parser。候选只改为字段必须存在，原全局Integer1..6范围保持；High定向复审入口/consumer剩余单图假设。worker只读研究原retry-generation的无模型提交同task恢复，尚未再次提交。原两pixel-set-replan收据已消费，绝不能重放或直接改DB。
- 模型前恢复候选已独立High PASS：精确parser错误/exec1/retry0/progress10/resultNULL/无资产/零Gateway audit与原root receipt、全部旧图正式反馈/来源/Claims保持；同一Serializable事务恢复task/step/run，max与任务数不增加。worker只允许exec2，各科学/艺术/末审阶段重验回执，后续自身audit不自阻断，primary-only不变。producer复用共享parser提前校验最终payload但不替换内容；managed任务关闭独立retry，初始science两处visibility误挡也移除。冻结证据tmp/pixel-pre-provider-rearm-review-20260922，尚未部署或模型请求。
- 37048da2正常服务器build/start exit0，无测试/预检/CI/迁移/receiver更新；release/rollback独立读回37048/b7、journal/failed false，日志/opt/openscience/observations/deploy-37048da2-20260922.log。原页面23:04:33Z第二篇HTTP202→b887同task/runv16；23:04:49Z第三篇HTTP202→04f同task/runv19。原max14/15不变，两份/jobs/{second,third}-paper-pixel-planning-resume-20260922.json已消费，不重放。
- 纠正独立科学复核：tmp/third-paper-scientific-terms-read-20260922.json从同一SourceMap定向回读Box1/类比段，明确(r,ω,k)中k=1/2/3方向索引且导言原文支持PINEM–Rabi、HHG–Compton/Thomson。先前按局部subjects引用判无支持过重，两份独立报告已原地更正；新04f静态科学PASS，符号解释/局部证据投影为非阻断。不能把摘录缺失当论文无报告。
- 04f正式M3 accepted后，真实6Pro scene0 accepted（全幅连续淡彩、主线程实看），scene1 blocked/null指出真正图示问题：FDT不是G→f串联桥，j与G卷积到A不能平行输出，量子化对象应明确介质中的场。第三篇另外b902 image失败、9eab已有PNG但review失败，runv22/max15/failed，原GET无恢复入口；正在定向spool只读取证与动态authority恢复设计。第二篇b887正式accepted后四图在途。generated-image-review.ts单行替换复用原6Pro调用明确reader叙事独立核源，High PASS，尚未部署。
- 第一篇已公开v3不变；后两篇仍私有。上述结果覆盖下节较早“尚未完成”的记录；一次性writer均不可重放。

## 2026-09-22 第二篇设计与第三篇分窗的定向取证（历史过程）

- 第二篇run7e9e已收敛failed/version7/max9、活动0；storyboard7bd6 exec1/retry0/resultNULL，无图片。science审计3a3323e5/78ae3cbc均primary MiniMax-M3、adaptive、16K/32K输出全耗尽、finish length、text0/thinking1/other0、fallback NULL，promptHash相同。没有进入art/末审/Chat。两次latency50689/106467ms；第二次inputTokens1仅provider记账，不能推断缺prompt。只读取证tmp/two-paper-scope-details-20260922.json；High建议沿原planning retry一次恢复同task，65K/600s只作用science，旧图片修订分支不改。候选实现中，未部署/重发。
- 第三篇同任务2e83在20:17:35Z落needs_review/succeeded但core六项均空，v4 blocked_scientific_review，reason canonical_partial_validation_exhausted；diagnostics全部semanticStage=section_map:SCHEMA_VALIDATION;usage=unavailable。6次OCR实际成功，随后4次text均provider succeeded/stop但结构未过；最后调用20:17:51晚于task落状态。读取既有exact SourceMapRef核摘要/大小/内部身份成功：24页/1554blocks，paragraph200722、caption9368、equation2273字符，source-map e490409c…共818144bytes。证据tmp/third-paper-analysis-failure-read-20260922.json；不扫描对象前缀或读秘密。
- 当前源码显示长文map提示未给明确外层对象，另一既有阅读路径有完整结构示例；guard/反馈不提供字段诊断。现有元数据没有保留被拒正文，因此不能追认是哪一个字段导致四次校验失败。并发Promise.all提前reject也需收口，避免终态之后仍有调用。下一步修原提示/反馈/收尾，沿既有Hermes composition刷新复用已保存SourceMap，不再解析或另造分析器。
- 两处候选完成独立High PASS。第二篇3文件：原planning retry增加初始thinking-only失败分类，同task/CAS/原审计/既有源身份，worker每阶段重验；science65536/600s、art旧容量，整个恢复primary-only。High发现unknown类型与art遗漏primary-only均已修并复审。第三篇2文件：两条map共用明确根对象/原guard约束/固定诊断及带被拒候选的原有界反馈；失败停领取并await allSettled，不加预算/模型阶段；内部原source_composition在初始读取及Serializable事务允许历史retryCount1，公共refresh不变。未测试/预检/本机构建，待必要发布及真实请求。
- 第三篇原overview→Hermes→guide aad65431-6595-4d19-91f5-c8aa80cedf12成功，researchRunDraft保留原完整指令、watercolor、f653；实际“打开图文制作”进入原页面，只有一条来源故没有select，start按钮可见，尚未点。/jobs/third-paper-watercolor-guide-submit-20260922.json已消费；该页选择器等待select超时只是助手假设错误，导航实际成功，无重复发送。第二篇恢复与第三篇run启动的一次性脚本已准备，未执行。
- 修复5b44d893正常服务器build/start exit0，无迁移/测试/预检/CI，release/rollback独立读回一致、journal/failed无；日志/opt/openscience/observations/deploy-5b44d893-20260922.log。一次marker读取因stdin末行缺newline在最后if处语法失败，仅只读；release/rollback/journal已得到，failed以单独只读成功确认absent，不误报部署失败。
- 第二篇原页恢复收据/jobs/second-paper-science-resume-20260922.json已消费，20:45:24Z HTTP202/version8，同7bd6 attempt2/retry1；source不变。第三篇原初始页面启动收据/jobs/third-paper-watercolor-run-start-20260922.json已消费，20:45:39Z HTTP202，runb3eee57a-8a08-4867-9281-cb5b950affbf；内部composition1834e21d-ebb2-496d-8637-8af22e3f0636实际创建并运行，相同e490SourceMap checkpoint保留，六维/分镜/图片尚未完成。最新运行读取tmp/remaining-paper-progress-read-20260922.json，禁止重放两个writer。
- 本轮12份已结束长文源码staging副本的删除在CreateProcess前被自动审批拒绝（blocked by policy），未执行任何删除。随后按更保守的同卷可恢复归档移入tmp/archived/long-paper-staging-20260922，完整内容/原路径/ACL及恢复说明保存restore.json，移动后所有ACL一致；原base-head.txt/implementation-handoff.md保持，生产者已结束，无需移活动writer或一次性收据。没有删除资产/原PDF/图片/回滚或处理旧268日志。
## 2026-09-22 容量修复发布中断与恢复

- 候选7dfed6fd首次部署SSH reset，主应用仍f12，Parser/BGE部分切换，journal停在switching；未发新模型。独立High审查后，在同一FD9下恢复两个服务到f12，核主应用四容器ID未变，原journal保留内容/权限归档至服务器`/opt/openscience/observations/deploy-recovery-20260922-7dfed6fd`，官方journal-clear成功。本机长脚本argv截断只到Python解析错误、未执行；后改STDIN。初次STDIN因证据父目录缺失而在容器写操作前停止，补建私有目录后恢复exit0。临时传输助手已改STDIN，不能据此声称修复上游argv缺陷。
- 第二次沿同一已物化候选的官方前台事务，no-tests/skip-migrate/复用未变能力镜像，远端私有日志`/opt/openscience/observations/deploy-7dfed6fd-retry-20260922.log`。构建、服务启动、active CAS成功，最后公网确认失败并自动回滚；现f12/rollback faa、journal与failed均无。既有Nginx日志00:44:36及00:44:44显示首页502、连接127.0.0.1:3000被拒绝；原Web未定义healthcheck，running不足以证明监听。失败容器已由回滚删除、旧日志未保留，不能猜测启动根因；下一步只定向诊断此启动故障，禁止重复模型或盲重部署。
- 原e3ef004f仍stopped/version41、5226 checkpoint保留；本轮尚未点击新的checkpoint审阅续接。全文/Claims、原图片及公开版本均未改变。当前运行状态与交付差额仍只见CURRENT。
- 一次不发布端口的原命令Web诊断实际exit1：`EACCES open apps/web/.next/BUILD_ID`，candidate文件0600、server/static目录0700；旧f12分别0644/0755。根因是本次私有日志wrapper把全局umask077传入build，非模型/鉴权/论文故障。原runtime-normalize只管worker闭包，不包含Web；不能以容器running冒称Web已就绪。诊断容器已精确移除、生产Web ID保持，日志`/opt/openscience/observations/web-startup-7dfed6fd-20260922.log`保留。修正只让077覆盖日志FD创建，build恢复022；从新干净HEAD物化新候选正常构建，避免就地修改旧产物权限。未加测试、重试序列或绕过公网确认。

- 修正后新候选5b516e62正式发布exit0，active/rollback独立读回一致，journal/failed无；Web BUILD_ID0644/server0755，私有日志0600。服务器私有日志`/opt/openscience/observations/deploy-5b516e62-20260922.log`。原页面续接已返回202/version42，task5226 exec3/retry2，未新增science/art；一次性收据`/jobs/visual-narrative-checkpoint-review-resume-20260922.json`已消费，不重发。

## 2026-09-22 保存方案末审与文字边界

- task5226 exec3/retry2没有重跑science/art；Gateway审计82b076ad-2b5f-4198-ae18-8f503b5c1331于17:04:03Z完成，MiniMax-M3科学审阅succeeded、287081ms、19974 output tokens、finish stop、fallback null。输入容量技术阻塞已实际越过，不代表内容通过。
- 末审blocked仅列一个requires_replan问题：composition加入场景标题、积分标注、公共乘子标签、量级小字4处不在labels的可见文字；run stopped/version43，未新生图。候选与完整review保留在原task，定向读取证据本机ignored `tmp/plan-label-review-20260922.json`；不能删除拒收、手工删文字冒充Hermes改稿或直接生成。
- 独立High确认art输入title与风格标题参考缺少明确可见文本边界，style文件本身已有优先级说明。最小修复只改原art prompt及prompt内readerTitle命名，原科学文档/标签/审核规则不变；不新增模型环节、regex清洗、状态分支、额度或恢复槽。后续可优先评估既有art-only规划能力；旧blocked checkpoint不会因提示修正自动放行。当时额外方案执行已消费；用户2026-09-22现已明确授权不限额度完成任务，后续费用不再重复询问。
- 74a12050正式部署exit0，release/rollback独立读回、journal/failed无；原页面刷新显示“完整成果尚未完成”、0/1图、HTTP200、POST0。新prompt的模型效果尚未新增收费请求验证，不据此标全链路完成。已结束的4个自有恢复/诊断/旧发布助手移至本机ignored `tmp/archived/deploy-recovery-20260922`，同卷移动后ACL逐项一致；restore.json保留原路径/权限与恢复说明，既有输出日志、服务器收据和防重发路径均保持。
- 用户不限额度授权后，正在补同任务art-only续接。独立High只读路径：`generateIllustrationStoryboard`的art分支可完整保留科学字段；`requireStoryboardRevisionTask`可读取失败checkpoint+review，但handler的requires_replan分支仍整份规划，blocked任务又无baseAssetId。现有恢复不接受blocked review且exec上限3，另建task会占唯一图片槽。已授权的最小接线方向为原retry-generation CAS重启同逻辑task，审计绑定拒收/来源，worker以checkpoint document构造art-only base；另存修正checkpoint并耐久记录提交，保留原拒收，完整末审通过后才能图片。当前未实现该接线，不声称已有继续按钮，不增max15/新表/科学分析器。

## 2026-09-22 同任务美术修正接线与预提交冲突

- 用户明确授权“不限额度，把整个任务做完”，覆盖此前本轮模型次数限制。继续原供应商和真实产品链路，保留诊断、科学审阅与原始资产，不反复询问用量。
- 候选复用原`retry-generation`、事务与审计：停止的单图叙事任务可显式预约一次art-only和一次完整末审，原任务重新入队，逻辑任务额度不增、保留余下图片槽；动态执行次数须匹配唯一收费授权收据，不能仅凭提高attempt数字执行。`chargeableAttempts=2`表示两个阶段，Gateway既有结构化输出有界重试仍适用，不承诺只有两个底层请求。
- 原`storyboardCheckpoint/storyboardReview`不覆盖；新`storyboardArtCorrection`保留修正候选/最终判定，各付费阶段之前先CAS保存提交标记，未知结果或再次blocked停止。科学字段与原稿严格一致，末审accepted前不能建立方案资产。本次art包装和worker-only review snapshot显式primary-only，经既有Gateway执行；主请求失败不换key/model，同主模型有限结构修复保持。成功或重复完成都保留私有证据，公共task投影隐藏新修正及既有acceptance checkpoint。
- API沿用原端点/请求，响应增加`generationRecovery=storyboard-art`；页面说明修正范围及新增用量。未新增表、迁移、供应商或科学分析器。独立High已静态PASS并正常服务器构建/部署；未测试/预检/CI/本机构建。
- 真实续作收据`/jobs/visual-narrative-art-correction-20260922.json`已消费：HTTP202/version44，同task5226进入exec4/retry3；随后首个persistPlan的`agentTask.updateMany`因Serializable写冲突/deadlock失败，run stopped/version45。定向DB仅授权correction字段，artSubmitted/planned/reviewSubmitted均不存在，Gateway最新仍82b旧审阅，新模型调用0。原收据不可重发，未改收费审计/执行次数或手工放行；候选已补仅P2034的有限DB事务退避（10/25/50/100/200ms，模型在循环外）；原授权唯一pre-submission续接审计引用原receipt并推进实际执行次数，不回退计数、不改原收费记录。仅correction初始字段/无任何提交标记或候选、授权后Gateway调用0、来源/剩图片/权限不变时可沿原UI恢复，chargeableAttempts0表示不追加授权，原两阶段实际用量仍计费。High增量静态PASS；待正常服务器构建/部署与原页真实续接。证据tmp/art-pre-submit-failure-20260922.json。

- 事务修复及唯一预提交恢复已High PASS、服务器正常构建部署；原页收据`/jobs/visual-narrative-art-pre-submit-resume-20260922.json`已消费，HTTP202/version46，同task5226 exec5/retry4。18:11:35Z只读确认artSubmitted=5已持久保存、planned尚未返回；随后18:13:26Z已保存新planned并进入reviewSubmitted=5；修正plan证据tmp/art-corrected-plan-20260922.json，完整末审在途，不能重跑两个写脚本或回退worker。原收费授权和失败证据保留。

- art修正及完整方案末审均成功：54da500f/99023ms、b658d657/14561ms均primary minimax-key-1-model-1/无fallback，嵌套review accepted；task5226最终succeeded并保留原checkpoint/review及完整correction证据，方案资产approved，science字段保持不变。自动新image763b88c3-6d9e-44de-88e9-e2616c70f876在Chat80083ms成功，1280×720/531607字节，hash eb06ba382e2b5e5067d5f4157a5e155d6af77d45254beaff050d8f7477748ced，本机tmp/visual-narrative-763b88c3-20260922.png已实看。
- 6Pro真实像素审阅d02c4aca/174156ms成功返回blocked，科学/公式与原方案一致，但首零参考线应短细实线却画成与分界近等高虚线，背景有纹理/浅灰起伏而非均匀#FAFAFA；repairInstruction非空且只修渲染。素材rejected/任务succeeded，run stopped/version50/max13全部使用。review证据tmp/visual-narrative-763b88c3-review-20260922.json（只需asset.review.summary/repairInstruction，parentIdentity长）；服务器/jobs/review/763b88c3-6d9e-44de-88e9-e2616c70f876保存1张真实图片附件、submitted/anchor/conversation/response/result。未发布该图。
- 当前断点已从科学错误转为纯render修正：原repairRejectedNarrativeImages有sceneImage.revisionAssetId能力，但既有固定13预算无余量；用户不限额度授权仍有效。已由High设计并完成沿原run/已批方案明确追加单个渲染任务的通用授权候选（详见下一节），不又加15/17魔法分支、不绕run手工出图、不重分析论文。现有修正输入是原完整brief+repairInstruction，不传被拒图字节（styleReference另有用途），不能称为保真像素编辑。尚未新增模型/更改预算/迁移。
## 2026-09-22 原run单张渲染修正（已部署，实际图文完成）

- 原图763b88c3被6Pro拒绝的两项缺陷都有明确repairInstruction。沿原retry-generation新增image-render恢复识别，不重复science/art规划；同事务只增加1项额度、创建同计划/scene的一阶修正task并写审计，提交后派发。新request不接收客户端自选额度/资产；旧13/11科学返工分支保持，不自动连续授权或放宽多代revision。
- High纠正了仅看Prisma Int遗漏SQL CHECK的问题：当前约束只认9/11/13，必须新增20260922030000前向迁移。新约束仅允许存储>=9的格式，Domain拒绝无收据的非基线数字；基线9/11/13均按相同资格追加1，动态任务执行与资产审阅必须验证精确授权收据。完整Domain/迁移/UI独立High增量PASS，无阻断；基线9/11/13同样追加1已收口，10/12/14无精确收据仍拒绝。生产worker只读sceneImageFallbackConfigured=false，不会自动切provider；未运行测试/预检/本机构建，后续实际部署与成图见下条。
- 必要迁移前已运行原`backup.sh --confirm --db`，exit0、BACKUP_OK core_size=47M/search_size=4.6M/sets=7/7；未读备份正文、未运行测试/演练。部署使用正常事务并运行迁移，receiver不变。动态授权写入后不交给旧worker，数据库回滚拒绝收窄；保留历史任务、拒收、公开版本及原论文。
- 原页一次性操作已准备`tmp/visual-narrative-image-render-resume-20260922.cjs`，严格stopped/version50/max13、approved parent5226及当前image763、image-render/chargeable1。服务器收据`/jobs/visual-narrative-image-render-resume-20260922.json`已消费，原页实际HTTP202/version51/max14，新task8bbcfd9b-95a9-4bdd-a202-3ebfb61594e3；收到未知响应先读收据/run，禁止盲重发。

- 11941d9df24cc5346656a573826261862da91b20正常迁移/构建/启动exit0，rollback5ed8e4c7，marker独立读回一致、journal/failed无；DB grant CHECK >=9及新worker fallback=false已读回。新Chat image审计59d97576-a965-4040-9491-f30d5db634c3，18:58:02.338Z/81089ms/succeeded/no fallback；PNG hash778815c8fd54996e99abbad2e6d39a17edcf294f109e615cb56015e1d2fff8a8，526396bytes，local tmp/visual-narrative-8bbcfd9b-20260922.png，主线程已看图：首零线已变短实线。6Pro像素审阅仍进行中，尚未批准/reader/发布；原图不删。

## 2026-09-22 真实图文完成与发布消费断点

- 8bbc图片6Pro审计90ada2a8-60c2-4ff0-9bab-dd9823a491d8，19:00:57.124Z/174195ms/accepted；明确公式、共享因子、传播/倏逝分区、首零位置及单轴叙事无阻断缺陷。原素材自动approved，run succeeded/version53/max14；无再次生成/人工审核冒充。完整review证据在tmp/visual-narrative-8bbcfd9b-review-20260922.json。
- 原Hermes页真实点击“阅读完整内容与图片”→private3051 overview，1280×720新图解码、六字段821字符、6Claims/58Evidence。收据与截图服务器/jobs/visual-narrative-final-reader-20260921.{json,png}，本机tmp/visual-narrative-final-reader-20260922.{json,png}；writes0。此项证明私有图文链路完成，最终用户科学/审美认可仍未冒认。
- 阅读实见图解13px且版本内部说明前置。UI候选仅把来源/媒体声明移到原evidence details，长叙事图注改1rem/1.75行距，正文/图来自同record版本故去“可能后续编辑”错误断言；共享version label只识别系统生产者Hermes reviewed import前缀，显示“已整理文献”，存储不改。候选静态读差异完成，未部署/测试。
- 原overview“更多工具→发布”实际进入并只勾8bbc。GET旧publicv2许可证为text CC-BY-4.0/code MIT/data CC-BY-4.0，原表单已选回相同许可、下载false，PDF workspace_member。发布范围独立High PASS。一次性/jobs/visual-narrative-publish-20260922.json已消费：license PUT200，review200但blocked/evidence_unverified；无transition/publish/新公开版本。原v1/v2不变，不能重放此脚本。
- 根因位于publication-evidence.ts105/128：仅verifiedByUserId可用。既有producer真实58Evidence均succeeded/人工字段NULL；provenance reviewed_ingestion+reviewOrigin hermes绑定run e3、source f2f/responseHash、cee71443、sourceMap7904、inputHash等。唯一系统审计49a9ad2e-3b2f-4c6c-ba84-98682cf8e0fa actorNULL/action evidence.system_verify/target3051，包含58个evidenceIds及相同上游身份。私有元数据tmp/narrative-publication-system-review-read-20260922.json。候选共享helper同时供原发布guard与最终事务冻结消费，完整v5/source/run/唯一audit/全批ID核对；High原始58项路径PASS，不填人工字段/清门禁/再跑科学模型。
- High另发现普通保存/历史恢复会复制Evidence到新ID/版本，原审计仍绑定旧版本；仅认当前审计会使未变科学内容失去系统核验。候选在同helper沿已有单值lineage，复用冻结Claim/Evidence比较，只有逐跳科学全等并最终有原系统证明或已发行verified冻结记录才继承；合并、多义、变化、循环继续拒绝。全路径共享256次Prisma读取预算，当前/冻结图和live root沿既有200 Evidence/500 Claims边界拒绝超限，缓存复用，预算不足不放行；防复杂历史图放大普通draft freeze查询。无新分析器、迁移、hash或审计；独立High最终PASS，待正常无测试/无迁移部署与真实发布。公开阅读两处原有caption同步16px/1.75与保留段落，避免只改善私有页面。

- 第二篇只读元数据：RO c896802c仍draft，只有旧content-driven-image failed run436ff；新叙事可复用confirmed来源2fdb78de/agent1e324308及原PDF7bb96cc1（3,770,010bytes），v4无semanticStage，可沿原composition+v5审阅补齐；不复用旧d5c6失败科学结论，不重新上传。收据tmp/second-paper-narrative-source-read-20260922.json。

- 正常无迁移/无测试部署0c6115dd完成exit0，release/rollback独立marker一致，journal/failed无。原UI新收据/jobs/visual-narrative-system-verified-publish-20260922.json：license/review/两次status均200，review passed/无hardBlocks，publish201，3051为公开v3，contentSha256 d34d5d70344cc7f7f6ee0ed7906836d74492cc9a815a5ceb188b7dbdcbe88c66，2026-09-21T19:48:46.366Z。没有填人工核验字段。
- 实际点击“查看公开RO”打开v3，新8bbc1280×720解码。匿名GET v1/v2/v3均200，旧两版contentHash/正文保持、3版许可一致，v3有6Claims/58Evidence和唯一8bbc，附件workspace_member。收据/jobs/visual-narrative-public-v3-observe-20260922.json及本机同名tmp；真实viewport图已看tmp/visual-narrative-public-v3-viewport-20260922.png，caption16px/28px/pre-wrap，无横溢出。初次fullPage图受现有Chrome125%/CDP截图裁切，DOM scrollWidth=clientWidth1140，改viewport截图确认完整画面，不把截屏裁切误判产品溢出。
- 第二篇真实入口已完成公开v3→研究桌面→deep-sub-cycle私有草稿→研究详情→Hermes。首次助手误用按钮可访问名导致未发送，DB同用户新guide0；输入保留，改用唯一可见发送按钮键盘Enter，HTTP201 task ab76b22e-386a-48ab-bf7b-bb188b7c053e。一次性/jobs/second-paper-editorial-guide-keyboard-submit-20260922.json已消费；原prepared收据保留，不重复发送。guide明确editorial及未读论文者叙事，尚未启动制作run。

## 2026-09-22 后两篇真实制作继续（最新运行记录）

- 4d97a62e正常无迁移/无测试构建启动exit0，独立release/rollback为4d97a62e/0c6115dd，journal/failed均无；日志/opt/openscience/observations/deploy-4d97a62e-20260922.log。独立High对六文件重试/检查点/分窗差异PASS；不新增服务/分析器/供应商。
- 第二篇不选confirmed2fdb：其v4无semanticStage，原prepareHermesRefresh不允许直接升级confirmed；已有needs_review840/d5c6为具来源的待审候选，High确认用原reviewOnly→v5完整核源、允许科学纠错，新稿不污染旧公开版。guide ab76 style=editorial/zh，沿真实“打开图文制作”选840并按原按钮启动HTTP202，收据/jobs/second-paper-editorial-run-start-20260922.json已消费。run7e9e1f3e-eafe-440a-be0f-7ff1ed349a8b，原9项；f1bb85c8-a8a0-4c5c-8e40-23c8b4f28b50在20:11:27Z v5 review_received成功，新私有d07cfeee-c81d-4162-a469-0b431f964801，storyboard7bd6b0b8-edef-4edf-b52f-f6bad6f9db23生成中。未取得成图/末审/新公开版。
- 第三篇实际路径为dashboard→原论文草稿→研究详情→继续文献整理与核对→原f653任务页；页面显示旧全文限制解除及“重试结构化提取”。原恢复按钮仅一次，20:13:11Z HTTP200，原Agent2e83eaf7-66a3-4436-a045-ffa56d2a4895/rertry1/attempt2，状态parsing。一次性/jobs/third-paper-original-retry-20260922.json已消费，审计a3f55ac1-68c3-4c07-a4ad-bd9ce708cf50 recovery=legacy_full_document_limit、previousState failed_blocked/attempt1/retry0/旧错误全等、creditPolicy reuse-original-reservation。当前尚未得到SourceMap checkpoint，不能推断实际长文规模或声称处理成功；tmp/two-paper-progress-read-20260922.json保存最近只读进度。
- 浏览器两张自有页：window.name=xgs-pipeline-20260921为第二篇run，xgs-longpaper-20260922为第三篇原task。不动Chat页/登录/共享桥。阅读截图只用viewport避免125% fullPage裁切；Hermes发送按钮可访问名不能按可见箭头拼接，使用唯一可见发送控件键盘Enter，无注入事件/直调私有执行API。

## 第三篇长文断点：设计与候选记录（已被上方部署/恢复事实推进）

- 新只读现场tmp/third-paper-recovery-scope-read-20260922.json确认f653 failed_blocked、双表精确旧全文错误、retry0/attempt1/resultNULL、sessionactive/用户ROpayload关系匹配、原Artifact可用。候选沿原retry一次legacy_full_document_limit恢复，严格CAS/审计保存旧错误与计数，复用原预留；不手改DB/新task/run。Worker解析成功后模型前写exact {sourceMapRef}私有检查点，重试严格加载为reusableSourceMap而非previousResult；现有18k映射取代120k前置门槛，无新reducer/内容裁剪/API/迁移。六文件增量High PASS，生产audit sink已注入。实际长文规模和reducer容量仍未知，待正常无测试/无迁移部署及原UI恢复。下列只读设计为之前的发现过程，不按旧“未实施”重复工作。

- RO aa450f1e-fafc-46d8-a072-d935e01b0544/f653386b既有120000字符失败发生在extractor.ts canonicalPassages全文总量检查，先于semantic map/reduce；原Artifact d04add46-9d96-443b-aae1-c1dfc1ecbadb（PDF 4,609,066 bytes）保留，无研究Version，不重新上传。最新服务器只读确认AgentTask 2e83eaf7-66a3-4436-a045-ffa56d2a4895 result=NULL、无sourceMapRef，parser-jobs未留该任务产物；尚不能声称SourceMap可恢复，需查原生产者持久化时机。
- 独立High定向读到现有buildMappedSemanticStage已将全部P段按约18000字符窗口顺序处理、并发2，再通过semantic-reduce归并；每段原1200字符/来源slice保留。小修方向为把120000限制留在单次buildLegacySemanticBridge，有previousResult但无可复用semantic stage的长文强制复用现有mapped路径，避免新分析模块和任意裁剪。
- 尚未修改/执行：实际第三篇全文字符、窗口数量和reducer请求容量未知，须在原Artifact解析恢复后定量核对；不能仅依据模型名称或假设上下文上限宣称全篇可处理。canonical树extractor.ts第616/674行确有18_000窗口，最初explorer读错位置的“未找到”已纠正，不作为事实。先完成当前论文的图文实际结果，再实施本项；不批量跑模型。
- 只读lookup更正：explorer最初脚本错把key长度定为84（正确目录+64hash+.json共89）且直接JSON.parse截断512字节，所报prefix0无效。主线程已保存并执行tmp/third-paper-source-reference-read-20260922.cjs，严格key regex、稳定开头双字段解析、上限50；真实返回capped/listed51，立即停止，未读取未匹配全文/扩范围/发模型。当前仅缺serializedSha/objectKey定位，不证明对象不存在。原Artifact的blobSha256=4a51048431f20950a01916b50cd87a08642881b20b0a9eac767144031ebc0b1a；后续可按High方案一次重解析原Artifact并保存私有sourceMap checkpoint，实际规模未知前不先加分层reducer。

## 2026-09-21 用户纠正：原图截取不是论文视觉叙事交付

- 用户用公开v2的Fig.1截图指出：原样裁出展示丑，未读论文者无法清楚理解所传信息。目标是图片（单/多张）与后续视频让读者理解核心思想和关键点；原图/生图/视频按需采用，须同时设计叙事与美感。要求已入需求§18.2、Taskmaster任务5和CURRENT；本轮只静态定位/同步，尚未改生产链路或公开资产。
- 更正下节旧表述：“已认可三图”不准确；Fig.1仅经历来源审核和产品approved操作，没有用户的审美/叙事认可，现明确否定直接展示。既有9f/aa41认可与历史发布事实保留；不得把来源真实、hash相同、轮播加载成功写成读者理解验收通过。下节操作证据仍有效，后续方向以CURRENT为准。

## 2026-09-21 用户授权继续：真实原图复用与剩余断点

- 后续实际收口：真实Fig.1 copy与原hash相同/900×696，copy与用户认可的恢复9f、淡彩aa41共三图经站内选择/审查/发布，生成v2；公开入口实际点击与三图轮播成功、匿名v1/v2均200。正文/Claim内容、40条Evidence原文定位均与v1一致，既有text/data CC-BY-4.0与code MIT保持，v2附件下载不新增开放，v1未变。收据/jobs/publication-publish-known-20260921.json、publication-public-observe-20260921.json；e77现published，后续封面必须新私有版本，不能继续写旧version。
- 51eb下标/来源覆盖错误，e253未删越界标势，均保留draft；最后aaf7科学修订已收敛主体/标签，但constraints仍含未绑定的理想薄屏/a≪λ条件，被现有审阅blocked。停止追加规划/Chat生图，不以这三图发布冒称新封面或全链路稳定。此类语义修订残留与第三篇全文上限仍是实际债务，下一步见CURRENT。
- guide b6遗漏style落到technical，3ab显式editorial纠正同时意外改写内容；51eb提交前通过原指令框恢复b6 Hermes指令。新建style必填及精简validationFeedback已完成High增量复核并部署，历史/艺术修订省略语义保留；反馈最多1786字符，处于Gateway原2000字符范围内，不增加重试。新缺style拒绝行为尚无实际模型结果，精确版本仅见CURRENT。

- 用户明确保留当前登录继续，未退出或改动会话；原错误并非认证失败。已从dashboard真实入口进入新版配图页，原图上传/来源审核成功，Hermes版本上下文实际修复。具体资产和下一动作只见CURRENT；下节“暂停/未上传”是此前历史状态。
- 原Fig.1三子图与完整图注已视觉核对，上传后hash相等、浏览器解码900×696；来源批准只允许reuse。Hermes仅Fig.1/reuse方案已成功并批准，原样复制已通过原按钮提交，未新调用Chat图像provider。收据/jobs/paper-source-*、hermes-source-reuse-*、paper-reuse-*20260921.json。
- 新封面guide成功而science plan失败；worker固定诊断是JSONparse、encoding220>200、subject描述151>140；按task关联Langfuse三条MiniMax调用。Pro同原CLI短任务实读两段代码、写/读回12行建议；tmp/pro-collaboration/2026-09-21T00-50-19-619Z.jsonl及tmp/pro-planner-bounds-review-20260921.md。候选聚合已被拒对象的超长字段反馈，修planning缺失上限/constraints.min，保留原证据/科学guard及两次重试；不截断科学文字、不扩大额度预算。
- 发布全选不能排除旧approved成品；候选新增现有publish可选IDs，新UI默认空选并预览计数，锁内校验approved且同version且非来源/分镜，所有historyMedia仍冻结保留，公开hash/下载使用原publicHistoryMedia。High复核未见新增实质问题。未部署前不声称选图已可用；Fig.2清理仍未授权。

## 2026-09-21 部署与暂停点（历史，已由上节续作）

- 本轮应用及独立provider均已成功部署，所有包服务器编译通过，精确release与rollback仅见CURRENT。提交使用[skip ci]，deploy --no-tests/skip-migrate/reuse-unchanged-capability-images，未运行应用测试/预检/CI或本机构建。provider首轮忙锁拒绝无切换；原备份已存，随后只停timer等待当前服务结束再运行既有installer，恢复此前两个timer active，未关闭浏览器或取消任务。
- 实际公开PDF只有Fig.1，第5页原图及图注已视觉核对并提取，原PDF/页图/裁图/坐标记录在服务器observations/paper-source-20260921与本机tmp/pipeline-*.png；sourceArtifact保持4b94c626，文件hash与原登记一致。后续真实reuse使用Fig.1，不能把生成计划Fig.3当原论文原图。当前未上传产品。
- 最终重投边界采用图片+Claim+图注身份：说明纠错可合法建立新draft，保留原rejected且需再次人工审核；不采用仅hash永远阻断，因为原拒绝可能是来源说明错配。新增原图审批前图片必须在浏览器解码成功，服务端仍不声称自动像素/来源认证。
- 一次原始下载错误带会话字段的事件及用户待答选择见CURRENT，未转述秘密。修复后的匿名公开下载已成功；私有产品操作仍暂停，不能称PDF→生成→审图→发布全流程完成。

## 2026-09-21 CLI合作与产品链路检查点（部署前记录，当前状态只见CURRENT）

- 本轮发生一次日志失误：Playwright request context下载失败的原始异常带会话字段进入工具输出，已告知用户并异步询问退出/重登；等待期间暂停私有站内操作。修复一次性下载脚本为固定错误码和匿名公开PDF fetch，不记录/转述会话内容。已有公開PDF已获取并与原Artifact hash匹配；没有新的论文解析/图片请求。

- 后续收口：短CLI续轮确实写入并读回18行tmp/pro-short-review-20260921.md，16-39-13-111Z分离日志、exit0；首轮长任务失败不抹除。
- High否决独立对象写入/伪TrashEntry预留，原图最终复用Artifact multipart/幂等→artifactId登记，只有DB引用新增，draft人工来源审核后reuse；删除新写CRC/Adam7/解压器。原Blob上传跨系统崩溃窗口是既有边界，不声称全局无孤儿。原接口Base64路径不保留，应用内此前无调用方，本轮UI同步新契约，历史一次性占位脚本不可再跑。
- High确认新增publicationIncluded:false仅写新发布来源快照，旧公开媒体/hash不变；来源冻结引用受回收保护。原图DTO/Claim审批复查/32MiB消费者上限对齐。
- 服务器已执行候选边缘采样与单色合成filtergraph，使用既有9f真实下载原图，输出1280×720/484210bytes，填边fefefe且原字节不变。收据路径见CURRENT。首次验证脚本因Windows引号传递失败、未执行图像处理，改ASCII heredoc后成功；不是renderer故障、无模型/业务写入。

- 用户要求复用已成功方式直接推进PDF→Hermes→三类风格→审查/发布。Ultron真实成功为原生CLI自动审批而非Desktop委派；本项目wrapper使用同模式续接既有XGS任务01a0be9a，不修改共享桥/全局权限/账户。CLI实际读取Git与源码，后半段工具调用不可用，报告未写出；exit0仅代表进程完成。原日志tmp/pro-collaboration/2026-09-20T16-15-06-004Z.jsonl，后续stdout/stderr分开；目录和子文件Windows ACL已实际限定Mac/SYSTEM/Administrators，原SDDL保存在目录内。中断/非零保留锁，先核进程和结果再恢复，禁止盲重发。
- 真实站内dashboard→编辑→研究详情→图解与视频已操作；服务器owned页window.name=xgs-pipeline-20260921。POST workspace.guide创建64aa264e-e1a2-4224-8509-7061b6babdce后失败，原请求context漏presentation，尚未进生图。原始请求/响应/任务结果在/jobs/hermes-editorial-ui-20260921.json；本机tmp/hermes-editorial-start-20260921.ps1只执行过一次，不可重跑，read脚本仅更新读取结果。
- 候选：ResearchPresentation补当前版本上下文且版本切换重建Drawer；workspace-guide把既有scope诊断接入结构化guard。另domain/API修原图格式/存储失败/幂等，UI提供真实原图上传入口和作用域隔离/反馈。均尚未部署，独立High审查中；无应用测试/预检/CI/本机构建。
- 最新实际资产状态纠正及受保护表只见CURRENT。来源original资产默认approved可能误入发布，深色非16:9固定暖色pad亦未闭环；旧Fig.2清理未授权。未新生图/审批/发布，不能称全流程完成。

## 2026-09-20 已授权本机修复与定向测试：源码候选通过，尚未安装

- 用户明确要求“运行修复与测试”，本轮只覆盖独立本机 `codex-chatgpt-web` 的已知故障；不恢复 OpenScience 全套测试、预检、CI 或生图授权。随后用户说明另一会话正在修正 Pro CLI 沙箱的网络/共享盘权限，本轮不竞争修改该层。
- 定向读取原 native 策略：CLI 任务 `01a0be9a-a7c0-7003-9b08-ee12e130ef19` 是 managed/read-only、network restricted、approval never，cwd 在本地 E:；桌面失败任务 `01a0be85-8abc-72c0-b073-44ace940c050` 则为 disabled/danger-full-access，cwd 在本地 C:。前者的访问边界支持用户判断，但不能解释后者的 delegation/压缩元数据失败。未从主任务可访问推导 Pro 同权限，也未据原记录声称另一会话的修正已经生效。
- 在已审读 v5.0.8 基线 `00aab23` 上完成四文件最小修复及 38 项新回归，候选提交 `84e6997` 位于 ignored 外部源码快照。可重建补丁与上游许可已保存为 `infra/development-platform/codex-chatgpt-web/{desktop-continuation.patch,README.md,LICENSE.upstream}`。统一真实 create/follow-up 指令识别、类型化上下文过滤、跨摘要环境核验、同 scope 的已完成 checkpoint 恢复原指令/item ID，以及 v1/v2 producer 来源保留；不取消原生 thread/turn/权限一致性验证，不持久化信任凭证。
- 新鲜证据：Bun 1.4.0 frozen-lockfile/ignore-scripts 安装源码依赖，lock 未变；原版 29 个初版新用例 23 fail → 最终五文件 117 pass/0 fail，相关 harness 筛选 6 pass/0 fail（77 filtered），TypeScript exit0。按上游原参数生成候选 CLI 成功（552,264 bytes），未生成/安装完整 launcher 包。命令见上述 README；日志 `tmp/bridge-continuation-20260920/repair-{baseline,red,regression,harness,typecheck,build}.log`。未发新模型请求，测试替身不能替代真实 Pro 工具回合。
- 独立 High 指出并已修正两项过宽限制：摘要之前的旧轮 delegation 不应阻断精确 checkpoint 恢复；只有本次选中环境实际跨越摘要时才要求额外 rollout，远处历史摘要不应阻断当前直接环境。新增反例已通过，复核未见新增实质缺陷。
- **不热覆盖 cli.js**：High 与源码核实 `runtime-install.cjs` 逐文件/manifest/bundleId 校验，`ensurePackagedRuntime` 会按启动器资源中的原包恢复不匹配安装；单改 cli 或只改安装目录 manifest 都不能稳定跨 launcher 重启。共享桥最近读回 PID27600、Full、accepting=true、active_http=3/browser=0，未 drain、重启或修改 live 文件；不能中断另一会话。后续需原构建/打包流程的完整一致产物，待原子 drain 确认空闲后切换，保留整包回退，再做带新原生指令的实际 Pro 工具续轮。
- 进程重启会丢失内存 checkpoint；不能承诺旧失败任务无新指令自动恢复。账号/网络修正与本源码候选分别交付；完整 Full 尚未实证。原风格部署、206 缓解及维护、真实原图 reuse/深色边界差额、Fig. 2 未授权状态保持。测试 fixture 已逐项清理；源码/候选/日志仍是后续打包与复核所需证据，保留在 ignored tmp，不在 home 顶层制造文件。

## 2026-09-20 仓库完整调用链审读：桌面委派遗漏与压缩环境恢复是两处缺口（修复前记录）

- 用户要求仔细阅读 `miuuyy/codex-chatgpt-web` 仓库检查原因。只读获取 tag `v5.0.8`（commit `00aab23eb78a0d35ab575ff14044e29c0f80e711`）、main `eaf4f09ae92d4dc4429fa597b0861663138f08f8` 与两个未合并 PR；最新发布仍 5.0.8。源码快照在 ignored `tmp/bridge-source-audit-20260920/`，仅供静态复核/后续修复；未安装依赖、执行仓库代码/测试、重启桥或新增模型请求。沿 README/TROUBLESHOOTING、安全模型、parser → server → revision/environment → native rollout → compaction checkpoint 及相关测试源码核对，独立 High 复核新增结论。
- **11:29 的 turn_id 冲突已取得对应生产者形状证据**：原目标任务的 native rollout 在 `11:29:11.228Z` 保存当前 turn `01a0be93…` 的 `function_call_output`，name=`send_message_to_thread`、有 ID、output 为完整 `<codex_delegation><source_thread_id>…</source_thread_id><input>…</input></codex_delegation>`。仅读取类型/身份/标签布尔，不输出指令正文；收据 `tmp/bridge-continuation-20260920/desktop-delegation-shapes.json`。v5.0.8 `environment.ts:171–185,246–255` 只接受普通 user 或直接父 agent_message，忽略该工具结果；随后选旧指令，`:219–234` 与新 turn 比较失败，`server.ts:584–591` 返回终止型400。因此不是没有发送新指令，而是桥接器漏认桌面实际传递形式；未捕获原 HTTP body，仍区分 native 生产记录与 wire 实跑。
- 上游 [PR #593](https://github.com/miuuyy/codex-chatgpt-web/pull/593)，head `507b84fdb2420252a88e993727dfe34aa2d406d7`，本轮 open/unmerged，正修上述 follow-up 形态。它严格限定当前 turn、工具名、item ID 与完整 delegation，修订历史/执行键可随之读到真实指令；**没有改环境配对判定**。其新增 server 用例为 browser-only，不能证明 Full 环境关卡通过；作者报告的 Linux 实跑不是本机验证。不能把单独安装该补丁当作全部恢复。
- **初次 create_thread 也有独立遗漏**：`11:13:40.404Z` 原 rollout 为同一完整 delegation 形态但 name=`create_thread`；此前唯一 user 是 plugins/AGENTS/environment 三段前言。`:162–168` 的整段文本过滤没有将此组合前言识别为上下文，`:519–590` 环境配对又只识别 user/parent instruction；真实委派被忽略，前言被误当任务。PR #593 仅接受 `send_message_to_thread`，不覆盖 `create_thread`。这与首次 missing-cwd 一致，但保留没有完整 outbound 的证据边界。
- **11:24:58 压缩后的首次失败不能归给后来的 follow-up**。前节已记录的三项 replacement_history（developer、多段 user 前言、原始 compaction，无独立人类指令）若直接进入现解析器，前言被选为当前修订；`:280–288` 只认可旧 turn 来源，`thread-environment.ts:157–164` 因当前环境但非已接受续接而在 native rollout 读取前拒绝。`server.ts:549` 仍假设 v2 保留原来源；`compaction-continuation.ts:6–25` checkpoint 仅存摘要/来源哈希，不能凭空重建被替换的真实指令。现有 grouped-preamble 测试保留旧 turn 指令，未覆盖同轮仅前言+compaction 的形态。
- 新上游 [PR #601](https://github.com/miuuyy/codex-chatgpt-web/pull/601)，head `a50081839e9457dd106796a55a495b8f72f08f65`，本轮 open/unmerged。作者报告 Codex 0.155 的七项 outbound：环境前言 → user 文本摘要 → developer → 真实 user 指令；旧 `canonicalMetadataEnvironmentBeforeUser` 只越过 developer，被摘要挡住。补丁让有来源约束的文本摘要可跳过，保留环境元数据核对；**不处理原始 type=compaction，也不补缺失的真实指令**。本机只保存 replacement_history，不能把它直接等同作者的 outbound；该补丁是明确相关缺口，不是本机全面修复证据。
- main 的 `cea5e1c` 仅补可信同轮 steering 恢复，提交说明明确不声称解决全部续接；上述两 PR 尚未入 main/发布。推荐修复范围是统一识别经过原生身份认证的 create/follow-up 委派，令修订选择与环境恢复使用同一指令判定，再针对真实 compaction wire 形态补接；保留当前 thread/turn/roots/沙箱核对，不能删冲突检查或手写 cwd 绕过。需要运行证据的阶段仍受当前本机静态操作限制；本轮未修改 live bundle，完整 Full 链路未交付。
- 能力边界补核：[`TROUBLESHOOTING.md:192–203`](https://github.com/miuuyy/codex-chatgpt-web/blob/00aab23eb78a0d35ab575ff14044e29c0f80e711/TROUBLESHOOTING.md#L192-L203) 明确网页聊天内生图不是当前受支持 turn 类型，原生 image API 是透传 Codex 后端、不会获得 Chat 网页额外图像额度。本机桥用于 Pro 代码协作，项目服务器 image provider 的稳定性/产物交付仍独立。206 已恢复且与这些消息格式缺口分开；三类风格、真实原图 reuse 和 Fig. 2 状态不变。

## 2026-09-20 防止临时产物再次撑爆沙箱，桌面续接静态定位

- 用户要求继续解决、避免复发并及时清理不用的东西。本轮从 `570744cc` 继续，静态元数据仍为 home 顶层 353 项、原 `ultron-*.log` 0；沿用下节唯一成功的 elevated/read-only 运行证据，未重复沙箱探针、模型请求、测试、预检、CI、构建或部署。最新用户指令已重新明确本机只允许静态阅读/编辑/Git/传输，canonical AGENTS 同步该边界。
- 已把临时产物归位与收尾清理加入 `C:/Users/Mac/.codex/AGENTS.md`，并更新交付树 AGENTS：显式项目工作目录；生成物进入所属项目 ignored tmp 或私有应用数据目录；按归属、生产任务已结束和无活动使用判断，不能凭年龄删除；归档须保留原路径、权限、恢复说明并同步生产者及原有证据存在保护。全局规则修改前副本留在 ignored `tmp/bridge-continuation-20260920/global-AGENTS-before-hygiene.md`。
- 找到两个历史一次性生产者 `C:/Users/Mac/ultron-v3-continuation-acceptance-run.ps1`、`ultron-v3-test-only-acceptance-run.ps1`：原日志已归档，旧路径的“存在即停止”保护会失效。仅将各自 `$logPath` 指向私有归档中的同名原结果日志并加注释，原执行与保护逻辑保持；静态确认两目标都存在，没有执行脚本。原脚本保留于 `C:/Users/Mac/AppData/Local/Ultron/Archives/sandbox-recovery-20260920/producer-scripts-before-fix/`。这是修复历史重跑保护，不代表所有生产者已改写。
- 已创建当前任务的每日 09:00（本机时区 Asia/Shanghai）heartbeat **本机临时产物维护**，id=`automation`，ACTIVE。只处理确认不用的生成物；仍需证据的完整私有归档，保留权限/原路径/恢复信息并修正生产者；保护活动日志、浏览器/会话/秘密、用户资料、独有资产和回滚副本。不运行测试/模型请求/服务探针，不重启桥，不重跑 268 日志归档；无可操作变化时保持安静。已有此任务，后续更新它，不重复创建。独立 High 对规则、脚本相对备份的差异及两目标存在性完成静态复核，未发现新增风险；heartbeat 尚无实际运行观察。
- 其余 home 顶层 `ultron-*` 仍有 186 文件（约 812 MB）和 24 目录，包含脚本与压缩包；尚未证明不用，全部保留。另一个 Ultron 用户任务仍 active；未更改其工作树、未重启共享桥、未清代理活动日志。此次没有新增删除，上一轮归档原件及完整备份仍在。
- 桌面续接新增证据仅取自目标 native rollout 的消息形状/身份字段：11:24:58.538Z 的 `replacement_history` 恰三项——同轮 developer、多段 user（插件/AGENTS/独立 environment_context）、加密 compaction；没有独立原人类指令。各 turn_context 的 cwd/roots 仍正确。未解密或输出加密正文/隐含推理，未捕获 raw outbound，所以这仍是与故障一致的静态假设，不能声称线路字段已确证。
- 对照安装版 5.0.8 的 `environment.ts`、`thread-environment.ts`、`compaction-continuation.ts`：多段环境前导可能被当成人类修订；同轮 ID 随后不满足旧轮续接分支，导致在 native rollout 环境恢复前拒绝 cwd。当前 checkpoint 只存摘要/源哈希，若原人类指令被替换则不足以恢复原修订。独立 High 静态复核认为修复必须限定同 daemon 已完成的精确 thread/turn/model/effort/摘要 checkpoint、无更晚真实指令，并以 native rollout 验证环境权限，不能全局放松 turn 冲突或接受任意摘要。
- 本轮公开版本仍为 5.0.8；未发布 `cea5e1c` 的 steering 修补不能作为剩余 compaction 已修的证据。没有热改第三方 bundle、改可信缓存或安装未发布版本。下一步须在允许的维护窗口取得精确续接请求的脱敏结构，再据此采用可审查的上游修复；当前本机运行限制与共享桥活动期间不执行该请求。短 CLI Pro 文本审查已有真实证据，完整 Full 工具/桌面压缩续接仍未交付；不以环境清理代替三类风格和真实论文图交付。

## 2026-09-20 已授权归档，Windows 沙箱 206 已恢复

- 用户对上一节精确 268 个 Ultron 历史日志清单明确回复“确认”。本轮在 `10461a02` 上执行环境恢复；应用/provider/配置/模型路由均未变，未新发 Pro/科研模型或生图请求，未运行项目测试、预检、CI、构建或部署。
- 仅清单内 `C:/Users/Mac/ultron-*.log`（268 个、1,583,990 bytes）完整归档至 `C:/Users/Mac/AppData/Local/Ultron/Archives/sandbox-recovery-20260920`。全部源元数据匹配并独占读取；原 ACL 的 Allow/owner 逐项确认只含当前用户、SYSTEM、Administrators。新归档目录关闭权限继承，仅允许这三者；完整 ZIP 备份逐项 SHA-256/长度吻合后才用同一 PowerShell 的 `Move-Item -LiteralPath` 移动原件，再核对每件内容、创建/修改时间、属性与原 SDDL 完全相等。代理日志、脚本、配置、浏览器资料和秘密未动。
- 首次执行在目录 ACL 文本比较安全停下（归档空、268 源全在），原因是 Windows 读回 `D:PAI`、内存描述符为 `D:P`；实际 owner/group、protected 和三项规则完全正确。独立 High 复核后改为逐项核对身份、Allow/FullControl、继承/传播标志；再次核对精确空目录非 reparse 后仅非递归移除此空目录，再执行修正版成功。没有放宽实际权限或删除日志内容。
- 最终收据 `archive-record.json` 为 completed/moved=268，原路径剩余 0，home 顶层 621→353；目录 protected=true、恰三项 ACL、CodexSandboxUsers 规则 0。同目录保留 `approved-inventory.json`、`original-content-backup.zip`、含原路径/SDDL 的收据及 `ROLLBACK.md`；原件与备份均保留。只读核对/回滚不得输出日志正文，恢复原路径须逐项检查冲突、禁止覆盖；恢复全部日志可能重新触发 206。
- **唯一修复后运行验证**：2026-09-20T14:36:22Z，已安装 CLI 正常执行 `sandbox -P :read-only --include-managed-config -c windows.sandbox="elevated" -C <canonical>`，子命令仅读取 `HermesPresentationAction.tsx` 首行。实际输出 `'use client';`、exit0；helper `payload_len=22584`（修复前 42060），本次新增 error206=0。收据在归档目录 `sandbox-read.json`，本机副本 ignored `tmp/bridge-continuation-20260920/archived-sandbox-read.json`。这是原生 elevated 只读文件执行成功，不只是 CLI 返回文本。
- 本机 206 阻塞已解除，未改变 Codex 配置、USERPROFILE、沙箱后端或可信缓存；底层 argv 长度依赖仍是上游缺陷，不能称永久根治。桌面 cwd/turn_id 压缩续接仍未解决，本轮未重试旧 Chat 任务或实跑 Pro 工具回合，因此完整 Full 联动仍未验收。后续可沿已成功的短 CLI 协作继续原定配图任务；不得重复归档脚本或把这次成功扩展成全部链路通过。

## 2026-09-20 本机桥续接与 Windows 工具故障定向取证

- 接手 `9bc03dc4`，应用/provider 未改动；本轮不重发旧 Chat 任务、不生图、不切 provider、不改 Fig. 2。只读取非秘密配置/故障日志/目标任务元数据与公开源码，未运行项目测试、预检、CI 或构建。沿用前节已经成功的短 CLI Pro + 精确源码文本协作；完整 Full 工具联动仍未交付。
- Windows 已安装 `codex-cli 0.155.0-alpha.9.2`、既有 `windows.sandbox=elevated`。既有 helper 日志明确记录 `payload_len=42060` 后 `orchestrator_helper_launch_failed / os error 206`；单个参数已超过 Windows CreateProcessW 32,767 字符上限，目标读取命令未开始。公开 `setup.rs` 把完整 Base64 setup payload 放在一个 argv；全盘读取分支枚举 USERPROFILE 顶层项。本机按该排除规则的 615 项路径数组 Base64 长度约 40,592，强烈支持路径枚举膨胀，但没有读取真实 payload，不能声称字段组成完全确定。相关上游 [#32315](https://github.com/openai/codex/issues/32315) 在本轮读取时仍 open；缩短任务提示/cwd 不能消除这份 payload。
- 已说明范围并经独立 High 静态审阅，仅执行一次零模型的单文件只读配置候选：`codex sandbox -P xgs_bridge_read --include-managed-config`，每次命令 `-c` 指定 `:minimal` 与目标 TSX 为 read、network=false、保留 elevated；子命令只准备读取 `HermesPresentationAction.tsx` 首行。结果 exit1：`elevated Windows sandbox requires effective :root read access`，新增 helper payload 记录 0，源码未读。**配置解析受支持，但本机后端拒绝限定读取范围，不是修复成功**；未持久化配置、改 ACL/缓存、降级沙箱或扩大权限。收据 ignored `tmp/bridge-continuation-20260920/scoped-sandbox-read.json`。
- CLI 语法纠正：本机是 `codex sandbox [OPTIONS] [COMMAND]...`，没有 `windows` 子命令。先前按公共 main 的旧布局调用 `sandbox windows --help` 实际触发初始化并重现 206；没有执行目标命令/模型。后以 `codex help sandbox` 正常取得本机帮助，后续不得再用旧语法取帮助。
- 桌面目标 `01a0be85…` 的 native rollout 中，各 `turn_context` 均有正确 cwd（包括 11:24:58Z 压缩返回后）；因此不是用户未提供工作目录。原始 outbound metadata 未捕获，cwd/turn_id 冲突根因仍不能精确归于某个字段。桥上游 [cea5e1c](https://github.com/miuuyy/codex-chatgpt-web/commit/cea5e1cc472c9acf6f56b0c498bc70e0b4a5eb0c) 新增以当前 native rollout 认证同轮 steering 的环境恢复，保留 compaction 原错误；该提交明确未打包/发版，也未声称解决剩余续接问题。安装版本仍 5.0.8，未套未发布源码、重启桥或篡改可信环境。
- 独立 `review_style_chain` 请求曾从 loopback 17841 返回 502/Unable to connect；随后只读确认原 bun PID27600 仍监听，不能用进程存活证明请求可用。另一个独立 High 完成上述候选静态审阅；未以反复 Chat 请求探测连接。当前可靠范围只沿用已取得回答的源码文本审查，不把一次成功写成长期稳定。
- 用户追问沙箱可否修复后，仅盘点 home 顶层元数据：621 项（492 文件/129 目录），其中 268 个 `ultron-*.log` 共 1,583,990 bytes，最后写入均在 9/5–9/7；唯一其他 `.log` 为仍在更新的 proxy 日志，明确排除。精确清单位于 ignored `tmp/bridge-continuation-20260920/ultron-log-archive-candidates.json`，未读取日志正文/移动文件。将这批历史日志移入一个已有顶层目录下的归档，按路径数组估算可减少 19,476 Base64 字符，helper 从 42,060 降到约 22,584、顶层剩 353 项；这是待验证的环境缓解，不是底层传参修复。独立 High 认可可回滚候选，但要求跨项目授权。已向用户提出归档到 `C:/Users/Mac/AppData/Local/Ultron/Archives/sandbox-recovery-20260920`、保留精确原路径/完整性校验/回滚后只做一次无模型只读验证，答复待收；未执行。该既有 Ultron 父目录继承 CodexSandboxUsers RX，而抽样原日志仅三项 ACL，批准后应保留原文件访问边界，不能让归档额外开放读取。
- 本节归档提议及“待答复”是前一回合历史状态，用户随后已确认并成功执行，结果见顶部最新节；不得按本节再次移动或验证。桌面续接及三类风格/真实论文图 reuse/深色标准化差额仍保留，文档取证不重部署。

## 2026-09-20 Pro 协作已回收，风格链路已部署

- 用户明确允许创建兼容协作任务，并授权自行判断桥接操作。风格候选 `ba460f1e` 经下述 Pro 反馈修正为 `7a3a6a85bdbe19f9bd63009c841087ba3e06e824`，已推送并部署应用/独立 provider，精确版本以 CURRENT 为准；未新生图、审批/发布资产或改动 Fig. 2。没有运行项目测试/预检/CI。
- 已用 Codex app 创建 **Chat Pro 审查配图风格链路**，requested model=`chatgpt-web/pro`、effort=`ultra`；正式 task=`01a0be85-8abc-72c0-b073-44ace940c050`。首次创建约 8 秒即报 `missing cwd in trusted Codex environment context`，应用自动归档；经正式工具恢复同一任务，以正常后续消息继续。该任务的临时 worktree `C:/Users/Mac/.codex/worktrees/a7d5/XGS` 后已不在实际 Git worktree 列表；未在其中编辑，实际审查源始终为 canonical 精确候选。
- 路由实证：本机 loopback `17841` 监听 PID=27600，执行本地 **codex-chatgpt-web 5.0.8** 的 bun/cli.js；config 为 full/compatibility-v1/automatic、proAvailable=true，Codex 路由指向该端口。只读非秘密字段，未修改配置、profile、缓存或安全校验；不能从路由配置推定已获得 Pro 结论。
- 后续 turn=`01a0be8a-ee0e-7e22-9c8d-1512cd08f2aa` 于 11:19Z 开始；bridge trace=`ebdfd504f144` 在 11:23:36Z 记录 `submission accepted evidence=user_turn`，11:24:58Z 记录 `accepted structured compaction handoff`，随后缺可信 cwd，11:25Z failed。缓存中的 cwd 已正确，未手工改写。再以正常新消息续接，turn=`01a0be93-c806-70d0-aa58-7889c49367bb` 立即报 `current user message conflicts with native Codex turn_id metadata`；已停止桌面任务重试。**Chat 接收过压缩请求，但未返回该任务的代码审查答案**。与上游 [#561](https://github.com/miuuyy/codex-chatgpt-web/issues/561) 现象相近，未证明同根因。
- 独立 High 同意一次隔离 CLI 尝试：已安装 Codex 正常 `exec --cd <canonical> --sandbox read-only --model chatgpt-web/pro`，未改全局模型/路由/审批。新任务 `01a0be9a-a7c0-7003-9b08-ee12e130ef19` exit0 并实际返回 Pro 文本；但读取源码时 Windows sandbox helper 报 `orchestrator_helper_launch_failed / os error 206`，Pro 明确未完成代码审查。桥返回模型答案已实证，完整工具联动尚未打通。该请求使用了 Chat 额度，不是免费恢复。
- 主任务静态读取精确 11 文件 diff 和 3 个邻接定义，以文本交给同一 CLI 任务正常 resume，保持 read-only，要求零工具。turn=`01a0be9f-0450-7cc3-9acb-538317877bf1` 于 11:47:21Z completed、CLI exit0，实际返回 Pro 静态审查且没有命令执行：唯一 P2 是 paperOriginal art 草稿被前端禁止确认时误显示“先确认来源”，遮蔽真正限制。其余所给差异未见确定新增阻断；不等于运行/审美通过。证据 `tmp/bridge-pro-review-20260920/review-packet-result.md` 和 `packet-events.jsonl` 仅在 ignored tmp，未提交私密日志。
- 已按该 P2 修正聊天确认卡及独立表单：保留原提交资格条件，区分来源无效、论文原图不可直接换风格及其他不兼容艺术方案，双语提示返回重新规划绘制。独立 High 对三文件新增差异确认布尔条件等价、原请求重放未弱化，两种入口均使用对应提示。Pro 未获得的 Domain 调用顺序由主任务定向补读：`submitPresentationGeneration` 第 174 行 `requireStoryboardBase` 在第 182 行 `createAgentSession` 和第 186 行 `submitAgentTask` 前；仅为源码证据。未运行测试/预检/CI。
- 必要发布准备只读实证：服务器 release=`7bf8c5e5d2df33df21e77716aa5e7173deaffa75`、rollback=`561d738bb10a4926ac0e5c46356d90749557c5d1`；renderer=`sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f` 仍存在。image/review 两队列 deadline+1h 内无终态请求均 0，未知 metadata=0；两个 timer 原已 active/waiting。live runner/review-runner/page-lifecycle 的 Git blob 与候选完全一致（8d0906fb/c4767efd/98be025f），不会覆盖未入库的不同修补。
- 独立 High 操作审查后，干净已推送的 `7a3a6a85` 执行既有 deploy `--no-tests --skip-migrate --reuse-unchanged-capability-images --rollback-ref 7bf8c5e5…`：必要服务器 build/start exit0，未迁移，未运行功能探针；retention 不带 prune，不删除 renderer。随后同 immutable release 的 `install.sh --confirm-provider` 使用恢复后的 `4a30b091…` renderer，exit0；未重启 Chrome。收据 `tmp/bridge-pro-review-20260920/{deploy,provider-install}.log`。两个 service ExecStart 已指向新 bundle，timer 保持 active/waiting，最近 oneshot exit0；不能据此宣称新请求/异常恢复已运行成功。
- 安装前重读两队列：image requestFiles=144、review=51，deadline+1h 内无终态项均 0，未知 metadata 均 0；timer 原为 enabled/active/waiting。原三锁内备份 exit0，目录 `/opt/openscience-chatgpt-browser/provider-backup-20260920-7a3a6a85`；取锁前校验 jobs 身份及锁非链接。三 live 文件和四 unit/状态已保留，旧 config/bundle 原位不动。部分安装失败应先停两 timer 派发、等原任务释放三锁，再恢复文件/unit、daemon-reload 及原 timer 状态；本次未失败、未执行恢复，应用与 provider 回退独立。
- 最小实际产品路径：新建本轮只读观察 tab，站内点击「概览 → 图解与视频 → Hermes」，使用原 RO/version。Fig. 3 图片实际 complete、1280×720，仍 draft；Hermes 弹层能打开并加载既有规划失败和稿件入口，但没有现成风格确认卡，未输入/发送指令。因此新风格确认、草稿恢复/重放及原图提示仍只有源码/构建证据，不记为真实操作验收。收据服务器 `/jobs/style-chain-product-20260920.json`、本机 ignored `tmp/bridge-pro-review-20260920/product-observation.json`。本轮观察 tab 已关闭，原页面保留。
- 接续边界：本次实际可用的协作路径是短 CLI Pro + 精确源码文本，完整 Full 工具联动及桌面压缩续接尚未根治；不盲重发旧任务，不改信任缓存/安全校验。三类风格的新端到端请求、真实论文图 reuse、深色固定暖底标准化和 Fig. 2 五项清理仍按 CURRENT 原差额推进，不因部署或 Pro 回答置 done。

## 2026-09-20 继续：Hermes 风格与逐图计划入口补接

- 用户确认本机桥接启动器已可正常工作，要求与 Chat 6 Pro 合作继续原定三类风格/稳定性任务。接手 canonical HEAD=`a16a0546467d0d0be7dc538e2f2f87900653beca`，根 main=`acd13a71`；两树干净。生产/rollback 沿用 A 恢复记录，本轮尚未部署。
- 本机现有 `openai_base_url` 已指向 loopback `127.0.0.1:17841/v1`；只读此非秘密配置，没有修改配置或重启。实际以 `chatgpt-web/pro` / `ultra` 请求独立子审查 `chat_pro_style_review`，在跨后端任务交付时收到 `ChatGPT Web cannot read this encrypted cross-backend subagent payload`，桥要求新 Compatibility V1 任务或来自 Web 的受支持明文委派。没有取得 Chat 审查答案，未盲重发，不能写为已与 Pro 完成协作。已询问是否创建独立兼容任务，等待答复；不创建用户未明确要求的新任务。
- 新增源码断点：`HermesAssistantDrawer.resultFromTask` 不仅 DTO 旧，还运行时拒绝 scientific/editorial；接收结果及 `HermesPresentationReview` / `HermesPresentationAction` 丢失 figurePlan，原草稿类型虽有字段但没有保存/恢复/提交。因此已有 API 实跑不能证明自然语言站内链路可用。
- 本轮候选沿现有链修复：Web style 类型引用 StoryboardRequest、接收自由 style 并复用既有 figurePlan 校验；逐图计划贯穿确认/草稿恢复/不确定请求回放/最终提交；新增编辑封面选项及中英文名称，未知目录名安全显示，沿用确认及幂等。figurePlan 依赖按内容而非对象引用触发，避免父组件重渲染重置正在编辑的草稿。
- art-only 仅明确切换风格时采用新 style，调色/排版不指定 style 时保留 base.style 和原逐图风格；明确整组换风格同步覆盖生成图的 styleId。原始科学字段仍由既有 planner 保持。含 paperOriginal 的计划在 guide/Web 资格与 Domain 提交前拒绝 art-only，worker 也保留明确阻断；这是前置报告原有不支持范围，不是交付了论文原图改绘。需要另建 re-render 计划，不能把复用图悄悄变成生成图。
- 独立 High 首轮发现两处新增差异：模型可改写 art.figurePlan 的非风格字段、确认卡只显示全局风格。已按 base 映射只采纳 styleId 并保持未指定图的旧风格；沿原结构化纠错拒绝错误图 ID/decision/caption，确认卡显示每图实际风格/reuse/skip，不确定重放显示原请求。第二轮发现原 resultGuard 未验证数组元素、scene.image 的原 payload 不带 figurePlan；已补完整结构校验/对应纠错提示、从父方案与原请求 sceneIndex 解析风格。最终独立 High 定向静态复核未见新阻断；此前 a16a0546 的桥恢复/逐图 style 候选审查复用，不重审整个分支。未运行测试、预检、CI、构建、服务探针或新的科研模型/生图请求；没有服务器操作、审批/发布或 Fig. 2 清理。没有新 PNG/审美证据，不能声称三类风格全部验收或零技术债。
- 待继续：取得兼容任务选择后完成真正的 Chat Pro 协作；再按已授权范围交付代码和桥候选，必要运行观察事前说明且不自动付费生图。真实论文图 reuse、深色图标准化固定暖底的视觉边界、Fig. 2 清理及原 Taskmaster 1/2/4 的差额仍保留。
## 2026-09-20 续作：三类风格链路候选与本机 Codex Web GPT 核查

- 用户对恢复的 Fig. 3 回复「没有问题」，随后将目标明确为多风格兼容和稳定运行；选择先完善学术、编辑封面、淡彩三类。本次认可不自动审批/发布资产，不把全部风格或长期稳定性标完成。Fig. 2 五项清理仍未授权。
- 本机代码候选在本节所属提交保存，**未部署、未构建、未运行测试/预检/CI、未发模型或新生图请求**。用户随后转向检查已安装的 `miuuyy/codex-chatgpt-web`，服务器生产 release/rollback/provider 配置沿用 A 恢复后的状态。
- 已查明待修断点：逐图 style 只进 art 请求但末审/render 回到全局 style；art 场景不足时静默补 technical、多出时截断；科学标签 ASCII 转译有损；figurePlan 全 skip 或输出合计超过 6 场景会在模型调用后必败；scene 标题仅提示、不校验图 ID 对应。候选复用现有 figurePlan provenance、有限结构化纠错及既有风格加载，不新增模型阶段。
- 风格候选已补上述五点：`storyboardSceneStyles` 消费原 provenance，`illustration-styles.ts` 共用多风格参考合并，render 的所选风格摘录提前避免被 1500 字符尾部裁掉。**剩余已知债务**：Hermes 自然语言 art-only 的 `workspace-guide.ts` 仍强制 base.style、Web DTO 仍旧三值枚举；含 paperOriginal 的 art-only 仍受原 source support 限制。本轮未扩这些入口；不得宣称零技术债或整个产品换风格已完成，后续发布前先收口这些入口。八文件候选独立 High 静态复核未见新增阻断或明显编译错误；未构建/未运行，不代表线上完成。
- Broker 候选：renderer 缺失时撤销 `.ready` 且不领取新任务；downloaded 后标准化失败记 uncertain；同任务目录/完整 PNG 可复用，pending 输出验证后发布，一次额外本地标准化使用私有标记限制重复处理；收据先保存副本再原子覆盖。独立 High 指出的 receipt 缺席崩溃窗口及 execute 返回字节后 deadline 竞态已修并静态复核无新阻断；尚无运行证据，原 grace 时限/旧任务身份/沙箱保持，历史 failed 不自动恢复。
- 本机只读事实：安装并运行 **Codex Web GPT 5.0.8**；`launcher-state.json` 为 automatic、autoStart/keepRunningOnClose=true、experimentalBiggerContext/experimentalSkillAttachments=false、browserSmokePassed=false、mcpGuideStep=0。`.codex-chatgpt-web/config.json` 不存在，当前 Codex `config.toml` 未见 `openai_base_url`；当前会话没有该工具或 Web 模型入口，不能称 Full harness 已接通。
- 既有脱敏事件：16:24/16:27/16:29 为 ERR_CONNECTION_TIMED_OUT；**16:33:11 browser.authenticated** 证明启动器已记登录成功，旧超时不等于当前登录失败。未读取 Cookie/浏览器存储/Secret，未做 doctor、smoke 或 MCP 实际发送。
- 项目文档说明该软件通过 loopback Responses 路由把 ChatGPT Web 放入 Codex 模型选择器；Full harness 的 MCP 方向是 ChatGPT → 当前 Codex 工具，而非在原生 Codex 中增加普通 ask_chatgpt 工具。配置尚缺模型路由和 Full harness 引导；具体选主模型或委派方式需按用户选择接入，不能擅自切模型/改全局路由/重启当前任务。原 README 已只读保存到 ignored `tmp/codex-chatgpt-web-review/README.zh-CN.md`。
- 适用边界：上游 5.0.8 文档明确**不支持 ChatGPT 网页会话中的生图完成/回收**；原生 Image Gen 仅转发，不提供额外生图额度。因此可用于分析/审查/编码协作，不能直接取代 XGS 服务器生图桥。稳定用法优先单任务单 Web 会话、原请求续取、不双重控制同页，不因超时或限额重发/切号。多账号仍只讨论，未接入。
- 用户随后明确希望最大限度利用并询问 Full 模式：建议 **Full harness + Automatic**，原生/Web 混合委派先沿上游 Compatibility V1；初始只保留一个活跃 Web 工作单元，Bigger Context 保持关闭，不改现行 Codex 主模型或审批。接入顺序为启动器模型安装 → 私密配置同账号 Tunnel → ChatGPT Developer Mode 中新建精确 `Codex Native2` → 完成接通 → 在合适检查点重启 Codex加载目录。尚未执行这些配置、下载或模型验证。
- 参考真实使用反馈：[#599](https://github.com/miuuyy/codex-chatgpt-web/issues/599) 的 Windows 用户报告显式 provider 兼容方案有效，但仍是候选分支、不能自动套到本机；[#561](https://github.com/miuuyy/codex-chatgpt-web/issues/561) 报告 Windows 5.0.8 压缩后续接失败；[#594](https://github.com/miuuyy/codex-chatgpt-web/issues/594) 报告选定与实际解析模型不符。三者均为用户报告、未在本机复现，不把安装成功/登录成功称为长期稳定。
- 参考：[README](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/README.md)、[架构](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/docs/architecture.md)、[故障排除](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/TROUBLESHOOTING.md)。启动器/配置修改须按实际接入方式继续；不按上游默认清单触发本项目已禁止的测试。

## 2026-09-20 A 恢复已完成（此前执行状态）

- 用户选择 A：恢复已有图，不新增生图、不清 Fig. 2。独立 High 静态审阅恢复脚本与原任务重试链路 GO；未运行测试/预检/CI。
- 标准化依赖已恢复：原 `apps/media-demo/Dockerfile`、生产源 `7bf8c5e5`、已有 Node/scansci 基础镜像；Debian 源下载缓慢后中止本次 build container，仅将临时构建文件源主机替换为项目既有 Aliyun mirror，保留 apt 签名验证。新 renderer=`sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f`，tag `openscience-media-demo:recovery-20260920`。image broker 的原 config-6a65dc7b 只更新 rendererImage，provider/bundle/浏览器会话不变；应用 release/rollback 仍为下节值，没有发布科研应用代码。
- 锁内恢复：`/opt/openscience-chatgpt-browser/recovery-20260920-9f7ff671/recover.mjs` 校验唯一 task/hash/request/source/submitted/downloaded/原图，沿原无网络、非root、readonly、512MiB ffmpeg 参数输出 **1280×720 / 486,042 bytes**。原 spool failure 硬链保留为 `spool/results/9f7ff671-bf9e-4062-a3df-8236f7431975/result.failed-before-recovery-20260920.json`；原 request/deadline/PNG 不变。Gateway 原 `resumeFromCompletedResult` 已读回对应 PNG/hash，才发原 API retry。
- 产品实际结果：原 task `9f7ff671` **succeeded / 100 / retryCount=1 / executionAttempt=2**；同 ID image 资产 **draft**，generator=`OpenScience Hermes scene image / chatgpt-web`，parent=`8141b5fd` scene0，contentHash=`9b4984df523714a5c1ed690566ef2fd4aa6682d446a3f9f0f76cb3c39f260611`，promptHash 保持 `c5329a4b…`。completedProviderRecovery 跳过 prompt planning/generateImage，新增模型请求 0。未审批/公开。
- 实际产品路径：已登录页面「研究详情 → 图解与视频」，恢复后再次「概览 → 图解与视频」，当前私有 version=`e77dc3c7`，目标卡片题为「Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子」、待审阅，目标 img complete=true / naturalWidth=1280 / naturalHeight=720。截图 `/jobs/fig3-recovered-product-20260920.png`，原 API 操作收据 `/jobs/fig3-product-recovery-20260920.json`；本机图/截图均在 ignored tmp。已看图只证明可显示，不代表科学或审美通过。
- 前置与顺序：此为**已执行一次性操作，不重跑**。源/收据完整、现有 image-runner flock 排他 → 隔离标准化 → 先写 PNG 后原子写 succeeded → 原 provider 读完成结果 → 原用户 API retry → 实际站内查看。恢复脚本/构建日志/镜像源变体/receipt/config.before.json 均保留在上述 recovery 目录；没有创建新模型请求、修改 deadline 或重开 Chat。
- 回退边界：原始 PNG 和 failed 收据保留；不要把成功收据改回 failed 或重置 retryCount。配置备份只用于审计/有依赖的回退，旧 renderer 已缺失，不能盲目恢复旧配置。若图质量不合格，仍按既有待审/拒绝流程处理，不自动重画。按需 renderer 没有常驻容器，须保留新镜像。
- 剩余：用户本轮已认可此图；Fig. 2 五项周期清理仍待明确同意，真实论文图 reuse 尚无真数据交付，多风格/批量差额保持 CURRENT。下节只读取证为恢复前历史，不再代表当前任务状态。

## 2026-09-20 只读取证更正（优先于下文 9/18 历史结论）

- Git：接手 HEAD `02c19579`，与 origin 跟踪引用相同；相对生产只有五份文档差异。服务器读回 release `7bf8c5e5d2df33df21e77716aa5e7173deaffa75` / rollback `561d738bb10a4926ac0e5c46356d90749557c5d1`；本轮不部署。
- **“Fig. 3 从未生成真实 PNG”已被新证据否定，产品交付仍未完成。** DB task `9f7ff671-bf9e-4062-a3df-8236f7431975` 的 payload 绑定 plan `8141b5fd-fd47-4c8e-b9f3-4b6558009095` scene0。桥根目录 `/opt/openscience-chatgpt-browser/` 下 `jobs/<task>/submitted.json` 记录 9/18 **12:30:03.050Z** 提交；`jobs/<task>/result.json` 在 **12:31:07.080Z** 记录 downloaded、1448×1086、1,071,490 bytes、scientificReview=pending。`jobs/<task>/output/image.png` 与 `private/<task>/browser-result.png` 字节相同且 PNG 头/尺寸匹配；未进行科学或审美审图。
- `private/<task>/normalized/` 为空；`spool/results/<task>/result.json` 于 **12:31:07.145Z** 写 failed/EXECUTION_FAILED，DB task failed、同 ID 图资产 0 行。故最后一次失败在**浏览器下载之后、标准化输出之前**，不是提交前失败，也不是完全没有原始图。对外 result 与内部 downloaded 必须分开判断。
- 运行桥 bundle `6a65dc7be5a83258887d9b193630dc1a2a3698f1` 的 `finalizeWebImage` 在保存 browser-result.png 后创建 normalized 并调用隔离 ffmpeg。当前配置 rendererImage=`sha256:1c47a579ceb608f244878b41888eee50bda1135ff325cb7b49de3a275ee2013d`，`docker image inspect` 返回 No such image。这是当前恢复阻塞/历史故障候选；历史 journal 仅保存 failed，未保留 Docker/ffmpeg 错误，不能证明 9/18 当时镜像就缺失，亦未运行容器复现。
- 容器日志在 12:30:02.307Z、12:30:03.973Z 有 WebGL1 blocklisted，12:31:07.071Z 有 dbus 错误；其后同任务下载收据与 PNG 已存在。只能确认时间相近，不能把它们判为阻断出图的根因。此次证据只覆盖末次任务，不替前两次失败下结论；历史 39% 是 spool 失败比例，不能解释为模型未出图率或纯偶发抖动。
- Fig. 2 五项 `6439150a`/`ee9bcfb6`(draft)、`6043bebb`/`75b34c88`(approved)、`d5087b03`(draft image) 都未软删除，属于私有 draft `e77dc3c7`。每项 1 条 Claim 关联、0 条 Hermes research step 外键引用、1 份私有 research_record 快照引用、0 份公开 publication 快照引用。前三个 plan hash 同为 `9b43357558e2`，第四为 `449ce484fa7d`，不能说四个逐字相同。copy 的 parent 为 `75b34c88`，paperOriginal.sourceAssetId=`929bd95d` 已无资产行。
- 产品影响依据 DB + 静态代码：listPresentationAssets 包含该版本未删除资产；ResearchPresentation 消费该列表，HermesMediaReview 筛出 draft，故私有素材列表包含五项、待审列表包含三项；未实际点击 UI，不声称已观察屏幕展示。建议用户同意后通过现有可恢复清理机制处理整个周期，并处理私有快照/Claim/父子依赖，不直接硬删五行。未改资产或任务。
- 待用户选择：**优先恢复已有原始图**（不重发模型，先处理标准化依赖，导入后仍需审图）；或显式指定 fallback 新生成（新增额度且不保证质量）；或真实论文图上传 reuse（无生图额度，需真实原图，不能替代 editorial 重绘交付）。不建议原样第四次重发。已超过自动恢复宽限，不能直接重跑旧恢复/清理脚本。
- 本轮只有只读服务器日志/收据/SQL/镜像元数据与文档同步；未测试、预检、CI、构建、启动、安装、重试生图或切 provider。下文三连失败及“没有 PNG”保留为历史记录，以本节纠正为准。

## 0. 30 秒结论

- **plan 段真的跑通了**：`8141b5fd-…`（interactive_html）**approved**，figurePlan `{"figures":[{"id":"Fig. 3","styleId":"editorial","decision":"re-render"}]}`，scene0 标题 `Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子`（真 MiniMax 输出 + chat-review 通过）。这是「figurePlan → 逐图规划」在当前生产 release 上的真实证据。
- **image 段第三次失败**：把该 plan 的 scene0 交给 chatgpt-web 桥出图，任务 `9f7ff671-…` `failed / image generation failed`（桥返回 `EXECUTION_FAILED`）。**至今没有任何一次真实的 chatgpt-web PNG 产出**对应这个 plan；最后一次真实桥出图成功是 2026-09-17 02:28 的 `ac455b2f-…`（spool `result.png` 590,049 字节）。
- **本轮清理留下了两处必须处理的后果**：①`docs/progress.md`（2026-09-18 paper-original 条目）与能力台账第 128 行**仍引用三个已被我删除的占位资产**（`929bd95d` / `6088f11b` / `03a160aa`）；②`d5087b03-…`（paper-original copy，draft）的 provenance 指向的源资产 `929bd95d` 已被删除 → **悬空引用**。文档漂移已在本轮原处加注更正，DB 残留留给下一轮决定（见 §4）。
- 生产 release = **`7bf8c5e5`**，rollback = **`561d738b`**；canonical HEAD = **`2a174fc6`**（**纯文档提交，未部署**）。

## 1. Git / 部署锚点（本轮实测读回）

| 项 | 值 | 证据 |
|---|---|---|
| 交付树 | `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，branch `release/onchip-production-line` | `git status --porcelain` 空、`HEAD == origin` |
| 交付 HEAD | 本交接首次提交 `6126dd06c867f50a1149a86932781ed6918379f1`（其后仅锚点小修正，用 `git log -- docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md` 看最终提交）；接手时上一个提交 `2a174fc6a1e9a44eb57f25de3125859e8b0655cd` | `git log --oneline -1`、`git status --porcelain` 空 |
| 生产 release | `7bf8c5e5d2df33df21e77716aa5e7173deaffa75` | `cat /opt/openscience/.release-id` |
| 生产 rollback | `561d738bb10a4926ac0e5c46356d90749557c5d1` | `cat /opt/openscience/.rollback-id` |
| 故障标记/事务 | `.release-failed` absent、`.deploy-transaction.json` absent | 同次 ssh 读回 |
| 容器 | web/agent-worker/api/scansci-mcp/document-parser/embedding-worker 均 Up 45h（healthy 除 web）；dev 栈 + `openscience-chatgpt-browser` Up 4 天 | `docker ps` |
| 根 main | `acd13a71` 干净；worktree 仅「根 + 交付树」 | `git worktree list` |

> 注意：HEAD 比生产多一个**纯文档**提交，属正常；`2a174fc6` 不需要部署，也不要把「HEAD 已推进」误读成「生产已更新」。

## 2. 本轮时间线（生产 DB 实测，2026-09-18，均为我的调试提交）

| 时间 (UTC) | 对象 | 结果 |
|---|---|---|
| 06:42 | task `27dff586` `presentation.figure-audit` | succeeded（`Fig. 1 → re-render` 真决策，session `4eaa4e8d`） |
| 06:57 | `5f6d391b` plan | succeeded → approved，hash `fd310137`，scene0 `Fig. 1: 屏—孔偶极源…`（**保留**） |
| 08:13 | `77b3f559` image | `paper_original_figure`、approved、hash `a1299ed3`、**69 字节占位 PNG**（**保留**，但是占位） |
| 08:14–08:17 | task `b9095526` / `5afaf7f6` / `bcc516bc` / `e2599002` | failed，错误 `结构化输出超过重试上限`（**修 `MAX_STRUCTURED_RETRIES` 之前的复现记录**，行仍在） |
| 09:58–10:13 | `6439150a`(draft) `ee9bcfb6`(draft) `6043bebb`(approved) `75b34c88`(approved) plan + `d5087b03` copy image + task `03a160aa` | 全部 succeeded；figurePlan `{"figures":[{"id":"Fig. 2","decision":"reuse"}]}`；`d5087b03` = `paper-original figure copy`、draft、hash `8952318f`（**占位链路演练**） |
| 12:14 | `8141b5fd` plan（task 12:14:37 succeeded） | approved，hash `9395f576`，Fig. 3 / editorial / re-render（**保留，真证据**） |
| 12:29 | task `9f7ff671` scene image | **failed** `image generation failed`（桥 `EXECUTION_FAILED`），仅剩这一行作为第 3 次尝试的收据 |

**本轮清理（用户授权：只清我自己造的废物）**：删除资产/任务 `929bd95d`（paper-original 源占位）、`6088f11b`（占位 plan）、`03a160aa`（占位 copy 图）+ 失败任务 `6088f11b`/`627e7b48`/`7c654505` + 其 `presentation_asset_claims` 与 spool 残留。**读回验证：`929bd95d%`/`6088f11b%`/`03a160aa%` 现存 0 行。**

## 3. 真实证据 vs 占位证据（务必区分）

- **真实**：`8141b5fd`（Fig. 3 plan，approved、真 LLM + chat-review 通过）、`5f6d391b`（Fig. 1 plan，approved）、`27dff586`（真 figure-audit 决策）、`ac455b2f`（**最后一次真实 chatgpt-web 出图**，2026-09-17 02:28，approved、590,049 字节）。
- **占位**：`77b3f559`（69 字节 PNG）、`d5087b03`（68 字节源图的拷贝）。**paper-original 链路从未流过一张真实论文图**——只验证了管道，不构成科学或审美交付。
- **已删除因而失效的引用**：`progress.md` 2026-09-18「paper-original reuse 链路全链路端到端打通」一节原先以 `929bd95d`/`6088f11b`/`03a160aa` 为证据，这三行现已不存在；能力台账第 128 行同样引用它们。两处已加注更正（见 §5 已完成项），**但没有替代的实测行**——重跑或改用真实论文图才能补回这条证据。

## 4. 未结事项（按优先级；每条含位置 / 后果 / 下一步）

1. **Fig. 3 没有真图**：plan `8141b5fd` approved 但三次桥尝试全 `EXECUTION_FAILED`。后果：原目标「生成描述文献的图片」在本篇上仍为 0 交付。下一步（择一，须用户定）：(a) 只读取证再判断（见 2）；(b) 用户同意后再发**一次**；或 (c) 换路径（显式 fallback provider / Codex CLI 备用 / 真实论文图上传）。
2. **桥失败根因未定，且有重复模式**：`progress.md` 2026-09-18 记过另一次 figurePlan-aware prompt 三连败（promptHash `1c221dc86e…`），本轮 Fig. 3 又是三连败；能力台账记的桥累计失败率约 39%（69 个 `result.json`：35 成功/27 失败/7 不确定，**本轮未重测**），容器日志此前出现 `WebGL1 blocklist` 与 dbus 报错。后果：把「偶发抖动」当结论会掩盖可能的确定性诱因。下一步：**只读取证**——拉 `openscience-chatgpt-browser` 在 12:2x 前后的日志与对应 spool 收件箱，确认失败发生在「提交 prompt 前」还是「导出图片阶段」，并看是否与 WebGL 报错时间相关；不要先花钱重试。
3. **真实论文图没进过 paper-original 路径**：栈内**没有** PDF 取图工具（`xgs-pdf-tools.sh` / `xgs-extract-fig*.sh` / `xgs-install-pymupdf*.sh` 的结论：worker/parser 内无 `pdftoppm`/`pymupdf`/`pdfimages`，apt/pip 装不上）。下一步：(a) 用已实现的 `POST /research-objects/:id/versions/:vid/paper-figures` 由用户上传真实 Fig. 3 图，走完一条**真数据**的 reuse 链（便宜、不烧桥额度）；或 (b) 另立需求做 PDF 取图。**不要**用手绘/截图冒充自动能力。
4. **DB 残留（本轮清理的尾巴，需用户拍板）**：`d5087b03` draft copy（源资产已删 → 悬空）+ Fig. 2 reuse 周期的 `6439150a`/`ee9bcfb6`（draft）与 `6043bebb`/`75b34c88`（**approved**）。后果：同一内容（hash `9b43357558e2`/`449ce484fa7d`）重复成对存在，产品面上可能显示无意义草稿。下一步：**整周期一起处置**（要删就删干净并同步文档；要留就写明它是占位演练证据）。`6043bebb`/`75b34c88` 是 approved 资产，删除会改变产品可见状态 → 必须用户明确同意。
5. **8:14–8:17 四条失败 task**（`结构化输出超过重试上限`）：它们是 `561d738b` 修 `MAX_STRUCTURED_RETRIES` 的复现证据；若要求「板上不留调试行」，可删，但请先确认不需要该证据。
6. **`transliterateMathToAscii` 从未被成功出图验证**（`f03bd97c` 引入，本轮桥全败）。后果：不能声称 Unicode 数学字符问题已解决。下一步：与 2 的取证结论一起判断。
7. **原目标的交付差额仍在**：多风格配图中只有淡彩 `aa41a018` 获用户认可；学术机制图、编辑封面仍在 [CURRENT 产品目标与交付差额](2026-09-10-hermes-web-image-handoff.md#illustration-delivery) 表中未完成。

## 5. 本轮已完成的文档同步

- 新文件即本交接（提交 `6126dd06`）；[CURRENT handoff](2026-09-10-hermes-web-image-handoff.md) 顶部与 Git 段已把生产 release/rollback 从 `fa66e89e`/`d3a0da3f` 更正为 `7bf8c5e5`/`561d738b`，并加了指向本文件的入口。
- `docs/progress.md` 2026-09-18 paper-original 条目加注「所引三个资产已作为占位调试产物清除，链路证据需用真实论文图重建」；能力台账第 128 行同步加注。
- 新增只读取证脚本（`tmp/verify-scripts/`，已被忽略）：`xgs-handoff-inventory.sql`、`xgs-handoff-provenance.sql`。

## 6. 禁止 / 注意

- **不要**重跑一次性恢复/清理脚本（`tmp/goal-*.ps1`、`xgs-cleanup-my-waste.cjs`、`xgs-spool-clean-*.sh` 等）；不要盲重发付费出图。
- **不要**删除他人资产、公开 v1、已认可淡彩图、真实论文与证据；删除前先确认归属并同步文档。
- 用户当前**禁止测试/预检/CI 与全套验收**；只允许针对已知故障的最小必要定向验证，并在做之前说明范围与风险。
- 本机不跑构建/Docker/迁移；服务器只读元数据、必要时最小定向操作。
- 不读取/打印 secret；ssh 只走 `infra/scripts/ssh-run.sh`（Windows 用 `C:/Program Files/Git/bin/bash.exe`）。
- 文档提交不需要部署；生产当前 release `7bf8c5e5` 与本轮代码无关。

## 7. 新会话启动 prompt（可直接复制）

```text
接手 OpenScience（XGS）「论文配图」交付。工作树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release（branch release/onchip-production-line）。
启动顺序：读 AGENTS.md（根 + 交付树）→ project_index.md → docs/progress.md 顶部条目 → docs/handoff/2026-09-10-hermes-web-image-handoff.md（CURRENT）→ 本次交接 docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md（含未结事项与禁止动作）。
先核对 git worktree list / HEAD / git status，确认交付树干净（生产 release=7bf8c5e5、rollback=561d738b；HEAD 只比生产多出文档提交，不需要部署）。

现状（已实测，不要重新调查）：Fig. 3 的分镜 plan 8141b5fd（figurePlan=Fig.3/editorial/re-render）已 approved；把它的 scene0 交给 chatgpt-web 桥出图已连续三次 EXECUTION_FAILED（最后一次 task 9f7ff671，2026-09-18 12:29），至今没有该 plan 的真实 PNG；最后一次真实桥出图成功是 2026-09-17 的 ac455b2f。paper-original reuse 链路只跑过占位图，真实论文图从未进过该链路。

本轮任务（按此顺序，先做只读取证再决定是否花钱）：
1. 只读取证 chatgpt-web 桥：拉 openscience-chatgpt-browser 在 2026-09-18 12:2x 前后的日志与对应 spool inbox/result，确认 EXECUTION_FAILED 发生在提交 prompt 前还是图片导出阶段，并核对是否与日志中的 WebGL1 blocklist / dbus 报错时间相关。不要先重试付费请求。
2. 基于取证结论给我 2–3 个可选处置（例如：再发一次、启用显式 fallback provider、改走真实论文图上传路径），标明各自的额度/风险成本，由我选择——不要自动切换 provider 或消耗额度。
3. 顺带处理未结事项 4（Fig. 2 reuse 周期的重复 plan + 悬空 d5087b03 draft 拷贝）：先只读列出它们的影响面（是否出现在产品面），给处置建议，等我同意再动。

约束：禁止测试/预检/CI/全套验收（用户已明确纠正）；只允许针对上述已知故障的最小必要定向验证，做前说明范围；不删除他人资产与已认可图片；不打印任何 secret；文档提交不需要部署；每轮收尾交付树与根 main 的 git status --porcelain 必须为空，有改动就提交并推送。
先只读汇报第 1 步结论和你的建议，再问我选哪条路。
```

2026-09-22后续冻结：tmp/pixel-planning-timeout-review-20260922两文件实现已独立High静态PASS；root精确读回两条既有Gateway审计，actor/target/retry/thinking/promptHash/usage等资格字段均与候选一致（tmp/second-art-timeout-audit-read-20260922.json）。无测试/运行候选；等待正常交付及原页面实际续作。
