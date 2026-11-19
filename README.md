# dsh-dev-plugins

面向开发者的 DeepSeek Harness 插件仓库。这里的插件给编码、联调和排障用：查库、看消息、以及同类本地工具。

一个 Git 根管理多个彼此独立的插件。根目录只做收纳和版本管理；插件代码、依赖和忽略规则都在各自的子目录里。根目录不是插件工程，也不把各插件依赖提升成 workspace。

已在 DeepSeek Harness `>=0.2.2-rc.5 <0.3.0` 上验证。

## 插件

| 目录 | 包名 | 用途 |
| --- | --- | --- |
| [`db-browser/`](db-browser/README.md) | `@local/db-browser` | 侧边栏数据库面板，并给 Agent 暴露查询工具。覆盖 MySQL 族、PostgreSQL 族、Oracle 与 Redis。 |
| [`kafka-tool/`](kafka-tool/README.md) | `@local/kafka-tool` | 侧边栏 Kafka 面板。浏览 topic 与消费者组，订阅消息流；Agent 工具只读。 |

连接方式、配置、安全限制和各插件自己的开发约定，见对应目录里的 README。

## 安装

在目标插件目录安装生产依赖，再在 DeepSeek Harness 里用 **Plugins → Add plugin** 选择该目录。本地目录以 link 方式装入，驱动从该目录的 `node_modules` 解析。

```bash
cd db-browser
pnpm install --prod
```

```bash
cd kafka-tool
pnpm install --prod
```

升级时拉取本仓库，然后在插件管理中重载对应插件。

## 开发

安装依赖、跑测试、改锁文件，都在该插件目录内进行：

```bash
cd db-browser
pnpm test
```

新增插件时另建同级子目录，并保持它是开发者在编码、联调或排障时会打开的工具。目录边界、入口、主题和界面语言见 [AGENTS.md](AGENTS.md)。动手前先在插件市场 [dsh-market](https://github.com/dsh-market/dsh-market) 检索同类插件；已有插件能覆盖需求时，复用社区版本。

## 许可

[MIT](LICENSE)
