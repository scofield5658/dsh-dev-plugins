# Kafka

Kafka Tool 风格的侧边栏数据查询面板。

- **界面**：侧边栏面板列表中的「Kafka」入口。连接栏管理 broker 地址（支持 SSL 与 SASL PLAIN/SCRAM），下方三个视图：消息订阅、Topics、消费者组。
- **连接生命周期**：连接由你手动点「连接」启动；切换窗口/面板不会断开（Host 端空闲 15 分钟才回收，回来自动恢复现场并重新加载最新数据）；DSH 退出时全部自动断开，重启后保持断开、等你手动连接。
- **Agent 工具**：`kafka_query`（连接、topic/分区位点、消费者组 lag、peek 最新消息、按 offset 读单条消息），与面板共享 Host 端连接，全部只读。
- **消息订阅**：同时订阅多个 topic，可从最新、最早、指定时间戳或指定 offset 开始；列表只展示元数据（时间戳、topic、partition、offset、key、大小），虚拟滚动承载数万条缓冲；「加载更早」按分区向前翻页；点击行打开详情弹窗，按需拉取 payload，支持 Hex / 文本 / JSON（自动 pretty）三种查看方式。topic 选择器支持关键字过滤、「全选过滤结果」与「清空选择」（选择器旁的 ✕ 可一键清空已选）。
- **过滤**：按分区、key 内容、offset 范围过滤当前缓冲。
- **Topics**：topic 列表（名称、分区数，数千个 topic 也能秒开），展开行按需加载该 topic 各分区的 begin/end offset 与消息量，一键送去订阅。
- **消费者组**：组列表（状态、成员数），展开查看各 topic 分区的已提交位点与 lag。
- **刷新**：手动刷新按钮 + 可配置秒数间隔的自动刷新（polling）。

## 连接配置

面板表单记住 broker 地址等（不记密码）。也可以在插件配置中提供默认值：

```yaml
config:
  brokers: ['10.0.0.1:9092', '10.0.0.2:9092']
  ssl: false
  # sasl: { mechanism: plain, username: my-user }   # plain | scram-sha-256 | scram-sha-512
```

密码只在面板中输入，保存在页面内存中，不会写入配置文件或 localStorage。

## 在其他终端安装

```bash
git clone <remote-url> dsh-kafka-tool-plugin
cd dsh-kafka-tool-plugin
pnpm install --prod   # 安装 kafkajs（唯一的运行时依赖）
```

然后在 DSH 的 **Plugins → Add plugin** 中选择该目录（本地目录以 link 方式装入，依赖从目录内的 `node_modules` 解析）；升级时 `git pull` 后在插件管理中重载即可。

## 测试

```bash
pnpm test
```

- `test/client.test.mjs`：面板模块注册、locale 字典完整性（无需 Kafka）。
- `test/host.test.mjs`：Host 端纯函数与路由校验（无需 Kafka）。
- `test/kafka.test.mjs`：端到端集成测试，需要可连接的 broker（默认 `localhost:9092`，可用 `KAFKA_TOOL_TEST_BROKERS` 指定；不可达时自动跳过）。测试会自建并清理临时 topic 与消费者组。

## 限制

- 详情拉取的 payload 超过 256 KiB 会被服务端截断；列表中的 key 截断到 8 KiB。
- 页面消息缓冲上限 5 万条：实时追加丢弃最旧的，历史翻页丢弃最新的（均有提示）。
- 「加载更早」每次点击每分区回填 100 条。
- 认证支持 TLS + SASL PLAIN/SCRAM；Kerberos、OAuth、mTLS 证书暂不可配置。

## 开发约定：冷启动陷阱

Host 侧服务**禁止在 `apply()` 里一次性 `ctx.get()` 后就用**——冷启动时未声明依赖的行之间没有启动顺序保证，服务可能还没发布，静默跳过会导致注册永远不发生（db-browser 插件曾因此面板 HTTP 404）。一律用 `ctx.inject(['tools'], ...)` 延迟到服务发布后注册（本插件的工具注册即如此；面板数据走 `connection/request` 事件，天然无时序问题）。改动 Host 端注册路径后，必须做一次完整 DSH 重启冒烟。
