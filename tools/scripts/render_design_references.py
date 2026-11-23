#!/usr/bin/env python3
"""Render reference tables from SQL/OpenAPI; requires design requirements only."""
from pathlib import Path
import sqlite3
import yaml

ROOT = Path(__file__).resolve().parents[2]
TABLES = {
    'admin_users': '唯一站主账号；不参与内容同步。',
    'sessions': '服务端会话，仅存 token 和 CSRF 的摘要。',
    'site_settings': '单例站点名称、介绍和展示时区。',
    'repository_config': '单例仓库配置，保存凭据别名而非密钥。',
    'asset_blobs': '通过解码验证并已落盘的不可变原始图片。',
    'asset_variants': '图片缩略/阅读变体及生成结果。',
    'content_objects': '四类内容的稳定身份、生命周期和当前版本指针。',
    'content_revisions': '不可变编辑快照；空字段允许草稿，发布另行校验。',
    'article_revision_data': '文章版本专属字段及只针对标题摘要的搜索文本。',
    'project_revision_data': '项目版本的角色、时间和技术信息。',
    'profile_revision_data': '个人资料版本专属字段；名称/短介绍/头像在主版本。',
    'skill_revision_data': '技能版本的分组；名称/实践说明在主版本。',
    'revision_renderings': '正文派生 HTML 与 H2/H3 目录，按渲染器版本保存。',
    'taxonomy_items': '分类标签编辑目录，退休后仍保护历史外键。',
    'revision_taxonomy': '版本使用的分类标签名称快照；最多一个分类。',
    'revision_assets': 'Markdown 实际引用的原图集合；封面另存主版本。',
    'revision_links': '个人公开联系方式、项目外部地址等有序链接。',
    'revision_relations': '版本关联的其他内容 id；允许保留已删除目标的历史标识。',
    'content_routes': '已发布规范路径与旧路径；到彻底删除前保留所有权。',
    'comment_threads': '根留言及平铺回复所在的线程，统一管理并发版本。',
    'comments': '根留言与回复的公开文字、目标快照及自身可见状态。',
    'comment_contacts': '可选私密邮箱，禁止公开查询和仓库导出。',
    'sync_snapshots': '规范化对象同步快照；包含完整公开/草稿和删除状态。',
    'sync_snapshot_assets': '共同基线、冲突及解决意图所需图片的引用保护。',
    'sync_bases': '最后实际收敛的共同对象快照及仓库提交。',
    'sync_conflicts': '基础、网站和仓库三方快照，保留冲突时的版本条件。',
    'sync_resolutions': '人工解决的明确意图与执行状态；应用后仍需确认仓库收敛。',
    'outbox_jobs': '持久任务；执行租约、重试和去重，不依赖内存队列。',
    'repo_events': '仓库事件去重记录，首版轮询之外的提供方适配预留。',
    'tombstones': '彻底删除后的最小身份记录，阻止旧事件重建对象。',
    'idempotency_records': '成功写请求的短期去重响应，与业务事务一起提交。',
    'audit_events': '脱敏操作审计，不保存正文、邮箱、密码或密钥。',
}
FIELDS = {
    'id':'业务 UUID；单例表采用固定主键 1', 'singleton':'固定 1，唯一约束限制单站主',
    'username':'登录名，NOCASE 唯一，1–80 字符', 'password_hash':'包含盐和参数的 Argon2id 编码串',
    'created_at':'创建时间，UTC Unix 毫秒', 'updated_at':'最近变化时间，UTC Unix 毫秒',
    'password_changed_at':'最近改密时间；改密使现存会话失效', 'token_hash':'会话 token 的 SHA-256，32 字节',
    'admin_id':'站主账号 id', 'csrf_hash':'派生 CSRF token 的 SHA-256，32 字节',
    'last_seen_at':'最近会话活动时间', 'expires_at':'绝对过期时间，毫秒',
    'title':'内容标题；profile 为显示名，skill 为技能名；站点设置标题最多 80 字符',
    'description':'站点介绍，最多 300 字符', 'timezone':'IANA 时区名称，由服务校验',
    'generation':'单调递增的业务并发版本，正整数', 'remote_url':'SSH/HTTPS 仓库地址，不可带凭据',
    'branch':'指定同步分支名', 'content_dir':'仓库内相对内容目录，不允许越界',
    'credential_ref':'服务器预置凭据的别名，不能包含密钥值', 'enabled':'是否启用自动同步，0/1',
    'poll_interval_seconds':'轮询周期，30–3600 秒，默认 60',
    'last_seen_commit':'最近观察到的分支 HEAD，不等于全部对象已同步',
    'last_checked_at':'最近检查仓库时间', 'last_success_at':'最近成功对账时间',
    'sha256':'原始文件 SHA-256，小写 64 位十六进制主键', 'media_type':'实际解码格式，JPEG/PNG/WebP',
    'byte_size':'文件大小，原图 1–10485760 字节', 'width':'解码后宽度，正整数像素',
    'height':'解码后高度，正整数像素', 'storage_key':'服务生成的私有相对路径键，不接受外部任意路径',
    'original_name':'原文件名，仅作管理展示，不能用于拼接存储路径',
    'asset_sha256':'被引用原图摘要', 'variant':'thumb 或 reading',
    'state':'该实体执行/可见状态，枚举见下方表级说明与 SQL CHECK',
    'error_code':'脱敏稳定错误码；无错误为 null', 'error_message':'脱敏错误摘要，不含路径与凭据',
    'kind':'实体类型，合法枚举由表级 CHECK 限制',
    'lifecycle':'active/trash；只有文章和项目可 trash',
    'visibility':'unpublished/published；必须同时检查 lifecycle',
    'published_revision_id':'当前或最后公开版本，非空不等于当前公开',
    'draft_revision_id':'未发布修改稿指针；无修改稿为 null',
    'first_published_at':'首次实际公开时间，后续编辑保持不变',
    'published_updated_at':'最近影响公开版本的时间', 'trashed_at':'进入回收站时间；active 时必须 null',
    'content_id':'所属内容对象 id；线程留言板为 null，同步快照可保留历史 id',
    'revision_no':'当前对象内递增版本序号', 'summary':'摘要/短介绍/实践说明，最多 500 字符',
    'markdown':'原始 Markdown，最多 200000 字符，草稿可为空',
    'slug':'候选或保留的 URL 标识；合法格式由服务校验',
    'display_order':'展示排序，小值在前；属于版本时发布才影响公开',
    'cover_sha256':'封面/头像原图摘要，可为空，删除受 FK 保护',
    'cover_alt':'封面或头像说明，最多 300 字符',
    'source':'admin/repository/resolution/taxonomy',
    'content_digest':'可同步业务字段规范化 SHA-256，不含本地版本时间',
    'revision_id':'所属不可变版本 id', 'channel':'文章 tech/life；标签目录 all；类别必须 tech/life',
    'search_title':'title 经过 trim 和 Unicode case fold 的派生搜索值',
    'search_summary':'summary 经过 trim 和 Unicode case fold 的派生搜索值',
    'role':'项目中的职责，最多 120 字符', 'started_on':'可选项目开始日期 YYYY-MM-DD',
    'ended_on':'可选项目结束日期，不早于开始日期', 'featured':'是否精选，0/1',
    'tech_stack_json':'技术栈名称数组，API 限制最多 30 项，每项 40 字符',
    'location':'选择公开的所在地，最多 120 字符', 'occupation':'公开职业描述，最多 120 字符',
    'group_name':'技能分组名，最多 80 字符；发布技能必需',
    'renderer_version':'渲染器与清洗策略联合版本号', 'body_html':'统一清洗后的正文 HTML',
    'toc_json':'H2/H3 目录对象数组，包含 id/text/level',
    'name':'分类或标签名称，目录 1–40 字符；版本关系保留快照',
    'normalized_name':'归一化名称，供目录唯一性判断', 'retired_at':'目录退休时间，不再供新版本选择',
    'taxonomy_id':'稳定分类或标签 id', 'position':'当前版本内的顺序，小值在前',
    'label':'公开链接标签，1–80 字符', 'url':'链接 URI，最多 2048 字符，服务限制协议',
    'target_content_id':'相关内容 id，无 FK；公开查询过滤失效或非公开目标',
    'namespace':'posts/projects 路由空间', 'is_current':'是否当前规范路径，0/1',
    'scope':'线程来源或幂等命名空间；具体规则见对应表说明',
    'thread_id':'所属根留言线程', 'is_root':'是否根留言，0/1；每线程最多一个根',
    'reply_to_id':'同线程回复目标，目标删除后设 null',
    'reply_to_nickname':'回复目标昵称快照，目标删除仍保留',
    'nickname':'展示昵称，trim 后 1–40 字符，不代表身份认证',
    'body':'纯文本评论，trim 后 1–2000 字符',
    'author_kind':'visitor/owner；只能由服务端认证结果决定',
    'comment_id':'对应评论 id', 'email':'私密联系邮箱，最多 254 字符，仅管理端查询',
    'digest':'规范化同步快照 SHA-256', 'payload_json':'类型化 JSON 对象；快照或任务载荷，结构由服务/schema 校验',
    'snapshot_id':'被引用的完整同步快照 id',
    'repository_commit':'共同基线实际确认的远端 commit OID',
    'synced_generation':'实际同步成功的网站 generation', 'synced_at':'共同基线确认时间',
    'base_snapshot_id':'共同基线 B；从未收敛时为 null', 'local_snapshot_id':'网站完整快照 L',
    'remote_snapshot_id':'仓库完整快照 R，包括不存在状态', 'local_generation':'冲突时的网站版本',
    'remote_commit':'形成该冲突时的仓库 HEAD', 'resolved_at':'本地应用人工选择的时间',
    'conflict_id':'所属冲突 id', 'selection':'local/remote/manual',
    'action':'明确业务动作；audit 中为动作编码',
    'merged_fields_json':'manual 选择的完整修改稿；其他选择必须 null',
    'expected_generation':'解决意图期待的网站版本', 'expected_remote_digest':'用户确认的远端完整对象摘要',
    'target_snapshot_id':'准备/应用的目标快照，固定合并资源并保护引用',
    'applied_generation':'解决动作真正生效后的网站 generation',
    'aggregate_id':'内容/资源/解决意图 id，无 FK，以支持删除后的任务',
    'target_generation':'本任务对应内容版本，仓库检查等任务可为空',
    'dedupe_key':'同一次任务意图唯一键', 'attempt_count':'尝试次数，非负',
    'next_run_at':'下次可以领取任务的时间', 'lease_token':'running 任务持有者随机 token',
    'lease_expires_at':'running 租约过期时间；非 running 必须 null',
    'provider':'仓库事件提供方标识', 'delivery_id':'提供方事件唯一标识',
    'config_generation':'接收事件时仓库配置版本，防止旧配置事件执行',
    'commit_oid':'事件提示的提交，可为空；执行仍读取当前 HEAD',
    'received_at':'事件接收时间', 'processed_at':'处理完成时间',
    'purged_at':'彻底删除时间', 'remote_delete_confirmed_at':'远端删除确认时间',
    'resource_id':'用于删除资源时清理旧幂等响应的对象 id，无 FK',
    'key_hash':'高熵幂等键 SHA-256，32 字节',
    'request_hash':'规范化请求的服务端 HMAC，32 字节，不存明文邮箱载荷',
    'response_status':'原成功 HTTP 状态，200–299', 'response_json':'原成功响应 JSON，204 使用 null JSON',
    'actor_kind':'owner/sync/system', 'actor_id':'可选站主或任务 id，不设强关联',
    'target_id':'审计目标 id；目标删除后仍可审计', 'request_id':'对应请求或后台任务关联标识',
    'details_json':'脱敏审计元数据，仅保留版本及结果等必要信息',
}

OVERRIDES = {
    ('site_settings','id'): '固定 1，仅一份站点设置',
    ('repository_config','id'): '固定 1，仅一个内容仓库配置',
    ('site_settings','title'): '公开站点名称，1–80 字符',
    ('content_objects','kind'): 'article/project/profile/skill，创建后不可改',
    ('taxonomy_items','kind'): 'category/tag；与 channel 组合校验',
    ('revision_taxonomy','kind'): '版本快照的 category/tag 类型',
    ('tombstones','kind'): '已彻底删除的 article/project 类型',
    ('outbox_jobs','kind'): 'sync_content/reconcile/resolve_conflict/delete_remote/image_variant/repository_check/delete_asset',
    ('asset_variants','state'): 'pending/ready/failed；ready 时路径、大小、宽高都必须有值',
    ('comments','state'): 'visible/hidden，只记录自身状态；根和文章状态另参与公开判断',
    ('sync_conflicts','state'): 'open/resolving/resolved/superseded；每对象最多一个 open/resolving',
    ('sync_resolutions','state'): 'requested/applied/failed/superseded；applied 不等于仓库已同步',
    ('outbox_jobs','state'): 'queued/running/retry_wait/succeeded/failed/conflict/superseded',
    ('repo_events','state'): 'received/processed/ignored/failed',
    ('comment_threads','scope'): 'article/guestbook；前者必须有 content_id，后者必须 null',
    ('idempotency_records','scope'): '用户或 anonymous + HTTP 方法 + 规范路径的命名空间',
    ('sync_resolutions','action'): 'save_draft/publish/withdraw/trash，必须显式选择',
}


def render():
    # 在临时内存库读取迁移形成的实际结构；不会打开或修改开发者的 SQLite 数据。
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript((ROOT / 'backend/migrations/00001_initial.sql').read_text())
    lines = ['# 数据库逐表字典', '',
             '版本：1.0，2026-11-15。由建表脚本和 `tools/scripts/render_design_references.py` 的字段说明生成。', '',
             '类型、空值、默认值、主外键和索引取自实际 SQLite schema；CHECK、trigger 及跨表事务规则分别见 [SQL](../../backend/migrations/00001_initial.sql) 和 [数据库设计](database-design.md)。', '',
             '所有时间字段均为 UTC Unix 毫秒；API 转 RFC3339。所有表为 STRICT，所有写连接必须启用外键。', '']
    for number, (table, description) in enumerate(TABLES.items(), 1):
        lines.extend([f'## {number} {table}', '', description, '',
                      '| 字段 | SQL 类型 | 可空 | 默认值 | 键 | 含义 |',
                      '| --- | --- | --- | --- | --- | --- |'])
        # 表名来自本脚本固定字典，索引名来自内存库的 SQLite schema，不接受外部输入。
        # PRAGMA 不支持在这些标识符位置绑定参数，普通字段值查询仍使用参数绑定。
        fks = {}
        for fk in db.execute(f'PRAGMA foreign_key_list({table})'):
            fks.setdefault(fk[3], []).append(f'{fk[2]}.{fk[4]} / DELETE {fk[6]}')
        for _, name, typ, notnull, default, pk in db.execute(f'PRAGMA table_info({table})'):
            label = OVERRIDES.get((table, name), FIELDS[name])
            if name == 'id' and typ == 'TEXT':
                label = '业务 UUID 主键'
            keys = ([f'PK {pk}'] if pk else []) + [f'FK {v}' for v in fks.get(name, [])]
            lines.append(f'| `{name}` | {typ} | {"否" if notnull or pk else "是"} | `{default}` | {"；".join(keys) or "—"} | {label} |'.replace('`None`', '无'))
        indexes = db.execute("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name=? AND sql IS NOT NULL ORDER BY name", (table,)).fetchall()
        implicit = []
        for _, name, unique, origin, _ in db.execute(f'PRAGMA index_list({table})'):
            if unique and origin == 'u':
                cols = [row[2] for row in db.execute(f'PRAGMA index_info({name})')]
                implicit.append('UNIQUE (' + ', '.join(cols) + ')')
        if implicit:
            lines.extend(['', '表内唯一约束：' + '；'.join(f'`{x}`' for x in implicit) + '。'])
        if indexes:
            lines.extend(['', '显式索引：', '', '```sql', *[row[0]+';' for row in indexes], '```'])
        lines.append('')
    lines.extend(['## 33 视图与约束说明', '',
                  '- `public_content` 只连接 published 指针，要求 active + published；它是内部投影，API 另做字段允许列表。',
                  '- `public_comments` 排除自身/根隐藏以及非公开文章，不连接邮箱表。',
                  '- 主版本 UPDATE、内容身份变更、跨线程回复由 trigger 拒绝。类型扩展和关系快照的不可变性由应用事务补齐。',
                  '- 内容与版本之间使用延迟复合外键，直到事务提交才检查指针；测试不能只检查单条 INSERT 是否成功。',
                  '- JSON 列的 SQL CHECK 仅验证 JSON 容器类型，具体字段、长度、枚举仍由合同与服务验证。', ''])
    (ROOT / 'docs/design/database-tables.md').write_text('\n'.join(lines))
    api = yaml.safe_load((ROOT / 'contracts/openapi.yaml').read_text())
    lines = ['# API 操作目录', '', '由 `contracts/openapi.yaml` 生成。请求/响应 schema 的完整字段以 OpenAPI 为准，业务流程见 [API 详细设计](api-design.md)。', '',
             '| 方法与路径 | operationId | 用途 | 请求 schema | 成功响应 | 访问 |',
             '| --- | --- | --- | --- | --- | --- |']
    for path, operations in api['paths'].items():
        for method, op in operations.items():
            request = op.get('requestBody', {}).get('content', {})
            request_schema = request.get('application/json', {}).get('schema', {}).get('$ref', '').rsplit('/', 1)[-1]
            if 'multipart/form-data' in request:
                request_schema = 'multipart file'
            responses = []
            for status, response in op['responses'].items():
                if status.startswith('2'):
                    schema = response.get('content', {}).get('application/json', {}).get('schema', {}).get('$ref', '').rsplit('/', 1)[-1]
                    responses.append(status+' '+(schema or ('图片字节' if response.get('content') else '无正文')))
            access = '站主会话' if op.get('security') else '无需会话'
            if any(x.get('$ref', '').endswith('/CSRF') for x in op.get('parameters', [])):
                access += ' + CSRF'
            if any(x.get('$ref', '').endswith('/IdempotencyKey') for x in op.get('parameters', [])):
                access += ' + 幂等键'
            lines.append(f'| `{method.upper()} {path}` | `{op["operationId"]}` | {op["summary"]} | {request_schema or "—"} | {"；".join(responses)} | {access} |')
    lines.extend(['', '## Schema 清单', '', '| 名称 | 结构 |', '| --- | --- |'])
    for name, schema in api['components']['schemas'].items():
        props = ', '.join(schema.get('properties', {}))
        if not props:
            props = 'oneOf 分型：' + ', '.join(x.get('$ref', '条件对象').rsplit('/', 1)[-1] for x in schema.get('oneOf', [])) if 'oneOf' in schema else ', '.join(schema.get('enum', []))
        lines.append(f'| `{name}` | {props} |')
    lines.append('')
    (ROOT / 'docs/design/api-endpoints.md').write_text('\n'.join(lines))
    print(f'Rendered {len(TABLES)} table definitions and {sum(len(v) for v in api["paths"].values())} API operations')


if __name__ == '__main__':
    render()
