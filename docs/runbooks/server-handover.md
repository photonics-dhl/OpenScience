# Runbook: 服务器运维交接

交接对象是 OpenScience 现有服务器及其运维职责。SSH 私钥提供登录能力；公钥通常已安装在服务器上。接管还需要服务配置、代码与发布方式、数据位置、备份恢复、监控告警和外部账号权限。版本与执行窗口以 [CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md) 为准，交接包中的运行信息只是采集时的快照。

## 1. 前置检查

- 确认接收人、职责、故障联系人、可安排维护的时间，以及云资源/域名/模型账单负责人；负责人姓名和联系方式由交接双方补齐。
- 核对服务器地址、SSH 用户/端口、项目专用密钥与已有主机身份记录。不要把 SSH 权限等同于阿里云控制台、Cloudflare、GitHub 或面板账号权限。
- 从实际交付树读取 Git、CURRENT 和生产标记。线上发布、待发布候选、历史执行器及恢复状态分别记录；交接不自动授权部署、启停、轮换凭证、恢复或清理。
- 从 [服务器能力](server-capabilities.md)、[部署](deployment.md)、[备份恢复](backup-restore.md) 和 [监控](monitoring.md) 手册确认现有机制。文档中的候选方案不代表已经安装或验收。

## 2. 执行步骤

### 2.1 整理交付材料

| 材料 | 交付内容与边界 |
|---|---|
| 连接资料 | 服务器地址、用户、端口、项目 SSH 私钥/公钥、该主机已有的 known_hosts 条目；不复制其他项目或个人密钥 |
| 服务清单 | 带时间的容器、镜像、挂载、网络、systemd/timer、运行版本与回退点快照；不输出容器环境变量到聊天/日志 |
| 配置与凭证 | 仅明确属于本服务器项目的配置、环境文件、Tunnel token、TLS 文件、监控配置及开发工具服务凭证，经私有归档交付；凭证不进入 Git |
| 代码与发布 | GitHub 协作权限、交付分支、精确已推提交、部署脚本及回滚流程；源码 tar 无 Git 历史，不能替代满足发布守卫的干净 Git checkout |
| 数据与备份 | 双库、对象存储、模型卷、任务/已付费恢复材料和独立开发栈的归属、备份位置、调度与恢复证据；配置包本身不包含这些数据 |
| 监控与告警 | 监控入口、账号权限、告警接收人、已有通知通道及已知故障；不以容器 healthy 证明告警已实际送达 |
| 外部账号 | 云控制台/计费、Cloudflare Tunnel/DNS、域名注册与续费、GitHub、模型供应商、SMTP，以及 Portainer/Langfuse/Basic Auth 的账号交接状态 |
| 未决事项 | 恢复缺口、缺失的旧源码路径、未验证的登录资料、正在进行的维护与负责人；接收人签收前保持原负责人可联系 |

使用明确文件清单归档配置，不递归打包整个 `/root`、浏览器/Codex 登录态、任务 HOME、数据库卷或论文资料。私有 tar 保留原路径、uid/gid、mode；Windows ZIP 解压不会自动恢复 Linux 权限。`.htpasswd` 是密码哈希，支持恢复原认证文件，不能当作面板登录密码。

### 2.2 接收人建立 SSH 访问

交接包的 `access/` 保存项目 SSH 资料；`toolkit/.env` 保存项目连接配置，`toolkit/infra/scripts/ssh-run.sh` 为仓库原始入口。包装器固定使用 `$HOME/.ssh/id_ed25519_xgs`，并默认从脚本对应项目根读取 `.env`；也支持已有的 `XGS_CONFIG_ROOT`。安装时保留接收人现有的 SSH 配置，不覆盖已有同名密钥。

Windows PowerShell 在解压后的包根执行：

```powershell
$sshDir = Join-Path $env:USERPROFILE '.ssh'
$keyPath = Join-Path $sshDir 'id_ed25519_xgs'
if ((Test-Path -LiteralPath $keyPath) -or (Test-Path -LiteralPath ($keyPath + '.pub'))) {
    throw '同名项目密钥已存在，请先由运维核对归属；本步骤不会覆盖。'
}
New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
Copy-Item -LiteralPath './access/id_ed25519_xgs' -Destination $keyPath
Copy-Item -LiteralPath './access/id_ed25519_xgs.pub' -Destination ($keyPath + '.pub')
$knownHosts = Join-Path $sshDir 'known_hosts'
$trustedEntries = [IO.File]::ReadAllText((Join-Path (Get-Location) 'access/known_hosts'))
[IO.File]::AppendAllText($knownHosts, "`n" + $trustedEntries, [Text.UTF8Encoding]::new($false))
Set-Location './toolkit'
$previousConfigRoot = $env:XGS_CONFIG_ROOT
try {
    $env:XGS_CONFIG_ROOT = (Get-Location).Path
    & 'C:\Program Files\Git\bin\bash.exe' './infra/scripts/ssh-run.sh' 'id -un'
} finally {
    $env:XGS_CONFIG_ROOT = $previousConfigRoot
}
```

预期输出与 `access/connection.json` 的 SSH 用户一致。必须使用 Git for Windows 的上述 Bash；不要使用 WSL 或系统裸 `bash`。当前脚本采用密钥认证，不处理交互式密码。私钥仅应对接收人可读；若 Windows OpenSSH 报权限问题，核对该文件 ACL，不要放宽权限。

Linux/macOS 在包根执行：

```bash
test ! -e "$HOME/.ssh/id_ed25519_xgs" || exit 1
test ! -e "$HOME/.ssh/id_ed25519_xgs.pub" || exit 1
install -d -m 700 "$HOME/.ssh"
install -m 600 access/id_ed25519_xgs "$HOME/.ssh/id_ed25519_xgs"
install -m 644 access/id_ed25519_xgs.pub "$HOME/.ssh/id_ed25519_xgs.pub"
printf '\n' >> "$HOME/.ssh/known_hosts"
cat access/known_hosts >> "$HOME/.ssh/known_hosts"
chmod 600 "$HOME/.ssh/known_hosts"
cd toolkit
XGS_CONFIG_ROOT="$PWD" bash infra/scripts/ssh-run.sh 'id -un'
```

### 2.3 接管日常操作

1. 通过原 SSH 包装器读取 `docker ps`、关键 unit 状态、根盘余量和发布标记；从站内入口核对产品可见状态。SSH 登录成功只证明服务器访问，面板登录与业务权限需分别确认。
2. 打开 `https://portainer.428312321.xyz/nav/`，分别确认监控、流量、Portainer 的访问方式与账号；Basic Auth 与 Portainer 账号不同。Langfuse 使用原 `--development-tunnel` 入口，其独立 owner 文件也不等于密码现时有效。
3. 核对 `/var/backups/openscience/`、cron 与服务器时区；记录最新完整双库集合及对象、任务恢复材料和独立诊断栈备份的覆盖范围。保留原备份与未知 paid/UNCERTAIN 任务，不盲目重发。
4. 以 [部署手册](deployment.md#当前原生-hermes-发布入口) 为操作入口。部署必须来自干净工作树、精确已推 SHA，满足现役版本祖先和回退约束；不在本交接过程中执行。
5. 按交付包中的账号清单移交外部平台成员权限、告警接收人与续费责任。实际接收人完成验证后再签收；密钥复制不改变云资源所有权。

## 3. 回滚步骤

- 本次材料整理只读服务器，不切换应用或修改账号，因此不需要服务器回滚。接收人本机安装密钥失败时停止后续步骤，保留原有 SSH 配置，不通过重建服务器密钥修复本机 Bash/路径错误。
- 配置快照只供核对和受控恢复。需要恢复时先保存现役配置、确认目标主机及路径、属主和权限，在独立目录检查 tar 成员，再按对应服务手册恢复；不要将整个归档直接解压覆盖 `/`。
- 发布失败与故障标记按 [部署回退流程](deployment.md#3-回滚步骤) 处理；不能直接改 `.release-id`、删除 `.release-failed` 或盲重跑部署。应用回退不会撤销数据库迁移。
- 数据恢复按 [备份恢复手册](backup-restore.md) 另行安排。配置、源码、同机 DB 备份均不证明具备异机恢复能力。

## 4. 验证命令与签收

在 `toolkit/` 下，Windows 经显式 Git Bash 调用；Linux/macOS 经 Bash 调用同一脚本。以下远程命令逐条作为包装器的一个参数传入：

```text
id -un
docker ps --format '{{.Names}}\t{{.Status}}'
systemctl is-active nginx cloudflared cloudflared-watchdog.timer
df -h /
timedatectl show -p Timezone --value
cat /opt/openscience/.release-id /opt/openscience/.rollback-id
```

确认用户、容器/服务、磁盘和版本与实际现场相符。签收前由同事完成：SSH 登录、监控/面板访问、从站内入口打开目标页、定位备份、解释部署/回退步骤及逐项确认外部账号与值班联系人。完整恢复仍需取得对象、双库与任务恢复集合，并在独立环境实际验证。

交接包验收仅检查归档可读、成员完整、密钥配对、主机身份记录和快照来源；不为打包新建备份、执行恢复、发起模型任务或重跑全站测试。2026-10-15 的构建取证与私有产物位于交付树 ignored `tmp/ops-handover-20261015/`，交付结果见 CURRENT。
