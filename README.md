<div align="center">

<img src="assets/favicon.svg" alt="XSnap" width="72">

# XSnap

**把一条推文，排版成一张图。**

贴一个链接 → 得到一张干净、高清、可以直接发出去的图。引用、串推、多图都替你处理好。

**[→ 线上使用](https://maxlen727.github.io/XSnap/)**

</div>

![XSnap](assets/preview.jpg)

---

## 它是什么

XSnap 是个纯浏览器的工具：把一个公开的 Twitter/X 链接变成一张适合发出去的图。

页面只跟 [FxEmbed](https://github.com/FxEmbed/FxEmbed) 要数据，卡片在你的浏览器里排版、由 `html2canvas` 栅格化成 PNG。**什么都不会上传。**

整个项目是一个静态页面 —— `index.html` 加 `assets/` 里三个文件，没有构建步骤，没有框架，没有打包。这就是全部的部署内容。

## 功能

| | |
|---|---|
| **背景** | 6 种纸面底色（纸/白/墨/靛/粉/沙）、3 种印刷纹理（点阵/方格/斜纹）、任意双色硬分割 |
| **卡片** | 白纸 / 米纸 / 墨卡，或者任意底色 —— 文字对比度自动算 |
| **多图** | 1–4 张，网格或堆叠，统一裁切 |
| **引用推** | 连同它自带的图一起还原，左侧一道靛蓝竖线 |
| **串推** | 点「显示上一条」逐层往上追，一张卡片一层 |
| **导出** | 2× / 3× / 4×，下载 PNG 或直接复制到剪贴板 |
| **选项** | 数据、水印各自可关 |
| **界面** | 中英双语，跟随系统语言 |
| **键盘** | `⌘/Ctrl + S` 下载 |

深链也能用：`?url=<推文链接>` 直接进到成品。

## 设计

视觉语言来自印刷品，不是网页：**钴蓝 `#1D3BFF` 的整页外框**、纯白纸面、**点状细线**做所有结构分隔、目录式的点线引导、方角零阴影、细边框小方块当标签。

层级靠字重和分割线建立，不靠渐变、圆角和光斑 —— 全站只有一种强调色，其余全是黑与灰。

颜色是自己的：**钴蓝 `#1D3BFF`** 走外框、版面小标题和选中标记；标志是几何的直角方框加叉，
和外框同构。这套语言参考了印刷品和编辑设计，但颜色、标志、栅格都是这个项目自己的。

移动端外框收成顶部红色条，和桌面同一套语言。

## 实现

```
x.com 链接  →  api.fxtwitter.com/{user}/status/{id}  →  卡片 DOM  →  html2canvas-pro  →  PNG
```

卡片是真的 DOM，不是画在 canvas 上 —— 所以所见即所得，调样式就是普通 CSS。

### 动渲染器之前必须知道的三个坑

`html2canvas` 自己重实现了一遍 CSS 布局，不走浏览器的。三处它会静默出错：

1. **不认 `object-fit`。** 图会被拉变形。所以每个图片格子是一个 `overflow:hidden` 的盒子，
   里面一张绝对定位的 `<img>`，尺寸和偏移按图片真实宽高手算（`main.js` 里的 `coverCell()`）。
2. **不认 flex 容器的 `gap`。** 间距全部用 margin 做。
3. **不认平铺的 CSS 渐变。** 用 `background-size` 平铺的 `radial-gradient` / `repeating-linear-gradient`
   在页面上看得见，导出后消失。所以纹理改用 **SVG data URI 图块**（`tileUrl()`）—— 那是图片背景，能过。

另外：图片格子的宽高是**像素**，所以卡片必须已经显示并完成布局才能测量。
在隐藏状态下渲染会量到 `0`，代码会在下一帧重试。

## 开发

```bash
python3 -m http.server 8080   # 或者任何静态服务器
# → http://localhost:8080
```

没有依赖，没有编译。改完刷新即可。

需要脚本化或嵌进别的页面时，页面导出了一个入口：

```js
XSnap.generate('https://x.com/user/status/123')  // 载入一条推文
XSnap.download()                                 // 保存当前卡片
XSnap.copyImage()                                // 复制当前卡片
```

## 已知限制

- 保护账号和已删除的推文取不到 —— 这是接口的限制，不是页面的。
- 很长的推文 = 很高的图。这是功能，但 4× 的九图串推会是个大文件。
- 某些隐私模式会拦掉 CDN 请求，图片会退到 [allOrigins](https://github.com/gnuns/allorigins)
  代理重试，会慢一点。
- X 的接口结构时有变化；真变了，先看 `buildCard()`。

## 致谢

- **[FxEmbed / FxEmbed](https://github.com/FxEmbed/FxEmbed)** —— 数据来源，这个项目本质是它的前端。
- **[html2canvas-pro](https://github.com/yorickshan/html2canvas-pro)** —— DOM 转 canvas，支持现代颜色函数。
- **[allOrigins](https://github.com/gnuns/allorigins)** —— 图片被拦时的代理兜底。
- **[Archivo](https://fonts.google.com/specimen/Archivo)** / **[Inter](https://rsms.me/inter/)** —— 字体。
- **Gemini** —— 最早那一版是它写的。

## 更新日志

### 重做

界面推倒重来。功能没减，层次重新梳过。

- 一套印刷品语言：钴蓝外框、点状细线、目录式点线引导、方角零阴影
- 背景从 2018 年的柔和渐变换成纸面底色 + 印刷纹理 + 双色硬分割
- 卡片去掉圆角和投影，改成细边框的「剪报」；加认证徽章、发帖日期、真图标
- 自定义底色自动算文字对比度，深色卡不会出现看不清的字
- `html2canvas` → `html2canvas-pro`；图片裁切改成手算，不再被拉变形
- 纹理改用 SVG 图块，解决平铺渐变导出后消失的问题
- 导出质量 2×/3×/4×、复制到剪贴板、水印与数据开关
- 单页布局：输入框常驻顶部，结果就地出现，不再有跳转页
- 响应式到手机，移动端外框收成顶部红条

### 2025-08-11

引用推渲染、回复链回溯、数据开关、移动端适配，以及 `main.js` 的一批修复。也是 Gemini 写的。

---

<div align="center">
<sub>Built by <a href="https://github.com/maxlen727">MaxLen</a></sub>
</div>
