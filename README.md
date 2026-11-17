# 个人网站设计项目

当前阶段：需求基线、交互原型及开发详细设计已形成，已交付可验证的 SQL 和 OpenAPI 合同。开发规范与分阶段计划已落地；下一执行起点为 P1 工程和本地联调底座，应用脚手架与生产服务尚未实现。

## 直接体验

[打开私有在线原型](https://personal-journal-prototype-1115.insightfulbeak64.chatgpt.site)

临时站名为“一隅”，内容均为设计示例。底部工具栏可以切换公开网站和内容管理；同步中心可模拟离线、冲突与仓库删除。数据仅保存在当前浏览器，使用“重置”恢复初始示例。

## 文档

- [需求文档 v1.3](docs/personal-website-requirements.md)
- [轻量技术方案 v1.2](docs/personal-website-technical-design.md)
- [开发详细设计总入口](docs/design/README.md)
- [开发与代理协作规范](AGENTS.md)
- [分阶段开发计划](docs/development-plan.md) · [本地服务联调规范](docs/local-integration.md)
- [代码仓库与编码规范](CONTRIBUTING.md)
- [数据库详细设计与表字典](docs/design/database-design.md)
- [API 详细设计](docs/design/api-design.md) · [OpenAPI 合同](contracts/openapi.yaml)
- [设计验证记录](docs/design/validation.md)
- [Git 初始化与提交验证](docs/verification/git-initialization-2026-11-17.md)
- [页面原型设计与验证记录](docs/personal-website-prototype-design.md)
- [技术调研及官方来源](docs/technical-research.md)
- 原型源码与本地运行方法：`prototype/README.md`（本地独立仓库提供，不随应用仓库分发）

已选定生产方案：前后端分离。公开网站使用 Nuxt 4（Vue 3 / TypeScript），管理端使用 Vue 3 / Vite 8；Go 1.27 提供 REST API，独占 SQLite、私有资源目录和持久化 Git 同步任务，不采用 Java。公开前端 Node 24 LTS 服务、管理端静态产物和 Go 后端分别构建、发布，首版可经同一域名部署在一台服务器。

详细设计包含 32 张业务表、58 个 API 操作、版本与幂等规则及可重复验证脚本。当前在线地址继续用于评审页面和交互，尚未接入生产 API。

开发按“工程与认证 → 内容发布闭环 → 真实 Git 同步验证 → 完整内容及互动 → 全量联调与恢复”推进，允许按模块启动子代理。SQL 与代码关键位置必须使用中文注释；阶段完成以本地真实 HTTPS、Go、SQLite、前端及临时 Git 仓库的联调证据为准。启动和测试脚本将在 P1 建立，具体计划命令见本地联调规范。

本地应用 Git 仓库已于 2026-11-17 初始化，主分支为 `main`；尚未配置远程仓库。`prototype/` 被应用仓库忽略，继续独立管理。

## 原型发布记录

- 日期：2026-11-15
- 托管：Sites，保持仅所有者访问的私有权限
- 状态：发布成功，已在浏览器打开并检查首页
- 源码提交：`cc751d9d531bbabe9f2ce61f274e52153373b310`
- 原型源码位于独立的 `prototype/` Git 仓库，设计文档保存在当前项目 `docs/` 中。

原型托管与未来生产站点部署分别管理。实际账号认证、服务端权限、Git 网络同步、图片上传与数据备份将在正式实现阶段完成。
