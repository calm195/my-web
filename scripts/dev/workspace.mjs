import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function git(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Git 工作区检查失败：${result.stderr}`)
  return result.stdout.trim()
}

// 合同和文档只保留在根仓库；类型生成与设计校验必须在同一套工作区执行。
for (const file of [
  'contracts/openapi.yaml',
  'contracts/schema-examples.json',
  'docs/design/api-design.md',
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`缺少根仓库文件：${file}`)
}
for (const name of ['backend', 'frontend']) {
  const directory = path.join(root, name)
  const entry = git(['ls-files', '--stage', '--', name]).split(/\s+/)
  if (entry[0] !== '160000') throw new Error(`${name} 未注册为 Git 子模块`)
  if (!fs.existsSync(path.join(directory, '.git')))
    throw new Error(`请先初始化子模块：git submodule update --init --recursive`)
  if (
    fs.realpathSync(git(['rev-parse', '--show-toplevel'], directory)) !== fs.realpathSync(directory)
  )
    throw new Error(`${name} 不是独立 Git 仓库`)
  const head = git(['rev-parse', 'HEAD'], directory)
  const dirty = git(['status', '--porcelain'], directory)
  // 日常开发允许工作中修改；锁定验收额外要求子仓库干净且与根索引记录一致。
  if (process.argv.includes('--locked') && (head !== entry[1] || dirty))
    throw new Error(`${name} 有未提交修改或子模块指针未更新`)
  if (
    fs.existsSync(path.join(directory, 'contracts')) ||
    fs.existsSync(path.join(directory, 'docs'))
  )
    throw new Error(`${name} 不应维护合同或文档副本`)
  console.log(`${name}: ${head.slice(0, 12)}${dirty ? '（有开发中修改）' : ''}`)
}
console.log('子模块与根合同目录检查通过。')
