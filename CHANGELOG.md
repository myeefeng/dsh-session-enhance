# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2026-10-28

### Changed

- **运行中标记改为 DSH 桌面端原生样式**：改用原生 `StateDot`（`@deepseek-ai/dsh-client-ui-primitives`）组件，运行中显示为空心圆环（与侧边栏会话行完全一致），不再使用自绘绿色脉冲点。
- **新增「待审批」状态显示**：当会话存在待处理的审批/计划审核/待回答交互时，左侧显示橙色 `StateDot`（warning），行尾把相对时间替换为「待审批 / 计划待审 / 待回答」文字，对齐原生 `sessionStatuses`（`uiSession.sessionStatus` 的 `pendingInteraction.kind`）。状态来源不变（惰性 `ctx.get('uiSession')`，缺服务时降级为无标记）。

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
