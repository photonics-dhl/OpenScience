# Hermes / Workbench CURRENT Handoff

## 当前任务与已确认方向
- 用户最新要求：贡献说明 → 核心概念图/视频（始终有占位；多图采用HTML幻灯片）→ 六字段精华 → 折叠附件、证据、历史。对齐网格、冷白/墨色/青绿风格，Hermes是主要操作入口。
- 已授权项目设计skills安装、本次服务器真实带图流程、代为科学审核及公开发布。不得恢复本机测试、全仓回归、CI、视频生成或批量冷启动。
- 工作树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release。根目录其他脏文件不碰。
- 基线 docs/OpenScience_Kimi_Development_Spec.md；设计 docs/specs/2026-09-05-integrated-research-product-design.md；服务器先读 docs/runbooks/server-capabilities.md。

## 精确版本
- 应用 release 9c5088ea72b88f40be1a4809216813caf34f0627；rollback 1a862027a76d6065cf3087b8eef93428672821b9；静默持续更新任务与retry空JSON已完成服务器构建/启动/切换，exit0，未合并main。
- 生图 provider d1630135d569d28364d295380bb4e0333c3ee264，独立部署exit0；rollback 92cc416ee3fe921f62c75cbe6f69e48d0b55227d。source HEAD=d1630135，后续docs-only提交不等于应用release。
- provider独立更新；Chrome/profile/登录复用，无新安装或账号轮换。Gateway源与f483完全未变，复用其已编译dist；不能复用/opt/openscience根目录的旧dist（缺少当前导出，曾使新broker启动失败，已纠正）。
- broker新修已部署：提交后不再自动重启整个浏览器；单任务uncertain保留在任务ledger，不再全局拒绝新UUID。submitted防重发、原会话恢复、host flock、限额/PNG/科学审核均保留，Sol High与Chat6Pro定向复核。未决旧会话页不再被新任务自动关闭；只关闭helper/未发送/已有PNG的旧页。

## 本轮已交付
- 应用1a：媒体优先、图视频稳定占位、共享网格、HTML多图单帧轮播/键盘翻页、真实图片放大。仅单图实际流程已运行，多图未做真实样本验收；不是独立可下载HTML文件。
- 公共页仅使用精确已发布版本的approved素材；SVG仍为原安全下载，不内嵌。Sol medium实现、Sol high独立静态复核。
- 项目内安装apple-design、emil-design-eng、design-artifact、html-prototype，保留完整引用/许可与固定来源SHA，登记索引。frontend-design及AGENTS已固化布局与使用要求。
- image路由修复：scene.image仅接受空instruction，修改指令必须storyboard.revise；现有视频协议未改。版本/方案读取已绑定当前会话和成员授权，不能引用其他RO。
- provider92cc：主图识别与缩略图分开，旧唯一按钮兼容；Save菜单点击Download image，取当前主图而非整组下载。既有任务、会话、submitted marker和原deadline均保留。
- 本机Git Bash回读曾因继承PATH查找挂住；本任务临时限定PATH后恢复，不宣称系统级修复。CUA一次超时不能代表服务器Chat不可用。

## 当前真实论文与成果
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8，deep-sub-cycle pulse。
- v7=f4e2dc71-1fe8-406f-8c19-e1849503d698；草稿修订11。六字段由服务器Hermes凝练并自动保存；仅人工删除results的一句无依据概括。104条既有Evidence及原PDF/高级解析复用，无重跑OCR。
- 已审单场景方案1582087a-e93c-40d0-a721-c3d2bcb00f41曾经Chat6Pro批准进入生图。
- 真实图片任务/资产e0f842fa-8917-445a-aea0-88dc09ad6e71，源plan158/scene0，已succeeded入库draft（executionAttempt2，retryCount1）。
- 原Chat https://chatgpt.com/c/6aa3f53d-9318-83ea-9625-dbb3f4aa2411 已产生图片。下载器旧按钮计数/Save菜单故障曾导致任务failed。按明确故障分别归档该任务失败恢复marker一次；从原会话取回，未重发prompt。gateway验证同任务/同prompt结果后经现有retry接口恢复入库。
- 原图1672×941/847730bytes；服务器 /jobs/e0f842fa-8917-445a-aea0-88dc09ad6e71/output/image.png；本机静态副本 C:/Users/Mac/AppData/Local/Temp/xgs-core-image-e0.png。
- e0成图暂不能公开：z空间轴贯穿E(t)图、S(z)未标明。主与Chat6Pro均要求两点修正；/jobs/core-image-science-review-20260911.txt。不得用方案审核代替实际图审核。
- 修订plan43cc8da1-4f62-4579-958c-ad3fb3b57f3c引入错误（入射k变出射k、水平电子z变竖轴），不能采用。随后服务器生成plan3a6ed136-002a-4301-8505-ca14e3dbbc53，已通过Hermes对话采用（PATCH200 approved）；左右轴独立、k入射竖直/电子水平。43cc及e0均已对话拒绝（PATCH200 rejected）。修正图任务fe764f82-959d-46f3-8ec0-8dce61ca17bd已提交一次，running，created2026-09-11T13:20:43.792Z；不要重发。
- 原1f3c8255-cacf-45e3-ac9c-28e3f6e0590a是错误路由产生的interactive_html，不是图片；禁止误记为生图成功。
- 更早fd719902旧图FWHM画成横向几何宽；8fcbe321旧plan光/电子同z却正交、非零面积；4017673f即使approved也不科学正确。以上不继承或发布。
- 旧公开OSR-2026-000020/v/2是旧内容，不是本次新版样例；v7尚未公开。

## 续做（不得重复已完成生成）
1. fe764f82原Chat完成空白回复；刷新/原会话恢复无PNG，产品failed、provider uncertain。用户明确要求尝试新对话；726f21c5在网页提交前被全局circuit拒绝（未生图）。Sol High复核后，锁内按state/taskId/promptHash/reason精确归档fe的circuit，旧记录与可能迟到结果仍保留。新任务02ec70bf-2add-4a3b-952a-74d990a6c1ce于13:42:04Z由Hermes提交202，沿用已审3a方案；不要重复发送。
2. 02ec70bf未提交网页即failed：新页renderer不响应，刷新后恢复控制但其中一页ERR_EMPTY_RESPONSE。13:46已观察到Chat主页/编辑框实际可用，沿用产品原生成API新建b19a65bd-6497-4b61-bb81-0154b264d58c（202），页面已切换此task。不得重发；等实际图并科学审核。直接API创建的这笔不冒充新一轮Hermes对话，prompt仍由已审Hermes方案与服务器组装。
3. b19新Chat6aa4065f已实际出现50%但再次空白结束；provider uncertain，无PNG。停止新生成；这不是完全走通。Chat6Pro建议先去掉自动整浏览器重启/全局熔断，现有证据不能区分Chat生成失败与附件回传异常，也不能证明重启取消后台任务。
4. 上述broker独立部署已完成（复用92cc已编译Gateway，源diff0）；下一步只针对新策略下的实际回传问题取证：Chat6Pro建议区分生成失败与图片引用/资源加载失败，不靠空DOM推断根因。不要自动再生成。原会话有图后才能科学审核、公开发布，旧图rejected保留。没有测试、CI或本机构建。
5. 暂停视频与批量冷启动。本轮尚未完成全部公开流程。

## 现有控制入口
- 服务器容器openscience-chatgpt-browser，CDP127.0.0.1:9233，/app/node_modules/playwright-core。
- 普通规划/科学复核Chat6Pro：https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581；已有两轮规划、两轮方案/实图科学讨论，不重复发送。
- 13:35读取我们新增的只读/images/标签挂起，使Playwright全浏览器连接超时；精确关闭该标签后连接立即恢复。不是全部Chat不可用，不重启Chrome或重新登录。
- noVNC http://127.0.0.1:6081/vnc.html?autoconnect=true&resize=scale；file:///jobs/ro-product-preview-20260911.html仅历史样稿。
- SSH使用infra/scripts/ssh-run.sh；Windows明确Git bash，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS。禁止读取/输出.env、Cookie、密码/OTP。
- 本轮部署日志 C:/Users/Mac/AppData/Local/Temp/xgs-core-media-deploy-20260911.log。
