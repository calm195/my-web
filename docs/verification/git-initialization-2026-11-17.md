# 应用 Git 初始化与提交验证

日期：2026-11-17。范围：已有需求、设计、合同、验证脚本及开发计划纳入本地应用仓库；不包括应用脚手架开发、远程仓库创建或推送。

## 1 仓库边界

- 应用根目录 `/Users/kurous/mydoc/my-web` 已初始化为独立 Git 仓库，主分支 `main`，未配置 remote。
- 沿用用户现有 Git 提交身份，未修改全局配置。
- `.editorconfig`、`.gitattributes`、`.gitignore` 定义格式、换行及跟踪边界。Markdown 允许用于显式换行的行尾空格；验收截图按二进制存储。
- `prototype/` 继续为独立仓库，由应用仓库忽略；其原有 README 修改未改动、未提交。应用文档中的原型源码链接改为本地路径说明，避免独立克隆应用仓库后出现失效链接。
- 开发计划已将 P1 的本地仓库初始化子项标为完成，工具链与应用服务仍待实施。

## 2 提交依赖顺序

| 顺序 | 提交主题 | 内容 |
| --- | --- | --- |
| 1 | 仓库基础规则 | 格式、换行和忽略配置 |
| 2 | 需求与验收基线 | 已确认的产品行为及 AC01–AC30 |
| 3 | 架构与原型 | 技术调研、前后端分离方案、技术栈、页面设计及截图 |
| 4 | 数据库与接口合同 | SQL 迁移、OpenAPI、请求样例、交互规则及详细字典 |
| 5 | 设计验证 | 生成脚本、合同/数据库检查、独立 Python 依赖及原验证说明 |
| 6 | 开发规范与计划 | AGENTS、CONTRIBUTING、P0–P7 计划、本地联调规范、文档入口及本记录 |

实际提交标识以应用仓库的 `git log --reverse --oneline` 为准。本记录随最后一批提交，避免在文档中维护自身提交标识。

## 3 实际检查结果

| 检查 | 环境 / 操作 | 结果 |
| --- | --- | --- |
| 仓库初始化 | Git 2.54.0，`git init -b main` | 完成；分支为 main |
| 忽略范围 | `git check-ignore prototype/ scripts/__pycache__/` | 两者均被忽略 |
| 生成文件一致性 | 独立 Python 环境运行 `scripts/render_design_references.py`，前后比较 SHA-256 | 32 表字典及 58 操作目录无差异 |
| 设计检查 | 独立 Python 环境运行 `scripts/validate_design.py`；SQLite 3.54.0、OpenAPI 3.1.1 | 33 个用例全部通过 |
| 仓库文件独立性 | 用 `git checkout-index --all` 导出全部暂存文件到临时目录，不包含原型及缓存 | 导出后再次执行 33 个设计检查，全部通过 |
| 文档可移植性 | 在导出目录检查全部 Markdown 的本地链接与代码围栏，包含 AGENTS | 通过，无需本地独立原型仓库 |
| 提交空白检查 | 每批暂存后执行 `git diff --cached --check` | 已提交批次均通过；最后批次使用同一检查作为提交前置条件 |

本次使用的验证环境为 `/private/tmp/personal-website-design-venv`，暂存文件导出目录为 `/private/tmp/personal-website-git-check-d92o0v6g`。临时目录不属于版本化交付，后续可按[设计验证说明](../design/validation.md)重新创建环境运行。

验证工具导入时出现 urllib3 对本机 LibreSSL 的兼容性提示；本次检查不执行网络请求，全部本地校验正常完成。未启动 HTTP、Nuxt、Vue 或 Go 应用服务，也未进行应用联调；设计检查不能替代后续 Go 驱动、Goose 和真实服务验收。
