import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
// 源码由各自 Git 子模块管理；运行数据始终只写根仓库 var。
export const frontendRoot = path.join(root, 'frontend')
export const backendRoot = path.join(root, 'backend')
export const tools = path.join(root, 'var/toolchain')
export const toolEnv = {
  ...process.env,
  PATH: [
    path.join(tools, 'node/bin'),
    path.join(tools, 'go/bin'),
    path.join(tools, 'caddy'),
    path.join(tools, 'bin'),
    process.env.PATH,
  ].join(path.delimiter),
  GOPATH: path.join(root, 'var/cache/go'),
  GOCACHE: path.join(root, 'var/cache/go-build'),
  GOTOOLCHAIN: 'local',
}
export const runDir = path.resolve(process.env.SITE_RUN_DIR || path.join(root, 'var/local'))
const marker = path.join(runDir, '.personal-website-run')
const configFile = path.join(runDir, 'config.json')
const processFile = path.join(runDir, 'run/processes.json')
const lockDir = path.join(runDir, 'run/services.lock')
const lockFile = path.join(lockDir, 'owner.json')
const self = fileURLToPath(import.meta.url)

export function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: toolEnv,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${path.basename(command)} 执行失败：${result.stderr || result.stdout}`)
  return (result.stdout || '').trim()
}

function assertNoLinks(file) {
  const relative = path.relative(root, file)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('运行路径越出项目范围')
  let cursor = root
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part)
    try {
      if (fs.lstatSync(cursor).isSymbolicLink())
        throw new Error('运行路径不允许符号链接，避免写入项目外的数据')
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
  }
}

function assertOwned() {
  // 数据与清理目标限制在当前仓库 var 内，并使用标记防止误用任意目录。
  const relative = path.relative(path.join(root, 'var'), runDir)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('运行目录必须是项目 var 内的独立子目录')
  // 字符串包含关系不能识别符号链接；所有实际写入入口都拒绝链接目录和链接文件。
  for (const file of [
    runDir,
    marker,
    configFile,
    processFile,
    lockFile,
    path.join(runDir, 'credentials.json'),
    ...['site.sqlite', 'site.sqlite-wal', 'site.sqlite-shm'].map((name) =>
      path.join(runDir, 'db', name),
    ),
    ...['db', 'assets', 'git', 'logs', 'certs', 'run', 'caddy', 'nuxt', 'vite'].map((name) =>
      path.join(runDir, name),
    ),
  ])
    assertNoLinks(file)
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') !== root)
    throw new Error('运行目录属于另一份项目')
}

export function config() {
  assertOwned()
  if (!fs.existsSync(marker) || !fs.existsSync(configFile))
    throw new Error('请先执行 ./dev prepare 或 ./dev up')
  return JSON.parse(fs.readFileSync(configFile, 'utf8'))
}

export function serviceEnv(c = config()) {
  return {
    ...toolEnv,
    SITE_RUN_DIR: runDir,
    SITE_ADDR: `127.0.0.1:${c.apiPort}`,
    SITE_DATABASE_PATH: path.join(runDir, 'db/site.sqlite'),
    SITE_ASSET_DIR: path.join(runDir, 'assets'),
    SITE_PUBLIC_ORIGIN: c.origin,
    SITE_CSRF_KEY: c.csrfKey,
    SITE_RATE_LIMIT_KEY: c.rateLimitKey,
    SITE_NUXT_BUILD_DIR: path.join(runDir, 'nuxt'),
    SITE_VITE_CACHE_DIR: path.join(runDir, 'vite'),
    SITE_WEB_PORT: String(c.webPort),
    SITE_ADMIN_PORT: String(c.adminPort),
    SITE_HTTPS_PORT: String(c.httpsPort),
    NUXT_API_BASE_URL: `http://127.0.0.1:${c.apiPort}`,
    NODE_EXTRA_CA_CERTS: path.join(runDir, 'certs/ca.pem'),
    XDG_DATA_HOME: path.join(runDir, 'caddy/data'),
    XDG_CONFIG_HOME: path.join(runDir, 'caddy/config'),
  }
}

function writePrivate(file, value) {
  assertNoLinks(file)
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600)
    try {
      fs.writeFileSync(fd, value)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    // 同目录 rename 对读者是原子的，状态查询不会读到被截断的半份 JSON。
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function prepareCertificate() {
  const dir = path.join(runDir, 'certs')
  const openssl = (args, cwd = dir) => execute('openssl', args, { cwd })
  const ca = path.join(dir, 'ca.pem')
  const caKey = path.join(dir, 'ca.key')
  for (const name of ['ca.pem', 'ca.key', 'localhost.pem', 'localhost.key'])
    assertNoLinks(path.join(dir, name))
  if (fs.existsSync(ca) !== fs.existsSync(caKey))
    throw new Error('本地 CA 或私钥缺失；拒绝自动替换已受信的 CA')
  const matchesKey = (cert, key) =>
    openssl(['x509', '-in', cert, '-pubkey', '-noout']) === openssl(['pkey', '-in', key, '-pubout'])
  if (!fs.existsSync(ca)) {
    const staging = fs.mkdtempSync(path.join(dir, '.ca-'))
    try {
      openssl(
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          'ca.key',
          '-out',
          'ca.pem',
          '-days',
          '365',
          '-subj',
          '/CN=Personal Website Local Test CA',
          '-addext',
          'basicConstraints=critical,CA:TRUE',
          '-addext',
          'keyUsage=critical,keyCertSign,cRLSign',
        ],
        staging,
      )
      writePrivate(caKey, fs.readFileSync(path.join(staging, 'ca.key')))
      writePrivate(ca, fs.readFileSync(path.join(staging, 'ca.pem')))
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  }
  if (!matchesKey(ca, caKey)) throw new Error('本地 CA 与私钥不匹配，拒绝重置信任根')
  openssl(['verify', '-CAfile', ca, ca])
  openssl(['x509', '-checkend', '172800', '-noout', '-in', ca])
  const cert = path.join(dir, 'localhost.pem')
  const key = path.join(dir, 'localhost.key')
  const validateLeaf = (certFile, keyFile) => {
    if (!matchesKey(certFile, keyFile)) throw new Error('站点证书与私钥不匹配')
    openssl([
      'verify',
      '-purpose',
      'sslserver',
      '-verify_hostname',
      'localhost',
      '-CAfile',
      ca,
      certFile,
    ])
    openssl(['x509', '-checkip', '127.0.0.1', '-noout', '-in', certFile])
    openssl(['x509', '-checkend', '86400', '-noout', '-in', certFile])
  }
  if (fs.existsSync(cert) && fs.existsSync(key)) {
    try {
      validateLeaf(cert, key)
      return
    } catch {
      /* 仅续签叶证书，保留本地 CA 和显式信任设置。 */
    }
  }
  const staging = fs.mkdtempSync(path.join(dir, '.leaf-'))
  try {
    openssl(
      [
        'req',
        '-new',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        'localhost.key',
        '-out',
        'localhost.csr',
        '-subj',
        '/CN=localhost',
      ],
      staging,
    )
    fs.writeFileSync(
      path.join(staging, 'localhost.ext'),
      'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
    )
    openssl(
      [
        'x509',
        '-req',
        '-in',
        'localhost.csr',
        '-CA',
        ca,
        '-CAkey',
        caKey,
        '-set_serial',
        `0x${randomBytes(16).toString('hex')}`,
        '-out',
        'localhost.pem',
        '-days',
        '90',
        '-extfile',
        'localhost.ext',
      ],
      staging,
    )
    validateLeaf(path.join(staging, 'localhost.pem'), path.join(staging, 'localhost.key'))
    writePrivate(key, fs.readFileSync(path.join(staging, 'localhost.key')))
    writePrivate(cert, fs.readFileSync(path.join(staging, 'localhost.pem')))
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

export function prepare() {
  assertOwned()
  requireProcessInspection()
  if (!fs.existsSync(marker) && fs.existsSync(runDir) && fs.readdirSync(runDir).length)
    throw new Error('拒绝初始化非空且无项目标记的目录')
  for (const dir of ['db', 'assets', 'git', 'logs', 'certs', 'run'])
    fs.mkdirSync(path.join(runDir, dir), { recursive: true, mode: 0o700 })
  const preparing = acquireLock('prepare')
  try {
    writePrivate(marker, root)
    if (!fs.existsSync(configFile)) {
      const ports = ['API', 'WEB', 'ADMIN', 'HTTPS'].map((name, index) =>
        Number(process.env[`SITE_${name}_PORT`] || [8080, 3000, 5173, 8443][index]),
      )
      if (
        ports.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535) ||
        new Set(ports).size !== 4
      )
        throw new Error('四个端口必须为不同的 1024–65535 整数')
      const [apiPort, webPort, adminPort, httpsPort] = ports
      writePrivate(
        configFile,
        JSON.stringify(
          {
            apiPort,
            webPort,
            adminPort,
            httpsPort,
            origin: `https://localhost:${httpsPort}`,
            csrfKey: randomBytes(32).toString('hex'),
            rateLimitKey: randomBytes(32).toString('hex'),
          },
          null,
          2,
        ),
      )
    }
    const env = serviceEnv()
    execute(path.join(backendRoot, 'bin/site-admin'), ['migrate'], { env })
    const diagnostics = JSON.parse(
      execute(path.join(backendRoot, 'bin/site-admin'), ['diagnose'], { env }),
    )
    if (!diagnostics.admin_initialized) {
      const credentials = { username: 'owner', password: randomBytes(24).toString('base64url') }
      execute(
        path.join(backendRoot, 'bin/site-admin'),
        ['init-admin', '--username', credentials.username],
        { env, input: credentials.password + '\n' },
      )
      // 仅在本地私有目录保存测试账号，不输出口令，不重置已有站主。
      writePrivate(path.join(runDir, 'credentials.json'), JSON.stringify(credentials, null, 2))
    }
    prepareCertificate()
    const remote = path.join(runDir, 'git/remote.git')
    if (!fs.existsSync(remote)) execute('git', ['init', '--bare', '--initial-branch=main', remote])
    console.log(`本地环境已准备：${runDir}；账号信息位于 credentials.json（仅本地）`)
  } finally {
    releaseLock(preparing)
  }
}

export function request(
  urlPath,
  { method = 'GET', headers = {}, body, c = config(), signal: abortSignal, timeout = 10000 } = {},
) {
  return new Promise((resolve, reject) => {
    // 客户端只信任本次运行的 CA；禁止关闭 TLS 校验。
    const req = https.request(
      new URL(urlPath, c.origin),
      {
        method,
        headers,
        ca: fs.readFileSync(path.join(runDir, 'certs/ca.pem')),
        family: 4,
        // 自动验收显式传入 5 秒超时和取消信号；普通联调保留原来的 10 秒默认值。
        timeout,
        signal: abortSignal,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        )
      },
    )
    req.on('timeout', () => req.destroy(new Error('本地 HTTPS 请求超时')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function available(port) {
  await new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(port, '127.0.0.1', () => socket.close(resolve))
  })
}

function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return ''
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=,pgid=,args='], {
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : ''
}

function requireProcessInspection() {
  // 无法辨认自己的进程时，必须在创建任何服务前失败，不能留下无法清理的空 identity。
  const ownIdentity = identity(process.pid)
  if (!ownIdentity) throw new Error('无法读取进程身份；请在允许 ps 的本地环境运行服务脚本')
  return ownIdentity
}

function readJSON(file) {
  assertNoLinks(file)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`${path.basename(file)} 状态损坏，请保留现场检查`, { cause: error })
  }
}

function state() {
  return readJSON(processFile)
}
function lockOwner() {
  return readJSON(lockFile)
}
function alive(record) {
  return Boolean(record?.identity && identity(record.pid) === record.identity)
}
function signal(pid, value) {
  try {
    process.kill(pid, value)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

function acquireLock(kind) {
  const owner = { pid: process.pid, identity: requireProcessInspection() }
  const runId = randomUUID()
  try {
    fs.mkdirSync(lockDir, { mode: 0o700 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    throw new Error('本运行目录已锁定；请先执行 dev:status，旧运行退出后可用 dev:down 清理', {
      cause: error,
    })
  }
  try {
    writePrivate(lockFile, JSON.stringify({ runId, kind, owner }))
  } catch (error) {
    fs.rmSync(lockDir, { recursive: true, force: true })
    throw error
  }
  return runId
}

function releaseLock(runId) {
  if (lockOwner()?.runId === runId) fs.rmSync(lockDir, { recursive: true, force: true })
}

async function stopGroups(records) {
  // 每个服务由持久 guardian 占住进程组首 PID；实际启动器退出也不会丢失组身份。
  for (const child of records) if (alive(child)) signal(-child.pid, 'SIGTERM')
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && records.some(alive)) await delay(100)
  for (const child of records) if (alive(child)) signal(-child.pid, 'SIGKILL')
  const killDeadline = Date.now() + 2000
  while (Date.now() < killDeadline && records.some(alive)) await delay(100)
  if (records.some(alive)) throw new Error('仍有本次运行的服务未退出，保留进程记录供排查')
}

function removeRun(runId) {
  if (state()?.runId === runId) fs.rmSync(processFile, { force: true })
  releaseLock(runId)
}

function guardian(runId, name, payload) {
  config()
  if (lockOwner()?.runId !== runId) throw new Error('服务启动意图已过期')
  const [command, args] = JSON.parse(payload)
  let closing = false
  // guardian 保持进程组身份直到清理结束；SIGKILL 发给整组，包含忽略 TERM 的后代。
  const keepAlive = setInterval(() => {}, 1000)
  const shutdown = () => {
    if (closing) return
    closing = true
    signal(-process.pid, 'SIGTERM')
    setTimeout(() => signal(-process.pid, 'SIGKILL'), 1200)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.on('disconnect', shutdown)
  process.send?.({ type: 'ready', name })
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const failed = (message) => {
    if (closing) return
    console.error(`${name} ${message}`)
    process.send?.({ type: 'failed', name, message })
    // 即使父进程未能处理 IPC，服务异常后也应自行清理整组。
    setTimeout(shutdown, 100)
  }
  child.on('error', () => failed('无法启动'))
  child.on('exit', (code, sig) => failed(`提前退出（${sig || code}）`))
  process.on('exit', () => clearInterval(keepAlive))
}

async function serve(runId) {
  const c = config()
  const currentLock = lockOwner()
  if (currentLock?.runId !== runId) throw new Error('服务启动意图已过期')
  const env = { ...serviceEnv(c), SITE_SERVICE_RUN_ID: runId }
  const records = []
  const supervisor = { pid: process.pid, identity: requireProcessInspection() }
  writePrivate(lockFile, JSON.stringify({ runId, kind: 'serve', owner: supervisor }))
  let closing = false
  const persist = () => {
    if (lockOwner()?.runId !== runId) throw new Error('运行锁已变化，拒绝覆盖另一轮状态')
    writePrivate(
      processFile,
      JSON.stringify({ runId, supervisor, children: records, origin: c.origin }, null, 2),
    )
  }
  const shutdown = async (failed = false) => {
    if (closing) return
    closing = true
    try {
      await stopGroups(records)
      removeRun(runId)
      process.exit(failed ? 1 : 0)
    } catch (error) {
      console.error(error.message)
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => {
    void shutdown()
  })
  process.on('SIGINT', () => {
    void shutdown()
  })
  persist()
  const start = async (name, command, args) => {
    if (closing) throw new Error('服务启动已取消')
    const logPath = path.join(runDir, `logs/${name}.log`)
    assertNoLinks(logPath)
    const log = fs.openSync(logPath, 'a', 0o600)
    const child = spawn(
      path.join(tools, 'node/bin/node'),
      [self, 'service', runId, name, JSON.stringify([command, args])],
      { cwd: root, env, stdio: ['ignore', log, log, 'ipc'], detached: true },
    )
    fs.closeSync(log)
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('spawn', resolve)
    })
    const record = { name, pid: child.pid, identity: identity(child.pid) }
    if (!record.identity) {
      signal(-child.pid, 'SIGTERM')
      throw new Error(`${name} 进程身份不可读取`)
    }
    records.push(record)
    persist()
    child.on('error', () => {
      void shutdown(true)
    })
    child.on('exit', () => {
      if (!closing) void shutdown(true)
    })
    child.on('message', (message) => {
      if (message.type === 'failed') {
        console.error(`${message.name} ${message.message}`)
        void shutdown(true)
      }
    })
  }
  try {
    await start('api', path.join(backendRoot, 'bin/api'), [])
    await start('web', path.join(tools, 'node/bin/node'), [
      path.join(frontendRoot, 'apps/web/node_modules/nuxt/bin/nuxt.mjs'),
      'dev',
      path.join(frontendRoot, 'apps/web'),
      '--port',
      String(c.webPort),
      '--strictPort',
      '--no-takeover',
    ])
    await start('admin', path.join(tools, 'node/bin/node'), [
      path.join(frontendRoot, 'apps/admin/node_modules/vite/bin/vite.js'),
      '--config',
      path.join(frontendRoot, 'apps/admin/vite.config.ts'),
      path.join(frontendRoot, 'apps/admin'),
    ])
    const template = fs.readFileSync(path.join(root, 'deploy/local/Caddyfile'), 'utf8')
    const replaced = template
      .replaceAll('{{RUN_DIR}}', runDir)
      .replaceAll('{{HTTPS_PORT}}', String(c.httpsPort))
      .replaceAll('{{API_PORT}}', String(c.apiPort))
      .replaceAll('{{WEB_PORT}}', String(c.webPort))
      .replaceAll('{{ADMIN_PORT}}', String(c.adminPort))
    const caddyfile = path.join(runDir, 'run/Caddyfile')
    writePrivate(caddyfile, replaced)
    await start('https', path.join(tools, 'caddy/caddy'), [
      'run',
      '--config',
      caddyfile,
      '--adapter',
      'caddyfile',
    ])
  } catch (error) {
    console.error(error.message)
    await shutdown(true)
  }
}

export async function up({ signal: abortSignal } = {}) {
  abortSignal?.throwIfAborted()
  const c = config()
  const runId = acquireLock('up')
  let supervisor
  try {
    if (state()) throw new Error('存在未清理的旧运行状态，请先执行 dev:down')
    for (const port of [c.apiPort, c.webPort, c.adminPort, c.httpsPort]) {
      abortSignal?.throwIfAborted()
      await available(port)
    }
    abortSignal?.throwIfAborted()
    const logPath = path.join(runDir, 'logs/supervisor.log')
    assertNoLinks(logPath)
    const log = fs.openSync(logPath, 'a', 0o600)
    const child = spawn(path.join(tools, 'node/bin/node'), [self, 'serve', runId], {
      cwd: root,
      env: { ...toolEnv, SITE_RUN_DIR: runDir },
      detached: true,
      stdio: ['ignore', log, log],
    })
    fs.closeSync(log)
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    supervisor = { pid: child.pid, identity: identity(child.pid) }
    if (!supervisor.identity) {
      signal(child.pid, 'SIGTERM')
      throw new Error('无法辨认监督进程')
    }
    child.unref()
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      // 测试信号中断要走下方已有的 run_id 清理，不能遗留 detached 监督进程。
      abortSignal?.throwIfAborted()
      if (!alive(supervisor)) throw new Error('服务提前退出，请查看本地日志')
      if (state()?.runId && state().runId !== runId)
        throw new Error('运行状态已变化，停止当前启动检查')
      try {
        const responses = await Promise.all([
          request('/api/v1/public/site', { signal: abortSignal, timeout: 5000 }),
          request('/', { signal: abortSignal, timeout: 5000 }),
          request('/admin/login', { signal: abortSignal, timeout: 5000 }),
        ])
        abortSignal?.throwIfAborted()
        if (responses.every((res) => res.status === 200) && alive(supervisor)) {
          console.log(
            `Local: ${c.origin}；管理端：${c.origin}/admin/；日志：${path.join(runDir, 'logs')}`,
          )
          return
        }
      } catch {
        abortSignal?.throwIfAborted()
        /* 首次编译期间等待有期限的就绪检查，不把进程启动等同就绪。 */
      }
      await delay(500)
    }
    throw new Error('服务未在 120 秒内就绪，请查看本地日志')
  } catch (error) {
    const current = state()
    if (current?.runId === runId) await stopRun(current)
    else if (supervisor && alive(supervisor)) signal(supervisor.pid, 'SIGTERM')
    releaseLock(runId)
    throw error
  }
}

async function stopRun(current) {
  if (lockOwner()?.runId !== current.runId)
    throw new Error('运行锁与进程记录不一致，拒绝清理其他运行')
  if (alive(current.supervisor)) signal(current.supervisor.pid, 'SIGTERM')
  await delay(1600)
  await stopGroups(current.children)
  if (alive(current.supervisor)) signal(current.supervisor.pid, 'SIGKILL')
  // 不删除后来新启动的记录；只有相同 run_id 才有权清理状态和锁。
  removeRun(current.runId)
}

export async function down() {
  config()
  requireProcessInspection()
  const current = state()
  const owner = lockOwner()
  if (current) await stopRun(current)
  else if (owner) {
    if (alive(owner.owner)) throw new Error('准备或启动仍在进行，请待当前命令结束后重试')
    releaseLock(owner.runId)
  }
  console.log('已停止本次运行的服务，数据保留。')
}

async function main(command) {
  if (command === 'prepare') prepare()
  else if (command === 'up') await up()
  else if (command === 'down') await down()
  else if (command === 'serve') await serve(process.argv[3])
  else if (command === 'service') guardian(process.argv[3], process.argv[4], process.argv[5])
  else if (command === 'status') {
    const c = config()
    const current = state()
    console.log(
      JSON.stringify(
        {
          origin: c.origin,
          running: alive(current?.supervisor),
          services:
            current?.children.map((p) => ({ name: p.name, pid: p.pid, running: alive(p) })) || [],
          logs: path.join(runDir, 'logs'),
        },
        null,
        2,
      ),
    )
  } else if (command === 'doctor') {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/toolchain.json'), 'utf8'))
    for (const [name, executable, args] of [
      ['node', 'node/bin/node', ['--version']],
      ['go', 'go/bin/go', ['version']],
      ['pnpm', 'bin/pnpm', ['--version']],
      ['caddy', 'caddy/caddy', ['version']],
    ]) {
      const version = execute(path.join(tools, executable), args)
      if (!version.includes(manifest[name])) throw new Error(`${name} 版本与 toolchain.json 不一致`)
      console.log(version)
    }
    console.log(execute('openssl', ['version']))
    console.log(execute('git', ['--version']))
    console.log('工具链检查通过；证书和端口将在 prepare/up 时验证。')
  } else throw new Error('未知服务命令')
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
