# API 操作目录

由 `contracts/openapi.yaml` 生成。请求/响应 schema 的完整字段以 OpenAPI 为准，业务流程见 [API 详细设计](api-design.md)。

| 方法与路径 | operationId | 用途 | 请求 schema | 成功响应 | 访问 |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/public/site` | `getPublicSite` | 读取公开站点设置 | — | 200 PublicSite | 无需会话 |
| `GET /api/v1/public/home` | `getPublicHome` | 读取首页组合内容 | — | 200 PublicHome | 无需会话 |
| `GET /api/v1/public/articles` | `listPublicArticles` | 文章列表与标题摘要搜索 | — | 200 PublicCards | 无需会话 |
| `GET /api/v1/public/articles/{slug}` | `getPublicArticle` | 读取公开文章 | — | 200 PublicContent | 无需会话 |
| `GET /api/v1/public/projects` | `listPublicProjects` | 读取公开项目列表 | — | 200 PublicCards | 无需会话 |
| `GET /api/v1/public/projects/{slug}` | `getPublicProject` | 读取公开项目详情 | — | 200 PublicContent | 无需会话 |
| `GET /api/v1/public/profile` | `getPublicProfile` | 读取公开个人资料 | — | 200 PublicContent | 无需会话 |
| `GET /api/v1/public/skills` | `listPublicSkills` | 读取公开技能 | — | 200 PublicContents | 无需会话 |
| `GET /api/v1/public/taxonomy` | `listPublicTaxonomy` | 读取已公开文章使用的分类标签 | — | 200 PublicTaxonomies | 无需会话 |
| `GET /api/v1/public/sitemap` | `listSitemapEntries` | 读取站点地图条目 | — | 200 SitemapEntries | 无需会话 |
| `GET /api/v1/public/comments` | `listPublicThreads` | 读取公开根留言 | — | 200 PublicThreads | 无需会话 |
| `POST /api/v1/public/comments` | `createVisitorComment` | 提交匿名评论或回复 | CreateVisitorComment | 201 PublicComment | 无需会话 + 幂等键 |
| `GET /api/v1/public/comments/{id}/replies` | `listPublicReplies` | 读取根留言下平铺回复 | — | 200 PublicReplies | 无需会话 |
| `GET /media/{sha256}/{variant}` | `getPublicMedia` | 读取当前公开内容引用的图片 | — | 200 图片字节 | 无需会话 |
| `POST /api/v1/admin/session` | `login` | 站主登录 | Login | 200 Session | 无需会话 |
| `GET /api/v1/admin/session` | `getSession` | 读取当前站主会话 | — | 200 Session | 站主会话 |
| `DELETE /api/v1/admin/session` | `logout` | 退出并使当前会话失效 | — | 204 无正文 | 站主会话 + CSRF |
| `GET /api/v1/admin/dashboard` | `getDashboard` | 读取后台概览 | — | 200 Dashboard | 站主会话 |
| `GET /api/v1/admin/contents` | `listAdminContents` | 查询内容与回收站 | — | 200 AdminContents | 站主会话 |
| `POST /api/v1/admin/contents` | `createContent` | 创建内容及首份修改稿 | CreateContent | 201 AdminContent | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/contents/{id}` | `getAdminContent` | 读取内容公开版、修改稿与同步状态 | — | 200 AdminContent | 站主会话 |
| `PUT /api/v1/admin/contents/{id}/draft` | `saveDraft` | 保存完整修改稿 | SaveDraft | 200 AdminContent | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/contents/{id}/discard-draft` | `discardDraft` | 丢弃当前修改稿 | ExpectedGeneration | 200 AdminContent | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/contents/{id}/publish` | `publishContent` | 发布选定版本 | PublishContent | 200 AdminContent | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/contents/{id}/withdraw` | `withdrawContent` | 撤回公开内容 | ExpectedGeneration | 200 AdminContent | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/contents/{id}/trash` | `trashContent` | 移入回收站 | ExpectedGeneration | 200 AdminContent | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/contents/{id}/restore` | `restoreContent` | 恢复为未发布 | ExpectedGeneration | 200 AdminContent | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/contents/{id}/purge-impact` | `getPurgeImpact` | 预览彻底删除影响 | — | 200 PurgeImpact | 站主会话 |
| `POST /api/v1/admin/contents/{id}/purge` | `purgeContent` | 彻底删除回收站内容 | PurgeContent | 204 无正文 | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/preview` | `previewMarkdown` | 预览完整修改稿的 Markdown | PreviewRequest | 200 PreviewResult | 站主会话 + CSRF |
| `GET /api/v1/admin/taxonomy` | `listAdminTaxonomy` | 查询分类标签目录 | — | 200 Taxonomies | 站主会话 |
| `POST /api/v1/admin/taxonomy` | `createTaxonomy` | 创建分类或标签 | CreateTaxonomy | 201 Taxonomy | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/taxonomy/{id}/impact` | `previewTaxonomyChange` | 预览改名或删除分类标签的影响 | TaxonomyImpactRequest | 200 TaxonomyImpact | 站主会话 + CSRF |
| `POST /api/v1/admin/taxonomy/{id}/apply` | `applyTaxonomyChange` | 确认改名、迁移或移除分类标签 | ApplyTaxonomyChange | 200 TaxonomyApplyResult | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/comments` | `listAdminComments` | 查询评论和留言 | — | 200 AdminComments | 站主会话 |
| `POST /api/v1/admin/comments` | `createOwnerComment` | 以站主身份留言或回复 | CreateOwnerComment | 201 AdminComment | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/comments/{id}` | `getAdminComment` | 读取评论及管理信息 | — | 200 AdminComment | 站主会话 |
| `POST /api/v1/admin/comments/{id}/visibility` | `setCommentVisibility` | 隐藏或恢复评论 | CommentVisibility | 200 AdminComment | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/comments/{id}/delete-impact` | `getCommentDeleteImpact` | 读取评论删除影响 | — | 200 CommentImpact | 站主会话 |
| `POST /api/v1/admin/comments/{id}/delete` | `deleteComment` | 删除评论或整组 | CommentDelete | 204 无正文 | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/media` | `listAssets` | 查询图片及引用 | — | 200 Assets | 站主会话 |
| `POST /api/v1/admin/media` | `uploadAsset` | 上传原始图片 | multipart file | 201 Asset | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/media/{sha256}` | `getAsset` | 读取图片引用信息 | — | 200 Asset | 站主会话 |
| `DELETE /api/v1/admin/media/{sha256}` | `deleteUnusedAsset` | 删除无引用图片 | — | 204 无正文 | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/media/{sha256}/preview` | `previewPrivateAsset` | 读取私有原图 | — | 200 图片字节 | 站主会话 |
| `GET /api/v1/admin/sync` | `getSyncOverview` | 读取同步概况 | — | 200 SyncOverview | 站主会话 |
| `POST /api/v1/admin/sync/reconcile` | `enqueueReconcile` | 主动请求仓库对账 | — | 202 AcceptedJob | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/sync/jobs` | `listJobs` | 查询持久任务 | — | 200 Jobs | 站主会话 |
| `GET /api/v1/admin/sync/jobs/{id}` | `getJob` | 读取任务状态 | — | 200 Job | 站主会话 |
| `POST /api/v1/admin/sync/jobs/{id}/retry` | `retryJob` | 重试失败任务 | — | 202 AcceptedJob | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/sync/conflicts` | `listConflicts` | 查询同步冲突 | — | 200 Conflicts | 站主会话 |
| `GET /api/v1/admin/sync/conflicts/{id}` | `getConflict` | 读取基础、网站和仓库版本 | — | 200 Conflict | 站主会话 |
| `POST /api/v1/admin/sync/conflicts/{id}/resolve` | `resolveConflict` | 提交冲突解决意图 | ResolveConflict | 202 AcceptedJob | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/settings` | `getSiteSettings` | 读取站点配置 | — | 200 SiteSettings | 站主会话 |
| `PUT /api/v1/admin/settings` | `updateSiteSettings` | 更新站点名称介绍时区 | UpdateSiteSettings | 200 SiteSettings | 站主会话 + CSRF + 幂等键 |
| `GET /api/v1/admin/repository` | `getRepository` | 读取仓库连接配置 | — | 200 RepositoryConfig | 站主会话 |
| `PUT /api/v1/admin/repository` | `updateRepository` | 配置仓库连接 | UpdateRepository | 200 RepositoryConfig | 站主会话 + CSRF + 幂等键 |
| `POST /api/v1/admin/repository/check` | `checkRepository` | 检查仓库访问能力 | — | 202 AcceptedJob | 站主会话 + CSRF + 幂等键 |

## Schema 清单

| 名称 | 结构 |
| --- | --- |
| `ContentKind` | article, project, profile, skill |
| `Error` | code, message, field_errors, request_id, current_generation, conflict_id |
| `ExpectedGeneration` | expected_generation |
| `Link` | label, url |
| `TaxonomySnapshot` | id, kind, channel, name, slug |
| `AssetRef` | sha256, alt |
| `TocItem` | id, text, level |
| `ArticleDetails` | channel |
| `ProjectDetails` | role, started_on, ended_on, featured, tech_stack |
| `ProfileDetails` | location, occupation |
| `SkillDetails` | group_name |
| `ArticleDraft` | kind, title, summary, markdown, slug, display_order, cover, links, related_content_ids, body_asset_sha256s, details, category_id, tag_ids |
| `ProjectDraft` | kind, title, summary, markdown, slug, display_order, cover, links, related_content_ids, body_asset_sha256s, details |
| `ProfileDraft` | kind, title, summary, markdown, slug, display_order, cover, links, related_content_ids, body_asset_sha256s, details |
| `SkillDraft` | kind, title, summary, markdown, slug, display_order, cover, links, related_content_ids, body_asset_sha256s, details |
| `ContentDraft` | oneOf 分型：ArticleDraft, ProjectDraft, ProfileDraft, SkillDraft |
| `Revision` | id, revision_no, fields, taxonomy_snapshots, created_at |
| `SyncStatus` | state, last_success_at, job_id, conflict_id, error_code, error_message |
| `AdminContent` | id, kind, lifecycle, visibility, generation, published, draft, first_published_at, published_updated_at, sync, created_at, updated_at |
| `AdminContentSummary` | id, kind, title, generation, lifecycle, visibility, has_draft, sync, updated_at |
| `CreateContent` | draft |
| `SaveDraft` | expected_generation, draft |
| `PublishContent` | expected_generation, revision_id, first_published_at |
| `PublicAsset` | sha256, url, width, height, alt |
| `RelatedLink` | id, kind, title, url |
| `PublicCard` | id, kind, title, summary, slug, canonical_path, cover, first_published_at, updated_at, display_order, channel, category, tags |
| `PublicContent` | id, kind, title, summary, slug, canonical_path, cover, first_published_at, updated_at, display_order, channel, category, tags, body_html, toc, links, related, details |
| `PublicSite` | title, description, timezone |
| `PublicHome` | profile, tech_articles, life_articles, featured_projects |
| `SitemapItem` | path, updated_at |
| `AdminIdentity` | id, username |
| `Session` | user, csrf_token, expires_at |
| `Login` | username, password |
| `CommentTarget` | oneOf 分型：条件对象, 条件对象 |
| `CreateVisitorComment` | target, reply_to_id, nickname, body, email |
| `CreateOwnerComment` | target, reply_to_id, body |
| `PublicComment` | id, thread_id, is_root, reply_to_id, reply_to_nickname, nickname, body, author_kind, created_at |
| `PublicThread` | id, root, visible_reply_count |
| `AdminComment` | comment, state, effective_visible, email, target, thread_generation |
| `CommentVisibility` | state, expected_thread_generation |
| `CommentDelete` | expected_thread_generation, confirm |
| `CommentImpact` | comment_id, thread_generation, delete_count, includes_replies |
| `PurgeImpact` | content_id, generation, revision_count, comment_count, asset_reference_count, impact_token, expires_at |
| `PurgeContent` | expected_generation, impact_token, confirm |
| `PreviewRequest` | draft |
| `PreviewResult` | body_html, toc, warnings |
| `Asset` | sha256, media_type, byte_size, width, height, original_name, preview_url, revision_reference_count, sync_reference_count, created_at |
| `Taxonomy` | id, kind, channel, name, slug, display_order, generation, retired_at |
| `CreateTaxonomy` | kind, channel, name, slug, display_order |
| `TaxonomyChange` | oneOf 分型：条件对象, 条件对象 |
| `TaxonomyImpactRequest` | expected_generation, change |
| `TaxonomyImpact` | taxonomy_id, affected_content_count, published_revision_count, draft_revision_count, impact_token, expires_at |
| `ApplyTaxonomyChange` | expected_generation, change, impact_token |
| `TaxonomyApplyResult` | taxonomy, affected_content_count, sync_job_ids |
| `Job` | id, kind, aggregate_id, target_generation, state, attempt_count, next_run_at, error_code, error_message, created_at, updated_at |
| `AcceptedJob` | job_id, state |
| `SnapshotRevision` | fields, taxonomy_snapshots |
| `SyncSnapshot` | content_id, kind, exists, lifecycle, visibility, first_published_at, published, draft, digest |
| `ConflictSummary` | id, content_id, state, local_generation, remote_commit, created_at |
| `Conflict` | id, content_id, state, local_generation, remote_commit, created_at, base, local, remote |
| `ResolveConflict` | expected_generation, expected_remote_digest, selection, action, merged_draft |
| `SyncOverview` | pending_count, failed_count, conflict_count, last_checked_at, last_success_at, repository_enabled |
| `SiteSettings` | title, description, timezone, generation, updated_at |
| `UpdateSiteSettings` | expected_generation, title, description, timezone |
| `RepositoryConfig` | generation, remote_url, branch, content_dir, credential_ref, enabled, poll_interval_seconds, last_checked_at, last_success_at |
| `UpdateRepository` | expected_generation, remote_url, branch, content_dir, credential_ref, enabled, poll_interval_seconds |
| `Dashboard` | published_articles, published_projects, draft_contents, trash_contents, visible_comments, sync |
| `PublicCards` | items, page, page_size, total |
| `PublicContents` | items, page, page_size, total |
| `PublicThreads` | items, page, page_size, total |
| `PublicReplies` | items, page, page_size, total |
| `AdminContents` | items, page, page_size, total |
| `AdminComments` | items, page, page_size, total |
| `Assets` | items, page, page_size, total |
| `Taxonomies` | items, page, page_size, total |
| `Jobs` | items, page, page_size, total |
| `Conflicts` | items, page, page_size, total |
| `SitemapEntries` | items, page, page_size, total |
| `PublicTaxonomy` | id, kind, channel, name, slug, article_count |
| `PublicTaxonomies` | items, page, page_size, total |
