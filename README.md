# ChatGPT 同步到思源笔记

一个简单的 Tampermonkey 用户脚本：在 ChatGPT 对话页添加“同步到思源”按钮，把当前会话整理为 Markdown 并写入思源笔记。

## 功能
- 提取当前 ChatGPT 对话内容
- 尽量保留标题、段落、列表、引用、表格、代码块等 Markdown 结构
- 一键同步到本地思源笔记
- 提供可视化配置界面，无需手改源码

## 安装
1. 安装浏览器扩展：Tampermonkey
2. 新建用户脚本
3. 将 `chatgpt-to-siyuan.user.js` 内容粘贴进去并保存

## 配置
安装脚本后，打开 ChatGPT 页面，点击右下角 **“设置思源”**，填写：

- `siyuanBaseUrl`：思源服务地址，默认 `http://127.0.0.1:6806`
- `siyuanToken`：思源 API Token
- `notebook`：目标笔记本 ID
- `parentPath`：保存目录，例如 `/ChatGPT同步`
- `docTitlePrefix`：文档标题前缀，例如 `ChatGPT会话-`

配置会保存在浏览器本地，仅当前脚本使用。

## 使用方法
1. 打开 `https://chatgpt.com/` 或 `https://chat.openai.com/`
2. 进入任意一个具体对话页
3. 如首次使用，先点击右下角 **“设置思源”**
4. 填写完成后点击 **“同步到思源”**
5. 在思源中查看新建文档

## 注意事项
- 仅支持你本机运行的思源服务
- 发布版本不包含任何真实 Token 或私人配置
- ChatGPT 页面结构变化后，脚本可能需要适配更新

## License
MIT
