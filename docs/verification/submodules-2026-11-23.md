# 前后端 Git 子模块拆分验收

日期：2026-11-23。结论：拆分实现、独立工程检查、本地真实 HTTPS 和 Firefox 浏览器验证通过；尚未推送或部署，远程 CI 未执行。

## 1 版本与范围

迁移前根版本为 `113f57ee7faefb6201fc68d9dad28a28c2a6aea0`。根历史保留不重写；前后端按路径提取相关线性历史，保留作者、时间和消息，跳过该侧文件未变的提交。旧提交到提取提交的对应关系见 [历史映射](submodule-history-map.json)。

| 仓库 | 本次实现提交 | 分支 |
| --- | --- | --- |
| 后端 | `c97be3a3bec2f74c0acd10c3c9caeca9eac2a045` | `feat/split-repository` |
| 前端 | `be028e09d397b7327e0945c110e168cd25ea1ad1` | `feat/split-repository` |
| 根协调仓库 | `916a3b5434a7b69ecbcb9f277ca002c13ce8987b` | `feat/split-submodules` |

本记录及历史映射在后续文档提交中补充。根 `contracts/`、`docs/` 为唯一来源；前后端分别以 mode `160000` gitlink 管理。三个 origin 和 `.gitmodules` 使用用户提供的 `calm195/my-web`、`calm195/my-web-frontend`、`calm195/my-web-backend` GitHub SSH 地址。本轮未连接 GitHub 验证仓库权限，也未推送。

与基线逐字节比较：`contracts/openapi.yaml`、`backend/migrations/00001_initial.sql`、前端生成的 `schema.ts` 均一致。Go 业务源码未变；前端业务页面未变。关键调整为目录、依赖边界、合同生成路径、子仓库独立入口、开发规范、CI 和真实服务编排。

## 2 环境与实际命令

沿用项目锁定工具：Node 24.22.3、pnpm 12.21.0、Go 1.27.4、Caddy 2.11.9；macOS arm64，Firefox 159.0。Go modernc 实际 SQLite 3.54.1；Python 设计检查的 SQLite 为 3.54.0，两者分别记录。

从根目录执行的以下命令均通过：

```sh
sh scripts/dev/with-tools.sh pnpm dev:doctor
CI=true sh scripts/dev/with-tools.sh pnpm install:all
sh scripts/dev/with-tools.sh pnpm check
sh scripts/dev/with-tools.sh pnpm test
sh scripts/dev/with-tools.sh pnpm build
sh scripts/dev/with-tools.sh pnpm test:lifecycle
sh scripts/dev/with-tools.sh pnpm test:integration
sh scripts/dev/with-tools.sh pnpm test:e2e
sh scripts/dev/with-tools.sh node scripts/dev/workspace.mjs --locked
```

- `check`：子模块、根合同唯一来源、生成类型漂移、各端 lint/格式/类型、gofmt、vet、33 项设计验证。
- `test`：客户端 29 项、管理会话 7 项、Go race 全部测试及 6 组编排故障测试。
- `build`：Nuxt、Vue/Vite、Go API 与维护 CLI 独立构建。
- 编排修复后再次执行 `test:lifecycle`，6 组故障测试通过。
- 三个仓库均执行 `git diff --check`；现行文档相对链接和围栏检查通过。

首次临时检出使用离线安装时，pnpm 因缺少依赖元数据拒绝校验；随后联网读取元数据并按同一冻结锁文件安装成功，未关闭供应链校验或改变依赖版本。

## 3 独立工程与递归检出

独立检出目录为 `var/test/standalone-c003c19a-4177-476f-b5e6-2efab072456c/`。提交前从本地仓库克隆并应用本次待提交文件，目录中不放根合同或根文档：

- 前端：冻结安装、lint、类型检查、36 项单元测试和两个应用构建全部通过；不读取后端或调用 Go。
- 后端：`scripts/check.sh`、`test.sh`、`build.sh` 全部通过；不读取前端或调用 Node。
- 前端合同生成分别验证默认根路径、显式绝对 `SITE_CONTRACTS_DIR`；从 `/private/tmp` 执行仍能定位。相对路径与不存在目录按预期拒绝。
- 后端三个入口以伪 Go 1.26.0 执行，均按预期拒绝；4 个 shell 脚本语法检查通过。

根提交后，从根仓库递归克隆到 `var/test/recursive-07ee238f-de71-43b4-85a3-2d535032cdee/`。克隆命令使用 `--recurse-submodules`，只在本次命令通过 `url.<本地镜像>.insteadOf` 将两个 GitHub URL 映射到 `var/repos/` 本地镜像，并显式允许该命令使用 file 协议；未修改全局 Git 配置。两个子模块检出精确提交，`workspace.mjs --locked` 通过。该检查证明本地固定版本可检出，不代表远程仓库已有这些提交。

## 4 真实 HTTPS 与浏览器

接口验证：`var/test/integration-cc52b960-b93a-4c1d-ae9a-80adc6dcbcc3/`，入口 `https://localhost:49221`，9 组通过。覆盖公开 DTO、SSR/管理深链接、未认证与来源校验、严格 JSON、Secure/HttpOnly Cookie、稳定 CSRF、公开 SSR 私密隔离、退出、会话轮换、CLI 改密使全部会话失效、限频、实际数据库配置和日志脱敏。

浏览器验证：`var/test/e2e-2a663104-c524-4f39-93ee-585461d9b0ff/`，入口 `https://localhost:49200`，6 组通过。覆盖公开 SSR 与激活、受保护深链接、错误输入保留、真实登录 Cookie/内存会话、跨标签退出、改密失效，以及 360/768/1440 宽度与键盘焦点。无页面脚本异常；桌面首页、登录页和手机首页截图已人工查看。

客户端与 Firefox 均正常验证本地 CA；Firefox 只在独立 profile 信任该 CA，`ignoreHTTPSErrors=false`，未修改系统信任。

首次并行运行暴露 Nuxt 共用 `.nuxt` 锁造成进程接管，接口环境超时、浏览器连接拒绝。本次修复将 Nuxt `buildDir`、Vite `cacheDir` 隔离到各自运行目录，并给 Nuxt 显式传入端口、`--strictPort`、`--no-takeover`。修复后上述两套真实服务并行运行均通过，证明不会因共享编译锁互相接管。

## 5 日志、清理与限制

本地日志保留在被忽略的 `var/migration/`：`check-final.log`、`test.log`、`build.log`、`lifecycle-final.log`、`install-all.log`、`standalone.log`、`recursive.log`、`integration-fixed.log`、`e2e-fixed.log`、`design-final.log`。首次失败日志保留用于追溯，不作为通过证据。各运行目录保留 `result.json`、服务日志和浏览器截图，不提交数据库、证书或账号。

仅停止本任务创建的服务，完成时通过 `ps` 与运行记录检查，未发现遗留项目服务进程、`processes.json` 或测试运行锁。既有 `prototype/README.md` 未提交修改保留；原源码及后端运行产物备份位于被忽略的 `var/migration/`。

验证范围为本机 macOS/Firefox 与临时 SQLite。远程 GitHub 拉取权限、远程 CI、Linux/其他浏览器、生产部署和 P2 以后业务不在本次通过范围。私有子仓库的远程 CI 需配置 `SUBMODULES_READ_TOKEN`；推送时先后端、前端，最后根仓库，确保根指针引用的子提交可获取。

## 6 拆分遗留清理（2026-11-23）

后续清理删除 `var/migration/` 中的旧 `apps-original`、`packages-original`、`backend-original`、一次性提取脚本与临时索引，以及本次独立检出、递归检出的测试副本。历史映射已提交到本文相邻 JSON，不依赖已删除的临时映射；递归结果另存 `var/migration/recursive-result.json`。验收日志、HTTPS 结果、浏览器截图及本地 Git 镜像保留。

根 `node_modules` 从遗留完整应用依赖中重建，仅按根冻结锁文件离线安装 86 个所需包，占用从约 316 MiB 降至约 46 MiB。本次清理目标原占用约 666 MiB，重新安装后净减少约 620 MiB；操作清单在本地 `var/migration/cleanup-result.json`。前后端子模块和原型源码未变。

根格式忽略规则移除过时的 `packages/` 路径，并明确忽略前后端子模块；它们的格式检查由各自工程执行。根 Node 配置、工具链与依赖仍用于服务编排、检查和浏览器测试，继续保留。

清理后 `pnpm check`（含前后端检查及 33 项设计验证）、`workspace.mjs --locked`、Playwright 1.65.1 工具加载及 `git diff --check` 均通过；未改业务代码，本次未重复 HTTPS 或浏览器全流程。
