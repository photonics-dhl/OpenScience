# Official Skills CLI

独立容器包装官方 `vercel-labs/skills` npm 包 `skills@1.5.26`，对应上游源码 `d667282815248da03a08a18272b5d2eef9caf77c`。只暴露项目范围的 `list` 与带关键词的 `find`；不创建 marketplace，不执行 add/use/update/remove/init/sync，不修改全局技能或安装第三方 skill。

2026-09-14已在服务器生成并提交锁文件、构建及实际使用：list返回31个项目技能，find返回科学插画候选。`Source: local / Agents: not linked` 是官方CLI登记状态，不代表Codex原生发现或Hermes加载失败；实际消费另查产品代码与provenance。当前镜像/源版本见CURRENT。

## 服务器安装

将本目录复制进版本化基础设施目录后，服务器 root 设置 `SKILLS_RELEASE=<完整基础设施提交>` 并执行 `bash install.sh`。脚本复用已有 Node 基础镜像及 Docker 构建层；适配现有 legacy builder，不要求 BuildKit/buildx。

第一次只在服务器生成独立 pnpm 9.15.0 lock，随后 Docker build 使用 frozen lock 与 `--ignore-scripts`；不会执行官方仓库的 husky、build、test、prepublish 等开发脚本。npm 发布包已包含 CLI 构建产物；保留其 `tar^7.5.20`、`yaml^2.8.3` 运行依赖并让 pnpm 锁定整个依赖树。以后复用取回的 lock，不每次重新解析版本。

依赖下载和镜像构建使用服务器既有 `with-proxy` 与 host network，使容器能访问已有 `127.0.0.1:7891` 出口。脚本不新增探针或测试；`with-proxy` 本身仍采用已有代理选择逻辑。基础镜像禁止自动 pull，缓存版本缺失或过旧时由主任务按现有资源台账处理，不更新全局 Node。

官方 CLI 要求 Node ≥22.20；本 wrapper 用 Node 22.21+，因为关键词查找的原生 `fetch` 使用官方 `--use-env-proxy`（22.21 才支持），避免声明了 HTTPS_PROXY 却实际直连。只在 package engines/安装中声明运行要求，不添加额外运行预检。

## 使用

由主任务设置 `SKILLS_PROJECT_DIR` 为已准备的 OpenScience 只读源码快照绝对路径；该快照应包含现有 `.agents/skills` 与项目 skill lock（若已有），不包含 Secret、`.env`、用户 home、生产运行数据或论文附件。CLI工作目录为快照根目录。项目目录以只读 bind 挂载；不挂 Docker socket、主机 home 或凭据。

```sh
SKILLS_RELEASE=FULL_INSTALLED_IMAGE_COMMIT SKILLS_PROJECT_DIR=/path/to/existing/project-snapshot bash run.sh list
SKILLS_RELEASE=FULL_INSTALLED_IMAGE_COMMIT bash run.sh find "scientific illustration"
```

`list` 在 `--network none` 下直接运行官方默认项目列表，输出官方终端文本，不承诺 JSON。它不会列本机 Codex 全局 skill，除非该技能本来就在这个项目快照中。已有三个 Baoyu 包与自有 skill 原样保留；快照中缺失的技能不从其他目录猜测补装。

`find` 只把显式关键词发给官方 `https://skills.sh/api/search`，使用既有服务器出口。不要把私人论文正文、项目 Secret 或用户信息当搜索词。它是官方公共技能搜索，不是本项目/产品内部能力检索，也不安装结果。调用无 TTY、stdin 为 `/dev/null`，必须有非空关键词；不会触发官方空查询交互搜索中“选择后安装”的分支。结果中的 `npx skills add ...` 是上游提示，不是此 wrapper 执行的动作。

官方 search 在请求失败时也可能输出“No skills found”；这不能证明外网搜索成功或市场确无结果。不得据此声称接入经过测试。容器退出即结束，非 root、只读 rootfs、限 256 MiB/0.5 CPU/32 PIDs；无服务端口、后台任务或常驻服务。`DO_NOT_TRACK=1` 与 `DISABLE_TELEMETRY=1` 关闭官方 CLI 统计上报；关键词 search 本身仍需网络。

## 与 OpenScience Hermes 的关系

CLI list 证明它能发现项目目录中的技能，不能证明本产品 Hermes 加载或使用了技能。上游支持的 `hermes-agent` 是另一个产品的适配名，不用于指代 OpenScience Hermes，也不写该 agent 的目录。

本项目已安装的三个 Baoyu 包及自有 skill 保持不变；Hermes 的真实消费仍需按 `apps/agent-worker/src/skills/installed-media-skills.ts` 和已有资产 provenance/任务结果取证。这里不增加 agent-worker 调用，也不把 CLI 安装状态写成产品能力状态。主任务统一更新 project_index、能力台账与 CURRENT handoff。

撤回时停止调用该独立镜像即可；无项目 skill 写入、应用部署、数据库变化或额外文件删除。

## 官方来源

- [固定 revision 的 package.json](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/package.json)
- [官方项目 list 实现](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/list.ts)
- [官方 find 与交互安装分支](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/find.ts)
- [官方 telemetry 开关](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/telemetry.ts)
- [Node 22.21 原生代理支持](https://nodejs.org/en/blog/release/v22.21.0)
