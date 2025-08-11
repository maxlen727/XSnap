## XSnap

<div align="center">
  <img src="assets/favicon.svg" alt="XSnap Logo" width="128">
  <h1>XSnap</h1>
  <p><strong>Turn any Tweet/X link into a beautiful, shareable image.</strong></p>
</div>

<div align="center">

**[Visit the Live Demo] →](https://maxlen727.github.io/XSnap/)**

</div>

![XSnap-elonmusk-1949938925163962634(12)](https://maxlen727.github.io/picx-images-hosting/XSnap-elonmusk-1949938925163962634(12).96a1x9y3e7.webp)
XSnap 是一个纯前端的在线工具，它可以让你轻松地将任何公开的 Twitter/X 链接转换成一张设计精美、适合在任何社交媒体上分享的图片。无需截图，无需裁剪，一切都优雅而高效。

这也是我Vibe Coding出来的一个项目，但这次我更懒了，连README也是AI帮忙写的。

## 🙏 致谢

XSnap 的核心功能得以实现，离不开以下优秀的项目：

*   **[FxEmbed/FxEmbed](https://github.com/FxEmbed/FxEmbed)**: 整个项目的数据来源，一个强大而可靠的 Twitter/X 链接修复和内容提取工具。没有它，就没有 XSnap。
*   **[html2canvas](https://github.com/niklasvh/html2canvas)**: 实现了将网页内容转换为图片的魔法。
*   **[allOrigins](https://github.com/gnuns/allorigins)**: 现代化浏览器的增强防护可能会造成同源策略的问题，此时我们将使用allOrigins来进行代理
*   **Gemini**

## ✨ 最新更新 (2025年8月11日)

本次更新主要围绕提升用户体验和扩展推文显示功能展开，修复了多项已知问题，并对核心渲染逻辑进行了重构。

*   **新增功能**：
    *   **引用推文显示**：现在可以正确解析并显示引用推文中的原始推文内容。
    *   **回复链追溯**：实现了无限向上追溯推文回复链的功能，用户可以点击按钮逐层加载父级推文。
    *   **推文统计数据开关**：新增选项，允许用户控制是否在生成的图片中显示回复数、转推数和点赞数。

*   **功能优化**：
    *   **移动端适配**：优化了应用在不同屏幕尺寸下的布局和显示效果。
    *   **“显示上一条推文”按钮美化**：改进了按钮的视觉样式，使其更美观且融入界面。
    *   **多图布局优化**：改进了多图网格布局的显示效果，确保图片完整显示，避免裁剪。

*   **问题修复**：
    *   修复了 `main.js` 中因字符串替换不当导致的 `Uncaught SyntaxError`。
    *   修正了获取推文数据时，API 字段名识别错误的问题（包括回复和引用）。
    *   解决了卡片样式在初始加载和父推文加载时未正确应用的问题。
    *   修复了“下载图片”后，“显示上一条推文”按钮状态异常的问题。
    *   解决了下载图片时，功能按钮会出现在图片中的问题。

这次维护工作也是Gemini完成的。对这样的小项目来说，Vibe Coding也没有导致项目难以维护。只是这次维护花了我2h还多的时间，换作是一个经验丰富的前端开发人员，可能1h以内就能完成了。（当然，这么慢有我的原因，因为我是前端丈育）
