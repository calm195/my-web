import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const node = process.execPath
const pause = () => new Promise((resolve) => setTimeout(resolve, 20))
const results = []
for (const scenario of [
  { name: 'startup', entry: 'integration', signal: 'SIGTERM', code: 143 },
  { name: 'browser', entry: 'acceptance', signal: 'SIGINT', code: 130 },
]) {
  const runDir = path.join(root, `var/test/interruption-${scenario.name}-${randomUUID()}`)
  const env = { ...process.env, SITE_RUN_DIR: runDir }
  for (const name of ['API', 'WEB', 'ADMIN', 'HTTPS']) delete env[`SITE_${name}_PORT`]
  let output = ''
  const child = spawn(node, [path.join(root, `tools/scripts/test/${scenario.entry}.mjs`)], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (part) => {
    output += part
  })
  child.stderr.on('data', (part) => {
    output += part
  })
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  try {
    const deadline = Date.now() + 45000
    const processFile = path.join(runDir, 'run/processes.json')
    let interrupted = false
    while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
      const ready =
        scenario.name === 'startup'
          ? fs.existsSync(processFile)
          : output.includes('通过：受信 HTTPS 下 Nuxt 公开首页与客户端激活')
      if (ready) {
        child.kill(scenario.signal)
        interrupted = true
        break
      }
      await pause()
    }
    assert.equal(interrupted, true, `未到达 ${scenario.name} 中断点：${output}`)
    let timer
    const exit = await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('中断后未及时退出')), 20000)
      }),
    ]).finally(() => clearTimeout(timer))
    assert.equal(exit.signal, null, output)
    assert.equal(exit.code, scenario.code, output)
    assert.equal(fs.existsSync(processFile), false, '中断后应移除自己的进程记录')
    assert.equal(
      fs.existsSync(path.join(runDir, 'run/services.lock')),
      false,
      '中断后应释放自己的运行锁',
    )
    const result = JSON.parse(fs.readFileSync(path.join(runDir, 'result.json'), 'utf8'))
    assert.equal(result.status, 'failed')
    assert.equal(result.interrupted, scenario.signal)
    assert.equal(result.servicesStopped, true)
    const config = JSON.parse(fs.readFileSync(path.join(runDir, 'config.json'), 'utf8'))
    for (const key of ['apiPort', 'webPort', 'adminPort', 'httpsPort']) {
      const socket = net.createServer()
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.listen(config[key], '127.0.0.1', resolve)
      })
      await new Promise((resolve) => socket.close(resolve))
    }
    results.push({ scenario: scenario.name, status: 'passed', exitCode: exit.code, runDir })
    console.log(`通过：${scenario.name} ${scenario.signal} 清理自有服务并返回 ${exit.code}`)
  } finally {
    // 仅兜底当前已标识的运行；失败保留日志与结果，绝不按进程名清理其他项目。
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    if (fs.existsSync(path.join(runDir, 'run/processes.json'))) {
      const stopped = spawnSync(node, [path.join(root, 'tools/scripts/dev/services.mjs'), 'down'], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 20000,
      })
      output += stopped.stdout + stopped.stderr
    }
    if (fs.existsSync(runDir)) fs.writeFileSync(path.join(runDir, 'interruption.log'), output)
  }
}
console.log(JSON.stringify(results, null, 2))
