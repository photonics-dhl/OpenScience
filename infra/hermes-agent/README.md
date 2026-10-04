# 原生 Hermes 适配

Hermes是已安装的NousResearch Hermes Agent；本目录保留上游`AIAgent.run_conversation`循环，适配客户端工厂和任务执行边界，不实现替代Agent。候选已接原source任务、Domain私有检查点与科学物化，并提供不可变安装器和退出清理。完整目标和边界见[接入计划](../../docs/plans/2026-10-01-native-hermes-agent-plan.md)，线上状态只见[CURRENT](../../docs/handoff/2026-09-10-hermes-web-image-handoff.md)。

`task_runtime.py`在每任务DynamicUser进程中调用实际Agent，通过唯一只读挂载UDS接Worker；配置绑定unit实例的任务ID/租约代际和固定运行时/Skill目录。`host_broker.py`只接收两个身份字段，固定模板启动，先把socket inode钉在root目录；没有任意命令、环境或模型可控挂载。模板隔离主机HOME、spool、网络和凭据；broker确认固定unit无进程及排队Job、通知Worker或确认原socket无监听后，清理自己的StateDirectory和IPC，保留小型结束收据防止同实例重启。

Worker的`native-agent/session.ts`保留完整Provider续传和每轮started/completed检查点；已完成回答可以按原请求重放，未知提交不重发。`paper-tools.ts`复用原SourceMap段号并返回实际页图。`host-task.ts`逐个授权调用，绑定工具输出/像素，只有无剩余工具调用的最终保存回答可结束；SDK传输封装上限与Gateway实际供应商请求额度分别检查。原生返回终答会trim，host仅允许外层空白归一，返回保存的原字节供科学物化/Hash；不删think或改JSON。实际原生0.10.0、独立冻结快照、私有Store和科学物化已完成11轮零外呼整合；数据库/存储及Provider的外部边界为夹具，不证明生产数据库、真实论文或图像质量。M3任务使用原生配置的512K容量，压缩器保持启用；压缩后完整历史兼容仍未验证，当前严格停止而不盲重发。

`task_agent.py`为真实上游类创建薄子类；每次客户端工厂创建独立httpx transport，SDK禁重试，使用已安装运行时的非流式路径。广告与实际执行白名单一致；原生Skill handler保留，但每次dispatch先授权，授权回调失败会归一为`NativeTaskStopped`以终止该进程。应在原生构造完成工具发现后包装实际registry，且每任务独立进程，不能共享全局registry。只读配置保留参数相同但ID不同的每个工具调用；上游默认去重会丢失完整Provider续传中的调用身份，因此此处禁用该去重，每个调用仍独立授权。不得把该适配用于写入或付费工具。Skill正文和引用文件只能读取任务只读目录内唯一选定Skill；无模型可控宿主路径。

`offline_native_loop.py`仅作零外呼验证：清空继承环境、创建临时任务profile，禁止socket连接；真实原生工具读测试Skill正文/引用与模拟来源，再完成模型轮。`offline_gateway.cjs`用实际Gateway/Anthropic适配器和假HTTP响应，把原生SDK与Gateway完整接成一条链；不调用真实模型、数据库或浏览器，也不评价论文科学质量。运行目录必须为自有ignored tmp或服务器私有临时目录；不能在原生安装目录执行测试。

本机适配边界：

```text
python -m unittest discover -s infra/hermes-agent -p "test_*.py"
node --check infra/hermes-agent/offline_gateway.cjs
npx pnpm@9.15.0 --filter @openscience/agent-worker exec vitest run test/native-agent-session.test.ts test/native-paper-tools.test.ts test/native-host-task.test.ts
```

UDS回归在Linux运行，Windows跳过；broker inode/mode攻击回归需要Linux root（不启动systemd或模型），CI使用`sudo python3 -m unittest discover -s infra/hermes-agent -p test_host_broker.py`。

## 已安装运行时的生产接入

任务清空环境后固定模型client/stale期限610秒，与既有UDS610秒衔接；Worker请求上限仍600秒，原预算不变。父线程未取得有效SDK回复或收到原生TimeoutError时沿既有停止信号结束，不进入SDK通用坏响应重试；以原付费回执为准，不据停止推断未提交/未计费。

科学catalogue在scientific-critical-thinking根Skill直接呈现已有七条共享证据对齐规则；作者和reviewer首次通过`skill_view`读根即可取得，专项原方法仍按需加载。`references/source-evidence-alignment.md`保留同源独立副本供兼容，不要求为同一内容重复读取。主线选择依研究类型与原文，当前论文仅为验收样本；生成文件/加载证明不能代替跨论文科学效果。

Native分镜的数量语法和有界诊断按首帧已保存的实际科学工具描述选择；旧描述/未知描述保持旧解析与原反馈，新描述才识别图表结构引用和独立数值–Hz单位跨度。执行和finish重建用同一选择，成功/失败回执均严格全等；原来源/单位/数量校验、必填nullable与输出额度不改。

前置：source候选独立High与精确CI通过，按现有deploy脚本完成干净已推SHA的构建/启动；先保留当前生产和回退身份。安装前timer/broker/原生任务须自然排空，不能停止活动论文进程。已有原生任务时须保留原marker绑定的运行时与Skill目录，不能用新配置冒充旧执行。

受控构建后从该不可变release生成现有`release-input-manifest.mjs runtime-snapshot`收据，root保存且禁止普通用户修改；安装器先验证source与这一既有runtime收据，再执行已构建科学方法导出。`python3 -B install.py --source /opt/openscience-releases/<FULL_SHA> --runtime-snapshot <PROTECTED_BUILD_RECEIPT> --defer-timer`只复制服务器已安装Agent/依赖及项目Skills，不下载依赖、不改全局记忆、不调用模型。快照链接限本副本或已挂载的只读系统依赖。

入口在导入本地helper前禁写bytecode，避免向已验证release新增缓存；建议同时以`python3 -B`运行。校验前失败可能尚无`previous/state.json`，须核实原unit/runtime/timer再恢复，不能假定backup已经生成或重建manifest掩盖额外文件。

安装始终defer：原units、非秘密`runtime.env`及timer enable/active状态保存在release的`previous/`。随后用相同release Compose重建API/Worker，确认启动健康、它们的非秘密runtime/catalogue身份和Worker inbox挂载，再启动固定`openscience-hermes-broker.timer`。只有此后允许新产品动作创建原生任务；旧未标记任务仍沿原路径。

安装失败会恢复旧units/env、daemon-reload，先撤销本次enable再恢复原层级，最后恢复原active状态。应用切换失败时：停止新timer并等已启动原生任务自然结束，按`previous/state.json`逐项恢复原文件或删除首次安装新增文件，恢复daemon和原timer层级/active，再沿既有应用rollback。若新原生付费任务已提交，保留能理解其marker/检查点的应用和运行时直到终态，优先前向修复；不交给旧Worker、不重置或重发unknown。禁止按目录年龄删除原运行时、真实论文和回退副本。

服务器实际原生验证需已核实的原生venv、本切片构建的Gateway JS，以及同生产release的受控Node依赖。将适配文件和Gateway JS复制到自有临时目录的`gateway-dist/`，不修改已安装Agent或生产release；从该临时目录执行：

```text
/opt/hermes-agent/.venv/bin/python offline_native_loop.py offline_gateway.cjs /opt/openscience-releases/<CURRENT_APP_SHA>/packages/ai-gateway/node_modules
```

预期五次SDK往返、四次原生工具调用、完整引用和opaque签名保留、关闭后客户端重建、`externalProviderCalls=0`、`gatewayRoundTrip=true`，两个相同只读调用的ID/结果完整续传，第二次撤权立即终止且不产生下一模型轮。这些是工程接线证据；实际权限/租约持久状态、生产进程隔离、真论文理解及图像质量仍按后续切片验收。
