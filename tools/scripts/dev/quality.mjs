import fs from 'node:fs'
import path from 'node:path'
import { root, frontendRoot, backendRoot as backend, tools, toolEnv, execute } from './services.mjs'

const pnpm = path.join(tools, 'bin/pnpm')

function run(command, args, cwd = path.join(root, 'tools'), env = toolEnv) {
  execute(command, args, { cwd, env, stdio: 'inherit' })
}

function buildAPI() {
  run('sh', ['scripts/build.sh'], backend)
}

function frontend(command) {
  run(pnpm, ['--dir', frontendRoot, command], path.join(root, 'tools'), {
    ...toolEnv,
    SITE_CONTRACTS_DIR: path.join(root, 'contracts'),
  })
}

const command = process.argv[2]
if (command === 'build-api') buildAPI()
else if (command === 'build') {
  frontend('build:web')
  frontend('build:admin')
  buildAPI()
} else if (command === 'go-test') {
  run('sh', ['scripts/test.sh'], backend)
} else if (command === 'check') {
  // 生成检查只比较，不重写文件，确保提交的是合同对应的客户端类型。
  run(process.execPath, ['scripts/dev/workspace.mjs'])
  frontend('check')
  run(pnpm, ['lint'])
  run(pnpm, ['format:check'])
  run('sh', ['scripts/check.sh'], backend)
  const python = process.env.DESIGN_PYTHON || path.join(root, 'var/venv/bin/python')
  if (!fs.existsSync(python)) throw new Error('请先执行 ./dev install 创建设计检查环境')
  run(python, ['tools/scripts/validate_design.py'], root)
} else throw new Error('未知质量检查命令')
