#!/usr/bin/env python3
"""验证合同与 SQLite 结构约束；只使用内存数据库，不代表服务链路验收。"""
from pathlib import Path
import json
import re
import sqlite3
import unittest

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / 'backend/migrations/00001_initial.sql').read_text()
SPEC = yaml.safe_load((ROOT / 'contracts/openapi.yaml').read_text())


class ContractTests(unittest.TestCase):
    def test_openapi(self):
        validate(SPEC)

    def test_schema_examples(self):
        for case in json.loads((ROOT / 'contracts/schema-examples.json').read_text()):
            with self.subTest(case=case['name']):
                schema = {'$ref': '#/components/schemas/' + case['schema'], 'components': SPEC['components']}
                errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(case['value']))
                self.assertEqual(not errors, case['valid'], str(errors[:1]))

    def test_unique_operation_ids_and_auth(self):
        # 管理接口除登录外须声明会话；写操作还须声明 CSRF，幂等键按登录、退出和预览例外处理。
        # 此处只检查声明，实际权限和幂等行为仍需通过真实 HTTP 服务验证。
        ids = []
        for path, operations in SPEC['paths'].items():
            for method, op in operations.items():
                ids.append(op['operationId'])
                params = [p.get('$ref', '') for p in op.get('parameters', [])]
                login = path == '/api/v1/admin/session' and method == 'post'
                if path.startswith('/api/v1/admin/') and not login:
                    self.assertEqual(op['security'], [{'AdminSession': []}], op['operationId'])
                    if method in ('post', 'put', 'patch', 'delete'):
                        self.assertIn('#/components/parameters/CSRF', params, op['operationId'])
                if method in ('post', 'put', 'patch', 'delete') and op['operationId'] not in ('login', 'logout', 'previewMarkdown', 'previewTaxonomyChange'):
                    self.assertIn('#/components/parameters/IdempotencyKey', params, op['operationId'])
        self.assertEqual(len(ids), len(set(ids)))

    def test_public_response_has_no_private_properties(self):
        # 沿响应 schema 的引用递归检查嵌套字段；visited 只防循环，不代替运行时字段白名单。
        forbidden = {'email', 'password_hash', 'csrf_token', 'token_hash', 'draft', 'sync', 'generation', 'remote_url', 'credential_ref'}
        def walk(value, visited):
            if isinstance(value, dict):
                if '$ref' in value and value['$ref'].startswith('#/components/schemas/'):
                    name = value['$ref'].split('/')[-1]
                    if name not in visited:
                        visited.add(name)
                        walk(SPEC['components']['schemas'][name], visited)
                self.assertFalse(forbidden.intersection(value.get('properties', {})), str(value.get('properties', {})))
                for child in value.values():
                    walk(child, visited)
            elif isinstance(value, list):
                for child in value:
                    walk(child, visited)
        for path, operations in SPEC['paths'].items():
            if path.startswith('/api/v1/public/'):
                for op in operations.values():
                    for status, response in op['responses'].items():
                        if status.startswith('2'):
                            walk(response, set())

    def test_local_markdown_links(self):
        files = [ROOT / 'README.md', ROOT / 'CONTRIBUTING.md', *list((ROOT / 'docs').rglob('*.md'))]
        for path in files:
            text = path.read_text()
            self.assertEqual(sum(line.startswith('```') for line in text.splitlines()) % 2, 0, str(path))
            for link in re.findall(r'\]\(([^)]+)\)', text):
                if '://' in link or link.startswith('#'):
                    continue
                self.assertTrue((path.parent / link.split('#')[0]).exists(), f'{path}: {link}')


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        # 每个用例独占内存库并显式启用外键；不接触开发库，也不证明 Go 驱动配置相同。
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(SQL)

    def tearDown(self):
        self.db.close()

    def object(self, oid='a', kind='article', published=True):
        # 对象与首版本存在延迟外键环，须在同一事务完成指针赋值后再提交。
        self.db.execute('BEGIN')
        self.db.execute('INSERT INTO content_objects(id,kind,created_at,updated_at) VALUES(?,?,1,1)', (oid, kind))
        self.revision(oid, oid+'-r1', 1, '公开标题')
        if published:
            self.db.execute("UPDATE content_objects SET published_revision_id=?,visibility='published',first_published_at=1,published_updated_at=1 WHERE id=?", (oid+'-r1', oid))
        else:
            self.db.execute('UPDATE content_objects SET draft_revision_id=? WHERE id=?', (oid+'-r1', oid))
        self.db.execute('COMMIT')

    def revision(self, oid, rid, no, title='', cover=None):
        self.db.execute("INSERT INTO content_revisions(id,content_id,revision_no,title,cover_sha256,source,content_digest,created_at) VALUES(?,?,?,?,?,'admin',?,1)", (rid, oid, no, title, cover, 'a'*64))

    def asset(self):
        sha = 'b'*64
        self.db.execute("INSERT INTO asset_blobs VALUES(?,'image/png',10,1,1,'sha/file.png','example.png',1)", (sha,))
        return sha

    def thread(self, tid='t', content=None):
        scope = 'article' if content else 'guestbook'
        self.db.execute('INSERT INTO comment_threads(id,scope,content_id,created_at,updated_at) VALUES(?,?,?,1,1)', (tid, scope, content))
        self.db.execute("INSERT INTO comments(id,thread_id,is_root,nickname,body,created_at,updated_at) VALUES(?,?,1,'根留言','正文',1,1)", (tid+'-root', tid))

    def reply(self, rid='reply', tid='t', target=None, hidden=False):
        self.db.execute('INSERT INTO comments(id,thread_id,is_root,reply_to_id,reply_to_nickname,nickname,body,state,created_at,updated_at) VALUES(?,?,0,?,?,?, ?,?,2,2)', (rid, tid, target or tid+'-root', '目标昵称', '访客', '回复', 'hidden' if hidden else 'visible'))

    def job(self, **overrides):
        # 字段名仅来自本文件的固定测试夹具及调用者传入的测试关键字；字段值仍使用参数绑定。
        fields = {'id':'job','kind':'sync_content','aggregate_id':'a','target_generation':1,'dedupe_key':'sync:a:1','next_run_at':1,'created_at':1,'updated_at':1}
        fields.update(overrides)
        self.db.execute('INSERT INTO outbox_jobs('+','.join(fields)+') VALUES('+','.join('?' for _ in fields)+')', list(fields.values()))

    def test_migration_integrity(self):
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(self.db.execute("SELECT count(*) FROM sqlite_schema WHERE type='table'").fetchone()[0], 32)

    def test_cross_object_revision_rejected_at_commit(self):
        self.object('a'); self.object('b')
        self.db.execute('BEGIN')
        self.db.execute("UPDATE content_objects SET draft_revision_id='b-r1' WHERE id='a'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('COMMIT')
        self.db.execute('ROLLBACK')

    def test_draft_does_not_change_public_title(self):
        self.object()
        self.revision('a','a-r2',2,'修改稿标题')
        self.db.execute("UPDATE content_objects SET draft_revision_id='a-r2',generation=generation+1 WHERE id='a'")
        self.assertEqual(self.db.execute('SELECT title FROM public_content').fetchone()[0], '公开标题')

    def test_incomplete_draft_allowed(self):
        self.object(published=False)
        self.revision('a','a-r2',2,'')
        self.db.execute("INSERT INTO article_revision_data(revision_id,channel) VALUES('a-r2',NULL)")
        self.assertEqual(self.db.execute('SELECT count(*) FROM public_content').fetchone()[0], 0)

    def test_cas_failure_rolls_back_new_revision(self):
        # 模拟旧 generation 写入：影响零行时回滚整个事务，不能留下孤立版本。
        self.object()
        self.db.execute('BEGIN')
        self.revision('a','a-r2',2,'不能保存')
        updated = self.db.execute("UPDATE content_objects SET draft_revision_id='a-r2',generation=generation+1 WHERE id='a' AND generation=999").rowcount
        self.assertEqual(updated, 0)
        self.db.execute('ROLLBACK')
        self.assertEqual(self.db.execute("SELECT count(*) FROM content_revisions WHERE id='a-r2'").fetchone()[0],0)

    def test_outbox_failure_rolls_back_content_change(self):
        # outbox 去重冲突必须与对象指针、版本插入一并回滚，避免只提交业务状态。
        self.object(); self.job()
        self.db.execute('BEGIN')
        self.revision('a','a-r2',2,'新版本')
        self.db.execute("UPDATE content_objects SET draft_revision_id='a-r2',generation=2 WHERE id='a'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.job(id='duplicate')
        self.db.execute('ROLLBACK')
        self.assertEqual(self.db.execute("SELECT generation FROM content_objects WHERE id='a'").fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT count(*) FROM content_revisions').fetchone()[0],1)

    def test_trash_cannot_be_published(self):
        self.object()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE content_objects SET lifecycle='trash',trashed_at=2 WHERE id='a'")

    def test_restore_remains_unpublished(self):
        self.object(); self.thread(content='a')
        self.db.execute("UPDATE content_objects SET lifecycle='trash',visibility='unpublished',trashed_at=2 WHERE id='a'")
        self.db.execute("UPDATE content_objects SET lifecycle='active',trashed_at=NULL WHERE id='a'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM public_content').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM public_comments').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM comments').fetchone()[0],1)

    def test_profile_singleton_and_no_trash(self):
        self.object('p','profile')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO content_objects(id,kind,created_at,updated_at) VALUES('p2','profile',1,1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE content_objects SET lifecycle='trash',visibility='unpublished',trashed_at=2 WHERE id='p'")

    def test_immutable_main_revision(self):
        self.object()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE content_revisions SET title='覆盖历史' WHERE id='a-r1'")

    def test_history_slug_reserved(self):
        self.object('a'); self.object('b')
        self.db.execute("INSERT INTO content_routes VALUES('posts','old','a',0,1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO content_routes VALUES('posts','old','b',1,1)")

    def test_only_one_current_route(self):
        self.object()
        self.db.execute("INSERT INTO content_routes VALUES('posts','one','a',1,1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO content_routes VALUES('posts','two','a',1,1)")

    def test_single_category_per_revision(self):
        self.object()
        for tid in ['c1','c2']:
            self.db.execute("INSERT INTO taxonomy_items(id,kind,channel,name,normalized_name,slug,created_at,updated_at) VALUES(?,'category','tech',?,?,?,1,1)",(tid,tid,tid,tid))
        self.db.execute("INSERT INTO revision_taxonomy VALUES('a-r1','c1','category','tech','一','one',0)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO revision_taxonomy VALUES('a-r1','c2','category','tech','二','two',0)")

    def test_retired_taxonomy_history_protected(self):
        self.object()
        self.db.execute("INSERT INTO taxonomy_items(id,kind,channel,name,normalized_name,slug,created_at,updated_at) VALUES('tag','tag','all','标签','标签','tag',1,1)")
        self.db.execute("INSERT INTO revision_taxonomy VALUES('a-r1','tag','tag','all','标签','tag',0)")
        self.db.execute("UPDATE taxonomy_items SET retired_at=2 WHERE id='tag'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM taxonomy_items WHERE id='tag'")

    def test_history_cover_protects_asset(self):
        sha=self.asset(); self.object()
        self.revision('a','a-r2',2,'历史',sha)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('DELETE FROM asset_blobs WHERE sha256=?',(sha,))

    def test_sync_snapshot_protects_asset(self):
        sha=self.asset()
        self.db.execute("INSERT INTO sync_snapshots VALUES('snapshot','a',?,'{}',1)",('a'*64,))
        self.db.execute("INSERT INTO sync_snapshot_assets VALUES('snapshot',?)",(sha,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('DELETE FROM asset_blobs WHERE sha256=?',(sha,))

    def test_sync_base_cannot_reference_another_object(self):
        self.object('a'); self.object('b')
        self.db.execute("INSERT INTO sync_snapshots VALUES('snapshot-b','b',?,'{}',1)",('b'*64,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO sync_bases VALUES('a','snapshot-b','commit',1,1)")

    def test_ready_image_variant_requires_dimensions(self):
        sha=self.asset()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO asset_variants(asset_sha256,variant,state,storage_key,updated_at) VALUES(?,'thumb','ready','thumb.png',1)",(sha,))

    def test_public_comment_projection_no_email(self):
        self.thread()
        self.db.execute("INSERT INTO comment_contacts VALUES('t-root','private@example.test')")
        cursor=self.db.execute('SELECT * FROM public_comments')
        self.assertNotIn('email',[c[0] for c in cursor.description])
        self.assertEqual(len(cursor.fetchall()),1)

    def test_root_hide_restore_respects_reply_hidden_state(self):
        self.thread(); self.reply('shown'); self.reply('hidden',hidden=True)
        self.db.execute("UPDATE comments SET state='hidden' WHERE id='t-root'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM public_comments').fetchone()[0],0)
        self.db.execute("UPDATE comments SET state='visible' WHERE id='t-root'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM public_comments').fetchone()[0],2)

    def test_cross_thread_reply_rejected(self):
        self.thread('a'); self.thread('b')
        with self.assertRaises(sqlite3.IntegrityError):
            self.reply('bad','a','b-root')

    def test_project_comments_rejected(self):
        self.object('p','project')
        with self.assertRaises(sqlite3.IntegrityError):
            self.thread('t','p')

    def test_deleting_reply_preserves_other_reply_target_name(self):
        self.thread(); self.reply('r1'); self.reply('r2',target='r1')
        self.db.execute("DELETE FROM comments WHERE id='r1'")
        self.assertEqual(self.db.execute("SELECT reply_to_id,reply_to_nickname FROM comments WHERE id='r2'").fetchone(),(None,'目标昵称'))

    def test_thread_deletion_cascades_comments_and_contacts(self):
        self.thread(); self.reply()
        self.db.execute("INSERT INTO comment_contacts VALUES('reply','private@example.test')")
        self.db.execute("DELETE FROM comment_threads WHERE id='t'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM comments').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM comment_contacts').fetchone()[0],0)

    def test_purge_can_keep_tombstone_and_remote_job(self):
        # 删除对象级联清理内容和评论，但 tombstone 与远端删除任务必须保留，阻止旧事件复活。
        self.object(); self.thread(content='a')
        self.db.execute('BEGIN')
        self.db.execute("INSERT INTO tombstones VALUES('a','article',2,2,NULL)")
        self.job(kind='delete_remote',target_generation=2)
        self.db.execute("DELETE FROM content_objects WHERE id='a'")
        self.db.execute('COMMIT')
        self.assertEqual(self.db.execute('SELECT count(*) FROM content_revisions').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM comments').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM tombstones').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT count(*) FROM outbox_jobs').fetchone()[0],1)

    def test_running_job_requires_lease(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.job(state='running')
        self.job(state='running',lease_token='lease',lease_expires_at=100)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE outbox_jobs SET state='succeeded' WHERE id='job'")

    def test_idempotency_unique_scope_key(self):
        args=('anonymous:POST:/comments',b'k'*32,b'r'*32,201,'{}',1,2)
        statement='INSERT INTO idempotency_records(scope,key_hash,request_hash,response_status,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?)'
        self.db.execute(statement,args)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement,args)

    def test_invalid_json_task_payload_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.job(payload_json='[]')


if __name__ == '__main__':
    print(f'Design verification: SQLite {sqlite3.sqlite_version}; OpenAPI {SPEC["openapi"]}')
    unittest.main(verbosity=2)
