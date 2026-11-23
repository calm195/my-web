# P1 本地开发与联调

适用范围：工程初始化、站主认证和本地 HTTPS；2026-11-23 更新为前后端 Git 子模块结构。内容发布、同步执行器、评论等功能按 P2 以后开发；当前 58 个操作的合同只实现公开站点配置和三个会话操作。

根仓库保留唯一的 `contracts/`、`docs/`、编排与跨服务测试；`frontend/`、`backend/` 各有独立 Git 历史。首次从远程检出使用：

```sh
git clone --recurse-submodules git@github.com:calm195/my-web.git
cd my-web
git submodule status
```

已有根仓库在切换版本后执行 `git submodule update --init --recursive`，使两个子模块回到根提交记录的版本。不要使用 `--remote` 自动跟随最新分支。子模块默认是 detached HEAD，开始开发前在对应仓库创建任务分支。

前端地址为 `git@github.com:calm195/my-web-frontend.git`，后端地址为 `git@github.com:calm195/my-web-backend.git`。本轮只配置地址和完成本地提交，推送前远程尚不包含新拆分版本；本地递归检出验证通过镜像和命令级 `url.<本地地址>.insteadOf` 完成，不修改全局 Git 设置。`var/repos/` 中的 bare 镜像与内容同步测试的临时 bare remote 职责不同，均不提交。

## 1 固定工具与首次安装

从应用仓库根目录执行。需要 Python 3.9+、Git、OpenSSL；浏览器测试额外需要 NSS `certutil`。当前工具摘要覆盖 macOS arm64 与 Linux x64，其他平台需先补充官方发行物与校验值。

```sh
python3 scripts/dev/bootstrap.py
sh scripts/dev/with-tools.sh pnpm install --frozen-lockfile
sh scripts/dev/with-tools.sh pnpm --dir frontend install --frozen-lockfile
python3 -m venv var/venv
var/venv/bin/pip install -r scripts/design-requirements.txt
PLAYWRIGHT_BROWSERS_PATH=var/cache/playwright sh scripts/dev/with-tools.sh pnpm exec playwright install firefox
```

`toolchain.json` 固定 Node 24.22.3、Go 1.27.4、pnpm 12.21.0、Caddy 2.11.9 及官方发行物摘要。安装目录和缓存位于被忽略的 `var/`；`with-tools.sh` 只对当前命令选择项目工具，不修改全局 Node、Go、Corepack 或 shell 配置。首次下载需要网络。

根目录与 `frontend/` 分别冻结安装自己的依赖，也可使用根命令 `pnpm install:all` 完成两处安装。前端的 pnpm 12 workspace 使用 `allowBuilds`，仅允许锁定依赖中的 esbuild 安装脚本。依赖发布等待期的例外精确到当前 TypeScript ESLint 版本，锁文件和规则一起提交，后续依赖更新仍需检查。前端主要依赖固定 Nuxt 4.6.4、Vue 3.5.45、Vite 8.3.8、Vue Router 4.6.5、TypeScript 5.9.3。

前端应用与共享包在 `frontend/apps/` 和 `frontend/packages/`；后端 Go 模块、迁移和二进制分别在 `backend/`、`backend/migrations/`、`backend/bin/`。根依赖用于脚本、跨进程和浏览器测试，后端构建不依赖前端包安装。

Linux 浏览器测试需先安装系统依赖，CI 中执行 `playwright install --with-deps firefox` 和安装 `libnss3-tools`。macOS 使用已安装的 NSS `certutil`。这些是软件依赖安装，不是修改系统证书信任。

## 2 创建并运行本地服务

```sh
sh scripts/dev/with-tools.sh pnpm dev:doctor
sh scripts/dev/with-tools.sh pnpm build:api
sh scripts/dev/with-tools.sh pnpm dev:prepare
sh scripts/dev/with-tools.sh pnpm dev:up
sh scripts/dev/with-tools.sh pnpm dev:status
```

默认入口为 `https://localhost:8443`，管理端为 `/admin/`；Go、Nuxt、Vite 分别监听回环端口 8080、3000、5173。端口冲突直接失败，不终止其他项目。更换端口时为新运行目录设置 `SITE_API_PORT`、`SITE_WEB_PORT`、`SITE_ADMIN_PORT`、`SITE_HTTPS_PORT` 后执行 prepare；已有目录使用其持久配置。

`dev:prepare` 显式执行 Goose 迁移，创建初始站点设置、唯一测试站主、随机密钥、开发证书及临时 bare Git remote。重复执行不会重置已有账号、站点或数据库。默认账号信息保存在 `var/local/credentials.json`，只供本地开发者读取，不打印到日志。Go API 启动只核验 schema，不自动迁移。

运行数据、证书、口令、PID 与日志都位于 `var/local/`。Nuxt 编译目录与 Vite 缓存分别在该运行目录的 `nuxt/`、`vite/`，测试环境互不共享开发进程锁或端口编译配置；Nuxt 启动使用严格端口并禁止接管其他进程。可用 `SITE_RUN_DIR` 指向项目 `var/` 内另一个独立目录；prepare 拒绝接管无标记的非空目录。P1 只准备 Git 测试环境，尚不执行内容同步。

本地 HTTPS 使用独立 CA。CLI 联调显式使用其 CA 文件；自动化 Firefox 仅在临时浏览器 profile 中信任该 CA，保持正常证书校验。普通浏览器需自行明确信任本地证书后访问，脚本不会修改系统钥匙串或全局浏览器信任。不得用忽略证书错误代替验收。

```sh
curl --cacert var/local/certs/ca.pem https://localhost:8443/api/v1/public/site
sh scripts/dev/with-tools.sh pnpm dev:down
```

服务关闭只处理当前运行记录所属的进程，保留数据库与证据。Nuxt、Vue、Go 的日志位于 `var/local/logs/`；出错先查看对应日志，不删除运行数据尝试“修复”。

## 3 认证与已实现接口

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/v1/public/site` | 从 SQLite 读取 title、description、timezone，不含管理信息 |
| `POST /api/v1/admin/session` | 严格小写 username/password JSON；校验来源、密码和限频，设置 Secure/HttpOnly 会话 |
| `GET /api/v1/admin/session` | 返回站主、csrf_token、expires_at；不延长绝对会话期限 |
| `DELETE /api/v1/admin/session` | 校验来源和 CSRF，删除服务端会话并清 Cookie |

管理前端仅将会话保存在页面内存中；登录失败保留输入，跨标签只广播“会话变化”事件，不传播 token。公开 Nuxt SSR 使用独立公开客户端，不转发管理员 Cookie。

运维 CLI 位于 `backend/bin/site-admin`，支持 `migrate`、`init-admin --username NAME`、`reset-password --username NAME`、`diagnose`。通过 `SITE_DATABASE_PATH` 与 `SITE_ASSET_DIR` 选择目标；密码从标准输入读取，不放在命令参数。改密在事务中清除该站主全部会话。诊断接口不经公开 HTTPS 代理暴露。

## 4 检查与构建

```sh
sh scripts/dev/with-tools.sh pnpm check
sh scripts/dev/with-tools.sh pnpm test
sh scripts/dev/with-tools.sh pnpm build
sh scripts/dev/with-tools.sh pnpm test:integration
sh scripts/dev/with-tools.sh pnpm test:e2e
```

- `check`：生成类型漂移、ESLint、Prettier、TypeScript、gofmt、Go vet、已有设计约束检查。
- `test`：客户端重试/取消/幂等、管理会话竞态、后端认证与数据库的 race 测试，以及运行锁、进程清理、证书和工具摘要的故障测试；会为故障测试先构建 Go CLI。
- `build:web` / `build:admin` / `build:api`：各自独立构建；Go 不嵌入前端产物。
- `test:integration`：隔离目录及动态空闲端口，真实 HTTPS 请求与 CLI 改密、Cookie、CSRF、限频、私密字段、实际 SQLite 配置。
- `test:e2e`：同一真实服务栈上的 Firefox 登录、深链接、多标签退出、改密失效、响应式及键盘检查，无请求 mock、无忽略 TLS 错误。

测试运行目录为 `var/test/<类型>-<run-id>/`，包含脱敏结果文件、服务日志、必要截图和隔离数据库。成功或失败均停止自己启动的服务；测试生成的账号及原始诊断数据不能提交。已建立的 CI 配置可执行相同检查，远程仓库接入前不能声称远程 CI 已运行。

当前 `test:release` 尚未实现，保留到 P7 的生产产物替换和恢复验收。已有 `pnpm build` 证明三端可独立产出，不代表生产部署或完整 AC30 已通过。

前端可从子模块目录执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，不使用 Go。后端通过 `sh backend/scripts/check.sh`、`sh backend/scripts/test.sh`、`sh backend/scripts/build.sh` 独立执行，不使用 Node；在根工作区可在这些命令前加 `sh scripts/dev/with-tools.sh` 选择已锁定的 Go。合同生成与设计检查需完整根工作区，不能由单端构建结果替代。

## 5 合同与参考

根 `contracts/openapi.yaml` 是接口字段依据，根 `pnpm generate` 调用前端生成器，更新 `frontend/packages/api-client/src/generated/schema.ts`；`generate:check` 仅核对漂移。生成器默认按脚本位置定位根合同，也允许 `SITE_CONTRACTS_DIR` 显式指定合同目录；子模块中不维护合同副本。生成器无法完整表达 `ResolveConflict` 的条件 schema；编译级正反例已记录该边界，后端实现对应功能时必须进行运行时校验。

根 CI 递归检出子模块；私有子仓库需配置可读取两侧的 `SUBMODULES_READ_TOKEN`，公共仓库可使用默认 token。根 CI 分别冻结安装根目录及前端依赖，再执行合同检查、各端测试和整体 HTTPS 验收。修改合同和实现后先完成子模块提交，最后由根提交记录合同、文档与子模块指针；后续推送也遵循子仓库先、根仓库后的顺序。只有本地提交时不能把远程 CI 描述为已执行。

Firefox 测试还将 `MOZ_APP_DATA` 和 `MOZ_LOCAL_APP_DATA` 指向本次运行目录，避免启动时触及用户已有的 Firefox 数据；这与 profile 隔离同时使用，不关闭浏览器沙箱或 TLS 校验。[Mozilla 独立测试目录说明](https://bugzilla.mozilla.org/show_bug.cgi?id=2078511)

版本与配置依据：[Node 发布周期](https://nodejs.org/en/about/previous-releases)、[Go 官方发行物](https://go.dev/dl/)、[Nuxt 4 安装要求](https://nuxt.com/docs/4.x/getting-started/installation)、[pnpm 配置迁移](https://pnpm.io/migration)、[Caddy 延迟设置响应头](https://caddyserver.com/docs/caddyfile/directives/header)。具体本地结果见[P1 验证记录](../verification/P1-2026-11-17.md)。
