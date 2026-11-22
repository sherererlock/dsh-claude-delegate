import { readFileSync, writeFileSync } from 'node:fs'

const P = 'E:/workspace/GitRepository/dsh-claude-delegate/docs/learn-dsh-plugin/index.html'
const lines = readFileSync(P, 'utf8').split('\n')

const d15 = '              <tr><td>D15</td><td>没有「错误文案映射」或「委派模型降档」的约定；错误分支要依赖结构化字段，文案只给人看。</td><td><code>ERROR_HINTS</code> / <code>describeFailure()</code> 做中文错误映射；<code>delegate-model.ts</code> 做模型降档与 effort 透传。</td><td>人读文案可以学，但不要让代码正则匹配文案做分支；模型降档是产品策略，读主模型要走 <code>agent.model.current()</code>。</td><td>阶段 7 · <a href="#stage-7">毕业前检查</a></td></tr>'
const note = '        <p class="bp-note">另补一条不在 15 条里的配置陷阱：patch 按 id 定位行并替换整个 <code>config</code>，不是深合并；覆盖时要把每个键写全，schema 默认值只补没写的键。<code>cordis.patch.yml:10-17</code> 只写了 4 个键，其余靠默认。</p>'

if (!lines[1625].includes('<td>附</td>')) {
  throw new Error('line 1626 is not the 附 row: ' + lines[1625].slice(0, 60))
}
lines[1625] = d15
lines[1629] = note

writeFileSync(P, lines.join('\n'), 'utf8')
console.log('replaced 附 row with D15 and updated note')
