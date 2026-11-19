# Database browser

一个 DBeaver 风格的侧边栏数据库面板，同时向 Agent 暴露查询工具。

- **支持的数据库**：MySQL（兼容 TDSQL、GoldenDB）、Oracle（12.1+ 走 Thin 模式，无需客户端；更老的 11g 等版本自动回退到 Thick 模式，需要本机装有 Oracle Instant Client，默认探测 `~/lib/oracle-instantclient`，也可用插件配置 `oracleClientLib` 指定）、Redis（单机 / Sentinel / Cluster）。
- **界面**：侧边栏面板列表中的「数据库」入口。左侧连接树（连接 → 库/Schema → 表），右侧 SQL 编辑器与结果网格；Redis 连接提供键扫描与值查看。
- **Agent 工具**：`db_browser`（连接列表、库表结构、执行 SQL）与 `redis_browser`（INFO、扫描键、读值、只读命令）。
- **安全**：默认只读；在插件配置中设 `allowWrites: true` 才允许写操作。密码保存在凭据存储，不进入配置文件。

## 连接配置

在面板中点击「新建连接」，或直接编辑插件配置：

```yaml
config:
  allowWrites: false
  connections:
    - id: my-mysql
      label: 业务库
      type: mysql          # mysql | oracle | redis
      hosts: [{ host: 10.0.0.1, port: 3306 }]   # 多个主机按顺序故障切换
      user: root
      database: app
    - id: my-oracle
      type: oracle
      hosts: [{ host: 10.0.0.2, port: 1521 }]
      user: scott
      serviceName: ORCLPDB1  # 或改用 sid: ORCL；connectString 完整描述符优先于两者
    - id: my-redis
      type: redis
      mode: sentinel       # standalone | sentinel | cluster
      hosts: [{ host: 10.0.0.3, port: 26379 }]
      masterName: mymaster # sentinel 模式必填
      db: 0
```

密码通过面板的连接表单保存（写入凭据存储），不要写进配置。

## 连接的生命周期

连接默认处于**停止**状态：在面板中点击连接的「⏻ 启动」才会建立常驻连接，浏览和查询都要求连接已启动。DSH 退出或插件重载会自动断开全部连接；重启后不会自动重连，需要再次手动启动。Agent 侧通过 `connect` / `disconnect` 动作获得同样的控制能力，`list_connections` 的 `status` 字段显示当前状态。

## 给其他 Agent 使用（MCP）

仓库内含一个独立的 stdio MCP server（`mcp-server.js`），供本 DSH 之外的 Agent（Claude Code、其他 DSH 实例等）调用同样的 `db_browser` / `redis_browser` 工具：

```bash
# 连接配置（不含密码；字段与插件 config 一致）
export DBB_CONNECTIONS_FILE=/path/to/db-browser.connections.json
# 密码走环境变量：约定 DBB_PASSWORD_<ID>（id 大写、非字母数字转 _），
# 或在配置文件的 "passwords": { "<id>": "ENV_VAR_NAME" } 中指定变量名
export DBB_PASSWORD_MY_MYSQL='...'
```

MCP 客户端配置示例（Claude Code）：

```json
{
  "mcpServers": {
    "db-browser": {
      "command": "node",
      "args": ["/path/to/dsh-db-browser-plugin/mcp-server.js"],
      "env": { "DBB_CONNECTIONS_FILE": "/path/to/db-browser.connections.json", "DBB_PASSWORD_MY_MYSQL": "..." }
    }
  }
}
```

MCP 模式下连接在进程内按需建立、退出即关闭；只读限制同样生效。

## 在其他终端安装

```bash
git clone <remote-url> dsh-db-browser-plugin
cd dsh-db-browser-plugin
pnpm install --prod   # 安装 mysql2 / ioredis / oracledb 驱动（oracledb 的 install 脚本可忽略，Thin 模式不需要）
```

然后在 DSH 的 **Plugins → Add plugin** 中选择该目录（本地目录以 link 方式装入，驱动从目录内的 `node_modules` 解析）；升级时 `git pull` 后在插件管理中重载即可。

## 开发约定：冷启动陷阱（改动前必读）

热重载期间一切正常、重启才暴雷的两类问题，本仓库都踩过（2026-11-19）：

### 1. 凭据存储契约

密码通过 Host 的 `credentials` 服务写入 `~/.dsh/.credentials.yaml`。该文件在 **DSH 启动时被全量严格校验**：任何一条记录不合法，`credentials-local`（必需插件）激活失败，**整个 Host 拒绝启动**。运行期热重载不会触发该校验，所以错误写法在开发时看起来"正常"，重启才暴雷。契约只有三条：

1. **kind 只能是 `grant`**（自由 JSON payload）或 `api-key`；本插件用 `{ kind: 'grant', payload: { password } }`。不存在 `password` 这种 kind。
2. **记录 key 的每段必须匹配 `^[a-z][a-z0-9-]*$`**；连接 id 允许 `_`、`.`、大写，因此统一用 `db-browser/c<hex(id)>` 编码（见 `credentialRecordKey()`）。
3. payload 必须可 JSON 往返（字符串/数字/布尔/null/ plain object / 数组）。

防护：`test/connection.test.mjs` 的 "passwords are grant records under a legal credential key" 用例固定了上述形状。

### 2. 服务获取必须走 `ctx.inject`

**禁止在 `apply()` 里一次性 `ctx.get('webServer')` 后就用**：冷启动时未声明依赖的行之间没有启动顺序保证，服务可能还没发布，一次性获取静默失败后路由/工具永远不会注册（面板 HTTP 404）。正确写法：

```js
ctx.inject(['webServer', 'connection'], (ctx) => registerHttp(ctx, core))
ctx.inject(['tools'], (ctx) => registerTools(ctx, core))
```

`ctx.inject` 会在依赖发布后运行回调，并在服务重载时先销毁再重跑（我们的 `ctx.effect` 注册随之自动清理）。防护：`test/apply.test.mjs` 固定了"服务未就绪时不得注册任何路由/工具"的延迟注册契约。

**凡是改动这两处路径的代码，必须：(a) 跑通对应测试；(b) 做一次完整的 DSH 重启冒烟**，确认启动无报错、面板可用后再交付。
