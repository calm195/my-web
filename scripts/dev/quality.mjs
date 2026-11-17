import fs from 'node:fs'
import path from 'node:path'
import { root, tools, toolEnv, execute } from './services.mjs'

const pnpm = path.join(tools, 'bin/pnpm')
const go = path.join(tools, 'go/bin/go')
const backend = path.join(root, 'backend')

function run(command, args, cwd = root, env = toolEnv) {
  execute(command, args, { cwd, env, stdio: 'inherit' })
}

function buildAPI() {
  fs.mkdirSync(path.join(backend, 'bin'), { recursive: true })
  // 前后端独立构建，Go 不读取前端产物；SQL 由编译时嵌入供显式迁移使用。
  for (const target of ['api', 'site-admin']) {
    run(go, ['build', '-trimpath', '-o', `bin/${target}`, `./cmd/${target}`], backend, {
      ...toolEnv,
      CGO_ENABLED: '0',
    })
  }
}

const command = process.argv[2]
if (command === 'build-api') buildAPI()
else if (command === 'build') {
  run(pnpm, ['--filter', '@personal/web', 'build'])
  run(pnpm, ['--filter', '@personal/admin', 'build'])
  buildAPI()
} else if (command === 'go-test') {
  run(go, ['test', '-race', './...'], backend)
} else if (command === 'check') {
  // 生成检查只比较，不重写文件，确保提交的是合同对应的客户端类型。
  run(pnpm, ['--filter', '@personal/api-client', 'generate:check'])
  run(pnpm, ['lint'])
  run(pnpm, ['format:check'])
  run(pnpm, ['typecheck'])
  const formatting = execute(path.join(tools, 'go/bin/gofmt'), ['-l', '.'], { cwd: backend })
  if (formatting) throw new Error(`Go 格式不符合约定：\n${formatting}`)
  run(go, ['vet', './...'], backend)
  const python = process.env.DESIGN_PYTHON || path.join(root, 'var/venv/bin/python')
  if (!fs.existsSync(python)) throw new Error('请按 README 创建 var/venv 并安装设计验证依赖')
  run(python, ['scripts/validate_design.py'])
} else throw new Error('未知质量检查命令')
