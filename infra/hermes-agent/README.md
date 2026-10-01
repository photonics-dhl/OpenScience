# 原生 Hermes 适配

Hermes是已安装的NousResearch Hermes Agent；本目录保留上游`AIAgent.run_conversation`循环，适配客户端工厂和任务执行边界，不实现替代Agent。当前为接入切片，尚无生产launcher或产品任务路由；完整目标和边界见[接入计划](../../docs/plans/2026-10-01-native-hermes-agent-plan.md)，线上状态只见[CURRENT](../../docs/handoff/2026-09-10-hermes-web-image-handoff.md)。

`task_agent.py`为真实上游类创建薄子类；每次客户端工厂创建独立httpx transport，SDK禁重试，使用已安装运行时的非流式路径。广告与实际执行白名单一致；原生Skill handler保留，但每次dispatch先授权，授权回调失败会归一为`NativeTaskStopped`以终止该进程。应在原生构造完成工具发现后包装实际registry，且每任务独立进程，不能共享全局registry。Skill正文和引用文件只能读取任务只读目录内唯一选定Skill；无模型可控宿主路径。

`offline_native_loop.py`仅作零外呼验证：清空继承环境、创建临时任务profile，禁止socket连接；真实原生工具读测试Skill正文/引用与模拟来源，再完成模型轮。`offline_gateway.cjs`用实际Gateway/Anthropic适配器和假HTTP响应，把原生SDK与Gateway完整接成一条链；不调用真实模型、数据库或浏览器，也不评价论文科学质量。运行目录必须为自有ignored tmp或服务器私有临时目录；不能在原生安装目录执行测试。

本机适配边界：

```text
python -m unittest discover -s infra/hermes-agent -p test_task_agent.py
node --check infra/hermes-agent/offline_gateway.cjs
```

服务器实际原生验证需已核实的原生venv、本切片构建的Gateway JS，以及同生产release的受控Node依赖。将适配文件和Gateway JS复制到自有临时目录的`gateway-dist/`，不修改已安装Agent或生产release；从该临时目录执行：

```text
/opt/hermes-agent/.venv/bin/python offline_native_loop.py offline_gateway.cjs /opt/openscience-releases/<CURRENT_APP_SHA>/packages/ai-gateway/node_modules
```

预期五次SDK往返、四次原生工具调用、完整引用和opaque签名保留、关闭后客户端重建、`externalProviderCalls=0`、`gatewayRoundTrip=true`。这些是工程接线证据；实际权限/租约持久状态、生产进程隔离、真论文理解及图像质量仍按后续切片验收。
