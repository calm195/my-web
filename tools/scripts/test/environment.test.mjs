import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const moduleURL = new URL('./environment.mjs', import.meta.url).href
function rejectsBeforeStart(directory, message) {
  const code = `import assert from 'node:assert/strict'; import { environment } from ${JSON.stringify(moduleURL)}; await assert.rejects(() => environment('guard'), ${message});`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    // 子进程不提供外部工具 PATH；隔离预检应在分配端口、加载服务或执行 CLI 之前拒绝。
    env: { ...process.env, SITE_RUN_DIR: directory, PATH: '/path-that-does-not-exist' },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

test('自动验收拒绝 var/local，不能改动日常开发账号和数据库', () => {
  rejectsBeforeStart(path.join(root, 'var/local'), '/不能复用 var\\/local/')
})

test('自动验收拒绝已存在的测试目录，保留其中全部内容', (t) => {
  const testRoot = path.join(root, 'var/test')
  fs.mkdirSync(testRoot, { recursive: true })
  const directory = fs.mkdtempSync(path.join(testRoot, 'environment-guard-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  // 即使目录为空也不能接管，避免校验和后续 prepare 之间误用既有运行空间。
  rejectsBeforeStart(directory, '/运行目录必须尚不存在/')
  const sentinel = path.join(directory, 'keep.txt')
  fs.writeFileSync(sentinel, 'must remain')
  rejectsBeforeStart(directory, '/运行目录必须尚不存在/')
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'must remain')
  assert.deepEqual(fs.readdirSync(directory), ['keep.txt'])
})

// 取消先于环境创建时不得生成账号、端口或进程记录；这是信号生命周期的无服务负向入口。
test('已取消的验收在环境准备前退出，不创建运行目录', () => {
  const directory = path.join(root, 'var/test', `aborted-before-start-${process.pid}-${Date.now()}`)
  const code = `import assert from 'node:assert/strict'; import fs from 'node:fs'; import { environment } from ${JSON.stringify(moduleURL)}; const controller = new AbortController(); controller.abort(new Error('cancel-before-start')); await assert.rejects(() => environment('guard', { signal: controller.signal }), /cancel-before-start/); assert.equal(fs.existsSync(process.env.SITE_RUN_DIR), false);`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    env: { ...process.env, SITE_RUN_DIR: directory, PATH: '/path-that-does-not-exist' },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(fs.existsSync(directory), false)
})
