import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export async function environment(kind, { signal, onPrepared } = {}) {
  signal?.throwIfAborted()
  // 在导入服务模块前确定隔离目录，避免自动化修改开发者的 var/local 数据。
  const testRoot = path.join(root, 'var/test')
  const selected = path.resolve(
    process.env.SITE_RUN_DIR || path.join(testRoot, `${kind}-${randomUUID()}`),
  )
  const relative = path.relative(testRoot, selected)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('自动验收只允许使用 var/test 内独立运行目录，不能复用 var/local')
  if (fs.existsSync(selected))
    throw new Error('自动验收运行目录必须尚不存在，避免接管已有目录或复用旧账号、证书和浏览器状态')
  process.env.SITE_RUN_DIR = selected
  const sockets = []
  try {
    for (const name of ['API', 'WEB', 'ADMIN', 'HTTPS']) {
      signal?.throwIfAborted()
      if (process.env[`SITE_${name}_PORT`]) continue
      const socket = net.createServer()
      await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.listen(0, '127.0.0.1', resolve)
      })
      sockets.push(socket)
      process.env[`SITE_${name}_PORT`] = String(socket.address().port)
    }
  } finally {
    // 先保留四个不同空闲端口，再统一释放供服务启动；不抢占其他项目端口。
    await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.close(resolve))))
  }
  const service = await import('../dev/services.mjs')
  let prepared = false
  try {
    signal?.throwIfAborted()
    service.prepare()
    prepared = true
    const preparedContext = { ...service, c: service.config() }
    onPrepared?.(preparedContext)
    await service.up({ signal })
    signal?.throwIfAborted()
    const credentials = JSON.parse(
      fs.readFileSync(path.join(service.runDir, 'credentials.json'), 'utf8'),
    )
    return {
      ...service,
      credentials,
      c: service.config(),
      signal,
      // 测试 HTTP 使用原生请求取消；信号到达时立即释放正在等待的 TLS 请求。
      request: (urlPath, options = {}) =>
        service.request(urlPath, { ...options, signal, timeout: 5000 }),
    }
  } catch (error) {
    // up 自身会清理失败启动；凭据读取等就绪后异常也必须停止本轮服务，不能遗留后台进程。
    // prepare 未完成时不接管或清理目录，避免把拒绝初始化的其他运行当成自己的环境。
    if (prepared) {
      try {
        await service.down()
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], '测试环境创建失败，且自有服务清理失败', {
          cause: cleanupError,
        })
      }
    }
    throw error
  }
}
