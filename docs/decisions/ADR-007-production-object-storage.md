# ADR-007 — 生产对象存储采用 SeaweedFS S3 模式

- Status: Accepted for implementation
- Date: 2026-08-09

## Context

生产上传首次真实 E2E 在 `POST /research-objects/:id/ingest` 返回 500。脱敏运行时探针确认生产容器未设置任何 S3 字段，SDK 回退到容器内 `127.0.0.1:9000`；生产 compose 又没有对象存储服务，因此 Artifact Blob 无法持久化。

原开发栈使用 MinIO，但 MinIO 社区仓库已在 2026-04-25 归档，社区版改为 source-only distribution，历史预编译 release 不再维护。把旧镜像直接带入新生产环境会形成已知供应链与补丁风险。

## Decision

1. 单 ECS 阶段生产对象存储采用 SeaweedFS `4.41` 的单节点 `weed mini` S3 模式。它是持续维护的 Apache-2.0 项目，官方 quickstart 支持 Docker、凭据和预建 bucket。
2. 服务仅加入 `data_net`，不映射宿主端口；API 与 agent-worker 通过 `object-storage:8333` 访问。
3. 数据写入独立命名卷 `seaweed-data`；S3 access key、secret key 与 bucket 只在服务器 `.env.prod` 生成，不进入 Git、日志或 Agent 上下文。
4. 业务层继续复用 `packages/storage` 的 S3-compatible adapter。现有类名 `MinioStorageAdapter` 是 SDK 实现细节，不代表生产服务必须是 MinIO；后续重命名应作为无行为变更的独立重构。
5. 镜像固定为 `4.41@sha256:43b768cd62b00d132439cda881b93fd1adebf1b315e996e794087743821d771d`；上线必须通过 compose config、容器 health、put/head/get、真实 ingestion 和备份恢复门禁。

## Alternatives considered

- **MinIO legacy image**：协议成熟，但社区二进制不再维护；拒绝作为新生产基线。
- **MinIO AIStor Free**：需要额外许可证生命周期，且未纳入当前 Secret/续期流程；暂不采用。
- **阿里云 OSS**：长期可取，但当前 `oss` driver 尚未实现，且没有经审核的 RAM 最小权限凭据；留作托管化迁移方向。
- **Garage/RustFS**：均可提供 S3 协议，但当前项目已有 SeaweedFS 官方单容器路径所需的最小配置，新增复杂度更低。

## Consequences

- 生产上传不再依赖不存在的 localhost MinIO，Blob 可以在 API 与 worker 间共享。
- 单节点对象存储与 ECS 同故障域，必须纳入每日备份；在对象备份/恢复证据完成前，不能宣称达到高可用。
- SeaweedFS `mini` 适合当前单 ECS 产品阶段；横向扩展或迁移 OSS 时保持 S3 key 与 Blob SHA-256 不变。

## Sources

- [SeaweedFS official README](https://github.com/seaweedfs/seaweedfs/blob/master/README.md)
- [SeaweedFS Apache-2.0 license](https://github.com/seaweedfs/seaweedfs/blob/master/LICENSE)
- [MinIO community repository status](https://github.com/minio/minio)
- [MinIO final legacy security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z)
