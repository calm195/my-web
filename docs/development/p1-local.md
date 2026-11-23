# P1 本地开发与联调

适用范围：工程初始化、站主认证和本地 HTTPS。2026-11-23 将工具、脚本、跨服务测试和 Node 配置集中到 `tools/`，根目录统一使用 `./dev`。历史 P1 和子模块拆分已通过的结果分别见 [P1 记录](../verification/P1-2026-11-17.md)及[拆分记录](../verification/submodules-2026-11-23.md)；本轮工具入口及共享验收流程的通过情况由新的实际记录补充。

内容发布、同步执行器、评论等按 P2 以后开发；当前 58 个操作的合同只实现公开站点配置和三个会话操作。

## 1 取得完整工作区

根仓库保留唯一 `contracts/`、`docs/`；`frontend/`、`backend/` 各有独立 Git 历史，通过子模块固定提交。联调工程在根仓库 `tools/`，不属于任何应用子模块。

```sh
git clone --recurse-submodules git@github.com:calm195/my-web.git
cd my-web
git submodule status
```

已有工作区切换版本后执行 `git submodule update --init --recursive`，不用 `--remote` 自动跟随最新分支。子模块默认是 detached HEAD，开始开发前在对应仓库创建任务分支。前端地址为 `git@github.com:calm195/my-web-frontend.git`，后端地址为 `git@github.com:calm195/my-web-backend.git`。本地提交尚未推送时，远程无法检出这些新提交；本地镜像验证只对本次命令设置 URL 映射，不改全局 Git 配置。

## 2 首次安装

从根目录执行，需要 Python 3.9+、Git、OpenSSL；浏览器测试还需要 NSS `certutil`。锁定工具摘要覆盖 macOS arm64 与 Linux x64，其他平台需先补充发行物及校验值。

```sh
./dev install
./dev doctor
```

`install` 安装项目私有工具，分别冻结安装 `tools/` 与 `frontend/` 的 Node 依赖，准备 `var/venv` 设计检查环境和项目缓存中的 Firefox。首次下载需要网络；命令不修改全局 Node、Go、pnpm、系统证书信任或已有浏览器 profile。Linux 的浏览器系统依赖和 NSS 需显式安装，CI 使用系统包及 Playwright 的依赖安装步骤；普通安装不会静默执行系统升级。

`tools/toolchain.json` 固定 Node 24.22.3、Go 1.27.4、pnpm 12.21.0、Caddy 2.11.9 及官方发行物摘要。运行工具与缓存分别在被忽略的 `var/toolchain`、`var/cache`；根目录没有 `package.json`、pnpm 锁文件或 `node_modules`。工具工程自己的配置和锁文件在 `tools/`，前端仍独立使用 `frontend/pnpm-lock.yaml`。

前端 pnpm 12 workspace 使用 `allowBuilds`，仅允许锁定依赖中的 esbuild 安装脚本。依赖发布等待期的例外精确到当前 TypeScript ESLint 版本。主要前端依赖固定 Nuxt 4.6.4、Vue 3.5.45、Vite 8.3.8、Vue Router 4.6.5、TypeScript 5.9.3。

## 3 日常启动与停止

```sh
./dev up
./dev status
./dev down
```

`up` 自动构建 Go API 和维护 CLI，显式准备数据库、站点设置、测试站主、独立 CA 和 bare Git remote，再启动 Go、Nuxt、Vite 和 Caddy，等待三端真实就绪。Go 进程启动本身只检查 schema，不自动迁移。重复准备不重置已有账号、站点或数据库。

默认公开入口为 `https://localhost:8443`，管理端为 `/admin/`；Go、Nuxt、Vite 分别只监听回环端口 8080、3000、5173。端口冲突直接失败，不终止无关进程。更换端口时，为新运行目录设置 `SITE_API_PORT`、`SITE_WEB_PORT`、`SITE_ADMIN_PORT`、`SITE_HTTPS_PORT`；已有目录使用已持久化的配置。

数据、证书、口令、PID 和日志在 `var/local/`，账号位于其中的 `credentials.json`，只供本地读取，不输出到普通日志。通过 `SITE_RUN_DIR` 可选择项目 `var/` 内另一个独立目录；准备脚本拒绝接管无项目标记的非空目录。Nuxt 编译目录、Vite 缓存各在运行目录的 `nuxt/`、`vite/`；Nuxt 显式使用严格端口并禁止接管其他开发进程。

本地 HTTPS 使用独立 CA。命令行客户端显式使用该 CA；自动化 Firefox 只在临时 profile 信任该 CA，保持正常证书校验。普通浏览器需要用户自行明确信任本地证书，脚本不修改系统钥匙串或全局浏览器信任。

```sh
curl --cacert var/local/certs/ca.pem https://localhost:8443/api/v1/public/site
```

`down` 只停止当前运行标识所属的进程，保留数据库与证据。失败时检查对应运行目录的 `logs/`，不删除数据尝试恢复。P1 只准备 Git 环境，尚不执行内容同步。

## 4 分层检查与完整验收

| 根目录命令 | 用途 |
| --- | --- |
| `./dev check` | 子模块、合同漂移、各端格式/lint/类型、gofmt、vet 和设计约束 |
| `./dev test` | 客户端/管理会话、Go race、编排与工具故障测试 |
| `./dev build` | 独立构建 Nuxt、管理端、Go API 和维护 CLI |
| `./dev build web` / `admin` / `api` | 只构建指定产物 |
| `./dev integration` | 独立运行目录和动态端口的真实 HTTPS/SQLite/CLI 套件 |
| `./dev e2e` | 独立真实服务栈上的 Firefox 套件 |
| `./dev acceptance` | 只启动一套真实服务，顺序执行浏览器与 HTTP 套件 |
| `./dev verify` | 检查、单元/race、各端构建、编排故障，再执行共享真实栈验收 |
| `./dev generate` | 从根 OpenAPI 生成前端类型 |
| `./dev workspace --locked` | 检查子模块干净且与根索引指针一致 |

修改信号、进程归属或清理逻辑时，另执行 `./dev exec pnpm --dir tools test:interruption`，真实验证启动中 SIGTERM、浏览器运行中 SIGINT 的退出码、失败结果、端口和运行锁释放。

日常按变更范围运行相关命令；阶段完成或跨服务编排变更运行 `./dev verify`。完整验收先完成构建，避免每个套件重复构建；浏览器与 HTTP 套件共享同一次启动的真实服务，减少重复初始化与 Nuxt 编译。浏览器套件先执行，套件之间通过维护 CLI 恢复测试口令、清除会话，HTTP 限频测试最后执行，防止前一套状态污染后一套。共享服务并不复用 `var/local/` 或既有开发账号。

自动测试目录为 `var/test/<类型>-<run-id>/`，动态分配四个不同空闲端口；账号、SQLite、证书和 Git remote 均独立。成功、失败或 Ctrl+C 中断都停止自己启动的服务，保留日志、结果和必要截图。SIGINT/SIGTERM 分别返回 130/143，失败结果会记录中断状态。共享验收分别写出浏览器结果、HTTP 结果及总结果，记录同一入口与服务运行标识；原始凭据和数据库不提交。

Firefox 使用正常 TLS 校验、独立 NSS profile 和独立 `MOZ_APP_DATA`、`MOZ_LOCAL_APP_DATA`，不访问用户既有浏览器数据，不关闭浏览器沙箱。浏览器路径无请求 mock。完整目标中的生产产物替换、备份恢复及 `test:release` 仍留在 P7；本地开发服务通过不代表生产部署或完整 AC30 通过。

## 5 认证与维护

| 方法与路径 | 当前行为 |
| --- | --- |
| `GET /api/v1/public/site` | SQLite 公开 title、description、timezone 投影 |
| `POST /api/v1/admin/session` | 严格 username/password JSON、来源校验、限频，设置 Secure/HttpOnly 会话 |
| `GET /api/v1/admin/session` | 站主、csrf_token、expires_at，不延长绝对期限 |
| `DELETE /api/v1/admin/session` | Origin/CSRF 校验、删除服务端会话并清 Cookie |

管理会话仅保存在页面内存，登录失败保留输入；跨标签只广播会话变化事件，不传播 token。公开 Nuxt SSR 使用独立公开客户端，不转发管理员 Cookie。

维护 CLI 为 `backend/bin/site-admin`，支持 `migrate`、`init-admin --username NAME`、`reset-password --username NAME`、`diagnose`。目标由 `SITE_DATABASE_PATH`、`SITE_ASSET_DIR` 选择，密码从标准输入读取；改密在事务中清除该站主全部会话。内部诊断探针不经公开 HTTPS 代理暴露。

高级命令可经统一入口使用私有工具链，例如从根目录执行：

```sh
./dev exec sh backend/scripts/check.sh
./dev exec pnpm --dir frontend check
```

前端单独克隆可用已提交类型执行自身 lint、类型、测试、构建，不依赖 Go；后端自身检查与构建不依赖 Node。完整合同检查和端到端验收需要根工作区。

## 6 合同、CI 与参考

根 `contracts/openapi.yaml` 为接口唯一来源；`./dev generate` 更新 `frontend/packages/api-client/src/generated/schema.ts`，子模块不保存合同副本。生成器按脚本位置定位根合同，也允许绝对 `SITE_CONTRACTS_DIR`。生成器无法完整表达 `ResolveConflict` 条件 schema，后端实现该功能时必须补充运行时校验。

根 CI 递归检出固定子模块，调用相同 `./dev` 入口。私有子仓库需配置能读取两侧的 `SUBMODULES_READ_TOKEN`，系统依赖安装另行显式执行。修改合同和实现后先提交子模块，最后根仓库记录文档、合同和两个 gitlink；推送顺序同样为子仓库先、根仓库后。远程 CI 未实际运行时不得标记通过。

依据：[Node 发布周期](https://nodejs.org/en/about/previous-releases)、[Go 发行物](https://go.dev/dl/)、[Nuxt 4 安装要求](https://nuxt.com/docs/4.x/getting-started/installation)、[pnpm 配置迁移](https://pnpm.io/migration)、[Caddy 延迟响应头](https://caddyserver.com/docs/caddyfile/directives/header)、[Mozilla 测试目录隔离](https://bugzilla.mozilla.org/show_bug.cgi?id=2078511)。
