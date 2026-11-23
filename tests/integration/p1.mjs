import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { environment } from '../../scripts/test/environment.mjs'

const s = await environment('integration')
let checks = 0
const checked = (name) => {
  checks++
  console.log(`通过：${name}`)
}
const json = (r) => JSON.parse(r.text)
const cookie = (r) => r.headers['set-cookie'][0].split(';')[0]
const send = (method, pathname, body, extra = {}) =>
  s.request(pathname, {
    method,
    headers: { Origin: s.c.origin, 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const sessionPath = '/api/v1/admin/session'

try {
  const site = await s.request('/api/v1/public/site')
  assert.equal(site.status, 200)
  assert.deepEqual(Object.keys(json(site)).sort(), ['description', 'timezone', 'title'])
  assert.equal(site.headers['cache-control'], 'no-store')
  assert.ok(site.headers['x-request-id'])
  assert.equal((await s.request('/healthz')).status, 404)
  assert.equal((await s.request('/readyz')).status, 404)
  checked('真实 SQLite 公开站点配置、no-store、追踪及内部探针隔离')

  const page = await s.request('/')
  assert.equal(page.status, 200)
  assert.ok(page.text.includes(json(site).title))
  assert.equal((await s.request('/admin/session')).status, 200)
  assert.equal((await s.request('/api/v1/admin/session')).status, 401)
  assert.equal((await s.request('/api/v1/admin/not-implemented')).status, 401)
  checked('Nuxt SSR、管理深链接和未登录管理权限')

  assert.equal(
    (await send('POST', sessionPath, s.credentials, { Origin: 'https://evil.invalid' })).status,
    403,
  )
  assert.equal((await send('POST', sessionPath, { ...s.credentials, admin: true })).status, 400)
  const trailing = await s.request(sessionPath, {
    method: 'POST',
    headers: { Origin: s.c.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(s.credentials) + '{}',
  })
  assert.equal(trailing.status, 400)
  checked('错误来源、未知字段和尾随 JSON 被拒绝')

  const login = await send('POST', sessionPath, s.credentials)
  assert.equal(login.status, 200)
  const session = json(login)
  const currentCookie = cookie(login)
  const setCookie = login.headers['set-cookie'][0]
  for (const attribute of ['__Host-site_session=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'])
    assert.ok(setCookie.includes(attribute))
  assert.ok(!/domain=/i.test(setCookie))
  assert.deepEqual(Object.keys(session).sort(), ['csrf_token', 'expires_at', 'user'])
  assert.equal(session.user.username, s.credentials.username)
  assert.equal(
    json(await s.request(sessionPath, { headers: { Cookie: currentCookie } })).csrf_token,
    session.csrf_token,
  )
  assert.equal(
    json(await s.request(sessionPath, { headers: { Cookie: currentCookie } })).csrf_token,
    session.csrf_token,
  )
  checked('HTTPS 登录、Cookie 属性与多标签稳定 CSRF')

  const loggedInPublic = await s.request('/', { headers: { Cookie: currentCookie } })
  assert.ok(!loggedInPublic.text.includes(session.csrf_token))
  assert.ok(!loggedInPublic.text.includes(session.user.id))
  assert.ok(!loggedInPublic.text.includes('__Host-site_session'))
  checked('站主访问公开 SSR 不泄漏会话信息')

  assert.equal(
    (await send('DELETE', sessionPath, undefined, { Cookie: currentCookie })).status,
    403,
  )
  assert.equal(
    (
      await send('DELETE', sessionPath, undefined, {
        Cookie: currentCookie,
        'X-CSRF-Token': 'wrong',
      })
    ).status,
    403,
  )
  const logout = await send('DELETE', sessionPath, undefined, {
    Cookie: currentCookie,
    'X-CSRF-Token': session.csrf_token,
  })
  assert.equal(logout.status, 204)
  assert.equal(logout.text, '')
  assert.equal((await s.request(sessionPath, { headers: { Cookie: currentCookie } })).status, 401)
  checked('CSRF 保护、退出与服务端会话失效')

  const first = await send('POST', sessionPath, s.credentials)
  const firstCookie = cookie(first)
  const second = await send('POST', sessionPath, s.credentials, { Cookie: firstCookie })
  assert.equal(second.status, 200)
  assert.notEqual(cookie(second), firstCookie)
  assert.equal((await s.request(sessionPath, { headers: { Cookie: firstCookie } })).status, 401)
  const third = await send('POST', sessionPath, s.credentials)
  s.execute(
    path.join(s.backendRoot, 'bin/site-admin'),
    ['reset-password', '--username', s.credentials.username],
    { env: s.serviceEnv(), input: s.credentials.password + '-changed\n' },
  )
  assert.equal((await s.request(sessionPath, { headers: { Cookie: cookie(second) } })).status, 401)
  assert.equal((await s.request(sessionPath, { headers: { Cookie: cookie(third) } })).status, 401)
  checked('重新登录轮换 token、CLI 改密清除全部会话')

  // 成功登录与格式错误不应耗尽失败限频桶；连续密码错误必须最终返回 429。
  const statuses = []
  let limited
  for (let i = 0; i < 6; i++) {
    const response = await send('POST', sessionPath, {
      username: 'missing-account',
      password: 'wrong-password',
    })
    statuses.push(response.status)
    if (response.status === 429) limited = response
  }
  assert.ok(statuses.includes(401))
  assert.equal(statuses.at(-1), 429)
  assert.ok(Number(limited.headers['retry-after']) > 0)
  checked('真实登录失败限频与 Retry-After')

  const diagnostic = JSON.parse(
    s.execute(path.join(s.backendRoot, 'bin/site-admin'), ['diagnose'], { env: s.serviceEnv() }),
  )
  assert.equal(diagnostic.foreign_keys, 1)
  assert.equal(diagnostic.journal_mode, 'wal')
  assert.equal(diagnostic.busy_timeout_ms, 5000)
  assert.equal(diagnostic.admin_initialized, true)
  for (const file of fs.readdirSync(path.join(s.runDir, 'logs'))) {
    const text = fs.readFileSync(path.join(s.runDir, 'logs', file), 'utf8')
    for (const secret of [s.credentials.password, session.csrf_token, currentCookie.split('=')[1]])
      assert.ok(!text.includes(secret), '日志不得包含凭据')
  }
  checked(`Go 实际 SQLite ${diagnostic.sqlite_version} 配置与日志脱敏`)
  fs.writeFileSync(
    path.join(s.runDir, 'result.json'),
    JSON.stringify(
      { status: 'passed', checks, sqlite: diagnostic.sqlite_version, origin: s.c.origin },
      null,
      2,
    ),
  )
  console.log(`HTTPS 联调 ${checks} 组通过，证据目录：${s.runDir}`)
} finally {
  await s.down()
}
