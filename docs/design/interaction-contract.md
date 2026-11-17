# 前后端交互规则

版本：1.0，2026-11-15。接口字段和路径以 [OpenAPI](../../contracts/openapi.yaml) 为准。本文件规定跨接口一致的行为，尤其是会话、重复提交和发布状态；这些规则必须同时落实到 Go 与前端请求适配器。

## 1 请求与响应

| 项目 | 约定 |
| --- | --- |
| 路径 | `/api/v1/public/*` 与 `/api/v1/admin/*`；公开受控图片为 `/media/{sha256}/{variant}` |
| 数据 | JSON，UTF-8，字段 snake_case；上传使用 multipart/form-data |
| 标识 | UUID 字符串；资产使用小写 SHA-256；前端不得将 id 转为整数 |
| 时间 | API 为带 `Z` 的 RFC3339 UTC；展示按站点 IANA 时区；SQL 为 Unix 毫秒 |
| 数值 | generation 为正整数且不超过 JavaScript 安全整数上限；布尔使用 true/false |
| 空值 | null 表示已定义但未设置；请求字段省略仅在合同明确可选时允许；空字符串不是通用 null |
| 成功 | 直接返回具体资源，不增加重复的 `{code:200,data:...}` 外壳；201 新建，202 排队，204 无正文 |
| 分页 | `{items,page,page_size,total}`；默认 20，最多 100，page 从 1 开始；越界页返回空 items |
| 错误 | 使用正确 HTTP 状态和 `Error` 对象，不把所有失败包装成 HTTP 200 |
| 追踪 | 所有响应有 `X-Request-ID`；前端可在失败详情中提供复制，不向普通访客显示技术堆栈 |
| 缓存 | 所有动态 HTML、API、payload、预览和受控图片使用 no-store |

解码或查询参数结构错误返回 400；格式正确但违反业务校验返回 422。请求未知字段拒绝，避免拼写错误和越权字段被悄悄忽略；客户端容忍响应新增字段。列表过滤条件取 AND，前端改变条件后 page 重置为 1。

## 2 认证与 CSRF

1. 通过部署 CLI 创建唯一站主账号；不提供公开注册和找回密码 API。CLI 修改密码时使所有现存会话失效。
2. 登录 POST `/admin/session`，Go 校验用户名、Argon2id 密码、同源 Origin/Referer 和限频；返回身份、csrf_token、expires_at，并设置会话 Cookie。
3. Cookie 名为 `__Host-site_session`，设置 HttpOnly、Secure、SameSite=Lax、Path=/，不设置 Domain。会话随机 token 至少 32 字节，数据库只存 SHA-256。
4. CSRF token 由 `HMAC-SHA256(CSRF_KEY, session_token)` 派生，登录和 GET session 返回同一个会话的派生值；库中只存其 hash。这样刷新页面可重新取得 token，多个标签页也不会互相使 token 失效。
5. 已认证 POST/PUT/PATCH/DELETE 携带 `X-CSRF-Token`，包括只读的 POST 预览、影响预览；Go 比较 token 并校验来源。登录没有旧 CSRF token，因此独立做来源验证。退出校验 CSRF、删除会话并清 Cookie。
6. 初始会话策略：绝对有效期 24 小时、空闲 2 小时，last_seen 最多每 5 分钟更新一次；登录刷新会话 token。参数可配置，但前后端必须按服务端返回的状态处理。

管理端启动调用 GET session，401 跳转登录。保存时遇到 401 保留内存输入，登录后先重新读取 generation 再提交；不自动覆盖新数据。403 表示权限或 CSRF 拒绝，不做无限重试。前端路由守卫不构成权限边界，Go 对每个管理请求重新校验。

Nuxt 公开 SSR 不接收管理员授权来查询内容，只请求公开 API；站主访问自己的公开站也只能得到公开快照。浏览器 API 同源访问，默认不开放 CORS；开发代理转发 API。未来跨来源部署须另行设计精确来源与凭据配置。

开发联调同样通过本地 HTTPS 入口访问前端和 API，以验证 Secure Cookie；允许的开发 Origin 显式配置，不通过关闭认证、CSRF 或修改生产 Cookie 策略绕过联调问题。

## 3 乐观并发

内容保存、发布、撤回、删除、恢复均提交 `expected_generation`。Go 在写事务中执行相当于：

```sql
UPDATE content_objects
SET draft_revision_id = :new_revision, generation = generation + 1, updated_at = :now
WHERE id = :id AND generation = :expected_generation AND lifecycle = 'active';
```

影响行数不是 1 时整个事务回滚，返回 409 `CONTENT_VERSION_CONFLICT`，带 current_generation。已经插入的新版本不能留成一次“部分保存”。新建对象 generation 从 1 开始。

前端保留输入，展示服务端最新版本供比对，用户确认后使用新的 generation 发起新操作。不能收到 409 后自动替换版本号再次保存。不同标签页、仓库导入、分类批量变更都遵守同一规则。

配置和分类目录各有独立 generation；评论管理采用 `expected_thread_generation`，线程中任何新增回复、隐藏/恢复或删除都会增加线程版本，避免确认删除后遗漏刚新增的回复。

## 4 幂等与重试

- OpenAPI 标记的持久写操作要求 `Idempotency-Key`（UUID）。用户开始一次提交时生成，网络重试复用；修改了输入或解决了版本冲突后生成新键。
- 后端在完成认证、CSRF 和限频后检查幂等记录，再检查业务 generation。同 scope、同键、同请求摘要返回原成功响应；不执行第二次写入。同键不同摘要返回 409 `IDEMPOTENCY_KEY_REUSED`。
- scope 包括认证用户或 anonymous、HTTP 方法与规范路径。匿名键为高熵 UUID，重放响应只含公开 DTO；不能凭键取邮箱。读取重放响应前仍校验目标当前可公开，已撤回/隐藏则返回 404，而非重放旧正文。
- 请求摘要对规范化 JSON 计算 HMAC；上传摘要基于已验证文件 SHA-256 与规范字段，不基于随机 multipart 边界。HMAC 密钥在后端，避免存储可被离线猜测的邮箱摘要。
- 业务写入、outbox、审计和成功幂等记录在同一数据库事务提交。仅成功结果保留 24 小时；失败后回滚、不保留成功响应。超出窗口不能承诺去重，前端应先查询当前状态，不能无限重发。
- 并发同键由写事务串行和主键唯一约束收敛；第二个请求重读记录。不可用“先查询、事务外执行业务、最后记键”的流程。
- 重放成功响应增加 `Idempotency-Replayed: true`；响应代表原操作结果，前端随后重新查询当前状态，不能拿旧响应覆盖后续发布或撤回。彻底删除内容、删除评论时清理该资源旧幂等记录，避免删除后仍保留其历史正文副本。
- 登录、退出、只读预览及影响预览不记录业务幂等响应；退出失效返回 401，前端可按已退出处理。只读 POST 仍校验 CSRF。

GET 遇到网络或 503 最多自动重试 2 次，采用短退避；400/401/403/404/409/422 不自动重试。429 按 Retry-After 提示等待。写请求网络状态不明时使用原幂等键查询/重试一次，仍不明则显示“结果待确认”，保留输入；不能把超时解释成一定没保存。

## 5 内容编辑与发布

完整修改稿字段由 ContentDraft 的四个类型 schema 定义。PUT draft 是完整替换，允许内容暂不完整，但仍检查字段类型、长度、链接协议、合法资产及分类关系。

| 内容类型 | 发布必需 | 编辑与公开规则 |
| --- | --- | --- |
| article | 非空 title、summary、markdown，tech/life，合法 slug | 最多一个匹配频道的分类、20 个标签；目录仅 H2/H3 |
| project | 非空 title、summary、markdown，合法 slug | role、时间范围、技术栈、链接可选；featured/order 随版本发布 |
| profile | 非空 title（显示名）、summary（短介绍） | 全站唯一；cover 作为头像，slug 必须 null |
| skill | 非空 title、summary（实践说明）、group_name | 一条技能为一个对象；分组由 group_name 展示，slug 必须 null |

发布使用明确的 revision_id，只允许该对象所属且资料完整的保留版本；若还有更新的修改稿，发布历史版本不能丢弃该修改稿。发布当前 draft 时清空 draft 指针，但保留历史 revision。公开时间首次确定后不因编辑改变；允许首次导入历史发布时间，不接受未来时间，首版没有定时发布。

成功响应同时给出 visibility、published、draft 和 sync。网站已发布且 sync.state=failed 时显示“已发布，仓库同步失败”；不能自动撤回已发布版本。公开列表、详情、元信息、图片、分类和规范链接均来自同一个公开快照。

旧 slug 由 API 返回 308 Location，Nuxt 将页面跳转到 canonical_path；必须先确认内容仍公开。已撤回内容的旧/新路径都返回 404。请求适配器识别最终规范路径，不能把管理端生成地址用于公开页。

## 6 评论与邮箱

根评论分页与回复分页分开，避免一个长线程让列表响应无限增长。根评论按时间倒序；回复按时间正序平铺，reply_to_id 指向同一线程的目标，显示目标昵称快照。

访客只可填写 target、reply_to_id、nickname、body、email。站主使用管理接口发评论，author_kind 由会话确定。公开响应及 SSR payload 没有邮箱字段；邮箱仅在管理查询中出现，不能进入 Git、审计正文或幂等重放响应。

隐藏根评论使整组不可见，恢复不覆盖回复自身隐藏状态。删除根评论删除线程和全部回复；删除一条回复后其他回复仍存在，目标 id 变为 null，目标昵称快照保留。评论写入事务内重新检查文章与目标仍公开。

## 7 异步任务与冲突解决

202 `{job_id,state:queued}` 只表示入队。前端在页面可见时每 2 秒查询任务，连续 30 秒未完成后减至每 10 秒；离开页面停止轮询，后台任务继续执行。

job 状态为 queued/running/retry_wait/succeeded/failed/conflict/superseded；内容同步状态为 pending/syncing/synced/failed/conflict。两者不是相同枚举。存在未解决冲突优先显示 conflict；否则根据最新 generation 的任务推导，旧成功任务不把新修改标成 synced。

冲突解决提交本地 generation、远端快照 digest、selection 和 action；manual 还需完整 merged_draft。后端先持久记录意图，再由 worker fetch 远端并校验双方状态：

1. 无法连接仓库：任务失败，冲突回到 open，网站不应用解决结果。
2. 任一版本已变化：标记过期，刷新三方比较；不能套用旧选择。
3. 校验一致：按明确动作在本地事务应用，写下一次同步任务；不在选择 remote 时隐含发布。
4. 普通 push 前再次核对已确认远端 digest；远端再变则产生新冲突，网站维持已经生效的状态。

选择不存在的远端对象不能用于 save_draft/publish；选择 save_draft 时本地仍在回收站则返回状态冲突，先显式恢复为未发布。trash 只适用于文章和项目。resolve 请求通过结构校验不等于业务已完成，最终结果查询 job 和内容状态。

## 8 分类标签变更

分类和标签名称保存在版本快照中，普通编辑不直接修改已有快照。目录改名或删除先调用 impact 预览，返回受影响内容数量和短期 token；确认 apply 时同时提交相同 change 与 generation。

后端原子复制所有受影响当前版本：公开版本从原公开内容复制，修改稿从原修改稿复制，分别替换标签；各对象 generation 增加并产生同步任务。历史版本保留旧名称。删除目录项可迁移到同类型/同频道项，或移除当前关系；目录项退休、历史记录保留。回收站的保留指针也执行相同关系更新，但不改变其下线状态。

影响 token 绑定操作内容、目标目录版本及受影响对象 generation，5 分钟有效；期间任一内容变化都需重新预览。批量操作首版在单事务完成，上线用约定内容规模测量，不隐式拆成可能半成功的多批。

## 9 初始限制与超时

以下是开发默认值，可配置但调整须同步 API schema 和提示。它们不是容量承诺。

| 项目 | 初始值 |
| --- | --- |
| 标题 / 摘要 / Markdown | 120 / 500 / 200000 个 Unicode code point |
| 评论昵称 / 正文 | trim 后 1–40 / 1–2000 字符 |
| JSON 请求体 | 最大 2 MiB；额外受字段长度限制 |
| 图片 | 单文件 10 MiB，JPEG/PNG/WebP，解码最多 4000 万像素；禁动画 |
| 搜索 | q 最多 100 字符；trim + Unicode case fold，按字面包含匹配标题摘要 |
| 匿名评论限频 | IP 的带盐 HMAC 桶每分钟 5 次、每小时 60 次；不存明文 IP，单机内存实现 |
| 登录限频 | 账号与 IP 桶各每 15 分钟最多 5 次失败，返回 429，不泄露账号存在性 |
| 浏览器请求超时 | 查询 10 秒，普通写 20 秒，上传 60 秒；超时不等于事务回滚 |
| Go SQL busy timeout | 5 秒，超时转换为可识别的繁忙错误，不无限等待 |
| Git 单次网络操作 | 60 秒超时，最多 5 次自动重试后人工处理 |
| 影响 token / 幂等记录 | 5 分钟 / 24 小时 |

反向代理请求体上限必须略高于图片上限以容纳 multipart 开销，最终由 Go 校验实际文件字节。限频和密码参数需在上线环境验证；内存限频不承诺跨实例共享，首版只运行一个 Go 实例。
