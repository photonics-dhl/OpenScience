# Squid 7.2 CONNECT compatibility backport

本目录只为当前 Langfuse 镜像下载阻塞制作一次原生 RPM 回补。根因是 Squid 7.2 Bug 5520：`parseHost()` 把数字开头的域名先截成 IPv4 片段，使合法的 R2 CONNECT 目标被拒绝。上游 commit `ab5cf0c36b538627c82b3989d6c87d1668c7e081` 在一个文件中增加 2 行、删除 14 行，恢复之前的域名解析；已进入 Squid 7.3。

本轮仅静态实现，未构建、安装、重启、运行测试或连接探针。服务器事实来自前一轮只读取证：Alibaba Cloud Linux 4.0.4，发行版 `7:squid-7.2-1.alnx4.x86_64`，官方签名 key `acd3429f23f834c6`，原单元 `/usr/lib/systemd/system/squid.service`。当前官方 ALinux4 更新目录最高仍为 7.2；未发现可复用的 Squid RPM/构建缓存或宿主编译链。

## 构建来源和实际修改

- 原 binary RPM 与 SRPM 固定为 `squid-7.2-1.alnx4`，从阿里云官方更新仓库下载并保存在本次构建目录的 `inputs/`，原件保留用于回退与后续重建。复用宿主已有发行版 RPM key 检查来源，避免在容器内执行来源不明的打包指令；不导入新 key、不关闭签名检查。
- 官方 SRPM 已用本机 archive 工具静态读取 spec。保留其 Epoch 7、Version 7.2、四个发行版 patch、configure 特性、Source7 单元和全部文件清单，仅将 release 加 `.openscience.1`，并加入 `Patch001: squid-bug5520.patch` 供原 `%autosetup -p1` 应用。
- 输出主包：`squid-7.2-1.alnx4.openscience.1.x86_64.rpm`；同时保留重新打包的 SRPM 与其他生成子包。内部回补包未冒称阿里云签名包，宿主只安装这一个主包。
- 原 spec 的 `%check` 是 `%make_build check`，使用 `rpmbuild -ba --nocheck` 跳过；常规 configure/compile/link/package 属必要构建，原 spec 未被改成新测试流程。

隔离 builder 的基础镜像为 `alibaba-cloud-linux-4-registry.cn-hangzhou.cr.aliyuncs.com/alinux4/alinux4:latest`，Alibaba 官方 `alibaba/anolisa` 仓库的 ALinux4 Dockerfile 明确采用此地址。仅当本机 Docker cache 缺失时 pull；本次实际 RepoDigest 记录于 `inputs/base-image.txt` 并用于 Dockerfile `FROM`，构建期间不继续跟随 latest。

已有 Debian Node 22 镜像不含 ALinux4 的 RPM/glibc/发行版构建宏环境，不能拿它直接产出此发行版原生回补 RPM。仅新增隔离 builder，编译链和 BuildRequires 安装在该镜像内，复用现有 legacy Docker builder 与已下载镜像层；宿主不安装 gcc/rpm-build/devel 包。镜像准备复用 `with-proxy` 与 host network；编译容器非 root、无网络、无 Secret/配置/应用/Docker socket 挂载，限 2 CPU、4 GiB/无额外 swap、256 PIDs。只映射本次 `/build` 工作目录。

## 主任务的服务器执行

由主任务先完成 High 静态审阅，再把本目录传输到服务器独立基础设施目录。`SQUID_COMPAT_RELEASE` 使用这份代码的完整 Git revision，各步骤使用同一值；这里不提供虚构 revision。

1. 服务器 root 运行 `SQUID_COMPAT_RELEASE=<reviewed-40-character-revision> bash build.sh`。它只准备原包、构建镜像和 RPM，不改已运行代理。产物及完整日志保存在 `/opt/openscience-development/squid-compat/<revision>/`。已有 base 会复用；包和 source 原件只缺失时下载。保持 RPM/DNF 原有签名与依赖机制。
2. root 根据构建完成状态取回或静态审阅生成 spec/RPM 元数据。不能把 build 成功称为已修复；无需运行 `%check`、Squid parse 预检、fallback 演练或新下载探针。该目录内 `rpm-build.log` 与 `builder-image.log` 保留全量构建输出。
3. 安装原生候选：`SQUID_COMPAT_RELEASE=<same-revision> bash native-rpm.sh apply`。脚本只接受已记录的原包版本，保存当前 `squid.conf`、sysconfig、原 unit 与已有 unit drop-ins，使用 RPM 的正常依赖检查安装这个主包，不请求 DNF 更新其他宿主软件。
4. 原发行版 `%postun` 带自动 restart；脚本通过 `--nopostun` 仅推迟这一轮旧包的 postun，恢复相同配置与 unit 字节后显式执行一次 daemon-reload/restart。原 `%pre/%post` 和 RPM 依赖机制保留，原 spec 的正常权限/用户 scriptlets 仍可能运行。没有新 listener、ACL、unit 或服务架构。若 RPM 安装/启动失败，会尝试恢复原 binary RPM、快照与服务；失败时日志及包都保留，由 root 处理，不声称恢复成功。
5. 最终效果由主任务继续原来已阻塞的 Langfuse 官方镜像安装观察；不为此追加 curl CONNECT/测试矩阵。`systemctl restart` 成功只代表服务启动命令完成，不证明下载已恢复，更不证明论文内容质量。

脚本不会打印 Secret、读取 `.env`、改代理地址或 Docker daemon 配置。代理短暂重启可能中断现有出网连接；由 root 串行安排本次原生包安装，避免与其他 Squid 管理操作同时执行。

## 回退

`SQUID_COMPAT_RELEASE=<same-revision> bash native-rpm.sh rollback` 只接受当前仍是这次精确回补 NVR；安装保留的原官方 binary RPM（允许降级、正常依赖检查），恢复安装前配置/unit 并启动原服务。拒绝对后续管理员安装的其他版本执行此回退，避免 `--oldpackage` 误降级新版本。

安装前快照只创建一次，重跑不会覆盖原恢复材料。手工回退后若要再次应用，应由主任务决定复用/新的已审阅基础设施 revision；不要删除快照让脚本“过关”。不使用 `make install` 覆盖发行版文件，不新增常驻代理容器，不清除 RPM/日志/文件。

可能的运行边界：实际编译依赖解析、发行版宏、构建资源与最终主包依赖尚未运行确认；若主机另装了严格依赖原 NVR 的 `squid-doc` 子包，RPM 原生依赖检查会拒绝单主包更新，应由 root 按实际已装关联包处理，不能使用 `--nodeps` 绕过。源 spec/构建失败保留原运行服务，不猜测删配置或削减特性。

## 官方依据

- [Squid 上游修复 commit](https://github.com/squid-cache/squid/commit/ab5cf0c36b538627c82b3989d6c87d1668c7e081)、[PR 2283](https://github.com/squid-cache/squid/pull/2283)、[Squid 7.3](https://github.com/squid-cache/squid/releases/tag/SQUID_7_3)
- [原 ALinux4 source RPM](https://mirrors.aliyun.com/alinux/4.0/updates/source/Packages/squid-7.2-1.alnx4.src.rpm)、[原 binary RPM](https://mirrors.aliyun.com/alinux/4.0/updates/x86_64/os/Packages/squid-7.2-1.alnx4.x86_64.rpm)
- [Alibaba 官方项目使用的 ALinux4 Docker base](https://github.com/alibaba/anolisa/blob/main/src/skillfs/container/Dockerfile.alinux4)

主任务统一登记索引、服务器能力清单、CURRENT handoff 和原代理故障记录；此包不成为第二套代理运维平台。
