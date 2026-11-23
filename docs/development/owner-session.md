# 站主登录与会话

站主通过同源 HTTPS 入口登录管理端。本文以直接打开 `/admin/session` 为例，说明浏览器、Go API 与 SQLite 如何建立和读取会话，以及退出或通过 CLI 改密后会话如何失效。

## 功能流程

下表中的 POST、GET、DELETE 均访问 `/api/v1/admin/session`。浏览器地址 `/admin/session` 则是管理端的「登录状态」页面。[接口合同](../../contracts/openapi.yaml)

| 站主操作 | 请求和可见结果 |
| --- | --- |
| 首次打开受保护页面 | 路由守卫先发 GET。返回 401 时转到登录页并记住站内目标。连接失败时转到连接状态页，可手动重试。 |
| 提交账号和密码 | POST 成功返回 200，浏览器接收会话 Cookie，页面清空密码并返回允许访问的目标页。账号不存在和密码错误统一返回 `401 INVALID_CREDENTIALS`，表单保留本次输入。限频返回 429，界面按 `Retry-After` 提示等待。 |
| 刷新页面或在新标签打开 | 浏览器随 GET 携带 Cookie，200 响应恢复用户、CSRF 令牌和绝对到期时间。页面重新可见或站主点击「检查登录状态」时也会核对。空闲或绝对期限已到、CLI 改密后，受保护页在下次核对得到 401 时回到登录页。 |
| 退出登录 | DELETE 携带 Cookie 和 `X-CSRF-Token`。服务端删除当前会话、清 Cookie 并返回 204。管理端清除内存身份；其他支持广播的标签收到变化事件后各自重新发 GET。退出时收到 401 也可清理本地状态，遇到网络故障则显示错误供站主核对。 |

## 关键实现

**页面和请求。** 从登录表单的 `submit` 跟到 `createSessionState`，再跟到客户端的 `login`、`getSession` 和 `logout`。管理端只在页面内存保存会话响应。状态模块通过登录或退出时更新的版本号以及读取序号识别迟到的 GET，避免旧响应在退出后恢复身份。路由守卫用 `safeReturnPath` 将回跳限制在已知管理页。[登录表单](../../frontend/apps/admin/src/views/login/LoginView.vue) · [会话状态](../../frontend/apps/admin/src/composables/session-state.ts) · [请求客户端](../../frontend/packages/api-client/src/transport/client.ts) · [路由守卫](../../frontend/apps/admin/src/router/index.ts)

**请求与认证。** Go 登录入口先校验来源，优先精确匹配 Origin，缺少时核对 Referer 的源，再校验输入和登录频率。登录凭账号、密码和请求来源建立新会话，无需提交现有会话的 CSRF 令牌。服务使用 Argon2id 校验密码，在写事务中复核密码摘要，替换此次请求携带的旧会话并写入新会话。浏览器取得的 `__Host-site_session` 带 `Secure`、`HttpOnly`、`SameSite=Lax` 和 `Path=/`，会话表以摘要保存这两种令牌。[HTTP 入口](../../backend/internal/httpapi/server.go) · [认证服务](../../backend/internal/auth/service.go) · [限频实现](../../backend/internal/auth/limiter.go) · [账号与会话表](../../backend/migrations/00001_initial.sql)

**会话可见范围和期限。** `Current` 核对会话及有效期，同一有效会话可重复读取相同 CSRF 令牌，多个标签可以同时使用。绝对期限为 24 小时，空闲期限为 2 小时，最近活动时间最多每 5 分钟写一次。退出只删除当前会话；CLI 改密在同一事务中更新密码并删除该站主的全部会话。跨标签只广播变化事件。公开 Nuxt 页面另建请求级客户端并使用 `credentials: 'omit'`，避免把管理身份带入公开渲染。[认证服务](../../backend/internal/auth/service.go) · [账号维护 CLI](../../backend/cmd/site-admin/main.go) · [标签页通知](../../frontend/apps/admin/src/composables/useSession.ts) · [公开站客户端](../../frontend/apps/web/app/composables/usePublicSite.ts)

## 代码规范

- 页面调用共享客户端，会话写操作由服务端鉴权。退出需要同时校验来源和当前会话的 CSRF 令牌。登录和退出都由调用者显式发起一次，不自动重试。[前后端交互约定](../design/interaction-contract.md)
- 接口字段变化先修改根 OpenAPI 并运行 `./dev generate` 更新前端类型。数据库结构变化新增迁移。SQL 使用参数绑定，并在语句旁用中文说明影响的会话范围；权限、事务和异步状态切换的关键代码用中文说明原因。[编码规范](../../CONTRIBUTING.md)
- 密码和令牌不得写入日志或 URL。原始会话令牌由浏览器通过 HttpOnly Cookie 管理。前端只在内存中处理登录表单和 CSRF 令牌，禁止将它们写入 localStorage。排查失败请求时，用错误响应中的 `request_id` 关联服务日志。[HTTP 错误与日志实现](../../backend/internal/httpapi/server.go)

## 验证方式

在完整根工作区执行下列命令，首次使用先按[本地开发说明](local-development.md)安装工具。按改动范围选择验证。

| 改动范围 | 从根目录执行 | 应观察到的结果 |
| --- | --- | --- |
| 管理端会话状态 | `./dev exec pnpm --dir frontend/apps/admin test` | 网络错误进入待确认状态，401 才清理身份。退出前的旧 GET 不会覆盖后来的状态。[前端状态测试](../../frontend/apps/admin/src/composables/session-state.test.ts) |
| 服务端认证、请求校验 | `./dev exec go -C backend test -race ./internal/auth ./internal/httpapi` | 用例覆盖空闲和绝对期限边界、改密与登录并发、来源校验和限频。[认证测试](../../backend/internal/auth/service_test.go) · [HTTP 测试](../../backend/internal/httpapi/server_test.go) |
| Cookie、代理、跨端登录流程 | `./dev acceptance` | 受信 HTTPS 下登录后可访问原管理页，多标签退出生效；缺少或错误 CSRF 的退出请求返回 403，有效退出返回 204，再用旧 Cookie 请求返回 401。[浏览器用例](../../tools/tests/e2e/site-and-session.mjs) · [接口用例](../../tools/tests/integration/site-and-session.mjs) |

单查接口或浏览器时分别执行 `./dev integration` 或 `./dev e2e`。验收脚本自行准备隔离账号和 SQLite 文件，自动停止其启动的服务，将结果与日志保存在 `var/test/` 的本次运行目录。本轮命令、覆盖范围和结果见[模块文档与本地服务验证记录](../verification/owner-session-docs-2026-11-23.md)。
