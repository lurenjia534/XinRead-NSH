# 小信阅读 · XinRead-NSH

[打开 Site](https://xinread-nsh.lurenjia534.chatgpt.site/) · [原版小信阅读](https://github.com/sunnysky123/xinread) · [Native Shell](https://github.com/longbridge/nsh)

基于 Native Shell 0.5.0 的中文阅读应用。书架、搜索、本地阅读器和设置使用 NSH TSX，Web 版本由 NSH 的 Rust / WebAssembly 运行时驱动。

## 阅读

- **官网推荐**展示微信读书首页的四本书，可按书名或作者筛选、刷新。推荐服务不可用时显示随版本打包的最近书单。
- **微信读书**图书在应用内的官方网页阅读器打开。登录、付费权限、正文、目录及云端进度由微信读书处理。网页嵌入受浏览器登录或 Cookie 设置影响时，可点「在官网打开」。
- **我的书架**支持用腾讯官方签发的个人 API Key 同步电子书。也可以直接打开微信读书网页版扫码。两个入口的会话独立，网页扫码后不会自动把个人书架导入 NSH。
- **本地读物**可导入 TXT、MD，支持 UTF-8 和 GB18030。支持分章、键盘翻页、目录、12–32 号字、浅深色、朗读和本地续读。朗读使用设备提供的语音，可以暂停、调语速和音量、选语音或自动读下一章。

本版面向浏览器。与原版 WinUI 客户端相比，线上正文由官方网页渲染，NSH 正文排版和浏览器朗读适用于本地文件。

## 运行

需要 Node.js 24、NSH CLI 0.5.0（f4d68f7）及其匹配的 Web 运行时。请安装[上游发行版](https://github.com/longbridge/nsh/releases/tag/v0.5.0)中当前系统的 CLI 和 Web 组件。

```sh
npm ci
npm test
nsh test App.test.tsx --web-host tests/headless-host.js
npm run build
npm run dev
```

默认在 http://localhost:5173 提供应用。可用 NSH_BIN 指向 CLI。Web 成品位于 dist/client，处理官网推荐和书架请求的 Worker 位于 dist/server。Worker 的静态文件绑定名为 ASSETS。

## 数据

本地文件保存在本浏览器的 IndexedDB。字号、语音设置与本地章节位置保存在 localStorage。打开腾讯页面时，浏览器直接访问对应的腾讯服务。连接书架时，Site 后端将 API Key 转发至腾讯官方网关，仅调用只读接口 /shelf/sync。密钥保存在页面内存中，刷新页面或断开连接后需要重新连接。应用不记录密钥、正文或书架请求日志。

## 贡献者

- sunnysky123 — 原版小信阅读和应用图标（MIT）。
- lurenjia534 — 项目发起与维护。
- OpenAI Codex — NSH 移植、浏览器适配、测试与部署。
