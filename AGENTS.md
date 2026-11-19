# dsh-plugins

本仓库用一个 Git 根管理多个彼此独立的 DeepSeek Harness 插件。`dsh-plugins` 只负责收纳和版本管理。插件代码、依赖和忽略规则都放在各自的子目录里。

当前插件：

| 子目录 | 包名 |
| --- | --- |
| `db-browser/` | `@local/db-browser` |
| `kafka-tool/` | `@local/kafka-tool` |

## 目录边界

新增插件时新建一个同级子目录，例如 `my-plugin/`。不要把插件源码、`package.json`、锁文件、`node_modules` 或 `cordis.patch.yml` 放到仓库根目录。

仓库根目录只保留仓库级文件，例如本提示词、仓库说明和根目录自己的 `.gitignore`。根目录不作为插件工程，也不建立把各插件依赖提升到一起的 workspace。

每个插件目录自行维护：

- `package.json` 与 `pnpm-lock.yaml`
- `.gitignore`（至少忽略 `node_modules/`、`*.log`、`.DS_Store`）
- `README.md`
- `cordis.patch.yml`、`index.js`、`client.js`
- `locale/`、`icon.svg`、`test/`

安装依赖、运行测试和修改锁文件，都在该插件目录内执行。改一个插件时不要顺手改另一个插件的清单或依赖。

## 开发前先查重

开发新插件之前，先确认本机 DSH 已安装插件市场 [dsh-market](https://github.com/dsh-market/dsh-market)。未安装时先告诉用户如何安装，不要直接开工。

然后在市场里检索同名、同类和功能接近的插件。只有市场上没有雷同插件，且现有相关插件也无法提供所需功能时，才在本仓库新建插件。只要已有插件能覆盖需求，就停下来，建议用户复用社区版本。

用户明确仍要自己做时，先说明雷同插件的实现思路，再在该思路上做丰富、调整和润色。不要把社区里已经做好的能力从零再写一遍。

## 插件入口

每个插件仍是独立的 DSH 组合包。`package.json` 声明 `dsh.bundle` 与 `dsh.client`，并用 `engines.dsh` 标明已验证的 DSH 版本范围。Host 入口导出 `name`、Schemastery `Config` 和 `apply`。浏览器入口使用包名对应的 lazy factory。

连接、定时器和订阅在插件卸载时由该插件自己的清理函数释放。请求处理和后台任务里的错误留在插件内部：配置不合法时让这个插件加载失败，不要让异常冒出插件、把 DSH 进程打崩。

## 界面主题

只要插件带界面，就必须同时适配 DeepSeek Harness 的浅色和深色主题，并跟随宿主的主题切换，不为某一种主题单独写死一套颜色。

颜色、背景、边框、文字和状态色使用宿主已经提供的 `--dsw-alias-*` 变量，例如 `--dsw-alias-bg-base`、`--dsw-alias-label-primary`、`--dsw-alias-border-l1`。不要用只在浅色或只在深色下才看得清的固定色值作为主配色。宿主切换主题后，插件界面应立刻沿用新的变量值，避免撞色、对比不足或文字看不清。

图标和内联图形同样使用这些变量。确需兜底色时，只把它写在变量后面的回退位置，不能代替变量本身。
