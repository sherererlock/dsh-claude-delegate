const BASE = "http://127.0.0.1:9223";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + JSON.stringify(detail) : ""));
}

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + "/json");
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.url.includes("index.html"));
      if (page) return page;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error("no page target");
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJS(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const state = await evalJS("document.readyState");
      if (state === "complete") {
        await sleep(250);
        return;
      }
    } catch (e) {}
    await sleep(100);
  }
  throw new Error("page not ready");
}

await waitReady();
await evalJS(`try { localStorage.clear(); } catch (e) {}`);
await send("Page.reload", { ignoreCache: true });
await waitReady();

const initial = await evalJS(`({
  checks: document.querySelectorAll('[data-check]').length,
  stages: document.querySelectorAll('section[data-stage]').length,
  progress: document.querySelector('[data-progress-text]').textContent,
  pct: document.querySelector('[data-progress-pct]').textContent,
  theme: document.documentElement.dataset.theme,
  path: document.documentElement.dataset.path,
  shortPressed: document.querySelector('[data-path-choice="short"]').getAttribute('aria-pressed'),
  fullPressed: document.querySelector('[data-path-choice="full"]').getAttribute('aria-pressed'),
  tocLinks: document.querySelectorAll('.toc a[href^="#stage-"]').length,
  insertPoints: document.querySelectorAll('.stage-body[data-insert]').length
})`);
check("初始结构：8 阶段 / 24 练习 / 8 目录项 / 8 插入点", initial.stages === 8 && initial.checks === 24 && initial.tocLinks === 8 && initial.insertPoints === 8, initial);
check("初始总进度 0/24 · 0%", initial.progress === "0/24" && initial.pct === "0%", initial);
check("默认完整路径", initial.path === "full" && initial.fullPressed === "true" && initial.shortPressed === "false", initial);

// ---- 路径切换 ----
await evalJS(`document.querySelector('[data-path-choice="short"]').click()`);
const shortState = await evalJS(`({
  path: document.documentElement.dataset.path,
  stored: localStorage.getItem('dsh-learn:path'),
  shortPressed: document.querySelector('[data-path-choice="short"]').getAttribute('aria-pressed'),
  fullPressed: document.querySelector('[data-path-choice="full"]').getAttribute('aria-pressed'),
  notice: getComputedStyle(document.querySelector('#stage-4 .path-notice')).display,
  group: getComputedStyle(document.querySelector('#stage-4 .ex-group')).display,
  stageBody: getComputedStyle(document.querySelector('#stage-4 .stage-body')).display,
  stage3Group: getComputedStyle(document.querySelector('#stage-3 .ex-group')).display
})`);
check("最短路径：状态与 localStorage 生效", shortState.path === "short" && shortState.stored === "short" && shortState.shortPressed === "true" && shortState.fullPressed === "false", shortState);
check("最短路径：阶段 4 折叠、阶段 3 不受影响", shortState.notice === "flex" && shortState.group === "none" && shortState.stageBody === "none" && shortState.stage3Group === "block", shortState);

await evalJS(`document.querySelector('#stage-4 [data-expand]').click()`);
const expanded = await evalJS(`({
  attr: document.querySelector('#stage-4').getAttribute('data-expanded'),
  notice: getComputedStyle(document.querySelector('#stage-4 .path-notice')).display,
  group: getComputedStyle(document.querySelector('#stage-4 .ex-group')).display
})`);
check("仍然展开：阶段 4 内容可见、提示隐藏", expanded.attr === "1" && expanded.notice === "none" && expanded.group === "block", expanded);

// ---- 主题切换 ----
const themeBefore = await evalJS(`document.documentElement.dataset.theme`);
await evalJS(`document.querySelector('[data-theme-toggle]').click()`);
const themeState = await evalJS(`({
  theme: document.documentElement.dataset.theme,
  stored: localStorage.getItem('dsh-learn:theme'),
  label: document.querySelector('[data-theme-toggle]').textContent
})`);
check("深浅色切换：状态、localStorage、按钮文案", themeState.theme !== themeBefore && themeState.stored === themeState.theme && (themeState.theme === "dark" ? themeState.label === "浅色" : themeState.label === "深色"), themeState);

// ---- 勾选与进度 ----
await evalJS(`document.querySelector('[data-check="0.1"]').click()`);
const checked = await evalJS(`({
  checked: document.querySelector('[data-check="0.1"]').checked,
  stored: localStorage.getItem('dsh-learn:exercise-0.1'),
  progress: document.querySelector('[data-progress-text]').textContent,
  pct: document.querySelector('[data-progress-pct]').textContent,
  bar: document.querySelector('[data-progress-bar]').style.width,
  stage0: document.querySelector('#stage-0 [data-stage-count]').textContent
})`);
check("勾选 0.1：写入 done，进度 1/24 · 4%，阶段计数 1/3", checked.checked === true && checked.stored === "done" && checked.progress === "1/24" && checked.pct === "4%" && checked.bar === "4%" && checked.stage0.indexOf("1 / 3") === 0, checked);

await evalJS(`document.querySelector('[data-check="0.1"]').click()`);
const unchecked = await evalJS(`({
  checked: document.querySelector('[data-check="0.1"]').checked,
  stored: localStorage.getItem('dsh-learn:exercise-0.1'),
  progress: document.querySelector('[data-progress-text]').textContent,
  pct: document.querySelector('[data-progress-pct]').textContent
})`);
check("取消勾选：写入空值，进度回到 0/24", unchecked.checked === false && unchecked.stored === "" && unchecked.progress === "0/24" && unchecked.pct === "0%", unchecked);

// 重新勾选，供刷新后的持久化验证
await evalJS(`document.querySelector('[data-check="0.1"]').click(); document.querySelector('[data-check="1.2"]').click()`);
const beforeReload = await evalJS(`({
  progress: document.querySelector('[data-progress-text]').textContent,
  pct: document.querySelector('[data-progress-pct]').textContent
})`);
check("多练习勾选：进度 2/24 · 8%", beforeReload.progress === "2/24" && beforeReload.pct === "8%", beforeReload);

// ---- 刷新持久化 ----
await send("Page.reload", { ignoreCache: true });
await waitReady();
const afterReload = await evalJS(`({
  theme: document.documentElement.dataset.theme,
  storedTheme: localStorage.getItem('dsh-learn:theme'),
  path: document.documentElement.dataset.path,
  storedPath: localStorage.getItem('dsh-learn:path'),
  shortPressed: document.querySelector('[data-path-choice="short"]').getAttribute('aria-pressed'),
  checked01: document.querySelector('[data-check="0.1"]').checked,
  checked12: document.querySelector('[data-check="1.2"]').checked,
  checked02: document.querySelector('[data-check="0.2"]').checked,
  progress: document.querySelector('[data-progress-text]').textContent,
  pct: document.querySelector('[data-progress-pct]').textContent,
  stage0: document.querySelector('#stage-0 [data-stage-count]').textContent,
  stage1: document.querySelector('#stage-1 [data-stage-count]').textContent,
  stage4Group: getComputedStyle(document.querySelector('#stage-4 .ex-group')).display,
  expandedCleared: document.querySelector('#stage-4').hasAttribute('data-expanded')
})`);
check("刷新后主题与路径保持", afterReload.theme === themeState.theme && afterReload.storedTheme === themeState.theme && afterReload.path === "short" && afterReload.storedPath === "short" && afterReload.shortPressed === "true", afterReload);
check("刷新后勾选保持，进度 2/24 · 8%", afterReload.checked01 === true && afterReload.checked12 === true && afterReload.checked02 === false && afterReload.progress === "2/24" && afterReload.pct === "8%", afterReload);
check("刷新后阶段计数正确", afterReload.stage0.indexOf("1 / 3") === 0 && afterReload.stage1.indexOf("1 / 3") === 0, afterReload);
check("刷新后最短路径折叠保持，展开态被清理", afterReload.stage4Group === "none" && afterReload.expandedCleared === false, afterReload);

// ---- 打印样式 ----
await send("Emulation.setEmulatedMedia", { media: "print" });
const printState = await evalJS(`({
  topbar: getComputedStyle(document.querySelector('.topbar')).display,
  toc: getComputedStyle(document.querySelector('.toc')).display,
  seg: getComputedStyle(document.querySelector('.seg')).display,
  stage4Group: getComputedStyle(document.querySelector('#stage-4 .ex-group')).display,
  stage4Body: getComputedStyle(document.querySelector('#stage-4 .stage-body')).display,
  bg: getComputedStyle(document.body).backgroundColor
})`);
check("打印：隐藏工具条/目录/切换栏，展开全部阶段", printState.topbar === "none" && printState.toc === "none" && printState.seg === "none" && printState.stage4Group === "block" && printState.stage4Body === "block", printState);
await send("Emulation.setEmulatedMedia", { media: "" });

// ---- 窄屏 ----
await send("Emulation.setDeviceMetricsOverride", {
  width: 800,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(150);
const narrow = await evalJS(`({
  columns: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns,
  tocPosition: getComputedStyle(document.querySelector('.toc')).position,
  tocDisplay: getComputedStyle(document.querySelector('.toc')).display,
  tocFirstLink: getComputedStyle(document.querySelector('.toc a')).display
})`);
const singleColumn = !narrow.columns.includes("210px") && narrow.columns.split(" ").length === 1;
check("窄屏 ≤920：正文单列、目录横向条目", singleColumn && narrow.tocPosition === "static" && narrow.tocDisplay === "flex" && (narrow.tocFirstLink === "flex" || narrow.tocFirstLink === "inline-flex"), narrow);
await send("Emulation.clearDeviceMetricsOverride");

// ---- 目录跳转 ----
await evalJS(`window.scrollTo(0, 0)`);
await sleep(120);
await evalJS(`document.querySelector('.toc a[href="#stage-3"]').click()`);
await sleep(800);
const jump = await evalJS(`({
  y: window.scrollY,
  targetTop: Math.round(document.getElementById('stage-3').getBoundingClientRect().top),
  hash: location.hash
})`);
check("目录点击跳转到阶段 3，且不被吸顶栏遮挡", jump.y > 0 && jump.hash === "#stage-3" && jump.targetTop >= 0 && jump.targetTop < 120, jump);

// ---- 汇总 ----
const failed = results.filter((r) => !r.pass);
console.log("\nSUMMARY " + (results.length - failed.length) + "/" + results.length + " passed");
if (failed.length) process.exitCode = 1;
ws.close();
