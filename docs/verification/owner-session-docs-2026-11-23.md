# 站主登录与会话文档核验

2026-11-23 在 macOS arm64 核验根、前端和后端的 README，以及根工作区的「站主登录与会话」模块说明。核验基线为根仓库 `ab471ed`、前端 `a68ace6`、后端 `1a2615c`。使用 Node 24.22.3、pnpm 12.21.0 和 Go 1.27.4。

| 核验项 | 实际操作与结果 |
| --- | --- |
| 文档链接 | 按四篇文档各自所在目录解析 Markdown 相对链接。根 README 33 处、两个子仓 README 各 21 处、开发须知 24 处，文件或目录均存在。GitHub 根仓链接与配置的 origin 对应，私有原型地址与原始入口一致。外部地址仅核对引用。 |
| 代码与合同 | 对照根 dev 入口、前端 package scripts、后端构建脚本及维护 CLI 检查命令、工作目录和产物。读取 OpenAPI 并对照 Go 路由与前端客户端，核对 login、getSession、logout 三个操作的成功响应、会话与 CSRF 要求。 |
| 前端 | `./dev exec pnpm --dir frontend generate:check` 通过。`./dev exec pnpm --dir frontend test` 通过，共 29 个客户端用例、7 个管理端会话用例。另按开发须知运行管理端定向命令，7 个用例通过。 |
| 后端 | `./dev exec sh backend/scripts/check.sh` 通过。`./dev exec sh backend/scripts/test.sh` 和开发须知中的 auth/httpapi 定向 race 命令均通过，Go 复用了测试缓存。 |
| 跨端 | `./dev acceptance` 在同一套本地服务上通过 Firefox 6 组、HTTPS 接口 9 组。浏览器验证输入保留、会话恢复、多标签退出和 CLI 改密失效；HTTP 用例核对 Cookie、来源与 CSRF 校验、旧会话撤销及公开渲染隔离。 |

本次使用 Firefox 159.0 与 Go 驱动的 SQLite 3.54.1。结果与日志位于本机 `var/test/acceptance-604dc9a0-0cab-4783-953e-4b5ad171b46c/`，总结果为 `passed`，`servicesStopped=true`。测试账号与数据库均在该隔离目录中使用。验证范围为本地工作区与本地服务。

## 开发说明按功能命名后的复核

2026-11-23 以根仓库 `8b3aec6` 为基线，复核了三个仓库中的 29 份 Markdown。逐份按文件所在目录解析的 195 处本地链接均有效。检查文档显示文字和源码注释后，开发阶段编号仅保留在主仓库的开发计划与历史验收记录。与基线逐行对照，23 个联调场景的操作、通过条件和需求映射一致，原有场景分期对应关系已归入开发计划。

用 Node 24.22.3 运行 `./dev acceptance` 验证按功能命名的测试入口。Firefox 6 组、HTTPS 接口 9 组均通过，本次服务已停止。结果与日志保存在本机 `var/test/acceptance-02dff764-cae7-4749-8a46-4565fcd8e56d/`。
