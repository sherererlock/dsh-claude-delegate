# 最终教程写作：执行票

产物：`docs/learn-dsh-plugin/index.html`（单文件、变体 A 结构、localStorage 进度）
规格来源：`.scratch/learn-dsh-plugin/map.md` 的 Decisions so far

## 进度

| 票 | 内容 | 状态 |
|---|---|---|
| [01](issues/01-skeleton.md) | 骨架与交互 | done |
| [02](issues/02-stages-0-2.md) | 阶段 0–2 | done |
| [03](issues/03-stages-3-5.md) | 阶段 3–5 | done |
| [04](issues/04-stages-6-7.md) | 阶段 6–7 | done |
| [05](issues/05-best-practice-table-polish.md) | 总对照表与收尾 | done |

## 每张票怎么开工

新会话说一句就够：

> 读 `.scratch/write-dsh-tutorial/issues/NN-*.md`，完成它，更新本文件的状态。

规则：

- 素材只读票面「素材索引」列出的票的 `## Answer`，**不读** `.scratch/learn-dsh-plugin/research/` 原文。
- 结构照 `docs/learn-dsh-plugin/prototype.html`，不要重新设计。
- 每批写完用 Edge headless 截图确认，再勾验收项。
- 每批正文调用 `humanizer-zh` 润色；事实、代码、出处不受润色影响。
- 02、03、04 都只依赖 01，可以并行开工，但同一时间只改 `index.html` 的一个区域，避免冲突。
