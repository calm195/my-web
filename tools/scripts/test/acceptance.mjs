import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { managedTest } from './lifecycle.mjs'
import { runE2E } from '../../tests/e2e/p1.mjs'
import { runIntegration } from '../../tests/integration/p1.mjs'

// 一次验收只启动一套真实服务；浏览器先运行，耗尽失败限频桶的 HTTP 用例最后运行。
await managedTest('acceptance', async (s, signal, report) => {
  const processFile = path.join(s.runDir, 'run/processes.json')
  const stack = JSON.parse(fs.readFileSync(processFile, 'utf8'))
  const suites = { e2e: { status: 'not_run' }, integration: { status: 'not_run' } }
  const progress = () =>
    report({
      checks: (suites.e2e.checks || 0) + (suites.integration.checks || 0),
      stackRunId: stack.runId,
      sharedServiceStack: true,
      suites,
    })
  function assertSameStack() {
    const current = JSON.parse(fs.readFileSync(processFile, 'utf8'))
    assert.equal(current.runId, stack.runId, '验收期间不能替换服务运行标识')
    assert.equal(current.supervisor.pid, stack.supervisor.pid, '验收期间不能重新启动服务栈')
  }
  suites.e2e = { status: 'failed' }
  progress()
  suites.e2e = await runE2E(s, signal)
  assertSameStack()
  signal.throwIfAborted()
  // 浏览器用例会改密并清除会话；口令仅经维护 CLI 标准输入恢复，不重建库或重启服务。
  s.execute(
    path.join(s.backendRoot, 'bin/site-admin'),
    ['reset-password', '--username', s.credentials.username],
    { env: s.serviceEnv(), input: s.credentials.password + '\n' },
  )
  suites.integration = { status: 'failed' }
  progress()
  suites.integration = await runIntegration(s, signal)
  assertSameStack()
  progress()
  console.log(
    `同一真实服务栈断言通过：浏览器 ${suites.e2e.checks} 组、HTTPS ${suites.integration.checks} 组；证据目录：${s.runDir}`,
  )
})
