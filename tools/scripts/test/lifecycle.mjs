import fs from 'node:fs'
import path from 'node:path'
import { environment } from './environment.mjs'

// managedTest 在创建环境前接管终止信号，统一取消浏览器/HTTP，并只清理本轮服务。
export async function managedTest(kind, run) {
  const controller = new AbortController()
  let interrupted
  const interrupt = (name) => {
    if (interrupted) return
    interrupted = name
    controller.abort(new Error(`验收收到 ${name}`))
  }
  const onINT = () => interrupt('SIGINT')
  const onTERM = () => interrupt('SIGTERM')
  process.on('SIGINT', onINT)
  process.on('SIGTERM', onTERM)
  let prepared
  let s
  let result = {}
  let failure
  let stopped = false
  const report = (progress) => {
    result = { ...result, ...progress }
  }
  try {
    s = await environment(kind, {
      signal: controller.signal,
      onPrepared: (context) => {
        prepared = context
      },
    })
    report(await run(s, controller.signal, report))
    controller.signal.throwIfAborted()
  } catch (error) {
    failure = error
  } finally {
    try {
      if (s) {
        await s.down()
        stopped = true
      } else if (prepared) {
        // up/环境创建失败已经清理自有进程；只检查结果，不接管后来可能出现的其他 run。
        stopped =
          !fs.existsSync(path.join(prepared.runDir, 'run/processes.json')) &&
          !fs.existsSync(path.join(prepared.runDir, 'run/services.lock'))
      }
    } catch (error) {
      failure ||= error
    } finally {
      if (prepared) {
        fs.writeFileSync(
          path.join(prepared.runDir, 'result.json'),
          JSON.stringify(
            {
              ...result,
              status: !failure && !interrupted && stopped ? 'passed' : 'failed',
              origin: prepared.c.origin,
              servicesStopped: stopped,
              interrupted,
            },
            null,
            2,
          ),
        )
      }
      // 清理期间继续吞接第二个终止信号，待子进程已收拢后才恢复默认行为。
      process.off('SIGINT', onINT)
      process.off('SIGTERM', onTERM)
    }
  }
  if (interrupted) {
    process.exitCode = interrupted === 'SIGINT' ? 130 : 143
    console.error(
      `验收被 ${interrupted} 中断；${stopped ? '自有服务已停止' : '请检查运行目录中的清理证据'}`,
    )
    return
  }
  if (failure) throw failure
  if (!stopped) throw new Error('验收服务尚未确认停止')
  return result
}
