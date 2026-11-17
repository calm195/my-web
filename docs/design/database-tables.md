# 数据库逐表字典

版本：1.0，2026-11-15。由建表脚本和 `scripts/render_design_references.py` 的字段说明生成。

类型、空值、默认值、主外键和索引取自实际 SQLite schema；CHECK、trigger 及跨表事务规则分别见 [SQL](../../backend/migrations/00001_initial.sql) 和 [数据库设计](database-design.md)。

所有时间字段均为 UTC Unix 毫秒；API 转 RFC3339。所有表为 STRICT，所有写连接必须启用外键。

## 1 admin_users

唯一站主账号；不参与内容同步。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `singleton` | INTEGER | 否 | `1` | — | 固定 1，唯一约束限制单站主 |
| `username` | TEXT | 否 | 无 | — | 登录名，NOCASE 唯一，1–80 字符 |
| `password_hash` | TEXT | 否 | 无 | — | 包含盐和参数的 Argon2id 编码串 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `password_changed_at` | INTEGER | 否 | 无 | — | 最近改密时间；改密使现存会话失效 |

表内唯一约束：`UNIQUE (username)`；`UNIQUE (singleton)`。

## 2 sessions

服务端会话，仅存 token 和 CSRF 的摘要。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `token_hash` | BLOB | 否 | 无 | PK 1 | 会话 token 的 SHA-256，32 字节 |
| `admin_id` | TEXT | 否 | 无 | FK admin_users.id / DELETE CASCADE | 站主账号 id |
| `csrf_hash` | BLOB | 否 | 无 | — | 派生 CSRF token 的 SHA-256，32 字节 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `last_seen_at` | INTEGER | 否 | 无 | — | 最近会话活动时间 |
| `expires_at` | INTEGER | 否 | 无 | — | 绝对过期时间，毫秒 |

显式索引：

```sql
CREATE INDEX idx_sessions_admin ON sessions(admin_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
```

## 3 site_settings

单例站点名称、介绍和展示时区。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER | 否 | 无 | PK 1 | 固定 1，仅一份站点设置 |
| `title` | TEXT | 否 | 无 | — | 公开站点名称，1–80 字符 |
| `description` | TEXT | 否 | `''` | — | 站点介绍，最多 300 字符 |
| `timezone` | TEXT | 否 | `'Asia/Shanghai'` | — | IANA 时区名称，由服务校验 |
| `generation` | INTEGER | 否 | `1` | — | 单调递增的业务并发版本，正整数 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

## 4 repository_config

单例仓库配置，保存凭据别名而非密钥。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER | 否 | 无 | PK 1 | 固定 1，仅一个内容仓库配置 |
| `remote_url` | TEXT | 否 | 无 | — | SSH/HTTPS 仓库地址，不可带凭据 |
| `branch` | TEXT | 否 | 无 | — | 指定同步分支名 |
| `content_dir` | TEXT | 否 | `'content'` | — | 仓库内相对内容目录，不允许越界 |
| `credential_ref` | TEXT | 否 | 无 | — | 服务器预置凭据的别名，不能包含密钥值 |
| `enabled` | INTEGER | 否 | `0` | — | 是否启用自动同步，0/1 |
| `poll_interval_seconds` | INTEGER | 否 | `60` | — | 轮询周期，30–3600 秒，默认 60 |
| `generation` | INTEGER | 否 | `1` | — | 单调递增的业务并发版本，正整数 |
| `last_seen_commit` | TEXT | 是 | 无 | — | 最近观察到的分支 HEAD，不等于全部对象已同步 |
| `last_checked_at` | INTEGER | 是 | 无 | — | 最近检查仓库时间 |
| `last_success_at` | INTEGER | 是 | 无 | — | 最近成功对账时间 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

## 5 asset_blobs

通过解码验证并已落盘的不可变原始图片。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `sha256` | TEXT | 否 | 无 | PK 1 | 原始文件 SHA-256，小写 64 位十六进制主键 |
| `media_type` | TEXT | 否 | 无 | — | 实际解码格式，JPEG/PNG/WebP |
| `byte_size` | INTEGER | 否 | 无 | — | 文件大小，原图 1–10485760 字节 |
| `width` | INTEGER | 否 | 无 | — | 解码后宽度，正整数像素 |
| `height` | INTEGER | 否 | 无 | — | 解码后高度，正整数像素 |
| `storage_key` | TEXT | 否 | 无 | — | 服务生成的私有相对路径键，不接受外部任意路径 |
| `original_name` | TEXT | 否 | 无 | — | 原文件名，仅作管理展示，不能用于拼接存储路径 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |

表内唯一约束：`UNIQUE (storage_key)`。

## 6 asset_variants

图片缩略/阅读变体及生成结果。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `asset_sha256` | TEXT | 否 | 无 | PK 1；FK asset_blobs.sha256 / DELETE CASCADE | 被引用原图摘要 |
| `variant` | TEXT | 否 | 无 | PK 2 | thumb 或 reading |
| `state` | TEXT | 否 | 无 | — | pending/ready/failed；ready 时路径、大小、宽高都必须有值 |
| `storage_key` | TEXT | 是 | 无 | — | 服务生成的私有相对路径键，不接受外部任意路径 |
| `byte_size` | INTEGER | 是 | 无 | — | 文件大小，原图 1–10485760 字节 |
| `width` | INTEGER | 是 | 无 | — | 解码后宽度，正整数像素 |
| `height` | INTEGER | 是 | 无 | — | 解码后高度，正整数像素 |
| `error_code` | TEXT | 是 | 无 | — | 脱敏稳定错误码；无错误为 null |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

表内唯一约束：`UNIQUE (storage_key)`。

## 7 content_objects

四类内容的稳定身份、生命周期和当前版本指针。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1；FK content_revisions.content_id / DELETE NO ACTION；FK content_revisions.content_id / DELETE NO ACTION | 业务 UUID 主键 |
| `kind` | TEXT | 否 | 无 | — | article/project/profile/skill，创建后不可改 |
| `lifecycle` | TEXT | 否 | `'active'` | — | active/trash；只有文章和项目可 trash |
| `visibility` | TEXT | 否 | `'unpublished'` | — | unpublished/published；必须同时检查 lifecycle |
| `published_revision_id` | TEXT | 是 | 无 | FK content_revisions.id / DELETE NO ACTION | 当前或最后公开版本，非空不等于当前公开 |
| `draft_revision_id` | TEXT | 是 | 无 | FK content_revisions.id / DELETE NO ACTION | 未发布修改稿指针；无修改稿为 null |
| `generation` | INTEGER | 否 | `1` | — | 单调递增的业务并发版本，正整数 |
| `first_published_at` | INTEGER | 是 | 无 | — | 首次实际公开时间，后续编辑保持不变 |
| `published_updated_at` | INTEGER | 是 | 无 | — | 最近影响公开版本的时间 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |
| `trashed_at` | INTEGER | 是 | 无 | — | 进入回收站时间；active 时必须 null |

显式索引：

```sql
CREATE INDEX idx_content_admin ON content_objects(lifecycle,kind,updated_at DESC,id DESC);
CREATE INDEX idx_content_public ON content_objects(kind,first_published_at DESC,id DESC) WHERE lifecycle = 'active' AND visibility = 'published';
CREATE UNIQUE INDEX uq_profile_singleton ON content_objects(kind) WHERE kind = 'profile';
```

## 8 content_revisions

不可变编辑快照；空字段允许草稿，发布另行校验。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `content_id` | TEXT | 否 | 无 | FK content_objects.id / DELETE CASCADE | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `revision_no` | INTEGER | 否 | 无 | — | 当前对象内递增版本序号 |
| `title` | TEXT | 否 | `''` | — | 内容标题；profile 为显示名，skill 为技能名；站点设置标题最多 80 字符 |
| `summary` | TEXT | 否 | `''` | — | 摘要/短介绍/实践说明，最多 500 字符 |
| `markdown` | TEXT | 否 | `''` | — | 原始 Markdown，最多 200000 字符，草稿可为空 |
| `slug` | TEXT | 是 | 无 | — | 候选或保留的 URL 标识；合法格式由服务校验 |
| `display_order` | INTEGER | 否 | `0` | — | 展示排序，小值在前；属于版本时发布才影响公开 |
| `cover_sha256` | TEXT | 是 | 无 | FK asset_blobs.sha256 / DELETE RESTRICT | 封面/头像原图摘要，可为空，删除受 FK 保护 |
| `cover_alt` | TEXT | 否 | `''` | — | 封面或头像说明，最多 300 字符 |
| `source` | TEXT | 否 | 无 | — | admin/repository/resolution/taxonomy |
| `content_digest` | TEXT | 否 | 无 | — | 可同步业务字段规范化 SHA-256，不含本地版本时间 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |

表内唯一约束：`UNIQUE (content_id, revision_no)`；`UNIQUE (content_id, id)`。

显式索引：

```sql
CREATE INDEX idx_revision_cover ON content_revisions(cover_sha256);
```

## 9 article_revision_data

文章版本专属字段及只针对标题摘要的搜索文本。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `channel` | TEXT | 是 | 无 | — | 文章 tech/life；标签目录 all；类别必须 tech/life |
| `search_title` | TEXT | 否 | `''` | — | title 经过 trim 和 Unicode case fold 的派生搜索值 |
| `search_summary` | TEXT | 否 | `''` | — | summary 经过 trim 和 Unicode case fold 的派生搜索值 |

## 10 project_revision_data

项目版本的角色、时间和技术信息。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `role` | TEXT | 否 | `''` | — | 项目中的职责，最多 120 字符 |
| `started_on` | TEXT | 是 | 无 | — | 可选项目开始日期 YYYY-MM-DD |
| `ended_on` | TEXT | 是 | 无 | — | 可选项目结束日期，不早于开始日期 |
| `featured` | INTEGER | 否 | `0` | — | 是否精选，0/1 |
| `tech_stack_json` | TEXT | 否 | `'[]'` | — | 技术栈名称数组，API 限制最多 30 项，每项 40 字符 |

## 11 profile_revision_data

个人资料版本专属字段；名称/短介绍/头像在主版本。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `location` | TEXT | 否 | `''` | — | 选择公开的所在地，最多 120 字符 |
| `occupation` | TEXT | 否 | `''` | — | 公开职业描述，最多 120 字符 |

## 12 skill_revision_data

技能版本的分组；名称/实践说明在主版本。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `group_name` | TEXT | 否 | `''` | — | 技能分组名，最多 80 字符；发布技能必需 |

## 13 revision_renderings

正文派生 HTML 与 H2/H3 目录，按渲染器版本保存。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `renderer_version` | TEXT | 否 | 无 | PK 2 | 渲染器与清洗策略联合版本号 |
| `body_html` | TEXT | 否 | 无 | — | 统一清洗后的正文 HTML |
| `toc_json` | TEXT | 否 | 无 | — | H2/H3 目录对象数组，包含 id/text/level |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |

## 14 taxonomy_items

分类标签编辑目录，退休后仍保护历史外键。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `kind` | TEXT | 否 | 无 | — | category/tag；与 channel 组合校验 |
| `channel` | TEXT | 否 | 无 | — | 文章 tech/life；标签目录 all；类别必须 tech/life |
| `name` | TEXT | 否 | 无 | — | 分类或标签名称，目录 1–40 字符；版本关系保留快照 |
| `normalized_name` | TEXT | 否 | 无 | — | 归一化名称，供目录唯一性判断 |
| `slug` | TEXT | 否 | 无 | — | 候选或保留的 URL 标识；合法格式由服务校验 |
| `display_order` | INTEGER | 否 | `0` | — | 展示排序，小值在前；属于版本时发布才影响公开 |
| `retired_at` | INTEGER | 是 | 无 | — | 目录退休时间，不再供新版本选择 |
| `generation` | INTEGER | 否 | `1` | — | 单调递增的业务并发版本，正整数 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

显式索引：

```sql
CREATE UNIQUE INDEX uq_taxonomy_name ON taxonomy_items(kind,channel,normalized_name) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX uq_taxonomy_slug ON taxonomy_items(kind,channel,slug) WHERE retired_at IS NULL;
```

## 15 revision_taxonomy

版本使用的分类标签名称快照；最多一个分类。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `taxonomy_id` | TEXT | 否 | 无 | PK 2；FK taxonomy_items.id / DELETE RESTRICT | 稳定分类或标签 id |
| `kind` | TEXT | 否 | 无 | — | 版本快照的 category/tag 类型 |
| `channel` | TEXT | 否 | 无 | — | 文章 tech/life；标签目录 all；类别必须 tech/life |
| `name` | TEXT | 否 | 无 | — | 分类或标签名称，目录 1–40 字符；版本关系保留快照 |
| `slug` | TEXT | 否 | 无 | — | 候选或保留的 URL 标识；合法格式由服务校验 |
| `position` | INTEGER | 否 | `0` | — | 当前版本内的顺序，小值在前 |

显式索引：

```sql
CREATE INDEX idx_revision_taxonomy_target ON revision_taxonomy(taxonomy_id,revision_id);
CREATE UNIQUE INDEX uq_revision_category ON revision_taxonomy(revision_id) WHERE kind = 'category';
```

## 16 revision_assets

Markdown 实际引用的原图集合；封面另存主版本。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `asset_sha256` | TEXT | 否 | 无 | PK 2；FK asset_blobs.sha256 / DELETE RESTRICT | 被引用原图摘要 |

显式索引：

```sql
CREATE INDEX idx_revision_assets_target ON revision_assets(asset_sha256);
```

## 17 revision_links

个人公开联系方式、项目外部地址等有序链接。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `position` | INTEGER | 否 | 无 | PK 2 | 当前版本内的顺序，小值在前 |
| `label` | TEXT | 否 | 无 | — | 公开链接标签，1–80 字符 |
| `url` | TEXT | 否 | 无 | — | 链接 URI，最多 2048 字符，服务限制协议 |

## 18 revision_relations

版本关联的其他内容 id；允许保留已删除目标的历史标识。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | TEXT | 否 | 无 | PK 1；FK content_revisions.id / DELETE CASCADE | 所属不可变版本 id |
| `target_content_id` | TEXT | 否 | 无 | PK 2 | 相关内容 id，无 FK；公开查询过滤失效或非公开目标 |
| `position` | INTEGER | 否 | `0` | — | 当前版本内的顺序，小值在前 |

显式索引：

```sql
CREATE INDEX idx_revision_relations_target ON revision_relations(target_content_id);
```

## 19 content_routes

已发布规范路径与旧路径；到彻底删除前保留所有权。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `namespace` | TEXT | 否 | 无 | PK 1 | posts/projects 路由空间 |
| `slug` | TEXT | 否 | 无 | PK 2 | 候选或保留的 URL 标识；合法格式由服务校验 |
| `content_id` | TEXT | 否 | 无 | FK content_objects.id / DELETE CASCADE | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `is_current` | INTEGER | 否 | 无 | — | 是否当前规范路径，0/1 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |

显式索引：

```sql
CREATE INDEX idx_content_routes_owner ON content_routes(content_id);
CREATE UNIQUE INDEX uq_content_current_route ON content_routes(content_id) WHERE is_current = 1;
```

## 20 comment_threads

根留言及平铺回复所在的线程，统一管理并发版本。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `scope` | TEXT | 否 | 无 | — | article/guestbook；前者必须有 content_id，后者必须 null |
| `content_id` | TEXT | 是 | 无 | FK content_objects.id / DELETE CASCADE | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `generation` | INTEGER | 否 | `1` | — | 单调递增的业务并发版本，正整数 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

显式索引：

```sql
CREATE INDEX idx_threads_source ON comment_threads(scope,content_id,created_at DESC,id DESC);
```

## 21 comments

根留言与回复的公开文字、目标快照及自身可见状态。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `thread_id` | TEXT | 否 | 无 | FK comment_threads.id / DELETE CASCADE | 所属根留言线程 |
| `is_root` | INTEGER | 否 | 无 | — | 是否根留言，0/1；每线程最多一个根 |
| `reply_to_id` | TEXT | 是 | 无 | FK comments.id / DELETE SET NULL | 同线程回复目标，目标删除后设 null |
| `reply_to_nickname` | TEXT | 是 | 无 | — | 回复目标昵称快照，目标删除仍保留 |
| `nickname` | TEXT | 否 | 无 | — | 展示昵称，trim 后 1–40 字符，不代表身份认证 |
| `body` | TEXT | 否 | 无 | — | 纯文本评论，trim 后 1–2000 字符 |
| `author_kind` | TEXT | 否 | `'visitor'` | — | visitor/owner；只能由服务端认证结果决定 |
| `state` | TEXT | 否 | `'visible'` | — | visible/hidden，只记录自身状态；根和文章状态另参与公开判断 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

显式索引：

```sql
CREATE INDEX idx_comments_reply ON comments(reply_to_id);
CREATE INDEX idx_comments_thread ON comments(thread_id,created_at,id);
CREATE UNIQUE INDEX uq_thread_root ON comments(thread_id) WHERE is_root = 1;
```

## 22 comment_contacts

可选私密邮箱，禁止公开查询和仓库导出。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `comment_id` | TEXT | 否 | 无 | PK 1；FK comments.id / DELETE CASCADE | 对应评论 id |
| `email` | TEXT | 否 | 无 | — | 私密联系邮箱，最多 254 字符，仅管理端查询 |

## 23 sync_snapshots

规范化对象同步快照；包含完整公开/草稿和删除状态。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `content_id` | TEXT | 否 | 无 | — | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `digest` | TEXT | 否 | 无 | — | 规范化同步快照 SHA-256 |
| `payload_json` | TEXT | 否 | 无 | — | 类型化 JSON 对象；快照或任务载荷，结构由服务/schema 校验 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |

表内唯一约束：`UNIQUE (content_id, id)`；`UNIQUE (content_id, digest)`。

## 24 sync_snapshot_assets

共同基线、冲突及解决意图所需图片的引用保护。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `snapshot_id` | TEXT | 否 | 无 | PK 1；FK sync_snapshots.id / DELETE CASCADE | 被引用的完整同步快照 id |
| `asset_sha256` | TEXT | 否 | 无 | PK 2；FK asset_blobs.sha256 / DELETE RESTRICT | 被引用原图摘要 |

显式索引：

```sql
CREATE INDEX idx_sync_asset_pins ON sync_snapshot_assets(asset_sha256);
```

## 25 sync_bases

最后实际收敛的共同对象快照及仓库提交。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `content_id` | TEXT | 否 | 无 | PK 1；FK sync_snapshots.content_id / DELETE RESTRICT；FK content_objects.id / DELETE CASCADE | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `snapshot_id` | TEXT | 否 | 无 | FK sync_snapshots.id / DELETE RESTRICT | 被引用的完整同步快照 id |
| `repository_commit` | TEXT | 否 | 无 | — | 共同基线实际确认的远端 commit OID |
| `synced_generation` | INTEGER | 否 | 无 | — | 实际同步成功的网站 generation |
| `synced_at` | INTEGER | 否 | 无 | — | 共同基线确认时间 |

## 26 sync_conflicts

基础、网站和仓库三方快照，保留冲突时的版本条件。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `content_id` | TEXT | 否 | 无 | FK sync_snapshots.content_id / DELETE RESTRICT；FK sync_snapshots.content_id / DELETE RESTRICT；FK sync_snapshots.content_id / DELETE RESTRICT；FK content_objects.id / DELETE CASCADE | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `base_snapshot_id` | TEXT | 是 | 无 | FK sync_snapshots.id / DELETE RESTRICT | 共同基线 B；从未收敛时为 null |
| `local_snapshot_id` | TEXT | 否 | 无 | FK sync_snapshots.id / DELETE RESTRICT | 网站完整快照 L |
| `remote_snapshot_id` | TEXT | 否 | 无 | FK sync_snapshots.id / DELETE RESTRICT | 仓库完整快照 R，包括不存在状态 |
| `local_generation` | INTEGER | 否 | 无 | — | 冲突时的网站版本 |
| `remote_commit` | TEXT | 否 | 无 | — | 形成该冲突时的仓库 HEAD |
| `state` | TEXT | 否 | `'open'` | — | open/resolving/resolved/superseded；每对象最多一个 open/resolving |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `resolved_at` | INTEGER | 是 | 无 | — | 本地应用人工选择的时间 |

显式索引：

```sql
CREATE UNIQUE INDEX uq_conflict_active ON sync_conflicts(content_id) WHERE state IN ('open','resolving');
```

## 27 sync_resolutions

人工解决的明确意图与执行状态；应用后仍需确认仓库收敛。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `conflict_id` | TEXT | 否 | 无 | FK sync_conflicts.id / DELETE CASCADE | 所属冲突 id |
| `selection` | TEXT | 否 | 无 | — | local/remote/manual |
| `action` | TEXT | 否 | 无 | — | save_draft/publish/withdraw/trash，必须显式选择 |
| `merged_fields_json` | TEXT | 是 | 无 | — | manual 选择的完整修改稿；其他选择必须 null |
| `expected_generation` | INTEGER | 否 | 无 | — | 解决意图期待的网站版本 |
| `expected_remote_digest` | TEXT | 否 | 无 | — | 用户确认的远端完整对象摘要 |
| `target_snapshot_id` | TEXT | 是 | 无 | FK sync_snapshots.id / DELETE RESTRICT | 准备/应用的目标快照，固定合并资源并保护引用 |
| `state` | TEXT | 否 | 无 | — | requested/applied/failed/superseded；applied 不等于仓库已同步 |
| `applied_generation` | INTEGER | 是 | 无 | — | 解决动作真正生效后的网站 generation |
| `error_code` | TEXT | 是 | 无 | — | 脱敏稳定错误码；无错误为 null |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

显式索引：

```sql
CREATE UNIQUE INDEX uq_resolution_pending ON sync_resolutions(conflict_id) WHERE state = 'requested';
```

## 28 outbox_jobs

持久任务；执行租约、重试和去重，不依赖内存队列。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `kind` | TEXT | 否 | 无 | — | sync_content/reconcile/resolve_conflict/delete_remote/image_variant/repository_check/delete_asset |
| `aggregate_id` | TEXT | 是 | 无 | — | 内容/资源/解决意图 id，无 FK，以支持删除后的任务 |
| `target_generation` | INTEGER | 是 | 无 | — | 本任务对应内容版本，仓库检查等任务可为空 |
| `dedupe_key` | TEXT | 否 | 无 | — | 同一次任务意图唯一键 |
| `payload_json` | TEXT | 否 | `'{}'` | — | 类型化 JSON 对象；快照或任务载荷，结构由服务/schema 校验 |
| `state` | TEXT | 否 | `'queued'` | — | queued/running/retry_wait/succeeded/failed/conflict/superseded |
| `attempt_count` | INTEGER | 否 | `0` | — | 尝试次数，非负 |
| `next_run_at` | INTEGER | 否 | 无 | — | 下次可以领取任务的时间 |
| `lease_token` | TEXT | 是 | 无 | — | running 任务持有者随机 token |
| `lease_expires_at` | INTEGER | 是 | 无 | — | running 租约过期时间；非 running 必须 null |
| `error_code` | TEXT | 是 | 无 | — | 脱敏稳定错误码；无错误为 null |
| `error_message` | TEXT | 是 | 无 | — | 脱敏错误摘要，不含路径与凭据 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `updated_at` | INTEGER | 否 | 无 | — | 最近变化时间，UTC Unix 毫秒 |

表内唯一约束：`UNIQUE (dedupe_key)`。

显式索引：

```sql
CREATE INDEX idx_jobs_aggregate ON outbox_jobs(aggregate_id,created_at DESC);
CREATE INDEX idx_jobs_due ON outbox_jobs(state,next_run_at,id);
```

## 29 repo_events

仓库事件去重记录，首版轮询之外的提供方适配预留。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `provider` | TEXT | 否 | 无 | — | 仓库事件提供方标识 |
| `delivery_id` | TEXT | 否 | 无 | — | 提供方事件唯一标识 |
| `config_generation` | INTEGER | 否 | 无 | — | 接收事件时仓库配置版本，防止旧配置事件执行 |
| `branch` | TEXT | 否 | 无 | — | 指定同步分支名 |
| `commit_oid` | TEXT | 是 | 无 | — | 事件提示的提交，可为空；执行仍读取当前 HEAD |
| `state` | TEXT | 否 | 无 | — | received/processed/ignored/failed |
| `received_at` | INTEGER | 否 | 无 | — | 事件接收时间 |
| `processed_at` | INTEGER | 是 | 无 | — | 处理完成时间 |

表内唯一约束：`UNIQUE (provider, delivery_id)`。

## 30 tombstones

彻底删除后的最小身份记录，阻止旧事件重建对象。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `content_id` | TEXT | 否 | 无 | PK 1 | 所属内容对象 id；线程留言板为 null，同步快照可保留历史 id |
| `kind` | TEXT | 否 | 无 | — | 已彻底删除的 article/project 类型 |
| `generation` | INTEGER | 否 | 无 | — | 单调递增的业务并发版本，正整数 |
| `purged_at` | INTEGER | 否 | 无 | — | 彻底删除时间 |
| `remote_delete_confirmed_at` | INTEGER | 是 | 无 | — | 远端删除确认时间 |

## 31 idempotency_records

成功写请求的短期去重响应，与业务事务一起提交。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `scope` | TEXT | 否 | 无 | PK 1 | 用户或 anonymous + HTTP 方法 + 规范路径的命名空间 |
| `resource_id` | TEXT | 是 | 无 | — | 用于删除资源时清理旧幂等响应的对象 id，无 FK |
| `key_hash` | BLOB | 否 | 无 | PK 2 | 高熵幂等键 SHA-256，32 字节 |
| `request_hash` | BLOB | 否 | 无 | — | 规范化请求的服务端 HMAC，32 字节，不存明文邮箱载荷 |
| `response_status` | INTEGER | 否 | 无 | — | 原成功 HTTP 状态，200–299 |
| `response_json` | TEXT | 否 | 无 | — | 原成功响应 JSON，204 使用 null JSON |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |
| `expires_at` | INTEGER | 否 | 无 | — | 绝对过期时间，毫秒 |

显式索引：

```sql
CREATE INDEX idx_idempotency_expiry ON idempotency_records(expires_at);
CREATE INDEX idx_idempotency_resource ON idempotency_records(resource_id);
```

## 32 audit_events

脱敏操作审计，不保存正文、邮箱、密码或密钥。

| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |
| --- | --- | --- | --- | --- | --- |
| `id` | TEXT | 否 | 无 | PK 1 | 业务 UUID 主键 |
| `actor_kind` | TEXT | 否 | 无 | — | owner/sync/system |
| `actor_id` | TEXT | 是 | 无 | — | 可选站主或任务 id，不设强关联 |
| `action` | TEXT | 否 | 无 | — | 明确业务动作；audit 中为动作编码 |
| `target_id` | TEXT | 是 | 无 | — | 审计目标 id；目标删除后仍可审计 |
| `request_id` | TEXT | 否 | 无 | — | 对应请求或后台任务关联标识 |
| `details_json` | TEXT | 否 | `'{}'` | — | 脱敏审计元数据，仅保留版本及结果等必要信息 |
| `created_at` | INTEGER | 否 | 无 | — | 创建时间，UTC Unix 毫秒 |

显式索引：

```sql
CREATE INDEX idx_audit_target ON audit_events(target_id,created_at DESC);
```

## 33 视图与约束说明

- `public_content` 只连接 published 指针，要求 active + published；它是内部投影，API 另做字段允许列表。
- `public_comments` 排除自身/根隐藏以及非公开文章，不连接邮箱表。
- 主版本 UPDATE、内容身份变更、跨线程回复由 trigger 拒绝。类型扩展和关系快照的不可变性由应用事务补齐。
- 内容与版本之间使用延迟复合外键，直到事务提交才检查指针；测试不能只检查单条 INSERT 是否成功。
- JSON 列的 SQL CHECK 仅验证 JSON 容器类型，具体字段、长度、枚举仍由合同与服务验证。
