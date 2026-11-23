# 个人网站

当前阶段：P1 工程初始化、站主认证及本地 HTTPS 底座已完成，并通过真实服务和浏览器验证。公开站、管理端和 Go API 可独立构建；下一阶段为 P2 内容版本与发布闭环。生产服务尚未部署。

## 仓库组织

根仓库统一维护 `contracts/`、`docs/`、本地 HTTPS 编排和跨服务测试。`frontend/`、`backend/` 为独立 Git 仓库，通过子模块纳入根仓库；公开站、管理端和共享前端包位于前端子模块。根提交同时固定合同、文档和两个子模块的提交版本。

```text
contracts/、docs/          # 根仓库：唯一合同与文档
dev                       # 唯一开发与验收入口
tools/                    # 联调脚本、测试、工具配置及独立依赖锁
deploy/                   # 部署与本地 HTTPS 配置
frontend/                 # 子模块：apps/web、apps/admin、packages
backend/                  # 子模块：cmd、internal、migrations
var/                      # 忽略的运行数据、本地工具和测试证据
```

根仓库地址为 `git@github.com:calm195/my-web.git`，前后端子模块分别为 `git@github.com:calm195/my-web-frontend.git`、`git@github.com:calm195/my-web-backend.git`。使用递归子模块方式检出，方法见[开发说明](docs/development/p1-local.md)。本轮仅完成本地提交，推送前远程尚不包含本次拆分版本。

## 本地开发

根目录通过 `./dev` 统一操作，Node 工具配置、锁文件和依赖集中在 `tools/`；根目录不再放置 `package.json`、pnpm 锁文件或 `node_modules`。首次安装、启动及停止方法见 [P1 本地开发说明](docs/development/p1-local.md)，实际环境、命令与结果见 [P1 验证记录](docs/verification/P1-2026-11-17.md)。工具链固定在项目内，不依赖全局 pnpm；默认入口为 `https://localhost:8443`，管理端为 `/admin/`。

首次安装并启动：

```sh
./dev install
./dev up
```

`./dev check` 执行日常检查，`./dev verify` 执行完整验收。完整验收在检查、单元/race、构建和编排故障测试后只启动一套真实服务，顺序执行浏览器及 HTTP 套件；本轮入口调整的实际结果由新的验收记录补充。

本地账号保存在被忽略的 `var/local/credentials.json`；证书信任方法见开发说明。结束时执行 `./dev down`。

## 直接体验

[打开私有在线原型](https://personal-journal-prototype-1115.insightfulbeak64.chatgpt.site)

临时站名为“一隅”，内容均为设计示例。底部工具栏可以切换公开网站和内容管理；同步中心可模拟离线、冲突与仓库删除。数据仅保存在当前浏览器，使用“重置”恢复初始示例。

## 文档

- [需求文档 v1.3](docs/personal-website-requirements.md)
- [轻量技术方案 v1.3](docs/personal-website-technical-design.md)
- [开发详细设计总入口](docs/design/README.md)
- [开发与代理协作规范](AGENTS.md)
- [分阶段开发计划](docs/development-plan.md) · [本地服务联调规范](docs/local-integration.md)
- [代码仓库与编码规范](CONTRIBUTING.md)
- [数据库详细设计与表字典](docs/design/database-design.md)
- [API 详细设计](docs/design/api-design.md) · [OpenAPI 合同](contracts/openapi.yaml)
- [设计验证记录](docs/design/validation.md)
- [根目录与联调工具优化验收](docs/verification/tools-2026-11-23.md)
- [子模块拆分验收](docs/verification/submodules-2026-11-23.md)
- [Git 初始化与提交验证](docs/verification/git-initialization-2026-11-17.md)
- [页面原型设计与验证记录](docs/personal-website-prototype-design.md)
- [技术调研及官方来源](docs/technical-research.md)
- 原型源码与本地运行方法：`prototype/README.md`（本地独立仓库提供，不随应用仓库分发）

已选定生产方案：前后端分离。公开网站使用 Nuxt 4（Vue 3 / TypeScript），管理端使用 Vue 3 / Vite 8；Go 1.27 提供 REST API，独占 SQLite、私有资源目录和持久化 Git 同步任务，不采用 Java。公开前端 Node 24 LTS 服务、管理端静态产物和 Go 后端分别构建、发布，首版可经同一域名部署在一台服务器。

详细设计包含 32 张业务表、58 个 API 操作、版本与幂等规则及可重复验证脚本。当前在线地址继续用于评审页面和交互，尚未接入生产 API。

开发按“工程与认证 → 内容发布闭环 → 真实 Git 同步验证 → 完整内容及互动 → 全量联调与恢复”推进，允许按模块启动子代理。SQL 与代码关键位置必须使用中文注释；阶段完成以本地真实服务证据为准。P1 已实现启动、停止、检查、独立构建和 HTTPS/浏览器测试；Git 当前只准备隔离 bare remote，内容同步按 P3 开发。

根 Git 仓库于 2026-11-17 初始化，主分支为 `main`；2026-11-23 按前后端子模块组织，合同和文档保留在根仓库。`prototype/` 被根仓库忽略，继续独立管理。

## 原型发布记录

- 日期：2026-11-15
- 托管：Sites，保持仅所有者访问的私有权限
- 状态：发布成功，已在浏览器打开并检查首页
- 源码提交：`cc751d9d531bbabe9f2ce61f274e52153373b310`
- 原型源码位于独立的 `prototype/` Git 仓库，设计文档保存在当前项目 `docs/` 中。

原型托管与应用部署分别管理。应用已实现站主认证及管理接口鉴权；内容权限、Git 网络同步、图片上传与数据备份按后续阶段实现，原型仍只用于交互评审。
