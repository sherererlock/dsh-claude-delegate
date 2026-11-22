// 给缺少复制按钮的代码块补 data-copy
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'

const P = 'E:/workspace/GitRepository/dsh-claude-delegate/docs/learn-dsh-plugin/index.html'
copyFileSync(P, P + '.bak-copy')

let html = readFileSync(P, 'utf8')
const parts = html.split('<div class="code">')
let fixed = 0

for (let i = 1; i < parts.length; i++) {
  const seg = parts[i]
  if (seg.includes('data-copy')) continue
  const m = seg.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)
  if (!m) continue

  let text = m[1]
    .replace(/<span class="ln"><i aria-hidden="true">\d+<\/i>/g, '')
    .replace(/<\/span>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n+$/, '')

  const attr = text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;')

  parts[i] = seg.replace(
    /(<span class="fname">[^<]*<\/span>)<\/div>/,
    (m, g1) =>
      g1 + '<span class="spacer"></span><button type="button" data-copy="' + attr + '">复制</button></div>'
  )
  fixed++
  console.log('fixed block', i, 'chars=', text.length, 'head=', (seg.match(/fname">([^<]*)/) || [])[1])
}

writeFileSync(P, parts.join('<div class="code">'), 'utf8')
console.log('fixed total:', fixed)
