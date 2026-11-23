import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root, 'var/cache/playwright')
const { firefox, expect } = await import('@playwright/test')
// runE2E 只持有本套浏览器上下文；服务由入口复用，并正常验证本地 CA。
export async function runE2E(s, signal = s.signal) {
  signal?.throwIfAborted()
  let context
  let closing
  const close = () => {
    if (!context) return Promise.resolve()
    closing ||= context.close()
    return closing
  }
  // 关闭浏览器上下文会终止页面等待；不能靠进程默认退出跳过服务清理。
  const onAbort = () => {
    void close().catch(() => {})
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  let checks = 0
  const passed = (name) => {
    signal?.throwIfAborted()
    checks++
    console.log(`通过：${name}`)
  }

  try {
    const profile = path.join(s.runDir, 'firefox-profile')
    fs.mkdirSync(profile)
    const appData = path.join(s.runDir, 'firefox-app-data')
    const localData = path.join(s.runDir, 'firefox-local-data')
    fs.mkdirSync(appData)
    fs.mkdirSync(localData)
    // 只在临时 Firefox profile 的 NSS 库信任测试 CA，系统钥匙串不做任何更改。
    s.execute('certutil', ['-N', '-d', `sql:${profile}`, '--empty-password'])
    s.execute('certutil', [
      '-A',
      '-d',
      `sql:${profile}`,
      '-n',
      'personal-website-local-ca',
      '-t',
      'C,,',
      '-i',
      path.join(s.runDir, 'certs/ca.pem'),
    ])
    context = await firefox.launchPersistentContext(profile, {
      headless: true,
      // 由 managedTest 先关闭 context 再停自有服务，禁止 Playwright 抢先 process.exit。
      handleSIGINT: false,
      handleSIGTERM: false,
      viewport: { width: 1440, height: 1000 },
      ignoreHTTPSErrors: false,
      firefoxUserPrefs: { 'security.enterprise_roots.enabled': false },
      // 同时隔离 Firefox 应用数据与 profile，不访问本机已有的浏览器数据目录。
      env: { ...process.env, MOZ_APP_DATA: appData, MOZ_LOCAL_APP_DATA: localData },
    })
    signal?.throwIfAborted()
    const page = await context.newPage()
    const errors = []
    context.on('page', (p) => p.on('pageerror', (error) => errors.push(error.message)))
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(s.c.origin)
    assert.equal(response.status(), 200)
    await expect(page.getByRole('navigation').first()).toBeVisible()
    assert.ok((await page.locator('body').innerText()).includes('一隅'))
    await page.screenshot({ path: path.join(s.runDir, 'home-desktop.png'), fullPage: true })
    passed('受信 HTTPS 下 Nuxt 公开首页与客户端激活')

    await page.goto(`${s.c.origin}/admin/session`)
    await expect(page.getByRole('heading', { name: '站主登录' })).toBeVisible()
    await page.screenshot({ path: path.join(s.runDir, 'login-desktop.png'), fullPage: true })
    await page.getByLabel('用户名', { exact: true }).fill(s.credentials.username)
    await page.getByLabel('密码', { exact: true }).fill('incorrect-password')
    await page.getByRole('button', { name: /^登录/ }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByLabel('用户名', { exact: true })).toHaveValue(s.credentials.username)
    await expect(page.getByLabel('密码', { exact: true })).toHaveValue('incorrect-password')
    passed('受保护深链接跳转登录、凭据错误保留输入')

    await page.getByLabel('密码', { exact: true }).fill(s.credentials.password)
    await page.getByRole('button', { name: /^登录/ }).click()
    await expect(page.getByRole('heading', { name: '登录状态', exact: true })).toBeVisible()
    const cookies = await context.cookies()
    const session = cookies.find((c) => c.name === '__Host-site_session')
    assert.ok(session)
    assert.equal(session.httpOnly, true)
    assert.equal(session.secure, true)
    assert.equal(session.sameSite, 'Lax')
    assert.equal(session.path, '/')
    assert.ok(!(await page.evaluate(() => document.cookie)).includes('__Host-site_session'))
    assert.equal(await page.evaluate(() => localStorage.length), 0)
    passed('真实浏览器登录、Secure/HttpOnly Cookie 与内存会话')

    const tab = await context.newPage()
    await tab.goto(`${s.c.origin}/admin/session`)
    await expect(tab.getByRole('heading', { name: '登录状态', exact: true })).toBeVisible()
    await tab.getByRole('button', { name: '检查登录状态' }).click()
    await expect(tab.getByText('登录状态已确认。')).toBeVisible()
    await page.getByRole('button', { name: '退出登录' }).click()
    await expect(page.getByRole('heading', { name: '站主登录' })).toBeVisible()
    await expect(tab.getByRole('heading', { name: '站主登录' })).toBeVisible()
    passed('多标签有效会话与退出广播同步')

    await page.getByLabel('用户名', { exact: true }).fill(s.credentials.username)
    await page.getByLabel('密码', { exact: true }).fill(s.credentials.password)
    await page.getByRole('button', { name: /^登录/ }).click()
    await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible()
    await page.goto(`${s.c.origin}/admin/session`)
    s.execute(
      path.join(s.backendRoot, 'bin/site-admin'),
      ['reset-password', '--username', s.credentials.username],
      { env: s.serviceEnv(), input: s.credentials.password + '-changed\n' },
    )
    await page.getByRole('button', { name: '检查登录状态' }).click()
    await expect(page.getByRole('heading', { name: '站主登录' })).toBeVisible()
    passed('CLI 改密后真实页面重新检查并失效')

    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const pathname of ['/', '/admin/login']) {
        await page.goto(s.c.origin + pathname)
        const dimensions = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }))
        assert.ok(dimensions.scroll <= dimensions.viewport, `${pathname} ${width}px 出现横向溢出`)
      }
    }
    await page.setViewportSize({ width: 360, height: 900 })
    await page.goto(s.c.origin)
    await page.screenshot({ path: path.join(s.runDir, 'home-mobile.png'), fullPage: true })
    await page.goto(`${s.c.origin}/admin/login`)
    await page.keyboard.press('Tab')
    assert.ok(await page.evaluate(() => document.activeElement !== document.body))
    passed('360/768/1440 响应式与键盘焦点')

    assert.deepEqual(errors, [])
    const result = {
      status: 'passed',
      checks,
      browser: context.browser()?.version() || 'Firefox',
      tlsVerification: true,
      systemTrustChanged: false,
      origin: s.c.origin,
    }
    fs.writeFileSync(path.join(s.runDir, 'e2e-result.json'), JSON.stringify(result, null, 2))
    console.log(`浏览器联调 ${checks} 组通过，证据目录：${s.runDir}`)
    return result
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await close()
  }
}
