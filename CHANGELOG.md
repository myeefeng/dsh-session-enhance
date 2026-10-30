# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-10-30

### Added

- **工作区行悬停预览：悬停工作区行，右侧展开该工作区的会话列表。** 之前要看某个工作区里有哪些会话，只能先切过去（或开侧边栏），切换本身会离开当前会话。现在在工作区下拉里把鼠标停在任意工作区行上，行右侧立即弹出该工作区的会话列表：
  - 除行内「更多」按钮外与会话下拉同构：置顶优先、其余按更新时间降序、当前会话高亮，行首原生 `StateDot`（运行中空心圆环 / 待审批橙点），行尾相对时间（待审批类状态用「待审批」等文字顶替相对时间，与会话下拉一致）；空工作区显示「该工作区暂无会话」。
  - 点会话行直接切过去（`uiWorkspace.openSession`）并收起工作区下拉；未连接过的工作区上 `openSession` 可能失败，此时兜底走 `openWorkspace` 连接后再补一次，兜底也失败走可见错误提示（不静默）。点行内「更多」按钮、滚动列表、指针离开、按 `Esc`、点面包屑按钮关闭下拉、窗口 resize，都会收起侧栏；「添加工作区」动作行与分隔行不弹侧栏。
  - 悬停有 **120ms 意图延迟**（鼠标沿列表往下划过工作区行时不会一路弹窗），已展开时切换行**立即换内容**；移出有 **200ms 宽限**（跨过 6px 间隙移进侧栏不会误关）。行悬停用 `mouseover` 而非 `mouseenter` —— 只有冒泡事件才能识别「指针从行内移到行尾『更多』按钮」，从而先收起侧栏再开原生菜单。
  - 定位：贴在被悬停行右侧 6px；右边放不下翻到行左侧；窄窗口两侧都放不下时夹进视口（12px 边距）。侧栏卡片与行复用主列表的 `.bst-list` / `.bst-item`，视觉逐像素一致。工作区行补 `aria-haspopup` / `aria-expanded`；展开只响应指针，键盘用户仍走会话下拉。
  - 实现要点（改这块前先看）：侧栏与主列表是两个 portal 兄弟节点，侧栏通过 `panelRef` 参与主列表的「点击外部关闭」判定（否则在侧栏里点空白/滚动条会把整条下拉关掉）；侧栏靠行矩形定位，列表滚动即失效（`onScroll` 立即收起）；开/关计时器在列表关闭、滚动、组件卸载时清掉。
  - 验证：用本地最小 DSH 环境替身（React 18 + 无头 Chromium/CDP，脚本在 `.tmp/`，未入库）跑通 13 个用例 —— 悬停展开、跨间隙进侧栏不关、点会话切换并收起、移开自动收起、点面包屑关闭下拉时侧栏一并消失、空工作区空态、超长标题封顶 360px 省略、420px 窄窗口夹进视口、悬停「添加工作区」不弹、指针移到行尾「更多」按钮时收起、`Esc` 收起、滚动列表收起、会话下拉不受影响。

## [1.6.3] - 2026-10-30

### Fixed

- **面包屑的图标态不再「粘住」：标题刷新后无需切换会话即可恢复文本。** 1.6.2 只收窄了触发条件，判定本身仍然**带记忆**：图标态下文本被移出文档流，量不到「显示文本需要多宽」，旧实现只能记住折叠时的 header 宽度、等它宽回来 +180px 才展开。一旦某次量在错误时机（新会话页首帧、标题刚生成、其它插件的动作刚挂上），面包屑就永久停在图标态 —— 此后窗口变宽、标题变短都不会让它回来，**只有切换会话（组件重挂、状态清零）才恢复**，表现正是「新建会话对话后标题不刷新显示，切一下会话才正常」。
  现在改为**无记忆判定**：每次 `update()` 都先临时摘掉 `.bst-crumb-iconic`（强制同步重排、同一帧内还原，不闪），在「文本可见」的真实布局下量出每一级的可见宽度，再纯函数式地得出结论。没有「上次状态」，布局一变，下一轮（`ResizeObserver` / `resize` / 300ms 轮询）立刻自我纠正。另加防重入标志，避免强制重排触发的 `ResizeObserver` 回调递归。

## [1.6.2] - 2026-10-29

### Fixed

- **窄窗口里工作区名 / 会话名不再被“图标态”吃掉。** 两种情况叠在一起，让「只要顶栏一挤，名称就整体消失」：
  - 兜底规则过激：只要整条面包屑溢出（`el.scrollWidth > el.clientWidth`）就**全部**收成图标。而顶栏还要让位给其它插件的动作（智能体团队 / 标准模式 / 后台任务），窄窗口下面包屑必然被挤窄 —— 此时每一级其实都还有 100px 出头、带着省略号的可读文本，却被判成了图标，用户看到的就是「两个图标、没有名字」。现在只在**真被窗口边缘裁切**时（整行溢出且没有任何一级出现正常的省略号截断）才整体退化为图标兜底；文本仍在按钮内正常省略时一律保留文本。
  - 按钮不会跟着容器收缩：`.bst-crumb`（flex 项）会收缩到 117px，里面的 `.bst-crumb-btn` 却仍按 max-content 停在 180px 并溢出父盒 —— 量出来的 `rowOverflow` 有一部分就是它。给按钮补 `width:100%;box-sizing:border-box`（文本再加 `min-width:0`）后，按钮跟随父盒收缩、文本照常省略号收尾，不再挤到相邻动作上。
  - 顺带把图标态下限 `ICONIC_TEXT_FLOOR` 从 80（≈5 个汉字）降到 32（≈2 个汉字）：只要还能挤出几个字就显示省略号文本，只有真到几个字都放不下时才退化为图标。
  - 实测（复刻宿主 `.header / .titleRow / .titleCluster / .headerActions` 布局，Chromium 无头量取值）：视口 674px 下修复前 `crumbs` 溢出 270/323、两级全判图标；修复后不再溢出（255/255），工作区名与会话名都保留可读的省略号文本（65px / 56px）；视口再窄到 ~530px 才全部退化为图标，~610px 时会话级先退化为图标、工作区名仍可见。

## [1.6.1] - 2026-10-28

### Changed

- **运行中标记改为 DSH 桌面端原生样式**：改用原生 `StateDot`（`@deepseek-ai/dsh-client-ui-primitives`）组件，运行中显示为空心圆环（与侧边栏会话行完全一致），不再使用自绘绿色脉冲点。
- **新增「待审批」状态显示**：当会话存在待处理的审批/计划审核/待回答交互时，左侧显示橙色 `StateDot`（warning），行尾把相对时间替换为「待审批 / 计划待审 / 待回答」文字，对齐原生 `sessionStatuses`（`uiSession.sessionStatus` 的 `pendingInteraction.kind`）。状态来源不变（惰性 `ctx.get('uiSession')`，缺服务时降级为无标记）。

### Docs

- 全面更新文档到当前状态：`README.md` / `README.en.md` 改为「会话增强 / Session Enhance」、安装命令与徽章指向 `dsh-session-enhance`、补充运行中 / 待审批状态与内嵌「会话管理」组件说明；`docs/RELEASE.md` 标注为历史发布清单并更新包名。历史 CHANGELOG 条目保持原样。
- **仓库地址变更**：owner 从 `xinspark` 调整为 `myeefeng`（与 `git remote` 一致）。同步更新 `package.json` 的 `repository` / `homepage` / `bugs`，以及 `README.md` / `README.en.md` 的徽章与安装命令（`github:myeefeng/dsh-session-enhance`）。

## [1.6.0] - 2026-10-28

### Changed

- **项目更名为 `dsh-session-enhance`，插件显示名改为「会话增强」**（原 `dsh-better-session-title` / Better Session Title）。同步更新：`package.json` `name`、cordis 组合行（`id`/`name` 改为 `dsh-session-enhance` 与 `dsh-session-enhance/chat-manager`）、client 模块 id、`locale/{zh,en}.json` 的 `meta.title`（「会话增强」/「Session Enhance」）、README/仓库链接。内嵌组件的宿主路由与「会话管理」显示名不变。

## [1.5.0] - 2026-10-28

### Added

- **面包屑「更多操作 → 永久删除」。** 会话下拉每行的「更多」（ellipsis）菜单新增「永久删除」项（红色 danger），点击弹出二次确认对话框，确认后调用内嵌的 `dsh-better-session-title/chat-manager` 组件的 host 路由 `/plugins/dsh-session-delete/delete`（带 `x-dsh-session-delete-confirmation: delete-session` 头）删除会话，并重载会话/工作区列表、必要时清空主视图。组件被关掉时路由不存在，点击会走统一的失败提示而非静默无反应。
- **运行中会话标记。** 面包屑与会话列表对「运行中」的会话显示一个小圆点（脉冲动画，`prefers-reduced-motion` 下不闪动）；状态来自宿主 `uiSession.sessionStatus`（`Map<sessionId,{running,...}>`），该服务在部分宿主代际上不存在时降级为「无标记」，不进 `inject` 以免整条 web 启动审计失败。
- **内嵌必选组件「会话管理」（`dsh-better-session-title/chat-manager`）。** 把 dsh-chat-manager 的**全部功能**作为本插件的**可开关组件**内嵌进来，组件显示名为「会话管理」（代码位于 `lib/components/chat-manager/`，`package.json` 与 `cordis.patch.yml` 各注册一条行，默认开启、可在 DSH 组件开关里停用）：
  - **host 半**（组件可开关控制）：会话永久删除、归档会话的路由（`/plugins/dsh-session-delete/delete|restore|archive-search`）。
  - **client 半**（并入主插件 `lib/client.js` 的 `registerChatManagerClient`，随主插件加载）：侧边栏会话菜单的「永久删除」项 + 删除确认对话框、侧边栏头部的「已归档会话」入口、设置页「已归档会话」（搜索 / 取消归档 / 永久删除）。
  - 说明：DSH 客户端每个 npm 包仅有**一个** `./client` bundle（由 `dsh-client-modules` 按包名解析），子组件无法自带独立 client 半，故 chat-manager 的 client 功能全部并入本包主 client、在主插件 `apply` 时一并注册。
  - 组件代码以 MIT 许可从 dsh-chat-manager（© WSL043）复制，版权与许可声明随组件保留。

### Changed

- 组件显示名改为「会话管理」，补充 `lib/components/chat-manager/locale/{zh,en}.json` 的 `meta.title/description`。
- `package.json` 的 `exports` 调整为 `./chat-manager`（host 入口）、`./chat-manager/package.json`、`./chat-manager/locale/*.json`；移除不再存在的 `./chat-manager/client`（client 已并入主 client）。`files` 纳入 `lib/components/chat-manager`。

## [1.4.0] - 2026-10-26

### Added

- **新会话页也有面包屑了。** 宿主在新会话时抑制顶栏标题内容（`hideChrome`：`!hideChrome` 才渲染 `titleCluster`），而 `conversation.header.leading` 正是宿主为「会话之前就要有全局导航」预留的空位（scope=root、常驻渲染）—— 于是新会话页顶栏是空的，想看历史会话只能去开侧边栏。插件现在额外在 `conversation.header.leading` 注册一份：显示「工作区 / 新会话」，会话级下拉里列出该工作区的历史会话，点一下直接跳过去，不用开侧边栏。两份面包屑**互斥** —— 有真实会话时 leading 这份返回 `null`，顶栏交给 `header.actions` 那一份，同一时刻只有一条。判定「新会话态」用宿主自己的信号：**主视图保留的是空白会话**（宿主的新会话标记，见其 `mainBlank()`：`session.blank && retainedBy.mainView > 0`）—— 只看「有没有主视图会话」会永远判成有会话（新会话页也保留着那个空白会话），这一份就永远不渲染。注册选项只给 `name`：`conversation.header.leading` 的契约是 `registerOptions: []`，多带 `id` 会让 `single` 槽的占用者落到别的格去，宿主自己的示例同样只给 `name`。

### Fixed

- **「添加工作区」不再报错。** 宿主的目录选择器是「组合能力」，`native`（OS 选择器，只有 `pick`）与 `browse`（应用内浏览，只有 `list` / `createDirectory`）互斥；1.3.0 硬假设「只有 browse」并自建浏览对话框，宿主组合成 `native` 之后 `listDirectory` 被宿主当场拒绝，「添加工作区」必然报 `directory browse failed: directory-picker/unavailable: directoryPicker.list needs the browse capability; the composed picker serves "native"`。现在按宿主的实际组合分流：先调宿主自己的 `pick`（桌面壳下走 `__DSH_DIRECTORY_PICKER__`，与原生 native 流程同款），只有当宿主明确说它提供的是 `browse` 时才退回自建的应用内浏览对话框；能力结论在会话内缓存，不再每次点都先吃一个失败调用。选完目录后建工作区并打开，取消则静默收工，其它失败照旧弹「添加工作区失败」。

## [1.3.1] - 2026-10-19

### Fixed

- **Wording matches the official UI again.** 1.3.0 renamed the workspace action row to 新建工作区 and the session action row to 新建会话; both are back to the native 添加工作区 / 新会话 (and `dialog.pickerErrorTitle` to 添加工作区失败). The `⋯` menu item 分支 is now the native 分支会话.
- **Directory picker reshaped to the native 「选择工作区目录」 dialog.** Titles, buttons and states are taken verbatim from `dsh-client-ui-directory-picker-browse` instead of being invented: breadcrumb path with an 编辑路径 mode, clicking a row enters that folder, the footer submits the current folder with 打开 / 取消, plus 新建文件夹 and 显示隐藏文件; hidden folders stay hidden until toggled, and an oversized listing warns 文件夹过多，仅显示开头部分。 The previous 上一级 / 选择此文件夹 / 输入或粘贴路径后回车 rows are gone.
- **Plugin page metadata.** `locale/zh.json` and `locale/en.json` now provide `meta.title` / `meta.description` (short, one line each) instead of falling back to the long package description, `package.json` declares `icon: "./icon.svg"` (a new 36×36 breadcrumb mark), and `exports` exposes `./locale/*.json` so the host can actually resolve those locale files.

## [1.3.0] - 2026-10-19

### Added

- **Built-in directory picker.** `uiWorkspace.pickDirectory()` throws on profiles where the composed picker only serves the `browse` capability (`directory picker failed: directoryPicker.pick needs the native capability; the composed picker serves "browse"`), which broke "add workspace" completely. The plugin now drives `uiWorkspace.listDirectory` / `createDirectory` itself and renders a native-shaped picker: parent / home / up, breadcrumb path, folder listing, inline "new folder" form, empty and error states. Works with both the browse and the native picker compositions.
- **Native session menu.** The per-session `⋯` menu is now shaped like the native one: 置顶会话 / 重命名 / 分支会话 / 归档会话 / 复制 Session ID, wired to `uiWorkspace.pinSession` / `unpinSession` (pinned first in the list, with the filled pin icon) and to the clipboard for the session id. Each row shows the same shortcut hint as the native menu, read from the `shortcuts` catalog (`session.rename`, `session.fork`, `session.archive`), so hints stay correct if keybindings change.

### Changed

- **Wording follows the native menu again:** the workspace action row is 添加工作区 / Add workspace and the session action row is 新会话 / New session (was 新建工作区 / 新建会话); 分支会话 replaces the old 分支 label.
- **Session list sorted by activity:** pinned sessions first (in pin order), then most recently updated first, instead of the raw `sessionIds` order.
- **Short description on the plugin page:** `locale/zh.json` / `locale/en.json` now carry `meta.title` / `meta.description`, so the plugin list shows 工作区/会话面包屑 · Workspace/session breadcrumb instead of the long README summary.

## [1.2.1] - 2026-10-18

### Fixed

- **Native title visible again (double title) on DSH 0.2.1-rc.2 (DSH NEXT).** The hide-native-title and shrinkable-container rules were anchored on `div[data-conversation-title-row]` / `[data-conversation-header]`, and 0.2.1-rc.2 removed both attributes — the native `<nav>` breadcrumb stayed visible next to ours. New anchors added alongside the legacy ones (kept for 0.2.0-rc.2): the header is `header[data-window-drag]`, the native title `nav` is hidden only when a later sibling layer contains `.bst-crumbs` (`nav:has(~ div .bst-crumbs)`), and the shrinkable-container rule is re-anchored on that same header. No hash-class names are used, so both generations match structurally.

## [1.2.0] - 2026-10-14

### Fixed

- The dropdown is now rendered through a React portal into `document.body`, like the native `Menu`'s `portal` mode. Rendered in place inside the topbar slot it lived inside the header's stacking context, so page content painted over it: an open list had chat content — and a third-party plugin's injected `复制` button — showing on top of it, and its first row could be covered by the app shell's sidebar column.
- The workspace action row no longer reuses the native wording. "Mobile pocket" plugins delete the native add-workspace entries by scanning every `[role=menuitem]`, `[role=option]`, `li`, `button` and `a` for the **exact** labels `添加工作区` / `添加工作区…` / `Add workspace` / `Add workspace…`, then writing `display: none` plus `data-mobile-nav-hide`, and they re-apply it through a `MutationObserver` on every inserted node (measured against `dsh-pocket` 2.11.0, `hideWsEntries`). Our row used the native label, so it was hidden the moment the dropdown opened and read as "the new-workspace entry is missing". It is now `新建工作区` / `New workspace`; the failure dialog title follows (`新建工作区失败` / `New workspace failed`).

### Changed

- **Standalone release.** The plugin is now fully independent: it ships its own bundle patch (which inserts only its own row), declares no dependencies, and nothing depends on it. Installing it makes the breadcrumb always active — there is no external switch any more.

### Removed

- The dsh-basic-right-sidebar sub-plugin coupling, on both sides: the settings bridge here (`window.__BASRS_SETTINGS__` snapshot + `'basrs:settings'` event), the `showBreadcrumb`-driven `enabled` state, and the `.bst-crumbs-off` class plus its style and the matching `:has(.bst-crumbs:not(.bst-crumbs-off))` CSS guard. That plugin no longer ships this one, no longer declares it as a dependency and no longer offers a breadcrumb toggle; it keeps only a CSS exemption so its "hide duplicated topbar elements" rule never hides `.bst-crumbs` when both are installed.

## [1.1.1] - 2026-10-14

### Fixed

- **Breadcrumb actions could be silently dead for an entire app run** — perfect looks, zero reaction. The client half read its services (`workspaces` / `sessions` / `uiWorkspace` / `locale`) with `ctx.get(...)` at `apply` time while `inject` declared only `slots`, so whenever `apply` won the race against those services registering, `undefined` was captured into every handler closure permanently: the crumb and both dropdowns render beautifully from hook data while switch / add-workspace / rename / delete do nothing — no exception, no log line. `inject` now declares all five, and every action reports a visible error instead of returning silently (`dialog.actionErrorTitle` / `dialog.serviceNotReady`). Verified live against a running app: `uiWorkspace.listDirectory`, `workspaces.rename`, `uiWorkspace.openSession` and a real dropdown-row click (workspace switch, then back) all succeed once the services are ready.
- Switching to a workspace whose sessions were never connected in this app run could fail silently: the fast path (open that workspace's most recent session) is followed by the native path — `uiWorkspace.openWorkspace` (connect the workspace, then open its session), the same entry the native `startSession` uses in 0.2.0-rc.2 — instead of ending in a swallowed `catch`.
- Switch / new session / fork / archive swallowed every failure (`catch {}`); they now surface in the error dialog. Adding a workspace also uses `uiWorkspace.openWorkspace` after `workspaces.create`.
- The dropdown could open already scrolled down in a short window, hiding the first action row (`添加工作区`) above the fold and reading as "the new-workspace entry is missing"; the list now resets `scrollTop` on every open.

## [1.1.0] - 2026-10-14

### Added

- Per-level icon fallback: a level shows only its icon once the topbar squeezes its label below a readable width (`ICONIC_TEXT_FLOOR`, ≈5 CJK characters); the full title stays in the tooltip and in the accessible name. A level whose title merely exceeds its own `max-width` cap keeps the truncated text — a wide window never collapses.
- Every level carries an icon — subagent levels use the native lineage switcher's up/down chevrons glyph — so an icon-only chain never leaves a blank, invisible clickable level.
- `aria-label` and `aria-expanded` on every crumb button: a level keeps a readable name in icon form (`display`-hidden text drops out of the accessible name).

### Fixed

- The breadcrumb was cut off instead of scrunched: the topbar container hosting it (`headerActions`) is `flex: 0 0 auto` with `min-width: auto`, so as the topbar narrowed the row overflowed and got clipped at the window edge and the labels were never squeezed — the icon fallback had no premise. An injected rule makes the three hosting containers shrinkable again (so labels ellipsize normally), and the fallback additionally collapses the row whenever it overflows, so the breadcrumb can never be cut off by the topbar.
- The icon fallback could never appear: its trigger measured the header's overflow, but the native header absorbs pressure by collapsing its own chips into an "…" overflow menu and never overflows. The trigger is now "the level's label is squeezed below a readable width" (`ICONIC_TEXT_FLOOR`), evaluated per level, plus the row-overflow fail-safe, with a header-width hysteresis for recovery — so it fires when the topbar is genuinely out of room and holds still (no flapping).
- Hardened the chevron's click path: icons inside a crumb button are `pointer-events: none`, so the arrow and the label share exactly one hit path (the button itself) instead of depending on how the SVG is hit-tested.
- The hover state also marks the chevron, so the dropdown affordance has explicit feedback.

### Changed

- The `/` separators stay visible in icon form, so the hierarchy remains readable at any chain length.

## [1.0.0] - 2026-08-16

### Added

- Initial release as a DSH bundle plugin.
- Replace the native session topbar title with a two-level "Workspace / Session" breadcrumb.
- Workspace dropdown: switch workspaces, add workspace (native directory picker), rename / delete workspace.
- Session dropdown: switch sessions, new session, rename / fork / archive session.
- Row "more" menu (native Menu) whose lifecycle follows the owning dropdown — no orphan menus.
- Rename/delete dialogs via native Modal + Button + Input with IME-safe Enter handling and duplicate-name checks.
- Auto compact mode: collapses to icons when the topbar space is tight (hysteresis).
- Relative-time meta at the row end, covered by the "More" button on hover; touch devices keep the button visible.
- Built-in zh/en dictionaries following the DSH language switch.
