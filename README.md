# 个人网站

## 功能简介

这是站主长期记录技术与生活的公开空间，规划包括个人资料与技术能力、项目经历、技术博客、生活分享、文章评论和留言板。

访客可以浏览公开站点首页，站主可以登录管理端、查看会话和退出。站点公开配置和三个会话接口已通过本地 HTTPS 和浏览器验收。内容版本与发布、Git 同步及访客互动的开发安排见计划。[开发计划](docs/development-plan.md) · [工程与认证验收](docs/verification/P1-2026-11-17.md)

## 技术栈

Nuxt 4、Vue 3 和 TypeScript 负责公开站的服务端渲染。管理端用 Vue 3 和 Vite 8 构建为静态应用。两端通过同源 `/api/v1/` 访问 Go REST API，由 Go 负责鉴权并通过 modernc 驱动读写 SQLite。本地 Caddy 提供统一 HTTPS 入口。精确版本见[工具链清单](tools/toolchain.json)和[前端依赖锁](frontend/pnpm-lock.yaml)。

## 快速开始、验证与构建

新检出时使用 `git clone --recurse-submodules git@github.com:calm195/my-web.git`。已有根仓库在切换版本后，执行 `git submodule update --init --recursive`，取得该根提交固定的前后端版本。远程检出需要三个仓库均已提供对应提交。

以下命令从**根仓库目录**执行。首次安装需要 Git、Python 3.9+、OpenSSL 和网络，Firefox 验收还需要 NSS `certutil`。支持的平台和证书信任步骤见[本地开发说明](docs/development/local-development.md)。

```sh
./dev install     # 首次安装项目工具和依赖
./dev up          # 准备本地数据库和站主账号，启动服务
./dev status      # 查看服务状态
```

默认访问 `https://localhost:8443/` 查看首页，访问 `https://localhost:8443/admin/` 登录管理端。本地测试账号在 `var/local/credentials.json`。也可在根目录执行 `curl --cacert var/local/certs/ca.pem https://localhost:8443/api/v1/public/site`，应收到包含 `title`、`description`、`timezone` 的 JSON。使用结束后执行 `./dev down`。

| 任务 | 根目录命令 | 结果 |
| --- | --- | --- |
| 检查日常改动 | `./dev check` | 检查合同、设计约束及各端代码 |
| 验证跨端行为 | `./dev acceptance` | 在隔离环境中启动一套服务，执行真实 Firefox 和 HTTPS 接口用例 |
| 构建交付物 | `./dev build` | 生成公开站 `frontend/apps/web/.output/`、管理端 `frontend/apps/admin/dist/`、后端 `backend/bin/api` 和 `backend/bin/site-admin` |
| 执行完整验收 | `./dev verify` | 完成检查、测试、构建和跨端验收 |

生产部署按 Nuxt Node 服务、管理端静态文件和 Go API 三个单元规划。当前已验证独立构建与本地联调，生产部署待验收。[技术方案](docs/personal-website-technical-design.md) · [本地验收记录](docs/verification/tools-2026-11-23.md)

## 功能模块与目录

| 要找什么 | 从哪里开始 |
| --- | --- |
| 公开首页和站点配置 | [Nuxt 应用入口](frontend/apps/web/app/app.vue)调用[公开数据客户端](frontend/apps/web/app/composables/usePublicSite.ts)读取站点信息，再传给页面。Go 从 SQLite [读取公开字段](backend/internal/settings/service.go)。 |
| 站主登录与会话 | 从[模块开发须知](docs/development/owner-session.md)跟踪管理页面、共享客户端、Go 认证与验证用例。 |
| 两端的独立工程 | [前端 README](frontend/README.md)介绍公开站、管理端与共享包。[后端 README](backend/README.md)介绍 API、维护 CLI 和迁移。两者均为 Git 子模块。 |
| 接口与数据库 | 根仓库的 [OpenAPI](contracts/openapi.yaml) 定义前后端共用的接口，[后端迁移](backend/migrations/)定义数据库结构。 |
| 本地环境与测试 | 根入口 [dev](dev) 调用[联调工具与测试](tools/)，[Caddy 配置](deploy/local/Caddyfile)分发请求。运行数据、证书和日志保存在本机 `var/`。 |

## 文档导航

| 我想做什么 | 文档 |
| --- | --- |
| 理解产品与页面 | [需求基线](docs/personal-website-requirements.md) · [页面原型设计与评审记录](docs/personal-website-prototype-design.md) · [在线交互原型（私有，使用示例数据）](https://personal-journal-prototype-1115.insightfulbeak64.chatgpt.site) |
| 修改站主认证 | [站主登录与会话开发须知](docs/development/owner-session.md) · [前后端交互规则](docs/design/interaction-contract.md) |
| 修改接口或数据模型 | [详细设计导航](docs/design/README.md) · [API 设计](docs/design/api-design.md) · [数据库设计](docs/design/database-design.md) |
| 了解协作和提交要求 | [编码与提交规范](CONTRIBUTING.md) · [开发与代理协作规范](AGENTS.md) |
| 运行服务或排查联调问题 | [启动、停止与工具命令](docs/development/local-development.md) · [本地联调规范](docs/local-integration.md) |
| 查看验证范围与历史 | [设计检查](docs/design/validation.md) · [站点与会话验收](docs/verification/P1-2026-11-17.md) · [子模块拆分验证](docs/verification/submodules-2026-11-23.md) · [共享服务栈验收](docs/verification/tools-2026-11-23.md) |
