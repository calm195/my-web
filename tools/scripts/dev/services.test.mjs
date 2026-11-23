import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const service = path.join(root, 'tools/scripts/dev/services.mjs')
const node = process.execPath
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fixture(t) {
  const dir = path.join(root, `var/test/lifecycle-${randomUUID()}`)
  fs.mkdirSync(path.join(dir, 'run'), { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(dir, '.personal-website-run'), root, { mode: 0o600 })
  const sockets = []
  for (let i = 0; i < 4; i++) {
    const socket = net.createServer()
    await new Promise((resolve, reject) => {
      socket.once('error', reject)
      socket.listen(0, '127.0.0.1', resolve)
    })
    sockets.push(socket)
  }
  const [apiPort, webPort, adminPort, httpsPort] = sockets.map((socket) => socket.address().port)
  await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.close(resolve))))
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      apiPort,
      webPort,
      adminPort,
      httpsPort,
      origin: `https://localhost:${httpsPort}`,
      csrfKey: 'a1'.repeat(32),
      rateLimitKey: 'b2'.repeat(32),
    }),
    { mode: 0o600 },
  )
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function invoke(dir, command, extraEnv = {}) {
  return spawnSync(node, [service, command], {
    cwd: root,
    env: { ...process.env, SITE_RUN_DIR: dir, ...extraEnv },
    encoding: 'utf8',
    timeout: 20000,
  })
}
function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function ownerLock(dir) {
  const runId = randomUUID()
  const lock = path.join(dir, 'run/services.lock')
  fs.mkdirSync(lock)
  fs.writeFileSync(
    path.join(lock, 'owner.json'),
    JSON.stringify({ runId, kind: 'test', owner: { pid: process.pid, identity: 'test-owner' } }),
  )
  return runId
}

// 不启动任何服务就检测 ps 能力；缺少权限时不能留下无法管理的后台进程。
test('ps 不可用时 up 在启动前失败', async (t) => {
  const dir = await fixture(t)
  const result = invoke(dir, 'up', { PATH: '/path-that-does-not-exist' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ps/)
  assert.equal(fs.existsSync(path.join(dir, 'run/processes.json')), false)
  assert.equal(fs.existsSync(path.join(dir, 'run/services.lock')), false)
  const fresh = path.join(root, `var/test/fresh-${randomUUID()}`)
  t.after(() => fs.rmSync(fresh, { recursive: true, force: true }))
  const preparation = invoke(fresh, 'prepare', { PATH: '/path-that-does-not-exist' })
  assert.equal(preparation.status, 1)
  assert.equal(fs.existsSync(fresh), false)
})

// 利用临时目录模拟错误链接，检查准备脚本不会写出仓库运行区。
test('拒绝运行目录与关键文件符号链接', async (t) => {
  const dir = await fixture(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'site-outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const linked = path.join(root, `var/test/linked-${randomUUID()}`)
  fs.symlinkSync(outside, linked)
  t.after(() => fs.rmSync(linked, { force: true }))
  assert.equal(invoke(linked, 'prepare').status, 1)
  assert.deepEqual(fs.readdirSync(outside), [])
  fs.rmSync(path.join(dir, 'config.json'))
  const externalConfig = path.join(outside, 'config.json')
  fs.writeFileSync(externalConfig, '{}')
  fs.symlinkSync(externalConfig, path.join(dir, 'config.json'))
  assert.equal(invoke(dir, 'prepare').status, 1)
  assert.equal(fs.readFileSync(externalConfig, 'utf8'), '{}')
})

test('同目录启动锁拒绝另一轮 up 与 prepare，不覆盖 owner', async (t) => {
  const dir = await fixture(t)
  const runId = ownerLock(dir)
  for (const command of ['up', 'prepare']) {
    const result = invoke(dir, command)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /锁定/)
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, 'run/services.lock/owner.json'))).runId,
      runId,
    )
  }
  assert.equal(fs.existsSync(path.join(dir, 'run/processes.json')), false)
})

// guardian 的实际子进程故意留下忽略 TERM 的后代；验证进程组清理确实释放动态端口。
test('启动器退出后 guardian 清理忽略 TERM 的后代', { timeout: 15000 }, async (t) => {
  const dir = await fixture(t)
  const runId = ownerLock(dir)
  const infoFile = path.join(dir, 'child.json')
  const descendant = `const fs=require('node:fs');const net=require('node:net');process.on('SIGTERM',()=>{});const server=net.createServer();server.listen(0,'127.0.0.1',()=>fs.writeFileSync(${JSON.stringify(infoFile)},JSON.stringify({pid:process.pid,port:server.address().port})));`
  const launcher = `const {spawn}=require('node:child_process');const fs=require('node:fs');spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'}).unref();const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(infoFile)})){clearInterval(timer);process.exit(9)}},10);`
  const child = spawn(
    node,
    [service, 'service', runId, 'fault-test', JSON.stringify([node, ['-e', launcher]])],
    {
      cwd: root,
      env: { ...process.env, SITE_RUN_DIR: dir },
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  )
  let stderr = ''
  child.stderr.on('data', (part) => {
    stderr += part
  })
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
  })
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  const deadline = Date.now() + 5000
  while (!fs.existsSync(infoFile) && Date.now() < deadline) await delay(20)
  assert.equal(fs.existsSync(infoFile), true, stderr)
  const { port } = JSON.parse(fs.readFileSync(infoFile))
  const result = await exited
  assert.equal(result.signal, 'SIGKILL', stderr)
  const probe = net.createServer()
  await new Promise((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve) => probe.close(resolve))
})

test('同 CA 修复私钥不匹配并续签临近过期证书，保留账号', { timeout: 30000 }, async (t) => {
  const dir = await fixture(t)
  let result = invoke(dir, 'prepare')
  assert.equal(result.status, 0, result.stderr)
  const ca = path.join(dir, 'certs/ca.pem')
  const key = path.join(dir, 'certs/localhost.key')
  const cert = path.join(dir, 'certs/localhost.pem')
  const credentials = path.join(dir, 'credentials.json')
  const originalCA = hash(ca)
  const originalCredentials = hash(credentials)
  fs.writeFileSync(key, 'broken-key', { mode: 0o600 })
  result = invoke(dir, 'prepare')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(hash(ca), originalCA)
  assert.equal(hash(credentials), originalCredentials)
  const openssl = (args) => {
    const output = spawnSync('openssl', args, { cwd: path.join(dir, 'certs'), encoding: 'utf8' })
    assert.equal(output.status, 0, output.stderr)
  }
  openssl(['req', '-new', '-key', key, '-out', 'expired.csr', '-subj', '/CN=localhost'])
  fs.writeFileSync(
    path.join(dir, 'certs/test.ext'),
    'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\n',
  )
  openssl([
    'x509',
    '-req',
    '-in',
    'expired.csr',
    '-CA',
    ca,
    '-CAkey',
    path.join(dir, 'certs/ca.key'),
    '-set_serial',
    '1234',
    '-out',
    cert,
    '-days',
    '1',
    '-extfile',
    'test.ext',
  ])
  await delay(1100)
  result = invoke(dir, 'prepare')
  assert.equal(result.status, 0, result.stderr)
  openssl(['x509', '-in', cert, '-checkend', '86400', '-noout'])
  assert.equal(hash(ca), originalCA)
  assert.equal(hash(credentials), originalCredentials)
  fs.renameSync(path.join(dir, 'certs/ca.key'), path.join(dir, 'certs/ca.key.saved'))
  result = invoke(dir, 'prepare')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CA/)
  assert.equal(hash(ca), originalCA)
})

// 以 Python 优化模式检查摘要不能被禁用，并在目录切换失败/上次中断后保留旧工具。
test('bootstrap 在 Python -O 下拒绝错误摘要并恢复中断目录', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'site-bootstrap-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const code = `
import hashlib, importlib.util, io, pathlib, sys, tarfile
base = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('bootstrap', sys.argv[2])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.DEST = base / 'tools'; module.DEST.mkdir()
old = module.DEST / 'fake'; old.mkdir(); (old / '.version').write_text('old'); (old / 'keep').write_text('old-tool')
archive = base / 'tool.tar.gz'
with tarfile.open(archive, 'w:gz') as output:
 info = tarfile.TarInfo('release/new'); data = b'new-tool'; info.size = len(data); output.addfile(info, io.BytesIO(data))
artifact = {'url': archive.as_uri(), 'strip': 1, 'sha256': '0' * 64}
try: module.install('fake', artifact, 'new')
except ValueError: pass
else: raise RuntimeError('优化模式跳过了摘要校验')
if (old / 'keep').read_text() != 'old-tool': raise RuntimeError('错误摘要覆盖旧工具')
artifact['sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
rename = pathlib.Path.rename
def fail_swap(self, target):
 if self.name == 'unpacked': raise OSError('injected swap failure')
 return rename(self, target)
pathlib.Path.rename = fail_swap
try:
 try: module.install('fake', artifact, 'new')
 except OSError: pass
 else: raise RuntimeError('应触发切换故障')
finally: pathlib.Path.rename = rename
if (old / 'keep').read_text() != 'old-tool': raise RuntimeError('切换失败未恢复旧工具')
old.rename(module.DEST / '.fake.previous')
artifact['sha256'] = '0' * 64
try: module.install('fake', artifact, 'new')
except ValueError: pass
if (old / 'keep').read_text() != 'old-tool': raise RuntimeError('未恢复上次中断目录')
`
  const result = spawnSync(
    'python3',
    ['-O', '-c', code, directory, path.join(root, 'tools/scripts/dev/bootstrap.py')],
    { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 10000 },
  )
  assert.equal(result.status, 0, result.stderr)
})
