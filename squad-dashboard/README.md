# squad-dashboard

跨工作区的小队看板（产研ECC，即「产品研发一体化作战室」）。Host 半注册 Cordis 服务 `squadDashboard`，只读遍历 `workspaceRegistry → agents → subagents/agentTeams`，把每个工作区里的小队会话聚合成 `snapshot()`；Client 半在左侧边栏注册「产研ECC」面板，经 `GET /api/squad-dashboard/snapshot` 取数渲染。

插件本身不绑定任何组织、环境、账号或成员名：预设前缀、小队类型、成员名册、模型路由、远端地址与 Token 全部通过 Host Config、HTTP 接口或面板的「配置」页设置。插件仓库只包含代码；本地名册、模型路由、远端地址与 Token 都存放在 `$DSH_HOME`（默认 `~/.dsh`）下的配置文件里，不随仓库提交。

## 与小队 preset 的关系

本插件代码只负责看板和配置，不注册 agent presets 或 skills。它与任何符合 `squadPresetPrefix`（默认 `squad-`）或 `squadKinds` 别名的 Leader preset 配合使用，不依赖特定 preset 包。若你自行维护小队 presets/skills，可把 skills 放在 `$DSH_HOME/plugins/squad-dashboard/agents/skills`，并在 profile 的 `cordis.patch.yml` 中声明 presets。没有这类 preset 时，看板不会凭空创建小队；配置页仍会从外部配置读取名册和模型路由。

## 功能

- 面板标题为「产研ECC仪表盘」。按工作区分组；每张小队卡片先标明小队类型，再给出会话标题。
- 成员行先写当前事项（目录 `label`，没有则用其名下未完成的 Team 任务主题），再写成员名、模型路由和状态。没有事项时明确显示「未记录当前事项」。Leader 的皇冠与成员名作为一组显示；成员名靠左，模型路由与状态作为一组靠右对齐，模型路由按内容自适应宽度完整展示，只有卡片真的放不下时才省略（悬停可看完整路由）。
- 本地 Team 任务板折叠区：subject / status / owner / blocked；
- 远端 Multica 任务列表：一行一个任务，列出任务编号、任务标题、发起人、创建时间和项目自己的工作流状态；不按固定泳道分组，项目换工作流不需要改插件；
- 点击小队标题或成员 → `ctx.uiWorkspace.openSession()` 跳转到对应会话（成员无 sessionId 时跳小队 Leader 会话）；点击远端任务行 → 打开 Multica 上对应的 Issue；
- 标题、页签和统计固定；只有工作区 / 小队任务区独立滚动，向下看任务时仍能切页签、刷新和看总数；
- 手动刷新 + 按 `pollMs`（默认 10s，插件 Config 可调）轮询，面板不可见时暂停；
- 双语 zh/en、深浅色主题跟随宿主（只用 `--dsw-alias-*`）。

## 配置

### Host Config

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `pollMs` | `10000` | 面板建议的轮询间隔（毫秒）。 |
| `squadPresetPrefix` | `squad-` | 用来识别小队 Leader preset 的前缀。 |
| `squadKinds` | `{}` | 可选的小队类型别名，`{ "<kind>": ["<preset id>", ...] }`。留空时按 preset id 推导；配置了别名的 preset 也会被视为小队。 |
| `squadConfigPath` | 空 | 小队配置文件路径；留空表示 `$DSH_HOME/plugins/squad-dashboard/squad-member-models.json`（默认 `~/.dsh/plugins/squad-dashboard/squad-member-models.json`）；相对路径按 `$DSH_HOME` 解析。 |
| `remoteConfigPath` | 空 | 远端连接配置文件路径；留空表示 `$DSH_HOME/plugins/squad-dashboard/squad-remote.json`（默认 `~/.dsh/plugins/squad-dashboard/squad-remote.json`）；相对路径按 `$DSH_HOME` 解析。 |

不配置 `squadKinds` 时，类型由 preset id 推导：去掉 `squadPresetPrefix` 和 `-leader` 后缀，例如 `squad-dev-leader` → `dev`、`squad-ops` → `ops`。使用别的命名约定时，可以显式配置：

```yaml
squadKinds:
  engineering:
    - crew-dev-leader
  product:
    - crew-product-leader
```

内置中英文类型名只有 `dev` / `product` / `test` 三种；其他类型显示为按 id 生成的名称。

### 面板「配置」页

「看板 / 远端 / 配置」三个页签。配置页的「本地小队配置」保留**缺省模型**、**并发上限**，以及每个成员一个模型下拉（留空表示使用缺省）。成员名册和小队类型的增删不在 UI 维护，改由其他 DSH 主会话通过 `squad_config` 工具或 HTTP API 调整。

- 成员行来自配置文件的 `members`（以及已有模型路由的成员名）；页面只编辑每个成员的 `squads.<kind>.<name>` 路由，不增删成员。
- 缺省模型写入 `defaults`，作为成员的统一回退；并发上限写入 `limits.maxConcurrentPerRoute`。保存提交完整 `{ defaults, squads, members, limits }`。
- 保存写入 `$DSH_HOME/plugins/squad-dashboard/squad-member-models.json`（默认 `~/.dsh/plugins/squad-dashboard/squad-member-models.json`；插件 Config `squadConfigPath` 可改），并显示保存路径。`DSH_HOME` 由宿主在 Windows / macOS / Linux 上统一提供，配置不在插件目录内；插件包的 `.gitignore` 也忽略这两个配置文件名，避免误提交。
- 标签列与控件列之间有分栏拖拽条：左右拖动调整标签列宽，双击恢复默认，宽度记忆在 localStorage。

配置文件结构：

```json
{
  "defaults": { "provider": "provider-a", "model": "model-a" },
  "members": {
    "dev": ["member-a", "member-b"],
    "product": ["member-c"]
  },
  "squads": {
    "dev": {
      "member-a": { "provider": "provider-b", "model": "model-b" }
    },
    "product": {
      "member-c": { "provider": "provider-b", "model": "model-b" }
    }
  },
  "limits": { "maxConcurrentPerRoute": 2 }
}
```

`members` 是成员名册（由 API 维护）；`squads.<kind>.<name>` 是成员实际使用的模型路由，优先于 `defaults`；`limits.maxConcurrentPerRoute` 是同一模型路由的同时在跑成员数上限。插件只负责读写文件。

### 配置 API

HTTP 路由（与面板共用宿主 Web 会话鉴权）：

- `GET /api/squad-dashboard/config`：返回 `{ path, config }`。
- `PUT /api/squad-dashboard/config`：整体替换 `{ defaults, squads, members, limits }`。

模型工具 `squad_config`：

- `action: get`：读取当前配置；
- `action: update`：可选传入 `defaults` / `members` / `squads` / `limits`，未传的段保持原值；传入的段整体替换，合并前先 `get`。

示例 update：

```json
{
  "action": "update",
  "defaults": { "provider": "provider-a", "model": "model-a" },
  "members": { "dev": ["analyst", "backend"] },
  "squads": { "dev": { "analyst": { "provider": "provider-b", "model": "model-b" } } },
  "limits": { "maxConcurrentPerRoute": 2 }
}
```

`squad_config` 只调整名册、模型路由和并发；每个 agent 的角色 prompt 与 skills 属于外部 preset/skills，不在本插件的 API 范围内。

面板成员行的模型徽标优先取会话的 `modelSelection` 投影，投影不可读时回退到配置文件里的路由。

## 远端 Multica 视图（可选）

面板顶部三个页签：**本地 / 远端 / 配置**。

- **远端**：只读监控远端 Multica 运行时的 Agent 与小队执行情况——按工作区分组的小队卡片、成员（状态 / 当前执行摘要 / 真实模型路由）、任务列表。任务列表一行一个 Issue，展示 `identifier`（任务编号）、标题、发起人、创建时间和 Issue 当前状态；状态优先显示项目自定义的 `status_name`，没有时回退到已知状态词（待办 / 进行中 / 评审中 / 已完成 / 阻塞 / 已取消），未知状态原样显示，所以不同项目的工作流不需要插件适配。只展示未进入终态的任务：Multica 会把项目工作流状态归一到 `unstarted` / `started` / `done` / `closed` 四类，`done`（已完成）和 `closed`（已取消、已关闭）不会进入列表。
- 远端数据全部来自 Multica REST API（Bearer token，只读 GET）：`/api/workspaces`、`/api/squads?workspace_id=`、`/api/squads/{id}/members`、`/api/agents?workspace_id=`、`/api/agents/{id}/tasks`，以及用于补齐任务编号 / 发起人 / 创建时间 / 状态的 `/api/workspaces/{id}/members` 与 `/api/issues?workspace_id=&ids=`（按工作区批量查询）。单个查询失败时对应字段降级，任务列表仍会返回。
- **远端连接配置**：配置页底部「远端 Multica」卡片——服务地址、Token（保存后只回显 `***`，留空表示沿用已存 token）、可选工作区限定、`测试连接`（列工作区数）与 `保存连接`。配置写入 `$DSH_HOME/plugins/squad-dashboard/squad-remote.json`（默认 `~/.dsh/plugins/squad-dashboard/squad-remote.json`；文件权限 600；插件 Config `remoteConfigPath` 可改）。
- 不配置地址与 Token 时，远端页签只显示未连接提示，不发起任何请求。
- 远端视图不提供任何写操作；点击成员不会跳转（本地会话跳转仅对本地视图生效）。

## 数据选型

- 小队识别（满足其一即视为小队）：`agentTeams.isEnabled(root)`、preset id 以 `squadPresetPrefix` 开头或出现在 `squadKinds` 别名里、`subagents.listDescendants()` 非空。
- 小队类型：`config.squadKinds` 显式别名优先；否则由 `agentPresets.presetForSession(agent.session)` 返回的 preset id 按前缀推导。
- 成员列表：`subagents.listDescendants(rootSessionId)`。当前事项取目录行的 `label`；成员名取 `name`，否则 `path`；会话 id 取 `id`。
- 本地任务板：仅 `agentTeams.isEnabled` 时读 `agentTeams.listTasks(root)`，失败降级为空数组。成员名下未完成任务的 `subject` 优先于 `label`。
- 远端任务列表：每个成员的 `/api/agents/{id}/tasks` 运行记录先按 Issue 去重（保留最新一次运行，按 `created_at` 倒序），再用工作区批量查询到的 Issue 补齐编号、标题、发起人（优先取运行记录的 `attribution`，缺失时回退到 Issue `creator_id` 对应的工作区成员名）和 `created_at` / `status`。没有 Issue 的运行记录用运行 id 前 8 位作为编号，`completed` 时视为终态；Issue 查询失败时不猜测终态，保留该行。终态判断按 Multica 的 `status_category`（缺失时 `status`）归一成 `done` / `closed`，命中即从成员任务、小队任务和统计计数中移除。
- 会话标题：`sessionTitle.get(agent.session)` 取快照的 `title`。`presetForSession`、`workingDirectory.get`、`sessionTitle.get` 都接收 Session，不接收裸 session id。
- 成员模型：`sessionProjections.snapshot()` 的 `values.modelSelection`；不可读时回退到配置文件。
- 远端队长：`/api/squads/{id}/members` 的 `role` 为 `leader`，或成员的 `member_id`（Agent 类型即 Agent id）命中小队的 `leader_id` 时视为队长。有的工作区把成员 `role` 全留空、只用 `leader_id` 标记队长，两种标记都认，队长行显示皇冠。

## 验证步骤

1. `pnpm install --prod`；
2. Plugins → Add plugin 选择本目录（或 plugin_manager install_bundle），启用后 `list_plugins` 中 `include:squad-dashboard` 为 active 无诊断；
3. 刷新 Web GUI，左侧边栏出现「产研ECC」；打开后标题为「产研ECC仪表盘」，小队卡片标明小队类型，成员行能看到当前事项；
4. 打开「配置」页确认能设置缺省模型、并发上限和每个成员的模型路由，能保存；成员名册通过 `squad_config` 工具或 API 调整。

## 已知限制

- `@Remote`/typert 桥为宿主内部生成代码，第三方插件无法手写，故 Client 走 HTTP 路由取数。
- 轮询间隔 `pollMs` 是快照返回的建议值，Host 不主动推送。
- 单会话读取失败时该条标记 `unavailable`，不保证每个字段都有值。
- 成员当前事项来自子代理目录的 `label`。目录没有 `label`、也没有未完成任务主题时，该行显示「未记录当前事项」，而不是只剩状态。
- 配置页的初始名册来自当前在线小队；没有在线小队时，可手动添加类型和成员名。
- 远端 Token 以文件权限 600 存放在 `$DSH_HOME/plugins/squad-dashboard/squad-remote.json`（默认 `~/.dsh/plugins/squad-dashboard/squad-remote.json`），不走系统凭据库。
- UI 实机验证以用户刷新 GUI 后目测为准。
