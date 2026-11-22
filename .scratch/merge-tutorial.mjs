// 一次性合并脚本：把三份阶段片段插进骨架，删占位，补样式与复制逻辑。
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'E:/workspace/GitRepository/dsh-claude-delegate'
const IDX = `${ROOT}/docs/learn-dsh-plugin/index.html`
const SEG = `${ROOT}/.scratch/write-dsh-tutorial/segments`

let html = readFileSync(IDX, 'utf8')
const before = html.length

// ---------- 1. 读片段，按 stage 切 ----------
function loadSeg(file) {
  const text = readFileSync(`${SEG}/${file}`, 'utf8')
  const parts = text.split(/<!--\s*=====\s*stage\s+(\d+)\s*=====\s*-->/)
  const map = {}
  for (let i = 1; i < parts.length; i += 2) map[parts[i]] = parts[i + 1].trim()
  return map
}

const stageMap = {
  ...loadSeg('stage-0-2.html'),
  ...loadSeg('stage-3-5.html'),
  ...loadSeg('stage-6-7.html'),
}
if (Object.keys(stageMap).length !== 8) {
  throw new Error(`expected 8 stage segments, got ${Object.keys(stageMap).join(',')}`)
}

// ---------- 2. 每个 section：删占位 ex-group，换 stage-body ----------
let replacedBodies = 0
let removedGroups = 0
const chunks = html.split(/(?=<section id="stage-\d+")/)
html = chunks.map((chunk) => {
  const m = chunk.match(/^<section id="stage-(\d+)"/)
  if (!m) return chunk
  const n = m[1]
  let c = chunk

  // 占位练习组：6 空格缩进的整块
  const groupRe = /\n      <div class="ex-group">\n[\s\S]*?\n      <\/div>\n/
  if (groupRe.test(c)) {
    c = c.replace(groupRe, '\n')
    removedGroups++
  }

  const body = stageMap[n]
  if (body) {
    const bodyRe = /<div class="stage-body" data-insert="[^"]*"><\/div>/
    if (bodyRe.test(c)) {
      c = c.replace(bodyRe, `<div class="stage-body">\n${body}\n      </div>`)
      replacedBodies++
    }
  }
  return c
}).join('')

// ---------- 3. 删掉 hero 里的骨架提示 ----------
html = html.replace(/\n\s*<p class="hero-note">骨架版本[^<]*<\/p>/, '')

// ---------- 4. 补正文样式 ----------
const EXTRA_CSS = `
/* ===== 正文内容块（合并自 prototype） ===== */
.block{margin:18px 0}
.block h4{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.block > p{margin:0 0 .9em}
.block ul{margin:.2em 0 .9em;padding-left:1.3em}
.block li{margin:.15em 0}
.block code{background:var(--code-bg);padding:1px 5px;border-radius:5px;font-size:.92em}

/* 代码块 */
.code{background:var(--code-bg);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin:10px 0}
.code-head{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}
.code-head .fname{font-family:"Cascadia Code",Consolas,"JetBrains Mono",monospace}
.code-head .spacer{flex:1}
.code-head button{font-size:12px;color:var(--muted);border:1px solid transparent;border-radius:6px;padding:2px 7px;cursor:pointer;background:none;font:inherit}
.code-head button:hover{border-color:var(--line);color:var(--fg)}
.code pre{margin:0;padding:10px 0;overflow:auto;font-size:12.5px;line-height:1.55;font-family:"Cascadia Code",Consolas,"JetBrains Mono",monospace}
.code .ln{display:block;white-space:pre}
.code .ln i{display:inline-block;width:3.2em;text-align:right;padding-right:1em;color:color-mix(in srgb,var(--muted) 70%,transparent);font-style:normal;user-select:none}

/* 练习卡内的提示 / 参考 / 验收 */
.ex details{margin:8px 0 0 26px}
.ex summary{cursor:pointer;color:var(--accent);font-size:13px}
.ex .refs{font-size:12.5px;color:var(--muted);margin:6px 0 0 26px}
.ex .refs code{background:var(--code-bg);padding:1px 5px;border-radius:5px}
.ex .accept{margin:8px 0 0 26px;font-size:13px;color:var(--muted)}

/* 自测 */
.quiz{border-left:3px solid var(--accent);padding:2px 0 2px 14px;margin:12px 0}
.quiz details{margin-top:4px}
.quiz summary{cursor:pointer;font-size:13px;color:var(--accent)}

/* 毕业项目卡 */
.capstone-card{border:1px solid var(--line);border-radius:var(--radius);background:var(--card);padding:14px 16px;margin:12px 0;transition:border-color .2s,opacity .2s}
.capstone-card h4{font-size:15px;letter-spacing:0;text-transform:none;color:var(--fg);margin:0 0 8px}
.cap-body{margin-top:6px}
`
if (!html.includes('/* ===== 正文内容块')) {
  html = html.replace('</style>', `${EXTRA_CSS}</style>`)
}

// ---------- 5. 补复制逻辑 ----------
const COPY_FN = `function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () {});
    return;
  }
  var ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  ta.remove();
}

`
if (!html.includes('function copyText')) {
  html = html.replace('/* ================= 进度 ================= */', COPY_FN + '/* ================= 进度 ================= */')
}

if (!html.includes('closest("[data-copy]")')) {
  html = html.replace(
    `document.addEventListener("click", function (event) {
  var pathButton`,
    `document.addEventListener("click", function (event) {
  var copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    copyText(copyButton.getAttribute("data-copy"));
    var oldLabel = copyButton.textContent;
    copyButton.textContent = "已复制";
    setTimeout(function () { copyButton.textContent = oldLabel; }, 1200);
    return;
  }

  var pathButton`
  )
}

// ---------- 6. 写出 ----------
writeFileSync(IDX, html, 'utf8')

console.log(JSON.stringify({
  before, after: html.length,
  replacedBodies, removedGroups,
  hasCopy: html.includes('function copyText'),
  hasCss: html.includes('/* ===== 正文内容块'),
  stages: Object.keys(stageMap).sort(),
}, null, 2))
