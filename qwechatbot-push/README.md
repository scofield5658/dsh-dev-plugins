# 企业微信推送

面向开发者的企业微信群机器人（Webhook Bot）推送插件：本地维护多个推送通道，交给 Agent 按用途判断是否推送，也提供侧边栏面板管理通道并手动测试。

- **通道模型**：每个通道 = `id`（标识符）+ `purpose`（用途）+ `key`（推送凭据）。推送地址固定为 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key={key}`，前缀作为插件内部配置固定，你只维护 `key`。
- **Agent 工具**：`qwechatbot_push`。`list_channels` 列出通道（id、用途、key），`save_channel` / `remove_channel` 维护通道，`push` 向指定通道发送 `text`（≤2048 字节 UTF-8，支持 @userid / @手机号）或 `markdown`（≤4096 字节 UTF-8）消息。
- **面板**：侧边栏「企业微信推送」入口，可视化新建 / 编辑 / 删除通道、填 `key`，并对某个通道发起测试推送，直接看到企业微信返回的 `errcode` / `errmsg`。
- **存储**：`key` 为低风险凭据，与 id、用途一并明文保存在本地通道文件，可直接查看/编辑。

推送方式见企业微信官方文档 [消息推送配置说明](https://developer.work.weixin.qq.com/document/path/99110)。每个机器人发送频率上限 20 条/分钟。

## 数据存储

通道（id、用途、key）全部明文保存在插件自己的数据目录：

```
$DSH_HOME/plugins/qwechatbot-push/channels.json
默认 ~/.dsh/plugins/qwechatbot-push/channels.json
```

文件结构：

```json
{
  "channels": [
    { "id": "build", "purpose": "构建通知", "key": "xxxx" },
    { "id": "alerts", "purpose": "线上告警", "key": "" }
  ]
}
```

## 插件配置

推送前缀在代码中固定（`DEFAULT_WEBHOOK_BASE`），无需在配置里维护；`timeoutMs` 是单次推送超时（毫秒），可按需调整：

```yaml
config:
  timeoutMs: 10000
```

## 安装

```bash
cd qwechatbot-push
pnpm install --prod   # 仅安装 @deepseek-ai/schemastery
```

然后在 DSH 的 **Plugins → Add plugin** 选择该目录（本地目录以 link 方式装入，依赖从目录内 `node_modules` 解析）；升级时 `git pull` 后在插件管理中重载。

## 测试

```bash
pnpm test
```

`test/qwechatbot.test.mjs` 覆盖工具 schema、通道增删改、key 明文落库与重载、payload 长度校验、推送 URL 构造与企业微信错误上报，全部离线、无需真实 Webhook。

## 限制

- 只支持 `text` 与 `markdown` 两种消息类型；图片 / 图文 / 文件需要先走素材上传接口拿 `media_id`，本插件暂不覆盖。
- `mentioned_list` / `mentioned_mobile_list` 仅对 `text` 生效（`markdown` 用内容里的 `<@userid>` 语法）。
- 推送依赖 DSH 运行时的全局 `fetch`（Node 18+）。

## 开发约定

Host 侧服务禁止在 `apply()` 里一次性 `ctx.get()` 后就用——冷启动时未声明依赖的行之间没有启动顺序保证。工具与 HTTP 路由一律用 `ctx.inject(['tools' | 'webServer', ...], ...)` 延迟到服务发布后注册，避免面板 404 或工具缺失。
