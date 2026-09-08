# DSL 保存服务

编辑器通过项目内的 Express 服务保存
`src/datav3/basic_charts` 与 `src/datav3/composite` 中的 JSON 文件。

## 启动

```bash
npm run dev:full
```

- Vite：`http://localhost:5173`
- 本地 API：`http://127.0.0.1:3000`

也可以在两个终端分别运行 `npm run dev` 和 `npm run server`。

## 保存语义

- `GET /api/dsl/:category/:file` 返回内容和 SHA-256 哈希。
- `PUT /api/dsl/:category/:file` 接收 `content`、`expectedHash` 与可选的
  `force`。
- 保存使用同目录临时文件、`fsync` 与原子重命名。
- 哈希过期时返回 `409 DSL_CONFLICT`；编辑器让用户选择重新加载外部版本
  或明确强制覆盖。
- 保存或校验失败时，候选内容不会安装到编辑器界面。
- 兼容端点 `POST /api/save-json` 仅允许写入上述两个 `datav3` 目录。

服务只监听 `127.0.0.1`，限制本地 Origin、文件分类和简单 JSON 文件名，
并拒绝路径穿越与符号链接目标。

## AI 配置

`GET/PUT /api/ai/config` 管理项目根目录下被 Git 忽略的 `.env.local`。
写入采用原子替换和 `0600` 权限，并保留无关配置与注释。API Key 只在本地
服务进程中读取，任何响应都只返回 `hasApiKey`。切换 Base URL 时必须重新
输入 Key；远程地址必须使用 HTTPS，仅回环地址允许 HTTP。

`POST /api/ai/chat` 代理非流式 OpenAI-compatible Chat Completions 请求。
请求正文使用：

```json
{
  "instruction": "Make the bars blue",
  "dsl": {},
  "viewData": {},
  "recentInstructions": [],
  "attachment": null
}
```

模型返回结构化 JSON 对象，其中 `patch` 是仅包含 `/dsl` 或 `/viewData`
路径的 RFC 6902 Patch，`summary` 是由标题、概述以及 DSL/视图数据分区说明
组成的语义化总结。Patch 仍是唯一执行依据；总结只作为解释文字，并在 Patch
校验、渲染与保存全部成功后才会展示。兼容仅返回 Patch 的模型，此时编辑器会
根据最终落库的历史记录生成安全的兜底总结。若模型把当前 API Key 回显到
Patch 内容中，服务会在写入编辑器或 DSL 文件前拒绝整个响应。
