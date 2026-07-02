# @slidev-ppt/build-worker

发布态构建 worker：消费 BullMQ `build` 队列，执行 `slidev build`，产物上对象存储/CDN，写回发布元数据。

## 流程

1. web `POST /api/ppt/publish` 入队 `{ pptId, doc, components }`。
2. worker 拾取 job：
   - `contentHash(doc, components)` 查 Redis 缓存 → 命中则复用已发布产物，秒回。
   - 未命中：`runSlidevBuild` 在隔离临时目录构建（写 MD → 装主题 → 软链启用组件 → `slidev build`，超时 `BUILD_TIMEOUT_MS`）。
   - 产物整目录上传对象存储（`storage.uploadDir(dist, 'p/<pptId>')`）。
   - 收紧产物 CSP（HTML 入口注入 meta；CDN 层应另设响应头）。
   - 写回 `PublishRecord`（status=published + publicUrl）到 Redis，建立 hash→pptId 映射。
3. web `GET /api/ppt/:id` 读 Redis 返回状态与公开 URL。
4. 访问公开 URL 走 CDN → 对象存储，**不经过 Node 进程**。

## 并发与隔离

- 并发上限 `BUILD_CONCURRENCY`（默认 4，建议 4-8，硬上限 8）。
- 每个 build 在独立临时目录进行；超时杀进程释放队列槽位。
- 生产环境构建应在隔离容器内运行（cgroups 限资源），本 worker 负责超时与产物隔离。

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `REDIS_URL` | Redis 连接（队列 + 发布元数据） | `redis://localhost:6379` |
| `BUILD_CONCURRENCY` | 并发构建数（1-8） | `4` |
| `BUILD_TIMEOUT_MS` | 单次 build 超时 | `120000` |
| `COMPONENTS_DIR` | 内置组件源目录 | `packages/components/src` |
| `SLIDEV_BIN` | slidev 命令（镜像预装时覆盖） | `npx slidev` |
| `OBJECT_STORAGE_ENDPOINT` / `OBJECT_STORAGE_BUCKET` | S3 兼容对象存储（OSS/COS/MinIO） | 无 → 本地文件系统回退 |
| `OBJECT_STORAGE_REGION` / `OBJECT_STORAGE_FORCE_PATH_STYLE` | 区域 / path-style（MinIO 置 true） | `us-east-1` / `false` |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | 凭证 | — |
| `CDN_BASE_URL` | CDN 域，拼公开短链 | 无 → 回退 endpoint 直链 |
| `LOCAL_STORAGE_ROOT` | 无 OSS 时本地产物目录 | `.storage` |

## 缓存命中策略

`contentHash = sha256(serializeSlidev(doc) + '|' + theme + '|' + sorted(components))`。

- web 入队前先查 hash 缓存，命中直接返回已发布 URL，不入队（秒回）。
- worker 拾取后二次查缓存（防止并发重复构建），命中则复用。
- 命中写入 `PublishRecord.cached = true`。

## 产物访问路径

`<CDN_BASE_URL>/p/<pptId>/`（无 CDN 时 `<ENDPOINT>/<BUCKET>/p/<pptId>/`，本地回退 `/p/<pptId>/`）。
