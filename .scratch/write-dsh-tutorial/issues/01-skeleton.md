# 01: 骨架与交互

**What to build:** 打开 `docs/learn-dsh-plugin/index.html` 就能看到最终教程的完整外壳：顶部工具条（路径切换、总进度、深浅色）、210px 吸顶目录、按阶段排好的空内容容器（占位文字即可）、`localStorage` 进度读写、打印样式与窄屏折叠。此时还没有正文，但所有交互都能真实点。

**Blocked by:** None（可以立刻开始）

**Status:** done

- [x] 页面打开无报错，显示 topbar、目录、8 个阶段占位
- [x] 最短/完整路径切换生效，刷新后保持
- [x] 深浅色切换生效，刷新后保持
- [x] 在任意占位练习上勾选后刷新，勾选状态保留
- [x] 总进度条随勾选变化，数字与百分比一致
- [x] 打印预览隐藏工具条、目录与切换栏
- [x] 窗口缩到 920px 以下时目录折叠、正文单列
- [x] 单文件，无外部依赖，体积 < 100KB

**素材索引**

- 结构照 `docs/learn-dsh-plugin/prototype.html` 的变体 A
- 视觉与交互结论见 `07` 票 Answer 的「定稿信息架构」
- 进度键名：`dsh-learn:exercise-<编号>`、`dsh-learn:path`、`dsh-learn:theme`
