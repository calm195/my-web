import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export async function environment(kind) {
  // 在导入服务模块前确定隔离目录，避免自动化修改开发者的 var/local 数据。
  process.env.SITE_RUN_DIR ||= path.join(root, `var/test/${kind}-${randomUUID()}`)
  const sockets = []
  try {
    for (const name of ['API', 'WEB', 'ADMIN', 'HTTPS']) {
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
  service.prepare()
  await service.up()
  const credentials = JSON.parse(
    fs.readFileSync(path.join(service.runDir, 'credentials.json'), 'utf8'),
  )
  return { ...service, credentials, c: service.config() }
}
