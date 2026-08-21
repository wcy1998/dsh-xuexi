/**
 * 读取并打印 .dsh-home 里最近一次 headless 会话的持久化日志。
 * 用法（demo 目录内）：node read-session.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const home = join(process.cwd(), '.dsh-home')
let cwdDir, sessionDir
try {
  cwdDir = readdirSync(join(home, 'sessions')).at(-1)
  sessionDir = readdirSync(join(home, 'sessions', cwdDir)).at(-1)
} catch {
  console.log('未找到会话日志：请先运行一次 Demo 5/6/7 的 dsh headless 命令。')
  process.exit(0)
}

const file = join(home, 'sessions', cwdDir, sessionDir, 'session.jsonl.zstd')
const buf = readFileSync(file)

// session.jsonl.zstd 是多帧 zstd：按魔数 28 B5 2F FD 切帧、逐帧解压、拼回 JSONL
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const starts = []
for (let i = 0; i + 3 < buf.length; i++) {
  if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) starts.push(i)
}
let text = ''
for (let k = 0; k < starts.length; k++) {
  const end = k + 1 < starts.length ? starts[k + 1] : buf.length
  text += zstdDecompressSync(buf.subarray(starts[k], end)).toString()
}

const rows = text.trim().split(/\n/).filter(Boolean).map((s) => JSON.parse(s))
console.log(`会话日志：${file}`)
console.log(`共 ${rows.length} 条记录\n`)

// 只打印"结构事件"，跳过高频的 text-chunks 聚合行
const SKIP = new Set(['text-chunks'])
for (const e of rows) {
  if (e.type === 'session') {
    console.log(`# ${e.id}  cwd=${e.cwd}  createdAt=${new Date(e.createdAt).toISOString()}`)
    continue
  }
  if (SKIP.has(e.type)) continue
  const data = e.data
  let summary
  switch (e.type) {
    case 'user/message':
    case 'assistant/message': {
      const text = (data.content ?? data.message?.content ?? [])
        .filter((b) => b.type === 'text').map((b) => b.text).join(' ')
      summary = `「${text.slice(0, 60)}${text.length > 60 ? '…' : ''}」`
      break
    }
    case 'assistant/chunk': {
      const c = data.chunk
      summary = c.type === 'text-delta' ? `"${c.text}"` : c.type === 'usage'
        ? `usage ${JSON.stringify(c.usage)}` : c.type === 'finish' ? `finish ${c.reason.kind}`
          : `${c.type} #${c.index}`
      break
    }
    case 'tool/call': summary = `${data.name}(${data.arguments})`; break
    case 'tool/result': summary = JSON.stringify(data.message.content).slice(0, 80); break
    case 'turn/end': summary = JSON.stringify(data.reason); break
    case 'request/header': summary = JSON.stringify(data.header.config); break
    default: summary = JSON.stringify(data).slice(0, 90)
  }
  console.log(String(e.seq).padStart(5), e.type.padEnd(22), summary)
}
