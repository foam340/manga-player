<div align="center">

# 📖 漫画播放器 (Manga Player)

**单文件、零安装、本地优先的漫画"播放器"**

一个 HTML 文件（约 390 KB），双击打开，把压缩包拖进去<br>
设好间隔，就像看视频一样自动翻页 🎬

![License](https://img.shields.io/badge/license-MIT-green) ![size](https://img.shields.io/badge/单文件-390&nbsp;KB-blue) ![install](https://img.shields.io/badge/安装-不需要-orange) ![network](https://img.shields.io/badge/联网-不需要-success)

![翻页模式](docs/screenshot-flip.png)

</div>

## ✨ 特性

- ⏱️ **定时自动翻页** —— 0.5 秒 ~ 1 小时任意间隔，随时暂停，看完自动停
- 📜 **条漫滚动** —— 长条漫画自动匀速下滑，速度可调
- 📦 **压缩包直读** —— ZIP / CBZ / RAR / CBR 拖进去就能看，无需解压
- 🔐 **加密 RAR** —— 自动弹窗询问密码
- 📖 **双页模式** —— 宽页跨页图自动拆成左右两半
- 🇯🇵 **日漫右开** —— 方向、按键、双页顺序整体翻转
- 🔍 **缩放平移** —— Ctrl + 滚轮缩放，拖动平移，双击复位
- 💾 **每本书独立记忆** —— 进度和阅读设置按书分开保存
- 🎚️ **进度拖动条** —— 任意跳页 / 跳转位置
- 🔋 **屏幕常亮** —— 播放时不会自动锁屏
- 🀄 **老压缩包兼容** —— GBK 文件名自动识别，不乱码不乱序
- 🔒 **纯本地** —— 无网络请求，所有内容只在内存中处理

## 🚀 使用

下载 [`漫画播放器.html`](漫画播放器.html) → 双击（Edge / Chrome）→ 拖入压缩包 → 按空格 ▶️

| 按键 | 功能 |
| --- | --- |
| `空格` | ▶️ 播放 / ⏸️ 暂停 |
| `←` `→` | ⬅️ 翻页（日漫方向下相反） |
| `Home` / `End` | 🔝 首页 / 🔚 末页 |
| `+` / `−` | ⏱️ 调整翻页间隔 |
| `Ctrl` + 滚轮 | 🔍 缩放（拖动平移，双击复位） |
| `F` / `?` / `Esc` | 🖥️ 全屏 / ❓ 帮助 / ↩️ 返回 |

🖱️ 鼠标：点击图片左 / 右半边翻页；整页模式下滚轮翻页。完整说明按 `?` 查看。

## 📦 格式支持

| 格式 | 状态 |
| --- | --- |
| ZIP / CBZ / RAR / CBR / 图片文件夹 | ✅ |
| 加密 RAR（密码弹窗） | ✅ |
| 加密 ZIP / 7z / ZIP64（>4GB）/ 分卷 RAR | ❌ 解压成文件夹拖入即可 |

## 🔬 原理

- 🗜️ ZIP：手写中央目录解析 + 浏览器原生 `DecompressionStream`，懒解压 + 预加载窗口，大包秒开
- 🎞️ RAR：内嵌 [node-unrar-js](https://github.com/YuJianrong/node-unrar-js)（官方 unRAR 6.1.7 WASM），后台 Worker 流式解压
- ⏲️ 翻页计时用 `setInterval`（标签页被遮挡也不停摆），渲染带代数号防竞态，文件名 UTF-8 / GBK 自动识别

<details>
<summary>🛠️ 开发与构建</summary>

```bash
node build.mjs            # 从 src/ 构建单文件 漫画播放器.html
node test/zip_test.mjs    # ZIP 解析器测试
node test/rar_test.mjs    # RAR 提取测试
```

</details>

## 💖 致谢与许可

- [node-unrar-js](https://github.com/YuJianrong/node-unrar-js)（MIT，内核为 Alexander Roshal 的官方 unRAR 6.1.7）
- 设计参考：[kthoom](https://github.com/codedread/kthoom)、[Mihon](https://github.com/mihonapp/mihon)
- 本项目代码以 [MIT](LICENSE) 发布，喜欢的话点个 ⭐ 吧！
