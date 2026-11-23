import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const entry = path.join(root, 'dev')

// 从工作区外调用仍定位本项目；否则同名合同、缓存和配置可能指向其他任务。
test('dev 从任意工作目录定位项目并透传参数', () => {
  const result = spawnSync(entry, ['exec', 'node', '-p', 'process.cwd()'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), root)
})

test('dev 保留子命令失败退出码，拒绝无效构建目标', () => {
  const failure = spawnSync(entry, ['exec', 'node', '-e', 'process.exit(23)'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  })
  assert.equal(failure.status, 23, failure.stderr)
  const invalid = spawnSync(entry, ['build', 'unknown'], { encoding: 'utf8' })
  assert.equal(invalid.status, 2)
  assert.match(invalid.stderr, /构建目标/)
})
