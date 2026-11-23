# 代码规范整理与逻辑评审记录

日期：2026-11-23（Asia/Shanghai）。范围为根仓库、前后端子模块的已跟踪手写代码、合同、迁移、工具和测试；独立原型、运行数据、生成类型及依赖产物不作为手写代码整理。根仓库与子模块起始均在 `main` 且工作区干净；后端基线 `4ac2cfeb`，前端基线 `04ed3666`。验收时使用这两个基线及其上的工作区改动，不能作为其他版本的验收证据。

## 整理及依据

- [公共编码规范](../../CONTRIBUTING.md)及前后端 `AGENTS.md` 增加 Go、SQLite、Vue、Nuxt、TypeScript 和 CI 官方实践及本项目取舍。
- 后端认证、事务、HTTP；前端会话、公开 SSR、请求适配；根工具生命周期与设计检查补充关键中文注释。扩充 Go 延迟外键提交失败后的连接复用测试。没有修改合同、已应用迁移、生成类型、依赖锁或应用业务行为。
- 按现有 gofmt、ESLint 和 Prettier 配置检查并复核格式；相关代码原已符合这些格式检查，未制造无意义的批量格式差异。手写代码及配置另检查 UTF-8、LF、文件尾换行和尾随空白：根 27、后端 20、前端 37 个文件未发现问题。Python、Shell、SQL 和合同没有完整的统一自动格式化覆盖，不将以上结果表述为这些语言全部通过某一格式工具。

## 逻辑评审结果

1. **已用真实 HTTPS 复现：动态栏目原型属性绕过 404。** [栏目页面](../../frontend/apps/web/app/pages/[section].vue)用普通对象索引路径参数，并以真值判断是否存在；继承属性 `constructor`、`toString` 也会通过判断。独立隔离服务中 `/about`、`/constructor`、`/toString` 均返回 200，而 `/unknown-route` 返回 404。应以明确的自有键或无原型字典判定，并补充真实 HTTP 和浏览器回归。本次按计划只记录业务行为问题，未修改路由。
2. **待浏览器验证：动态路由复用时的 404。** 同一页面只在 setup 时判断栏目存在，客户端从合法栏目切换到未知栏目时可能复用组件而不再次判断。需建立浏览器复现，再确定处理方式；当前不能宣称已复现。
3. **待故障注入验证：准备命令可能阻塞中断。** [同步进程执行](../../tools/scripts/dev/services.mjs)使用 `spawnSync`，准备阶段的 CLI、OpenSSL 和 Git 调用未统一设置超时；若子进程挂起，Node 事件循环无法及时处理终止信号，清理可能被延迟。建议用可控挂起命令验证并设计可取消、限时的进程生命周期；本次未改变执行机制。端口探测后到绑定前也有竞争窗口，现有代码注释明确其失败清理边界。
4. **后续迁移风险：设计检查和字典只读取初始迁移。** [设计检查](../../tools/scripts/validate_design.py)和[字典生成器](../../tools/scripts/render_design_references.py)当前直接读取 `00001_initial.sql`；前者还断言 32 张表。目前迁移目录仅有初始迁移，新增迁移时须同步扩展脚本并核对字典，不能认为现有检查覆盖后续结构。

其他评审涉及认证和 CSRF、事务、SSR 隔离、请求重试、进程所有权、合同与生成类型；没有将未实现的内容发布和同步能力视为已通过业务评审。本记录不是穷尽所有缺陷的保证。

## 实际验证

工具链：macOS arm64；Node 24.22.3、pnpm 12.21.0、Go 1.27.4、Caddy 2.11.9；真实服务使用 Go SQLite 3.54.1，设计检查使用 Python SQLite 3.54.0；Firefox 159.0。

- 初始 `./dev check` 通过。初始 `./dev test` 的单元及 Go 测试通过，5 个编排测试因沙箱不允许监听 `127.0.0.1` 而失败；在允许回环监听和进程检查的环境下，后续完整验证的 8 个编排测试全部通过。
- 整合后 `./dev verify` 退出 0：合同生成一致、lint、格式、类型、gofmt/vet、33 项设计检查、前端 36 项单元测试、Go race、3 项隔离测试、8 项编排测试及三端构建通过；同一真实 HTTPS 服务上的 Firefox 6 组和 HTTP 9 组检查通过。结果与日志位于 `var/test/acceptance-84b4e639-3ea5-4513-91fa-59d5814d1f50/`，结果记录 `servicesStopped=true`，浏览器只信任临时 CA，未改变系统信任。
- `./dev exec sh -c 'cd backend && go test ./internal/store -run TestDeferredForeignKeyRollback -count=1'` 通过，验证延迟外键提交失败后可再次写入；`git diff --check` 分别在三个仓库通过。
- 使用 `tools/scripts/test/lifecycle.mjs` 的 `managedTest` 创建独立 `route-review` 环境，通过其受信 CA 的 HTTPS 客户端依次请求 `/about`、`/constructor`、`/toString`、`/unknown-route`，状态分别为 200、200、200、404；结果和日志位于 `var/test/route-review-f638ba1a-5b8e-4288-8d22-98475af69c48/`，本轮服务已停止。该检查没有验证客户端路由切换。
- Python 设计检查输出 urllib3 与本机 LibreSSL 的兼容性警告，但检查退出成功；没有据此断言外部 HTTPS 请求均可用。

验收时 `./dev workspace` 通过，提示两个子模块含本轮未提交改动；因此当时未运行要求子模块干净的 `workspace --locked`。验收时尚未提交、推送或部署；远程 CI、生产环境及尚未实现的内容/同步流程未验证。
