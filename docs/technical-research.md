# 个人网站轻量技术调研

日期：2026-11-15  
依据：个人网站需求文档 v1.3  
用途：为正式技术方案提供选型依据与同步设计建议。本文件没有实施后端或执行性能验收。

选型已在后续[开发详细设计](design/README.md)中落实；本文件保留调研背景和当时观察，依赖锁定与实现边界以详细设计为准。

## 1 推荐结论

按已确认的前后端分离约束，推荐 Nuxt 公开网站、Vue 3 / TypeScript / Vite 管理端，以及独立 Go API。SQLite、本地私有图片目录、Git CLI 和持久同步任务只归后端管理；前端通过 API 取数，不访问数据库或仓库。

生产运行一个 Nuxt Node 进程和一个 Go 进程，管理端作为独立静态文件由反向代理托管，前后端分别发布。Nuxt 承担页面渲染，Go 承担全部业务 API；首版不增加 Redis、独立消息队列或数据库服务器。增加 Node 运行时是本方案为公开页面初始 HTML 和前端独立开发作出的取舍。

这是基于本项目“单站主、读多写少、需要持久同步任务与独立前端”的工程判断，不代表语言或框架的通用性能排名。

## 2 前端路线比较

| 路线 | 生产运行形态 | 与本需求的适配 | 主要代价 | 结论 |
| --- | --- | --- | --- | --- |
| Nuxt SSR + Vue 管理端 + Go API | 独立 Node 前端、Go 后端、静态管理端 | 页面初始 HTML 可包含公开正文，发布无需重建页面 | 需维护一个前端 Node 运行进程 | 推荐 |
| Vue SPA + Go API | 静态公开前端及管理端、独立 Go 后端 | 页面与 API 分离，运行组件较少 | 首次正文、搜索收录和分享摘要需要额外处理 | 备选 |
| 静态生成公开站 + Vue 管理端 + Go API | 静态页面、Go 后端、构建任务 | 适合内容变更较少的场景 | 发布与撤回需协调重新生成及缓存清理 | 首版不采用 |

Nuxt 支持服务端渲染、客户端渲染和混合方式；本方案采用独立 Node SSR 前端，业务数据由 Go API 提供。是否使用 Nuxt 的全栈能力是项目选择，本项目不在 Nuxt 中实现业务 API。[Nuxt 渲染](https://nuxt.com/docs/4.x/guide/concepts/rendering)、[Nuxt 部署](https://nuxt.com/docs/4.x/getting-started/deployment)

公开 SSR 页面通过服务端 API 地址获取数据；浏览器通过同源 `/api/v1` 请求。使用 Nuxt 的数据获取机制传递公开页面初始数据，不把站主 Cookie、修改稿或私密字段带入公开页面载荷。[Nuxt 数据获取](https://nuxt.com/docs/4.x/getting-started/data-fetching)

Vite 管理端构建输出作为独立静态产物，生产由代理托管，不使用 `vite preview`。[Vite 静态部署](https://vite.dev/guide/static-deploy.html)

## 3 组件建议与界限

| 层 | 建议 | 实施边界 |
| --- | --- | --- |
| 公开界面 | Nuxt、Vue 3、TypeScript | 独立前端服务负责 SSR、路由、元信息与交互 |
| 管理界面 | Vue 3、TypeScript、Vite | 独立静态产物，由反向代理托管 |
| HTTP API | Go `net/http`、JSON、OpenAPI | 不包含页面模板与前端构建产物，统一业务与权限校验 |
| 数据访问 | `database/sql`、SQL migration、SQLite 驱动 | 显式事务和约束，避免先引入大型 ORM |
| SQLite 驱动 | 已选择 `modernc.org/sqlite` | CGo-free 便于构建；锁定兼容依赖，核对实际内嵌 SQLite 版本 |
| Markdown | Goldmark，按需求启用表格等扩展 | 原文保存，HTML 为派生结果；预览和发布共用同一后端渲染入口 |
| 同步执行 | 数据库 outbox + 应用内受控 worker + Git CLI | 持久任务、租约及重试；网络操作不占用数据库写事务 |
| 图片 | 本地私有资源目录，按摘要寻址 | 元数据与公开引用由数据库管理，不直接把整个 uploads 目录作为静态网站 |
| HTTPS | Caddy 或现有反向代理 | Caddy 可自动管理 HTTPS，但域名与网络条件仍需满足 |

Go 统一处理 Markdown、代码高亮与 HTML 清洗，API 返回清洗后的正文和目录。前端仅在专用正文组件中展示该 HTML；标题和评论使用 Vue 文本插值，用户内容不得作为 Vue 模板编译。预览与发布复用管线，Goldmark 保留默认禁止原始 HTML 的边界。[Vue 安全说明](https://vuejs.org/guide/best-practices/security.html)、[Goldmark 安全说明](https://github.com/yuin/goldmark#security)

Goldmark 仓库当前提示 v2 仍处于早期阶段；实施时选择与所需扩展兼容的稳定版本并锁定依赖，不直接追随主分支。[Goldmark 仓库](https://github.com/yuin/goldmark)

`modernc.org/sqlite` 文档说明其为 CGo-free SQLite 驱动，并要求配套 `modernc.org/libc` 版本一致。[驱动文档](https://pkg.go.dev/modernc.org/sqlite)

Caddy 可自动获取、更新证书并处理 HTTPS 跳转。[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)

### 本次实际查到的版本信息

下表是 2026-11-15 查询得到的文档页面信息，不声称为最新版本，也不直接作为实现锁定清单。

| 文档 | 查询结果 | 使用方式 |
| --- | --- | --- |
| Go 标准库包页面 | 显示 go1.27.4，发布日期为 2026-11-10 | 只据此核验 `embed` 和模板行为；正式开发选当时受支持版本并锁定工具链 |
| modernc.org/sqlite 包页面 | 显示 v1.62.0，发布日期为 2026-11-07；支持表中的 Linux amd64/arm64 对应 SQLite 3.54.1 | 构建后仍以运行时 `sqlite_version()` 验证实际引擎 |
| Goldmark 仓库 | README 明确提示 v2 尚在早期阶段，依赖不支持 v2 的扩展时使用 v1 | 先核验扩展兼容性，再锁定具体版本 |
| Nuxt 文档 | 本次读取 4.x 部署、渲染与数据获取文档 | 作为独立公开前端的设计依据；实现版本另行锁定 |

来源：[Go embed 包页](https://pkg.go.dev/embed)、[modernc.org/sqlite 包页](https://pkg.go.dev/modernc.org/sqlite)、[Goldmark v2 状态](https://github.com/yuin/goldmark#v2-status)、[Nuxt 4.x 部署](https://nuxt.com/docs/4.x/getting-started/deployment)。

## 4 SQLite 运维约束

建议单机持久磁盘、WAL 模式、短事务、设置 busy timeout、串行管理写入；读取连接数量按实测调整。WAL 允许读写并行但同一时间仍只有一个写者，且不适用于跨机器共享网络文件系统。[SQLite WAL](https://www.sqlite.org/wal.html)

上线时通过 `SELECT sqlite_version()` 核对实际运行引擎，不能只看 Go 驱动版本。官方 WAL 文档记录的 WAL-reset 修复位于 SQLite 3.51.3 及以后，部分旧分支有回补；应选择当前受支持、已含该修复的版本。[WAL 修复说明](https://www.sqlite.org/wal.html)

在线备份使用 SQLite Backup API 或 `VACUUM INTO`，不要把运行中的单个 `.db` 文件复制操作当作完整快照。备份还要包括原始资源、回收站所需资源及必要配置，并进行实际恢复演练。[SQLite 在线备份](https://www.sqlite.org/backup.html)

如果后续出现多个应用实例、大量并发写入或必须跨主机访问数据库，重新评估 PostgreSQL；首版不为尚未出现的需求增加这些组件。[SQLite 适用范围](https://sqlite.org/whentouse.html)

## 5 发布与同步分离

以下为项目设计建议，不是框架自带保证。

1. 在同一个 SQLite 事务内写入不可变内容版本、更新公开指针或修改稿指针、递增对象 generation，并写入 outbox。
2. 网站发布成功以本地事务成功及必需资源可用为准，立即返回当前公开版本与独立同步状态。
3. 后台 worker 从持久 outbox 领取任务，在事务外读写仓库；重启后可重新领取超时任务。
4. 每个仓库首版只运行一个同步执行器，避免自身并行提交。每次处理前重新读取对象最新 generation，过期任务不得覆盖新发布、撤回或删除。
5. Git 成功之后才更新对应共同版本与 outbox 状态。进程在 Git 成功、数据库标记前退出时，重试通过内容摘要与操作标识识别“已经同步”，不得再生成重复发布或循环提交。
6. 内存 goroutine 或 FastAPI BackgroundTasks 可以负责调度，但不能替代数据库任务记录；重要任务必须具备持久化和恢复机制。

仓库工作区使用独立服务目录，克隆整个指定分支，不改用户日常编辑的工作目录。以操作系统文件锁保护该工作区，第二个应用实例不能同时启动同步执行器；进程退出后锁自动释放。任务领取使用 SQLite 事务记录 owner、lease 和 attempt，服务重启时恢复超时任务；每次写回状态校验任务 token 和对象 generation。首版是单机单同步执行器设计，不把可到期的数据库 lease 当作已经实现了多机分布式互斥。Git 网络调用采用参数数组、超时和固定内容路径范围，不拼接用户文本到 shell 命令。

FastAPI 文档把 BackgroundTasks 定义为响应后的进程内任务，并区分更复杂的任务工具；上面的 outbox 方案是为了本项目重试与崩溃恢复要求而追加的设计。[FastAPI BackgroundTasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)

## 6 公开版本与修改稿

建议 `content_objects` 保存稳定 id、类型、slug、生命周期、`published_revision_id`、`draft_revision_id`、`generation`。`content_revisions` 保存不可变的标题、摘要、正文、分类标签及资源引用。公开查询始终只按 `published_revision_id` 取数；修改稿的分类、封面和摘要同样不能提前出现在公开列表或搜索中。

保存修改稿只替换 draft 指针；发布创建或选定版本、更新 published 指针，再产生同步任务。撤回清除公开指针或设置不可公开状态，保留历史与评论。回收站保留对象、版本与资源引用，恢复时保持未发布。彻底删除保留最小 tombstone/generation，用来拒绝迟到事件，不能让旧提交复活内容。

## 7 建议的仓库文件协议

```text
content/
  schema.json
  posts/<stable-id>/
    object.json
    published.md
    draft.md
  projects/<stable-id>/...
  profile/<stable-id>/...
  skills/<stable-id>/...
assets/<sha256>.<ext>
```

- `object.json` 记录稳定 id、对象类型、schema version、slug、公开生命周期，以及两个版本文件的用途；标题、摘要、分类标签等可编辑字段存于对应版本文件中，避免修改稿污染公开元数据。
- `published.md` 存当前公开版本，`draft.md` 存未发布工作版本。新建未发布内容可以只有 draft；撤回保留上次公开版本但对象公开状态为 false。
- 本地修改 draft 仅保存修改稿；修改 published 并保持对象发布状态才更新线上。两个动作不可使用同一含糊的 `status: draft` 表达。
- 同一对象的两个合法版本共享对象 id，不应被误判重复；两个独立对象声明同一 id 则拒绝。
- 对象目录整体移除才是对象删除；只移除 draft 是丢弃修改稿；只移除一张仍被引用的图片应触发资源校验。
- 未识别字段保留或明确拒绝，不能在导入导出过程中静默丢失。文件协议必须有 schema version，后续迁移显式执行。
- 仓库不包含 SQLite、评论、私密邮箱、管理账号、密钥、任务日志或回收站数据库备份。

## 8 冲突、重试和仓库事件

对每个对象保存最近共同快照 B、网站当前快照 L、仓库当前快照 R。比较完整对象状态与版本内容，而不只比较正文：

| 条件 | 动作 |
| --- | --- |
| R 与 B 一致、L 有变化 | 将网站变化写入仓库 |
| L 与 B 一致、R 有变化 | 导入仓库变化，按其明确用途保存或发布 |
| L 与 R 一致 | 标记收敛，不产生重复提交 |
| L、R 都偏离 B 且不同 | 标记冲突，保留双方和网站当前状态，交站主处理 |

删除也作为对象状态参与三方比较。“一端删除、另一端修改”不能自动删除或自动恢复。先 fetch 指定分支，记住远端 HEAD，在完整工作区上只修改通过三方比较的对象，基于该 HEAD 产生新提交，再执行不带 force 的正常 fast-forward push。远端在此期间前进而导致拒绝时，重新 fetch、比较并生成提交，不自动合并同一对象的字段，也不覆盖远端提交。[Git push](https://git-scm.com/docs/git-push)

本地 Git 引用可用 `git update-ref <ref> <new> <old>` 做带旧值检查的条件更新；它只保护本地引用，不能替代远端 push 的并发保护。仓库 API 若支持 expected-head，则也可在未来实现中采用，但首版不同时维护 Git CLI 与提供方 API 两套写入路径。[Git update-ref](https://git-scm.com/docs/git-update-ref)

接收事件时校验来源和分支，将事件仅作为“需要对账”的信号，读取当前分支 HEAD，而不是按通知到达顺序盲目应用旧提交。保存已处理 delivery id、commit 和每对象版本；重复 webhook、自身提交回调与乱序通知都不产生重复内容。定时对账作为漏通知补偿，不需要为首版增加独立消息系统。

## 9 图片与缓存

原始图片保存于非公开目录，以内容摘要和 MIME 记录身份。公开资源请求先验证该资源是否被当前公开版本引用，再返回文件；草稿预览走管理员会话。相同图片同时被公开文章引用时可公开，但这不会公开引用它的修改稿本身。

首版无需 CDN；公开动态 HTML、API、页面数据载荷、受控图片及管理预览统一使用 `Cache-Control: no-store`，不启用页面静态生成、SWR、ISR 或持久页面缓存。撤回后新请求重新校验公开状态，前端页面跳转和恢复焦点时重新取数；已经加载或另行保存的内容不能远程收回。只有带摘要且不含业务内容的构建资源可长缓存。图片生成过程和 Git 网络操作都不应持有 SQLite 写事务。

## 10 建议先验证的技术切片

正式全面开发前，先跑通一条完整链路：后台保存修改稿 → 公开页不变 → 后台发布且仓库离线 → 网站已更新、任务失败可见 → 仓库恢复重试 → 本地并发修改制造冲突 → 人工选定版本 → 删除进入回收站 → 旧事件不复活 → 恢复后仍未发布。

这条切片应同时验证标题、摘要、分类和图片的公开边界，不能只验证正文。完成后再展开更多页面和编辑功能。页面原型可展示上述状态，但不应宣称已经实现或通过真实 Git 同步、权限、备份和性能验收。
