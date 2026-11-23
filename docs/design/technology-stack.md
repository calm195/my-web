# 技术栈与工程结构

版本：1.1，2026-11-23。首版选定以下路线，不使用 Java；“轻量”落实为少运行组件、明确依赖和单机可维护，不省略版本、权限和同步一致性设计。

## 1 选定组件

| 层 | 选定技术 | 用法与范围 |
| --- | --- | --- |
| 公开前端 | Nuxt 4、Vue 3、TypeScript | 独立 Node SSR 服务；页面路由、SEO 元信息、阅读和互动 |
| 管理前端 | Vue 3、Vite 8、Vue Router 4、TypeScript | `/admin/` 静态 SPA；不引入另一个 SSR 服务 |
| 页面样式 | CSS 变量、Vue scoped CSS、共享基础组件 | 沿用现有温暖简洁原型；不以大型 UI 库覆盖整站风格 |
| 编辑器 | 原生 textarea、独立 Markdown 预览面板 | 首版满足 Markdown 编辑；代码编辑器增强后续再加 |
| 状态管理 | Nuxt `useState` / `useAsyncData`；管理端 composable | 局部表单归组件；会话与全局提示集中管理；首版不加通用全局 Store 库 |
| HTTP 客户端 | 原生 fetch 封装、OpenAPI 生成的 TypeScript 类型 | Nuxt SSR 取数经 `useAsyncData`；管理端使用统一错误与重试规则 |
| 前端运行时 | Node 24 LTS | 公开前端常驻；开发与 CI 使用同一精确补丁版本 |
| 前端包管理 | pnpm workspace | 前端子模块一个锁文件，根编排另有锁文件；Nuxt 自己管理其构建器依赖，不强制覆盖为管理端 Vite 版本 |
| 后端语言 | Go 1.27，初始化基线 1.27.4 | `net/http`、`database/sql`、`log/slog`；模块化单体 |
| 数据库 | SQLite 3、`modernc.org/sqlite` | 无 CGo 驱动；WAL、STRICT 表、外键、短写事务；不使用大型 ORM |
| 数据库迁移 | `github.com/pressly/goose/v3` | SQL 迁移，发布前单独执行，应用只检查 schema 版本 |
| Markdown | Goldmark v1、兼容的代码高亮扩展、bluemonday | Go 单一渲染清洗管线；v1 作为保守兼容基线，扩展组合必须验证 |
| 认证 | Cookie 会话、Argon2id（`golang.org/x/crypto/argon2`） | 单站主，无 JWT/访客账号/OAuth |
| 标识 | UUID v7，使用维护中的成熟 UUID 库 | UUID 只作标识；排序和并发不能依赖其生成时间 |
| 同步 | Git CLI、SQLite outbox、Go 内串行仓库执行器 | 普通 push、共同版本比较、租约恢复，不引入消息队列 |
| 图片 | 私有本地原图、按摘要寻址；Go 解码和派生缩放 | JPEG/PNG/WebP 输入，派生 JPEG/PNG；不要求外置图片服务 |
| 部署 | Caddy 2 + systemd | 一个 Nuxt 进程、一个 Go 进程和管理端静态目录；不要求容器平台 |
| 验证 | Go testing/httptest、Vitest、Playwright、OpenAPI/JSON Schema 校验 | 状态与边界用例优先；不用只复述实现的测试凑覆盖率 |

Nuxt 默认支持服务端渲染；Node 官方将 24 列为 LTS，本项目选用该线而非要求追随最新大版本。[Nuxt 官方](https://nuxt.com/docs/4.x/getting-started/introduction)、[Node 生命周期](https://nodejs.org/en/about/previous-releases)。Go 官方发布记录列出 1.27.4；Vite 8 已有稳定发布记录。[Go 发布记录](https://go.dev/doc/devel/release)、[Vite 8](https://vite.dev/blog/announcing-vite8)

数据库与迁移组件的能力依据其官方文档，业务事务仍由项目实现。[modernc SQLite](https://pkg.go.dev/modernc.org/sqlite)、[Goose](https://github.com/pressly/goose)。Markdown 清洗和密码处理分别使用对应库提供的能力，具体策略由本项目限制。[Goldmark](https://github.com/yuin/goldmark)、[bluemonday](https://github.com/microcosm-cc/bluemonday)、[Argon2](https://pkg.go.dev/golang.org/x/crypto/argon2)

## 2 版本锁定规则

以上锁定技术和主要版本路线；工程初始化时选择当时受支持、相互兼容的精确补丁版本，写入 `go.mod/go.sum`、`package.json`、`pnpm-lock.yaml` 和工具版本文件，不使用生产 `latest`。

- Node、pnpm、Go 工具链精确固定；CI 和本地使用同一版本。TypeScript 使用通过 Nuxt、Vue 类型检查验证的精确兼容版本。
- 已安装的本机工具不自动成为项目标准；本轮没有升级全局 Node、Go 或 pnpm。
- SQLite 驱动锁定后在 Go 程序中执行 `SELECT sqlite_version()`，确认实际引擎包含所需修复；设计验证用的系统 SQLite 不代表生产驱动版本。
- 依赖升级必须说明影响，重新执行相关构建、类型和行为检查；安全修复优先，禁止无理由一次升级全部依赖。
- 运行环境只部署产物及必要运行时；不在服务器现场安装前端开发依赖或构建页面。

## 3 应用代码仓库

根仓库统一维护合同、文档、编排、跨服务验证与部署配置；前端和后端分别为独立 Git 仓库，以子模块纳入根仓库。三个仓库主分支均为 `main`。一个根提交固定合同和两个子模块提交；不使用额外的版本组合清单，不自动跟随子模块分支。

```text
.gitmodules                # 前后端子模块地址与路径
AGENTS.md                  # 公共开发和协作规范
contracts/                 # 唯一 OpenAPI、内容 schema 与正反例
docs/                      # 唯一需求、设计、开发计划与验收记录
scripts/                   # 合同/字典生成、开发编排与跨仓库检查
tests/                     # 跨进程集成与真实浏览器用例
deploy/                    # Caddy、systemd、环境变量示例
frontend/                  # 独立 Git 子模块
  AGENTS.md                # 前端补充规范，引用根规则
  apps/web/                # Nuxt 公开站；server 仅渲染配置，无业务 API
  apps/admin/              # Vue + Vite 管理端
  packages/api-client/     # 根 OpenAPI 生成类型与手写请求适配器
  packages/ui/             # 设计 token 和必要基础组件
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
backend/                   # 独立 Git 子模块
  AGENTS.md                # 后端补充规范，引用根规则
  cmd/api/                 # HTTP + 受控后台执行器
  cmd/site-admin/          # 初始化账号、改密、诊断等运维 CLI
  internal/{auth,content,comments,media,taxonomy,sync,jobs,settings}/
  internal/{httpapi,store,config}/
  migrations/              # 不可修改的已应用 SQL 迁移
  go.mod
  go.sum
var/                       # 忽略的工具、运行数据与本地 bare 镜像
```

P1 已建立 `frontend/apps/web`、`frontend/apps/admin`、`frontend/packages/api-client`、`frontend/packages/ui`，以及 Go 的认证、配置、站点设置、HTTP 与数据库模块。内容、评论、资源、同步和持久任务模块按后续阶段建立。`prototype/` 仍是单独提供的本地设计参考仓库，其 localStorage 示例逻辑不并入生产实现。

前后端不复制根 `contracts/` 和 `docs/`。生成器默认从根工作区定位合同，也允许显式传入合同目录；生成类型提交在前端子模块。Go 服务运行不读取 OpenAPI 文件。前端凭已提交的生成类型独立构建，后端凭自身模块与迁移独立构建；完整合同检查和端到端验收由根工作区完成。

根仓库地址为 `git@github.com:calm195/my-web.git`；两个子模块地址分别为 `git@github.com:calm195/my-web-frontend.git`、`git@github.com:calm195/my-web-backend.git`。本轮尚未推送这些新提交，递归检出验证使用本地镜像和仅对该命令生效的 URL 映射，不修改全局 Git 配置。私有内容同步仓库另行配置，不与应用子模块混用。

完整目录和职责见 [AGENTS.md](../../AGENTS.md)，阶段拆分见[开发计划](../development-plan.md)。P1 固定 Node 24.22.3、Go 1.27.4、pnpm 12.21.0、Caddy 2.11.9；前端采用 Nuxt 4.6.4、Vue 3.5.45、Vite 8.3.8。工具发行物摘要见根 `toolchain.json`，依赖以各仓库锁文件为准；[本地说明](../development/p1-local.md)记录安装及验证边界。

## 4 模块依赖

HTTP handler → 应用服务 → SQL repository；服务协调事务，repository 不自行提交业务事务。公开查询与管理查询使用分开的 DTO。`sync` 调用内容服务的导入/发布能力，不能复制一套状态规则；`jobs` 负责任务领取，不负责解释文章字段。

Nuxt 和管理端只依赖 `contracts` 生成的客户端类型与前端公共包，不引用 Go 内部代码。Nuxt 服务端只使用固定配置的公开 API 上游，不读取 SQLite 或私有目录，不转发站主身份参与公开渲染。

## 5 配置与部署边界

| 配置 | 归属 | 是否允许进入浏览器 |
| --- | --- | --- |
| 站点公开 URL、浏览器 API 前缀 `/api/v1` | 前端 | 是 |
| SSR 内网上游、SSR 请求超时 | Nuxt 服务端 | 否 |
| 监听地址、数据库与资源路径、Git 工作区、会话/CSRF/幂等 HMAC 密钥 | Go 环境 | 否 |
| 仓库 remote、分支、凭据别名、轮询周期 | 管理配置 | 仅认证后台；凭据值从服务器注入 |
| 站点名称、介绍、时区 | 站点设置 | 通过公开 DTO 选择性返回 |

首版代理优先处理 `/api/v1/*`、`/media/*`、`/admin/*`，其余交给 Nuxt。Go API 仅监听内网/回环，管理端深链接回退不能吞 API 404。内部健康检查独立于公开代理；Git 故障属于同步异常，不应导致整个公开站健康检查失败。

运行目录建议 `/var/lib/personal-website/{db,assets,git,backups}`，发布目录与数据目录分开。更改前端可独立重启/回滚，数据库升级与后端发布按兼容顺序执行。
