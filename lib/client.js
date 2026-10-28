// ============================================================================
// 会话增强（dsh-session-enhance）· 浏览器端（Client）
// ----------------------------------------------------------------------------
// 本文件是插件的浏览器半，通过 UMD 包装注册到 DSH 的 clientModules。
//
// 定位：把会话顶栏中央的原生会话标题，替换为「工作区 / 会话」面包屑，并占据顶栏最前端
// （注册 order -40，排在原生 subagent-catalog/-30、agent-team/-20、agent-preset/-10 之前）。
// 进入子智能体会话时自动扩展为「工作区 / 父会话 / 子智能体会话」：祖先级可点跳回，
// 末级为当前会话；当前工作区按祖先链的根节点判定（子会话自身不一定属于任何工作区）。
//
// 两处注册，互斥，同一时刻顶栏只有一条面包屑：
//   ① conversation.session.header.actions —— 有会话时（order -40，最前端）。
//   ② conversation.header.leading —— **新会话态**时（顶栏新会话页）。
//      宿主在新会话时抑制顶栏标题内容（hideChrome：!hideChrome 才渲染 titleCluster），
//      而 conversation.header.leading 正是宿主为「会话之前就要有全局导航」预留的
//      空位（scope=root、常驻渲染）—— 于是新会话页顶栏是空的，想看历史会话只能开侧边栏。
//      判定「是不是新会话态」用宿主自己的信号：**主视图保留的是空白会话**
//      （宿主的新会话标记，见宿主 mainBlank()：session.blank && retainedBy.mainView > 0）。
//      注册选项只给 name —— 该槽契约是 registerOptions: []，宿主自己的示例同样只给 name。
//
// 折叠（紧凑）模式：空间不足时隐藏文本、只留图标，链有多长都成立，靠三条规矩：
//   ① **每一级都必须有图标** —— 工作区=文件夹、普通会话级=会话字形、子智能体级=原生
//      switcher 的上下双箭头字形。祖先级原先只有文本，隐藏文本后就成了一眼看不见、
//      却仍能点的区域（子智能体会话下最明显）。
//   ② 保留「/」分隔 —— 图标态下层级顺序全靠它读出来（原生 crumbs 同样保留分隔）。
//   ③ 每个按钮都带 aria-label + title —— 文本 display:none 会连带移出可访问名，
//      没有它图标态就成了无名按钮。
// 点击语义：整颗按钮（含右侧箭头）是同一个命中区；按钮内的 svg 一律 pointer-events:none，
//   于是「点箭头」与「点文字」走的是同一条路径，不存在只有箭头失效的中间态。
//
// 复用原生原则：
//   * 下拉列表 —— 自绘弹出层，卡片沿用原生菜单 token（padding 4、圆角 --dsw-radius-lg、
//     shadow --dsw-elevation-prominent、surface --dsw-menu-surface-fill + --dsw-menu-backdrop-filter），
//     行内度量为 min-height 40 / padding 8·10 / 14px·22px / gap 8 —— 与原生 AccountMenu 的
//     [role=menuitem] 一致；**不是** Menu.module.css 的行内度量（那份更紧凑：34 / 6·8 / 13px·20px），
//     后续调整时别照 Menu.module.css 改。
//     原生 Menu 的 itemLabel 带 overflow:hidden 且选中态只有对勾，无法承载
//     「与 hover 一致的整行高亮」，故列表层自绘、视觉与原生完全一致。
//     列表行规范：行内不显示工作区/会话图标（仅「新建工作区」「新建会话」
//     动作行保留图标）；元信息（会话数 / 相对时间）靠行尾；悬停行时元信息
//     被「更多」按钮覆盖（触屏无 hover，则常显按钮、隐藏元信息）。
//   * 行内更多操作 —— 原生 Menu（getAnchorRect 锚定 ellipsis，引用稳定），
//     重命名 / 删除 / 分支 / 归档 全部真实服务调用。
//   * 重命名 / 删除确认 —— 原生 Modal + Button + Input（对齐 ui-workspace：
//     autoFocus、全选、输入法组合 Enter 防误触、重复名校验、错误行）。
//   * 图标 —— 原生 IconXxx（0.2.0-rc.2 命名为 …Regular / …Medium，见下方导入处说明）。
//   * 服务调用 —— 对齐 0.2.0-rc.2 的 ui-workspace：
//       renameWorkspace → workspaces.rename
//       deleteWorkspace → workspaces.delete
//       createWorkspace → workspaces.create
//       pickDirectory   → uiWorkspace.pickDirectory（0.2.0-rc.2 起不在 workspaces 上）
//       connectWorkspace→ uiWorkspace.connectWorkspace
//       openSession     → uiWorkspace.openSession（切换会话 / 新建会话后打开）
//       renameSession   → sessions.using(id,{source:'workspaceOperation'},
//                                        ref => ref.binding.session.rename(title))（{ok,error}）
//       forkSession     → uiWorkspace.forkSession({increaseTitle:true}) → openSession
//       archiveSession  → workspaces.archiveSession（无对话框，直接提交）
//     当前工作区回落：快照已无 recentWorkspaceId，改用 bstRecentWorkspaceId（复刻原生算法）。
//
// 独立插件：本插件自成一体 —— 自带 bundle 补丁（cordis.patch.yml 只插入本插件自己的行），
// 不依赖任何其它插件，也不被任何其它插件依赖；安装即始终生效，没有外部开关。
// 唯一对外约定：`.bst-crumbs` 是类名契约 —— 第三方插件的「隐藏顶栏重复元素」规则按它做豁免，
// **改名会让那些规则转而隐藏本插件的面包屑**。
// ============================================================================
window.__ModuleLoader__.load({
  id: 'dsh-session-enhance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')
    // 下拉列表要 portal 到 document.body：原地渲染会留在顶栏槽位的层叠/裁剪上下文里，
    // 被应用外壳（侧栏列网格）与页面内容（聊天正文等）盖住 —— 原生 Menu 的 portal 同款理由。
    let createPortal = null
    try {
      const reactDom = require('react-dom')
      if (reactDom && typeof reactDom.createPortal === 'function') createPortal = reactDom.createPortal
    } catch { /* 拿不到就退回原地渲染 */ }
    // 原生 UI 组件库：对话框 / 按钮 / 输入框 / 菜单 / 图标
    let {
      Menu, Modal, Button, Input,
      // 0.2.0-rc.2 起图标改为「无尺寸 + 字重后缀」命名（…Regular / …Medium）。
      // 新名默认尺寸与原 …14 / …16 / …20 名一一对应（chevron、queue = 14；archive = 20；
      // 其余 = 16），所以这里只是改名，各调用点无需传 size。
      IconFolderCloseRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular,
      IconNewChatOutlineRegular, IconProjectAddOutlineRegular, IconEditOutlineRegular,
      IconTrashOutlineRegular, IconBranchOutlineRegular, IconArchiveOutlineRegular,
      IconEllipsisOutlineRegular, IconQueueOutlineRegular,
      IconChevronRightOutlineRegular,
      // 会话菜单（与原生菜单同款）：置顶/取消置顶、复制 Session ID
      IconPinOutlineRegular, IconPinFillRegular, IconCopyOutlineRegular,
      // 子智能体层级图标：原生管线的 switcher 字形（上下双箭头）——
      // 原生 conversation.session.header.lineage 的切换器用的就是这个语义，
      // 折叠成图标时它让「这一级是子智能体」一眼可辨，且与下拉箭头（单箭头）不同形。
      IconChevronsUpDownOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    // 完整 primitives 对象：内嵌的会话管理（chat-manager）client 功能直接用 ui.Xxx 取组件。
    // 注意：client 每个包只有一个 ./client bundle，无法给子组件单独一个 client 半，
    // 因此 chat-manager 的全部 client 功能（侧边栏菜单删除、删除框、归档设置、归档按钮）
    // 都并入本文件、在主插件 apply 时一并注册。见文件末尾 registerChatManagerClient。
    const uiPrimitives = require('@deepseek-ai/dsh-client-ui-primitives')
    // 目录对话框的行/面包屑右尖括号：老内核若没有该图标，退回已有的下拉箭头（同形可接受）。
    const IconChevronRight = IconChevronRightOutlineRegular || IconChevronDownOutlineRegular

    // 图标态下限：某一级的标签被顶栏挤到可见宽度小于这个值（≈5 个汉字）时，文本已经读不出
    // 内容，该级改为只显示图标（完整标题仍在 title / aria-label 里，悬停即得）。
    // 注意这是「挤到读不出」的判据，不是「标题比上限长」：后者哪怕窗口再宽也会命中
    // （标题本身就超过 max-width 上限），那正是"这么宽怎么变图标"的来源。
    // 参考量：会话级标签在上限（180px）时的可见宽度约 130px —— 下限必须明显小于它。
    const ICONIC_TEXT_FLOOR = 80

    // ============================================================
    // 本地基础工具：样式注入 / 定时器
    // ============================================================
    const styleTags = []
    function insertStyle(css) {
      if (typeof document === 'undefined') return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-session-enhance'
      tag.textContent = css
      document.head.append(tag)
      styleTags.push(tag)
    }
    function interval(fn, ms) {
      const id = setInterval(fn, ms)
      return () => clearInterval(id)
    }

    // ============================================================
    // 插件字典（zh/en，跟随 DSH 语言切换）
    // ============================================================
    const BST_ZH = {
      'slot.breadcrumb': '工作区/会话',
      'crumb.workspaceNone': '未关联工作区', 'crumb.sessionNone': '新会话', 'crumb.noSiblings': '暂无同级子代理',
      // 文案与原生菜单对齐（用户要求）：「添加工作区」「新会话」「分支会话」。
      // （曾为躲开 dsh-pocket 2.11.0 的按文本隐藏功能而写成「新建工作区」；该插件不在当前组合里，
      //   且用户明确要求原生文案，故改回。）
      'crumb.addWorkspace': '添加工作区', 'crumb.noWorkspaces': '暂无工作区', 'crumb.newSession': '新会话', 'crumb.noSessions': '当前工作区暂无会话',
      'crumb.rename': '重命名', 'crumb.remove': '删除工作区', 'crumb.fork': '分支会话', 'crumb.archive': '归档会话',
      'crumb.pin': '置顶会话', 'crumb.unpin': '取消置顶', 'crumb.copySessionId': '复制 Session ID',
      'crumb.permanentDelete': '永久删除',
      'crumb.running': '运行中',
      // 会话状态标签（对齐原生 dsh-client-ui-workspace status.*）
      'status.running': '运行中', 'status.pendingApproval': '待审批', 'status.pendingPlan': '计划待审', 'status.pendingAnswer': '待回答', 'status.completed': '已完成', 'status.idle': '空闲',
      // 目录浏览对话框：逐字对齐原生 dsh-client-ui-directory-picker-browse 的字典
      // （browser.title/home/newFolder/folderName/createIn/untitledFolder/create/cancel/open/editPath/loading/truncated/showHidden）
      'picker.title': '选择工作区目录', 'picker.home': '主目录', 'picker.empty': '（没有子文件夹）',
      'picker.newFolder': '新建文件夹', 'picker.folderName': '文件夹名称', 'picker.create': '创建',
      'picker.createIn': '在"{name}"中新建文件夹', 'picker.untitledFolder': '未命名文件夹',
      'picker.open': '打开', 'picker.cancel': '取消', 'picker.editPath': '编辑路径',
      'picker.loading': '加载中…', 'picker.truncated': '文件夹过多，仅显示开头部分。', 'picker.showHidden': '显示隐藏文件',
      'menu.more': '更多',
      'dialog.renameWsTitle': '重命名工作区', 'dialog.renameWsPlaceholder': '工作区名称', 'dialog.renameWsDuplicate': '已存在同名工作区',
      'dialog.renameSessionTitle': '重命名会话', 'dialog.renameSessionPlaceholder': '会话标题',
      'dialog.deleteWsTitle': '删除工作区', 'dialog.deleteWsBody': '确定删除工作区「{name}」吗？其会话将移入未分组。此操作不可撤销。',
      'dialog.deleteSessionTitle': '永久删除会话？', 'dialog.deleteSessionBody': '本机会话记录将永久删除，无法恢复。运行中的任务会先停止。',
      'dialog.permanentDeleteConfirm': '确认永久删除',
      'dialog.pickerErrorTitle': '添加工作区失败', 'dialog.close': '关闭',
      'dialog.actionErrorTitle': '操作失败',
      'dialog.serviceNotReady': '界面服务尚未就绪（工作区/会话控制器还没连上），请稍后重试。',
      'dialog.confirm': '确定', 'dialog.cancel': '取消',
      'dialog.busy': '处理中…', 'dialog.failed': '操作失败：{error}',
      'rel.justNow': '刚刚', 'rel.minutes': '{n}分钟', 'rel.hours': '{n}小时', 'rel.days': '{n}天', 'rel.months': '{n}个月', 'rel.years': '{n}年',
    }
    const BST_EN = {
      'slot.breadcrumb': 'Workspace/Session',
      'crumb.workspaceNone': 'No workspace', 'crumb.sessionNone': 'New session', 'crumb.noSiblings': 'No sibling subagents',
      // Match the native menu wording (see the zh dictionary).
      'crumb.addWorkspace': 'Add workspace', 'crumb.noWorkspaces': 'No workspaces', 'crumb.newSession': 'New session', 'crumb.noSessions': 'No sessions in this workspace',
      'crumb.rename': 'Rename', 'crumb.remove': 'Delete workspace', 'crumb.fork': 'Fork session', 'crumb.archive': 'Archive session',
      'crumb.pin': 'Pin session', 'crumb.unpin': 'Unpin session', 'crumb.copySessionId': 'Copy session ID',
      'crumb.permanentDelete': 'Delete permanently',
      'crumb.running': 'Running',
      'status.running': 'Running', 'status.pendingApproval': 'Approval', 'status.pendingPlan': 'Plan review', 'status.pendingAnswer': 'Answer', 'status.completed': 'Completed', 'status.idle': 'Idle',
      'picker.title': 'Select a workspace folder', 'picker.home': 'Home', 'picker.empty': '(no subfolders)',
      'picker.newFolder': 'New folder', 'picker.folderName': 'Folder name', 'picker.create': 'Create',
      'picker.createIn': 'New folder in "{name}"', 'picker.untitledFolder': 'Untitled folder',
      'picker.open': 'Open', 'picker.cancel': 'Cancel', 'picker.editPath': 'Edit path',
      'picker.loading': 'Loading…', 'picker.truncated': 'Too many folders to list; only the beginning is shown.', 'picker.showHidden': 'Show hidden files',
      'menu.more': 'More',
      'dialog.renameWsTitle': 'Rename workspace', 'dialog.renameWsPlaceholder': 'Workspace name', 'dialog.renameWsDuplicate': 'A workspace with this name already exists',
      'dialog.renameSessionTitle': 'Rename session', 'dialog.renameSessionPlaceholder': 'Session title',
      'dialog.deleteWsTitle': 'Delete workspace', 'dialog.deleteWsBody': 'Delete workspace "{name}"? Its sessions move to the ungrouped list. This cannot be undone.',
      'dialog.deleteSessionTitle': 'Permanently delete session?', 'dialog.deleteSessionBody': 'The local session record will be permanently deleted and cannot be recovered. Running work is stopped first.',
      'dialog.permanentDeleteConfirm': 'Confirm permanent deletion',
      'dialog.pickerErrorTitle': 'Add workspace failed', 'dialog.close': 'Close',
      'dialog.actionErrorTitle': 'Action failed',
      'dialog.serviceNotReady': 'The UI services are not ready yet (workspace/session controller still connecting). Please retry in a moment.',
      'dialog.confirm': 'Confirm', 'dialog.cancel': 'Cancel',
      'dialog.busy': 'Working…', 'dialog.failed': 'Action failed: {error}',
      'rel.justNow': 'just now', 'rel.minutes': '{n}m', 'rel.hours': '{n}h', 'rel.days': '{n}d', 'rel.months': '{n}mo', 'rel.years': '{n}y',
    }

    // ============================================================
    // 内嵌会话管理（chat-manager）client 功能
    // ------------------------------------------------------------
    // 来源：dsh-chat-manager（MIT © WSL043）的 lib/client.js。原样搬入本文件并随主插件
    // apply 一并注册。提供「剩下的所有功能」：
    //   ① 侧边栏会话菜单里的「永久删除」项（sidebar.workspaces.session.menu.item）；
    //   ② 永久删除确认对话框（shell.overlay）；
    //   ③ 侧边栏头部的「已归档会话」入口（sidebar.workspaces.header.action）；
    //   ④ 设置页「已归档会话」：搜索 / 取消归档 / 永久删除（settings.section）。
    // host 侧对应的删除/归档路由由独立可开关组件 dsh-session-enhance/chat-manager 提供。
    function registerChatManagerClient(ctx, React, ui) {
      const h = React.createElement;
      // ---------- ① 会话菜单「永久删除」+ ② 删除确认框 ----------
      (function registerOfficialSessionActions(ctx, React, ui) {
        const listeners = new Set()
        let state = { target: null, busy: false, error: '' }, disposed = false
        const controller = new AbortController()
        const publish = value => {
          if (disposed) return
          state = { ...state, ...value }
          for (const listener of listeners) listener()
        }
        const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
        const snapshot = () => state
        const text = (zh, en) => ctx.locale.getSnapshot().active === 'zh' ? zh : en
        const danger = { color: 'var(--dsw-alias-state-error-primary)' }
        function DeleteMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
          const [, closeMenu] = useMenuOpenState()
          return h(ui.MenuItemButton, {
            danger: true,
            icon: h(ui.IconTrashOutlineRegular, {}),
            onSelect: () => {
              closeMenu(false)
              if (!disposed && !state.busy) publish({ target: { id: sessionId, title: displayTitle || sessionId }, error: '' })
            },
          }, text('永久删除', 'Delete permanently'))
        }
        async function confirm() {
          if (disposed || state.busy || !state.target) return
          const target = state.target
          publish({ busy: true, error: '' })
          try {
            const response = await fetch('/plugins/dsh-session-delete/delete', {
              method: 'POST', signal: controller.signal,
              headers: { 'content-type': 'application/json', 'x-dsh-session-delete-confirmation': 'delete-session' },
              body: JSON.stringify({ sessionId: target.id }),
            })
            const result = await response.json()
            if (!response.ok || result?.ok !== true) throw Error(result?.error?.message || `HTTP ${response.status}`)
            if (disposed) return
            const sessionsSvc = ctx.get('sessions'), workspacesSvc = ctx.get('workspaces')
            const workspace = ctx.get('uiWorkspace')
            if (workspace?.selection?.getSnapshot?.().sessionId === target.id) workspace.clearMain()
            const refreshed = await Promise.allSettled([
              typeof sessionsSvc.refresh === 'function' ? sessionsSvc.refresh() : Promise.resolve(),
              typeof workspacesSvc.refresh === 'function' ? workspacesSvc.refresh() : Promise.resolve(),
            ])
            publish({ target: null })
            for (const item of refreshed) if (item.status === 'rejected') console.warn('Session deleted; list refresh failed:', item.reason)
          } catch (error) { publish({ error: error.message || String(error) }) }
          finally { publish({ busy: false }) }
        }
        function DeleteDialog() {
          const current = React.useSyncExternalStore(subscribe, snapshot, snapshot)
          if (!current.target) return null
          const close = () => { if (!state.busy) publish({ target: null, error: '' }) }
          return h(ui.Modal, {
            open: true, onClose: close, closeLabel: text('取消', 'Cancel'),
            title: text('永久删除会话？', 'Permanently delete session?'),
            description: text('本机会话记录将永久删除，无法恢复。运行中的任务会先停止。', 'The local session will be permanently deleted. Running work will be stopped first.'),
            footer: h('div', { style: { display: 'flex', gap: 8 } },
              h(ui.Button, { variant: 'outline', disabled: current.busy, onClick: close }, text('取消', 'Cancel')),
              h(ui.Button, { variant: 'outline', style: danger, disabled: current.busy, onClick: confirm },
                current.busy ? text('正在删除…', 'Deleting…') : text('确认永久删除', 'Confirm permanent deletion'))),
          }, h('p', null, current.target.title), current.error && h('p', { role: 'alert' }, current.error))
        }
        ctx.effect(() => () => {
          disposed = true
          controller.abort()
          listeners.clear()
        }, 'chat-manager: session deletion lifecycle')
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item', id: 'dsh-chat-manager.delete', order: 500,
        }, DeleteMenuItem))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'dsh-chat-manager.delete-dialog',
        }, DeleteDialog))
        function ArchiveShortcut({ className }) {
          return h('button', {
            type: 'button', id: 'archived-sessions', className,
            title: text('已归档会话', 'Archived sessions'),
            'aria-label': text('已归档会话', 'Archived sessions'),
            onClick: () => window.__DSH_PORTABLE_SETTINGS__?.open('archived-sessions'),
          }, h(ui.IconArchiveOutlineRegular, { size: 16 }))
        }
        // ③ 侧边栏头部的「已归档会话」入口
        ctx.slots.inject('sidebar.workspaces.header.action', () => ctx.slots.register({
          name: 'sidebar.workspaces.header.action', id: 'dsh-chat-manager.archives',
        }, ArchiveShortcut))
      })(ctx, React, ui);

      // ---------- ④ 设置页「已归档会话」：搜索 / 取消归档 / 永久删除 ----------
      (function registerArchiveSettings(ctx, React, ui, dangerClass, options = {}) {
        const text = (zh, en) => ctx.locale.getSnapshot().active === 'zh' ? zh : en
        const service = (name, direct) => {
          if (direct !== undefined) return direct
          if (typeof ctx.get !== 'function') return undefined
          try { return ctx.get(name) } catch { return undefined }
        }
        async function request(action, sessionId) {
          const response = await fetch(`/plugins/dsh-session-delete/${action}`, {
            method: 'POST', headers: { 'content-type': 'application/json',
              ...(action === 'delete' ? { 'x-dsh-session-delete-confirmation': 'delete-session' }
                : { 'x-dsh-session-manager-action': 'restore-session' }) },
            body: JSON.stringify({ sessionId }),
          })
          const body = await response.json()
          if (!response.ok || body?.ok !== true) throw Error(body?.error?.message || `HTTP ${response.status}`)
          const sessionsSvc = service('sessions')
          const workspacesSvc = service('workspaces')
          const uiWorkspace = service('uiWorkspace')
          const snap = sessionsSvc?.list?.getSnapshot?.() || {}
          const current = uiWorkspace?.selection?.getSnapshot?.().sessionId ?? snap.current
            ?? Object.values(snap.byId || {}).find(summary => summary?.id === sessionId
              && (summary.retainedBy?.mainView ?? 0) > 0)?.id
          if (action === 'delete' && current === sessionId) {
            if (typeof sessionsSvc?.clear === 'function') sessionsSvc.clear()
            else if (typeof uiWorkspace?.clearMain === 'function') uiWorkspace.clearMain()
          }
          const refreshes = await Promise.allSettled([
            typeof sessionsSvc?.refresh === 'function' ? sessionsSvc.refresh() : Promise.resolve(),
            typeof workspacesSvc?.refresh === 'function' ? workspacesSvc.refresh() : Promise.resolve(),
          ])
          for (const result of refreshes) if (result.status === 'rejected') console.warn('Archive action succeeded; list refresh failed:', result.reason)
        }
        function ArchiveSettings({ useSessions, useWorkspaces }) {
          const sessionsSvc = useSessions(s => s)
          const workspacesSvc = useWorkspaces(s => s)
          const [query, setQuery] = React.useState('')
          const [target, setTarget] = React.useState(null)
          const [busy, setBusy] = React.useState(false)
          const [error, setError] = React.useState('')
          const [matches, setMatches] = React.useState([])
          const normalized = query.trim().toLowerCase()
          React.useEffect(() => {
            setMatches([])
            if (!normalized) return
            const abort = new AbortController()
            const timer = setTimeout(async () => {
              try {
                const response = await fetch('/plugins/dsh-session-delete/archive-search', {
                  method: 'POST', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ query: normalized }), signal: abort.signal,
                })
                const body = await response.json()
                if (!response.ok || !body.ok) throw Error(body?.error?.message || `HTTP ${response.status}`)
                if (!abort.signal.aborted) setMatches(body.value.items)
              } catch (reason) { if (!abort.signal.aborted) setError(String(reason.message || reason)) }
            }, 250)
            return () => { clearTimeout(timer); abort.abort() }
          }, [normalized])
          const owners = new Map()
          for (const workspace of workspacesSvc.items) for (const id of workspace.sessionIds) owners.set(id, workspace.title)
          const rows = [...workspacesSvc.archivedSessionIds].reverse().map(id => ({
            id, title: sessionsSvc.byId[id]?.displayTitle || id,
            workspace: owners.get(id) || text('未分组', 'Ungrouped'),
          })).filter(row => !normalized || `${row.title} ${row.workspace}`.toLowerCase().includes(normalized)
            || matches.some(match => match.sessionId === row.id))
          async function perform(action, row) {
            if (busy) return
            setBusy(true); setError('')
            try { await request(action, row.id); setTarget(null) }
            catch (reason) { setError(String(reason.message || reason)) }
            finally { setBusy(false) }
          }
          const close = () => { if (!busy) setTarget(null) }
          const card = { border: '.5px solid var(--dsw-alias-settings-card-stroke)', background: 'var(--dsw-alias-settings-card-fill)', borderRadius: 'var(--dsw-radius-xl)', padding: '0 14px' }
          return h('div', { style: { display: 'grid', gap: 16 } },
            h('div', { style: { display: 'grid', gap: 10 } },
              h('h2', { style: { margin: 0, color: 'var(--dsw-alias-label-primary)', fontSize: 16, fontWeight: 500, lineHeight: '24px' } }, text('已归档会话', 'Archived sessions')),
              h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 14, lineHeight: '22px' } },
                text('在这里搜索、取消归档或永久删除会话。', 'Search, unarchive or permanently delete sessions here.'))),
            h('input', { type: 'search', value: query, maxLength: 500,
              'aria-label': text('搜索已归档会话', 'Search archived sessions'),
              placeholder: text('搜索名称、工作区或聊天内容', 'Search names, workspaces or messages'),
              onChange: e => { setQuery(e.target.value); setError('') },
              style: { width: '100%', boxSizing: 'border-box', height: 36, padding: '0 14px', borderRadius: 'var(--dsw-radius-md)', fontSize: 14, lineHeight: '22px',
                background: 'var(--dsw-alias-bg-base)', color: 'inherit', border: '1px solid var(--dsw-alias-border-l2)' } }),
            error && h('p', { role: 'alert', style: { margin: 0, color: 'var(--dsw-alias-state-error-primary)', fontSize: 14, lineHeight: '22px' } }, error),
            rows.length === 0 && h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 14, lineHeight: '22px' } }, text('暂无匹配的归档会话', 'No matching archived sessions')),
            rows.length > 0 && h('div', { style: card },
              ...rows.map((row, index) => h('div', { key: row.id, style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '16px 0',
                borderBottom: index === rows.length - 1 ? 'none' : '.5px solid var(--dsw-alias-border-l2)' } },
                h('div', { style: { flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' } },
                  h('div', { style: { fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' } }, row.title),
                  h('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } }, row.workspace)),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 'auto', maxWidth: '100%' } },
                  h(ui.Button, { variant: 'outline', size: 'sm', disabled: busy,
                    onClick: () => perform('restore', row), 'aria-label': text('取消归档 ', 'Unarchive ') + row.title }, text('取消归档', 'Unarchive')),
                  h(ui.Button, { variant: 'outline', size: 'sm', disabled: busy,
                    className: dangerClass, onClick: () => { setTarget(row); setError('') }, 'aria-label': text('永久删除 ', 'Delete permanently ') + row.title }, text('永久删除', 'Delete permanently')))))),
            h(ui.Modal, { open: target !== null, onClose: close, closeLabel: text('取消', 'Cancel'),
              title: text('永久删除会话？', 'Permanently delete session?'),
              description: text('删除后无法恢复。', 'This cannot be undone.'),
              footer: h('div', { style: { display: 'flex', gap: 8 } },
                h(ui.Button, { variant: 'outline', disabled: busy, onClick: close }, text('取消', 'Cancel')),
                h(ui.Button, { variant: 'outline', className: dangerClass, disabled: busy || !target, onClick: () => perform('delete', target) }, text('确认永久删除', 'Confirm permanent deletion'))) },
              h('p', null, target?.title), error && h('p', { role: 'alert' }, error)))
        }
        let registered = false
        const register = () => {
          if (registered || (!options.always && typeof window.__DSH_PORTABLE_SETTINGS__?.open !== 'function')) return
          registered = true
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section', id: 'archived-sessions', priority: -10, order: 25,
            label: () => text('已归档会话', 'Archived sessions'),
          }, ArchiveSettings))
        }
        ctx.effect(() => {
          window.addEventListener('dsh-portable/settings-ready', register)
          register()
          return () => window.removeEventListener('dsh-portable/settings-ready', register)
        }, 'chat-manager: unified archive settings')
      })(ctx, React, ui, 'dsh-chat-manager-delete', { always: true });

      // 归档危险按钮配色（原 chat-manager 的 style 效果）
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = '.dsh-chat-manager-delete:not(:disabled){color:var(--dsw-alias-state-error-primary)}'
        document.head.appendChild(style)
        return () => style.remove()
      }, 'chat-manager: archive action style')
    }

    module.exports = {
      name: '会话增强',
      // cordis 级依赖声明：必须等这些服务就绪再 apply。
      // ① 少了 `slots`，apply 会在槽位系统就绪前执行，`slots.inject(key, cb)` 的回调**永不触发**
      //    ——插件静默不注册、界面什么都不显示，且全链路没有任何报错。
      // ② 少了 workspaces / sessions / uiWorkspace / locale，apply 可能在这些服务注册前跑完：
      //    下面 `ctx.get(...)` 拿到的是 undefined，而 apply 只执行一次 —— 于是这层 undefined
      //    被**永久捕获**进所有事件处理闭包，表现是「面包屑外观完全正常，但下拉里的
      //    切换 / 新建 / 重命名 / 删除 全部点了没反应」，既无异常也无日志。
      //    官方/第三方客户端插件都声明各自的服务依赖；新增服务依赖时同步加进这里。
      //    shortcuts 只用于「更多」菜单里的快捷键提示：缺了它菜单照常工作（只是没有按键提示），
      //    所以加进 inject 之后仍按 undefined 容错。
      inject: ['slots', 'workspaces', 'sessions', 'uiWorkspace', 'locale', 'shortcuts'],
      apply(ctx) {
        ctx.effect(() => () => { for (const tag of styleTags.splice(0)) tag.remove() }, 'bst: styles')
        const slots = ctx.get('slots')
        if (slots === undefined) return
        const workspaces = ctx.get('workspaces')
        const sessions = ctx.get('sessions')
        // 0.2.0-rc.2：目录选择器与「打开会话 / 打开工作区」搬到 uiWorkspace 服务；
        // workspaces / sessions 只保留列表与 CRUD（rename / delete / create / fork / binding 仍在）。
        // 上面 inject 已保证这四个服务在 apply 前就绪；万一某天组合里确实缺了，
        // 各动作会走 fail('dialog.serviceNotReady') 给出可见错误，而不是静默不执行。
        const uiWorkspace = ctx.get('uiWorkspace')
        const locale = ctx.get('locale')
        // 「更多」菜单的快捷键提示：catalog = { getSnapshot(): rows, subscribe(listener) }，
        // rows 行形如 { id, label, keys: ['Ctrl','+','Alt','+','G'], aria: 'Control+Alt+G' }。
        // 与原生会话菜单同源（session.rename / session.fork / session.archive）。
        const shortcuts = ctx.get('shortcuts')
        const shortcutCatalog = shortcuts !== undefined && shortcuts.catalog ? shortcuts.catalog : null
        function useShortcut(id) {
          return React.useSyncExternalStore(
            shortcutCatalog !== null ? shortcutCatalog.subscribe : (() => () => {}),
            () => {
              if (shortcutCatalog === null) return undefined
              const rows = shortcutCatalog.getSnapshot()
              return rows.find((row) => row.id === id)
            },
          )
        }

        // ---------- 字典与语言切换 ----------
        const bstT = (key, params) => {
          const dict = locale !== undefined ? locale.bind('better-session-title') : null
          if (dict !== null) {
            const text = dict(key, params)
            if (text !== key) return text
          }
          const zhText = BST_ZH[key]
          if (zhText === undefined) return key
          if (!params) return zhText
          return zhText.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m))
        }
        if (locale !== undefined) {
          try { locale.register('better-session-title', { zh: BST_ZH, en: BST_EN }) } catch { /* 已注册或服务受限 */ }
        }
        function useBstLocale() {
          const [, force] = React.useReducer((x) => x + 1, 0)
          React.useEffect(() => {
            const disposers = []
            if (locale && typeof locale.subscribe === 'function') {
              disposers.push(locale.subscribe(() => force()))
            }
            return () => { for (const d of disposers) { try { d() } catch { /* ignore */ } } }
          }, [])
          return bstT
        }

        // ---------- 会话状态（复用宿主 uiSession.sessionStatus，对齐原生 sessionStatuses） ----------
        // 0.1.6-alpha.2 起状态来源是 uiSession.sessionStatus：Map<sessionId,{running,pendingInteraction,completionUnread}>。
        // 该服务在部分宿主代际上不存在，因此**不**放进 inject，改用 ctx.get 惰性读取（缺了降级为「无状态」不报错）。
        // 返回 Map<sessionId, {state, trailingLabel}>：
        //   state ∈ 'warning'(待审批/待计划审核/待回答) | 'ongoing'(运行中) | 'done'(完成未读)
        //   trailingLabel 仅待审批类有（原生侧栏把行尾相对时间换成「待审批」等文字）。
        function isStoreLike(s) {
          return !!s && typeof s.getSnapshot === 'function' && typeof s.subscribe === 'function'
        }
        function pendingKindOf(pi) {
          const kind = pi && pi.kind
          return (kind === 'approval' || kind === 'plan-review' || kind === 'question') ? kind : undefined
        }
        function statusOf(value) {
          const kind = pendingKindOf(value && value.pendingInteraction)
          if (kind === 'approval') return { state: 'warning', trailingLabel: bstT('status.pendingApproval') }
          if (kind === 'plan-review') return { state: 'warning', trailingLabel: bstT('status.pendingPlan') }
          if (kind === 'question') return { state: 'warning', trailingLabel: bstT('status.pendingAnswer') }
          if (value && value.running) return { state: 'ongoing' }
          if (value && value.completionUnread === true) return { state: 'done' }
          return undefined // idle → 不显示标记
        }
        function useSessionStatuses() {
          const [statuses, setStatuses] = React.useState(() => new Map())
          React.useEffect(() => {
            let store = null
            try {
              const svc = ctx.get('uiSession')
              if (svc && isStoreLike(svc.sessionStatus)) store = svc.sessionStatus
              else if (svc && isStoreLike(svc.pendingInteractions)) store = svc.pendingInteractions
            } catch { store = null }
            if (!store) return undefined
            const same = (a, b) => {
              if (a.size !== b.size) return false
              for (const [k, v] of b) {
                const p = a.get(k)
                if (!p || p.state !== v.state || p.trailingLabel !== v.trailingLabel) return false
              }
              return true
            }
            const sync = () => {
              try {
                const snap = store.getSnapshot()
                const next = new Map()
                if (snap && typeof snap.forEach === 'function') {
                  snap.forEach((value, sid) => {
                    const st = statusOf(value)
                    if (st) next.set(sid, st)
                  })
                }
                setStatuses((prev) => (same(prev, next) ? prev : next))
              } catch { /* ignore transient snapshot errors */ }
            }
            sync()
            const unsub = store.subscribe(sync)
            return () => { try { unsub() } catch { /* ignore */ } }
          }, [])
          return statuses
        }

        // ---------- 原生侧栏行内相对时间（tree.ts relativeTime + locales） ----------
        function fmtRel(ms) {
          if (typeof ms !== 'number' || Number.isNaN(ms)) return ''
          const diff = Math.max(0, Date.now() - ms)
          const MIN = 60000, HOUR = 3600000, DAY = 86400000
          if (diff < MIN) return bstT('rel.justNow')
          if (diff < HOUR) return bstT('rel.minutes', { n: Math.floor(diff / MIN) })
          if (diff < DAY) return bstT('rel.hours', { n: Math.floor(diff / HOUR) })
          if (diff < 30 * DAY) return bstT('rel.days', { n: Math.floor(diff / DAY) })
          if (diff < 365 * DAY) return bstT('rel.months', { n: Math.floor(diff / (30 * DAY)) })
          return bstT('rel.years', { n: Math.floor(diff / (365 * DAY)) })
        }

        // 原生 recentWorkspace(workspaces, sessions) 等价实现（0.2.0-rc.2 已移除快照字段
        // recentWorkspaceId）：取「最近更新会话」最大的工作区；无会话的工作区回落 createdAt。
        function bstRecentWorkspaceId(items, byId) {
          let selected
          let selectedTime = -Infinity
          for (const w of items) {
            let latest = -Infinity
            for (const id of w.sessionIds) {
              const s = byId[id]
              if (s !== undefined && typeof s.updatedAt === 'number') latest = Math.max(latest, s.updatedAt)
            }
            if (latest === -Infinity) latest = Date.parse(w.createdAt) || 0
            if (selected === undefined || latest > selectedTime) { selected = w.workspaceId; selectedTime = latest }
          }
          return selected
        }

        // 会话链（复刻 0.2.0-rc.2 原生 deriveAncestry）：
        //   普通会话 → [自己]；子智能体会话 → [根祖先, …, 自己]（沿 parentId 上溯到非 subagent 为止）。
        // 根祖先用于判定「当前工作区」——子智能体会话不一定出现在任何工作区的 sessionIds 里。
        function bstSessionChain(byId, id) {
          const chain = []
          const seen = new Set()
          let cursor = id
          while (cursor !== undefined) {
            if (seen.has(cursor)) break
            seen.add(cursor)
            const s = byId[cursor]
            if (s === undefined) break
            chain.unshift({
              id: s.id,
              title: s.displayTitle || s.id,
              subagent: s.origin === 'subagent',
            })
            if (s.origin !== 'subagent') break
            cursor = s.parentId
          }
          return chain
        }

        // ---------- 自绘下拉列表（样式逐值复刻原生 Menu.module.css） ----------
        // items: [{ id, icon?, label, meta?, selected?, disabled?, actions? }]（actions = 更多菜单项）
        // actions: [{ id, label, icon?, danger?, action }]
        function BstList({ open, anchorEl, items, onSelect, onClose, onMore, sessionStatuses }) {
          const [pos, setPos] = React.useState(null)
          const listRef = React.useRef(null)
          // onClose 走 ref：调用方每次渲染传新箭头函数，但监听器只在 open/anchorEl
          // 变化时重绑，避免每渲染一次就 remove/addEventListener 一次。
          const onCloseRef = React.useRef(onClose)
          onCloseRef.current = onClose
          // 定位：锚定面包屑按钮下方，视口边缘避让（12px 边距）
          React.useLayoutEffect(() => {
            if (!open || !anchorEl) { setPos(null); return }
            const r = anchorEl.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            const MARGIN = 12
            const el = listRef.current
            const lw = el ? el.offsetWidth : 0
            const lh = el ? el.offsetHeight : 0
            // 每次打开都回到列表顶部：列表是滚动容器（max-height + overflow-y），
            // 一旦残留非 0 的 scrollTop，第一行（「新建工作区」/「新建会话」动作行）
            // 就会被滚出可视区 —— 表现为「下拉里缺少新建工作区」。
            if (el && el.scrollTop !== 0) el.scrollTop = 0
            let x = r.left
            let y = r.bottom + 4
            // 底部空间不足时向上展开
            if (y + lh > vh - MARGIN && r.top - lh - 4 > MARGIN) y = r.top - lh - 4
            if (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN)
            if (lh > 0) y = Math.min(Math.max(y, MARGIN), vh - lh - MARGIN)
            setPos({ left: x, top: y })
          }, [open, anchorEl])
          // 关闭：点击列表外 / Escape
          React.useEffect(() => {
            if (!open) return
            function onClick(e) {
              // 列表内、锚按钮上不关闭（锚按钮由自身的 click 做 toggle）
              if (listRef.current && listRef.current.contains(e.target)) return
              if (anchorEl && anchorEl.contains(e.target)) return
              onCloseRef.current()
            }
            function onKeyDown(e) {
              if (e.key === 'Escape') onCloseRef.current()
            }
            // 外部关闭必须监听 click 而非 pointerdown/mousedown：pointerdown/
            // mousedown 先于 click 派发，若此时关闭列表（卸载），行内按钮或
            // 悬浮菜单项的 click 将永远丢失——实测点击更多菜单项时列表被提前
            // 卸载、更多菜单随之关闭、重命名按钮消失，onSelect 不执行，
            // 对话框永不弹出。click 派发时目标元素必然还活着：行/菜单项的
            // onClick 先执行，其 stopPropagation 阻止 click 冒泡到 document
            // （悬浮菜单项不误关列表），未阻止的列表外点击才正常关闭。
            document.addEventListener('click', onClick)
            document.addEventListener('keydown', onKeyDown)
            return () => {
              document.removeEventListener('click', onClick)
              document.removeEventListener('keydown', onKeyDown)
            }
          }, [open, anchorEl])
          if (!open || !pos) return null
          const listEl = React.createElement('div', {
            ref: listRef, className: 'bst-list', style: pos, role: 'menu',
          },
            items.map((it, idx) => it.separator
              ? React.createElement('div', { key: 'sep' + idx, className: 'bst-list-sep', role: 'separator' })
              : React.createElement('button', {
                  key: it.id, type: 'button', role: 'menuitem', className: 'bst-item' + (it.selected ? ' bst-item-selected' : ''),
                  disabled: it.disabled, onClick: () => onSelect(it.id),
                },
                  it.icon ? React.createElement('span', { className: 'bst-item-icon' }, it.icon) : null,
                  React.createElement('span', { className: 'bst-item-main' },
                    React.createElement('span', { className: 'bst-item-title' }, it.label),
                    (sessionStatuses && sessionStatuses.has(it.id))
                      ? React.createElement(uiPrimitives.StateDot, { state: sessionStatuses.get(it.id).state })
                      : null,
                    (sessionStatuses && sessionStatuses.get(it.id) && sessionStatuses.get(it.id).trailingLabel)
                      ? React.createElement('span', { className: 'bst-item-status', 'aria-hidden': true }, sessionStatuses.get(it.id).trailingLabel)
                      : (it.meta ? React.createElement('span', { className: 'bst-item-meta' }, it.meta) : null),
                  ),
                  it.actions && it.actions.length > 0
                    ? React.createElement('span', {
                        role: 'button', tabIndex: -1, className: 'bst-item-more',
                        title: bstT('menu.more'), 'aria-label': bstT('menu.more'),
                        // stopPropagation：阻止 click 冒泡到行按钮（避免触发行切换）
                        onClick: (e) => { e.stopPropagation(); onMore(e.currentTarget.getBoundingClientRect(), it.actions) },
                      }, React.createElement(IconEllipsisOutlineRegular, null))
                    : null,
                ),
            ),
          )
          // portal 到 body：脱离顶栏槽位的层叠/裁剪上下文（原生 Menu 同样这么做）
          return createPortal === null ? listEl : createPortal(listEl, document.body)
        }

        // ---------- 顶栏面包屑（代替原生会话标题） ----------
        // 两种形态共用这一份实现：
        //   有会话（conversation.session.header.actions）—— 顶栏显示「工作区 / 会话」链。
        //   无会话（conversation.header.leading）—— 顶栏新会话页：宿主此时不渲染
        //     conversation.session.header 整棵子树，只留一个空的 titleRow，
        //     于是这里补一份「工作区 / 新会话」，会话下拉里列出该工作区的历史会话，
        //     不用开侧边栏也能跳回旧会话。
        // props.sessionless = true 表示「无会话形态」（leading 槽）。
        function WorkspaceTitleBreadcrumb(props) {
          useBstLocale()
          const { useSessions } = props
          // 会话状态（用于面包屑与会话列表的「运行中 / 待审批」标记）
          const sessionStatuses = useSessionStatuses()
          // 会话 id：leading 槽拿不到 slot 给的 sessionId（scope=root，无会话绑定），
          // 改用宿主的「主视图保留」信号判定 —— 与原生 DocumentTitle 判当前会话同源
          // （Object.values(byId).find(s => (s.retainedBy.mainView ?? 0) > 0)）。
          // actions 槽拿到的 sessionId 是权威值，直接用它。
          const sessionId = props.sessionless
            ? undefined
            : props.sessionId
          const items = props.useWorkspaces((list) => list.items)
          const archived = props.useWorkspaces((list) => list.archivedSessionIds)
          // 当前工作区（快照已无 recentWorkspaceId，回落值本地计算，见 bstRecentWorkspaceId）
          const byId = useSessions((list) => list.byId)
          const sessionless = props.sessionless === true
          // 无会话态下当前会话仍可能存在（宿主新会话页保留了一个空白会话）。
          // 判定方式与原生 DocumentTitle 判当前会话同源：
          // Object.values(byId).find(s => (s.retainedBy.mainView ?? 0) > 0)?.id
          // 有会话时 slot 给的 sessionId 是权威值，直接用它。
          const mainSessionId = useSessions((state) => {
            if (!sessionless) return undefined // 有会话：下面的 props.sessionId 已是权威值
            const main = Object.values(state.byId).find((s) => (s.retainedBy.mainView ?? 0) > 0)
            return main === undefined ? undefined : main.id
          })
          // 生效的当前会话 id：有会话用 slot 给的；无会话用主视图保留的那个（可能是空白会话）。
          const activeSessionId = sessionless ? mainSessionId : sessionId
          // 会话链的锚点：无会话态不展开链 —— 那一级是「新会话」占位，不是某个具体会话
          // （主视图那个是空白会话，标题是空的，展开只会得到一个空标题）。
          const chainSessionId = sessionless ? undefined : activeSessionId
          // 「更多」菜单的快捷键提示：与原生会话菜单同源（session.rename / fork / archive）。
          // hook 必须在组件顶层调用（不能放进 map），三个 id 各取一次、下面逐行复用。
          const scRename = useShortcut('session.rename')
          const scFork = useShortcut('session.fork')
          const scArchive = useShortcut('session.archive')
          const [wsOpen, setWsOpen] = React.useState(false)
          const [ssOpen, setSsOpen] = React.useState(false)
          const [sbOpen, setSbOpen] = React.useState(false)
          const wsAnchorRef = React.useRef(null)
          const ssAnchorRef = React.useRef(null)
          // 独立插件：没有外部开关，面包屑始终渲染（曾经的父插件设置桥接已移除）。
          // 自适应图标态：**逐级**判定，且只在「真的放不下 / 被挤到读不出」时才换图标。
          // 判据两条：
          //   ① 整条面包屑溢出（放不下）→ 全部收成图标。这条是兜底，不依赖"文本会被挤"这个前提：
          //      顶栏容器若不可收缩，溢出会直接表现为被窗口边缘裁掉（文本一点没被挤）——
          //      实测过：headerActions 是 flex:0 0 auto + min-width:auto 时就是这个症状，
          //      所以另有 CSS 规则让那三层容器可收缩；这条兜底覆盖残留的溢出状态。
          //   ② 某级文本被截断，且截断后可见宽度 < ICONIC_TEXT_FLOOR（≈5 个汉字宽）→ 该级收成图标。
          //      · 窗口宽、只是标题比上限长 → 可见宽度仍有 ~130px，继续显示截断文本
          //        （截断文本比一个图标信息量大）—— 这就是「这么宽为什么变图标」的修法；
          //      · 顶栏真挤起来、文本只剩几个字 → 换成图标，让位于层级感与点击面积。
          //        单级面包屑本来就很难被挤到，真正会走到这里的是多级链（子智能体会话）。
          // 恢复用与形态无关的滞回：记住折叠时的 header 宽度，宽回来 +180px 才展开
          //（图标态下文本移出文档流，量不到"原本需要多宽"，所以只能拿 header 参照）。
          const [iconic, setIconic] = React.useState('')
          const ref = React.useRef(null)
          // 用 layout effect：首次测量发生在绘制前，于是不会先闪一下文本再变图标。
          React.useLayoutEffect(() => {
            const el = ref.current
            if (!el) return
            const header = el.closest('header') || el
            const flags = {}
            const update = () => {
              try {
                if (header.clientWidth === 0) return
                const keys = []
                // 兜底：整条面包屑已经放不下（溢出）就全部收成图标 —— 不靠"文本被挤"这个前提
                //（顶栏容器若不可收缩，溢出会直接表现为被窗口边缘裁掉，文本一点都没被挤）。
                const rowOverflow = el.scrollWidth > el.clientWidth + 1
                for (const b of el.querySelectorAll('.bst-crumb-btn')) {
                  const key = b.dataset.bstCrumb
                  if (key === undefined) continue
                  const f = flags[key] || (flags[key] = { on: false, at: 0 })
                  const text = b.querySelector('.bst-crumb-text')
                  if (f.on) {
                    if (header.clientWidth >= f.at + 180) f.on = false
                  } else if (rowOverflow || (text !== null
                    && text.scrollWidth > text.clientWidth + 1
                    && text.clientWidth < ICONIC_TEXT_FLOOR)) {
                    f.on = true
                    f.at = header.clientWidth
                  }
                  if (f.on) keys.push(key)
                }
                const next = keys.join(' ')
                setIconic((prev) => (prev === next ? prev : next))
              } catch { /* ignore */ }
            }
            update()
            const ro = new ResizeObserver(update)
            ro.observe(el)
            const onResize = () => update()
            window.addEventListener('resize', onResize)
            const disposeTimer = interval(update, 300)
            return () => {
              ro.disconnect()
              window.removeEventListener('resize', onResize)
              disposeTimer()
            }
          }, [])
          const iconicSet = new Set(iconic === '' ? [] : iconic.split(' '))
          // 注意：这里不能有全局 mousedown「点击外部关闭」监听——
          // mousedown 先于 click 派发，会把列表先行卸载，行内 click 全部丢失。
          // 点击外部关闭已由 BstList 的 document click 监听负责（且排除了锚按钮）。
          // 会话链：普通会话只有自己；子智能体会话会多出父会话（可多级）。
          // 无会话态（顶栏新会话页）：链不展开 —— 那一级用「新会话」占位，
          // 当前工作区改由「最近工作区」回落值判定（下面 currentWs 的第二条分支）。
          const chain = React.useMemo(() => bstSessionChain(byId, chainSessionId), [byId, chainSessionId])
          const chainRootId = chain.length > 0 ? chain[0].id : chainSessionId
          // 当前工作区按「链根」判定：普通会话下链根就是自己（与旧行为一致）；
          // 子智能体会话用根祖先去匹配，避免退回「最近工作区」这个无关结果。
          // 无会话态（新会话页）：链根为空，改用宿主保留的那个空白会话所在的工作区
          // —— 宿主的新会话页也是按它显示工作区（见宿主 pendingWorkspace/sessionWorkspace）；
          // 取不到时再回落「最近工作区」。
          const blankSessionId = sessionless ? mainSessionId : undefined
          const currentWs = items.find((w) => w.sessionIds.includes(chainRootId))
            || (blankSessionId !== undefined ? items.find((w) => w.sessionIds.includes(blankSessionId)) : undefined)
            || items.find((w) => w.workspaceId === bstRecentWorkspaceId(items, byId))
            || null
          // 子代理会话的 displayTitle 是「首条提示词原文」（又长又不是标题），真正的短标题躺在
          // 它**父会话**的 subagentCatalog 投影里 —— 原生 switcher 用的正是 currentEntry.label。
          // 因此每一级子代理都从它自己父级的 catalog 取 label，取不到才回落 displayTitle。
          const projections = useSessions((list) => list.projectionsBySession)
          const catalogOf = (parentId) => {
            const proj = projections ? projections[parentId] : undefined
            return proj && proj.values && Array.isArray(proj.values.subagentCatalog)
              ? proj.values.subagentCatalog : null
          }
          const chainLabeled = React.useMemo(() => chain.map((node, i) => {
            if (!node.subagent || i === 0) return node
            const catalog = catalogOf(chain[i - 1].id)
            const entry = catalog === null ? undefined : catalog.find((e) => e.id === node.id)
            return entry && entry.label ? { ...node, title: entry.label } : node
          }), [chain, projections])
          // 会话摘要缺失（启动竞态 / 会话不在快照里）时仍保留一格占位，避免整个会话段消失
          const crumbs = chainLabeled.length > 0 ? chainLabeled : [{ id: 'none', title: bstT('crumb.sessionNone'), subagent: false }]
          // ---------- 同级子代理切换器（对齐原生 CatalogDropdown 的 switcher 变体） ----------
          // 只在「当前会话是子智能体会话」时启用：末级面包屑改为切换器，
          // 列出父会话（链的倒数第二级）的直接子代理，当前项高亮。
          // 数据源优先用父会话的 subagentCatalog 投影（原生同源），未就绪时回退到 byId 里同 parentId 的子会话。
          const isSubagentSession = chain.length > 1
          const siblingParentId = isSubagentSession ? chain[chain.length - 2].id : undefined
          const siblings = React.useMemo(() => {
            if (siblingParentId === undefined) return []
            const catalog = catalogOf(siblingParentId)
            if (catalog !== null && catalog.length > 0) {
              return catalog.map((e) => ({ id: e.id, label: e.label || e.id }))
            }
            return Object.values(byId)
              .filter((s) => s !== undefined && s.origin === 'subagent' && s.parentId === siblingParentId)
              .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              .map((s) => ({ id: s.id, label: s.displayTitle || s.id }))
          }, [projections, byId, siblingParentId])
          const archivedSet = new Set(archived)
          const pinned = props.useWorkspaces((list) => list.pinnedSessionIds)
          const pinnedSet = new Set(pinned || [])
          const sessionVisible = (s) => s !== undefined
            && s.origin !== 'subagent'
            && !archivedSet.has(s.id)
            // 空白会话只在「它就是当前会话」时可见（有会话态：当前正开着它）。
            // 无会话态（新会话页）：那个空白会话由「会话 / 新会话」这一级占位代表，
            // 不该再在列表里出现一条空白的「新会话」行。
            && (!s.blank || (!sessionless && s.id === activeSessionId))
          // 排序对齐原生 orderByRecency + 置顶优先：置顶会话在前（保持置顶顺序），
          // 其余按 summary.updatedAt 降序、id 作确定性 tie-break（原生同款）。
          const sessionRows = currentWs
            ? currentWs.sessionIds
                .map((id) => byId[id])
                .filter(sessionVisible)
                .sort((a, b) => {
                  const pa = pinnedSet.has(a.id), pb = pinnedSet.has(b.id)
                  if (pa !== pb) return pa ? -1 : 1
                  if (pa && pb) {
                    const ia = (pinned || []).indexOf(a.id), ib = (pinned || []).indexOf(b.id)
                    if (ia !== ib) return ia - ib
                  }
                  const ta = a.updatedAt || 0, tb = b.updatedAt || 0
                  if (ta !== tb) return tb - ta
                  return a.id < b.id ? -1 : 1
                })
            : []
          const switchWorkspace = async (w) => {
            setWsOpen(false)
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              // 快路径：该工作区里最近更新的可见会话（切过去就能看到内容，与旧行为一致）
              const members = w.sessionIds
                .map((id) => byId[id])
                .filter(sessionVisible)
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              if (members.length > 0) {
                // 未连接过的工作区，openSession 可能直接失败 → 交给下面的原生路径
                try { uiWorkspace.openSession(members[0].id); return } catch { /* fall through */ }
              }
              // 原生路径：ui-workspace 的 startSession 走的就是 openWorkspace ——
              // 先 connectWorkspace（复用/新建空白会话）再打开，这是 0.2.0-rc.2 里
              // 「切换工作区」的正统入口（没有它，未连接工作区的会话打不开）。
              await uiWorkspace.openWorkspace(w.workspaceId)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          const [picker, setPicker] = React.useState(null)
          // { level, loading, error, showHidden, pathDraft, folderDraft, busy }
          //   pathDraft   null = 不在编辑路径（显示面包屑）；否则显示路径输入框
          //   folderDraft null = 不在新建文件夹（显示正常列表）；否则显示新建表单
          // 与原生 dsh-client-ui-directory-picker-browse 的交互一致：点行进入子目录，
          // 「打开」提交当前目录；隐藏目录默认不显示，由页脚「显示隐藏文件」切换。
          const pickerSeq = React.useRef(0)
          const errText = (e) => (typeof e === 'string' ? e : ((e && e.message) || String(e)))
          const loadLevel = React.useCallback(async (path) => {
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            const seq = ++pickerSeq.current
            setPicker((p) => (p === null ? p : { ...p, loading: true, error: null, pathDraft: null }))
            try {
              const level = await uiWorkspace.listDirectory(path)
              if (seq !== pickerSeq.current) return // 更新的意图胜出：丢弃过期结果
              setPicker((p) => (p === null ? p : { ...p, level, loading: false, error: null, folderDraft: null }))
            } catch (e) {
              if (seq !== pickerSeq.current) return
              setPicker((p) => (p === null ? p : { ...p, loading: false, error: errText(e) }))
            }
          }, [uiWorkspace])
          const closePicker = () => { pickerSeq.current += 1; setPicker(null) }
          // ---------- 宿主目录选择能力：native / browse，按实际组合分流 ----------
          // 宿主的目录选择器是「组合能力」，两者互斥：
          //   native —— 只有 pick（宿主屏幕上的 OS 目录选择器）
          //   browse —— 只有 list / createDirectory（应用内浏览）
          // 调用宿主不支持的那个，宿主会以 `directory-picker/unavailable` 拒绝，
          // 并说明自己实际提供的是哪一种（details.capability，或 message 里的
          // `the composed picker serves "native"`）。
          // 1.3.0 曾硬假设「只有 browse」并自建 list/createDirectory 对话框；
          // 宿主组合成 native 之后，list 直接被拒 —— 「添加工作区」必然报错：
          //   `directory browse failed: directory-picker/unavailable: directoryPicker.list
          //    needs the browse capability; the composed picker serves "native"`
          // 现在改成先按 native 走：调用宿主自己的 pick（OS 选择器），被拒且宿主说
          // 它提供的是 browse 时，才退回自建的应用内浏览对话框。能力结论缓存下来
          // （宿主承诺能力在服务生命周期内稳定），避免每次都先吃一个失败调用。
          //
          // 能力判定：优先读结构化的 details.capability；老内核只把能力名写进
          // message，故 message 也做一次兜底匹配。
          //
          // listing 形状：{ path, home, crumbs:[{name,path,hidden}], entries:[{name,path,hidden}] }
          //   —— entries 只含子目录；path 省略 = 主目录。
          const pickerModeRef = React.useRef(null) // 'native' | 'browse' | null（还没判定）
          const pickerCapabilityOf = (e) => {
            if (e === null || typeof e !== 'object') return null
            const rpc = e.rpcError
            if (rpc && rpc.code === 'directory-picker/unavailable') {
              if (rpc.details && typeof rpc.details.capability === 'string') return rpc.details.capability
            }
            // pick 失败时客户端只保留 message（`directory picker failed: …`），
            // list/createDirectory 失败时保留结构化 rpcError —— 两条路都读。
            const text = [e.message, rpc && rpc.message].filter((s) => typeof s === 'string').join(' ')
            const m = /the composed picker serves "([^"]+)"/.exec(text)
            return m ? m[1] : null
          }
          // 采纳一个已选定的目录：建工作区并打开（native pick 与 browse「打开」共用）
          const adoptPath = async (path) => {
            if (!workspaces || !uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            const view = await workspaces.create({ path })
            const id = view && view.workspaceId
            if (id !== undefined) await uiWorkspace.openWorkspace(id)
          }
          // native 能力：调宿主自己的目录选择器，取回所选目录。
          // 桌面壳暴露 __DSH_DIRECTORY_PICKER__（由应用窗口拥有对话框）时优先用它，
          // 与原生 native 流程（dsh-client-ui-directory-picker-native）同款；
          // 它不可用或失败时退回线协议（uiWorkspace.pickDirectory → directoryPicker/pick）。
          // 返回 null = 用户取消（静默收工，不报错）。
          const pickNative = async () => {
            const desktop = globalThis.__DSH_DIRECTORY_PICKER__
            if (desktop !== undefined && desktop !== null && typeof desktop.pick === 'function') {
              try {
                return await desktop.pick()
              } catch { /* 桌面桥不可用 → 走线协议 */ }
            }
            return await uiWorkspace.pickDirectory()
          }
          // 打开「添加工作区」：按宿主实际能力分流。
          //   native → 宿主 OS 选择器（与原生「添加工作区」同款交互）
          //   browse → 自建的应用内浏览对话框
          const openPicker = async () => {
            setWsOpen(false)
            setWsError(null)
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            if (pickerModeRef.current === 'browse') {
              setPicker({ level: null, loading: true, error: null, showHidden: false, pathDraft: null, folderDraft: null, busy: false })
              loadLevel(undefined) // 省略 path = 主目录
              return
            }
            try {
              const path = await pickNative()
              if (path === null || path === undefined || path === '') return // 用户取消
              pickerModeRef.current = 'native'
              await adoptPath(path)
            } catch (e) {
              // 宿主说它提供的是 browse → 改走应用内浏览对话框（这是唯一还剩的路）
              if (pickerCapabilityOf(e) === 'browse') {
                pickerModeRef.current = 'browse'
                setPicker({ level: null, loading: true, error: null, showHidden: false, pathDraft: null, folderDraft: null, busy: false })
                loadLevel(undefined)
                return
              }
              fail('dialog.pickerErrorTitle', e)
            }
          }
          const createFolder = async () => {
            if (!picker || !picker.level || !uiWorkspace) return
            const name = (picker.folderDraft || '').trim()
            if (name === '') return
            setPicker({ ...picker, busy: true, error: null })
            try {
              await uiWorkspace.createDirectory(picker.level.path, name)
              loadLevel(picker.level.path)
            } catch (e) {
              setPicker((p) => (p === null ? p : { ...p, busy: false, error: errText(e) }))
            }
          }
          const adoptDirectory = async () => {
            if (!picker || !picker.level || !workspaces || !uiWorkspace) return
            const path = picker.level.path
            setPicker({ ...picker, busy: true, error: null })
            try {
              await adoptPath(path)
              closePicker()
            } catch (e) {
              // 失败必须可见（原生 WorkspacePickFlow 同款：错误留在对话框里，可重试）
              setPicker((p) => (p === null ? p : { ...p, busy: false, error: errText(e) }))
            }
          }
          const newWorkspace = openPicker
          const newSession = async () => {
            setSsOpen(false)
            if (!uiWorkspace || !currentWs) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              // 原生「新会话」= uiWorkspace.startSession(workspaceId) → openWorkspace（复用空白会话）
              await uiWorkspace.openWorkspace(currentWs.workspaceId)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }

          // ---------- 更多操作（ellipsis → 原生 Menu 弹出） + 对话框状态 ----------
          const [moreMenu, setMoreMenu] = React.useState(null)
          const moreRectRef = React.useRef(null)
          const closeMore = () => setMoreMenu(null)
          const openMore = (rect, actions) => {
            moreRectRef.current = rect
            // 悬浮期间下拉保持打开，用户仍能看到当前操作的是哪一行；
            // 关闭由原生 Menu 自身负责（外部点击 / Escape）或 onSelect 显式执行。
            setMoreMenu({ actions })
          }
          // getAnchorRect 必须引用稳定（原生 Menu 的 place useLayoutEffect 依赖它）
          const getMoreAnchorRect = React.useCallback(() => moreRectRef.current, [])
          const [wsRename, setWsRename] = React.useState(null)
          const [wsDelete, setWsDelete] = React.useState(null)
          const [ssRename, setSsRename] = React.useState(null)
          const [ssDelete, setSsDelete] = React.useState(null)
          const [wsError, setWsError] = React.useState(null)
          // 统一的失败出口：`{ title, message }`。**不要**再写静默 `catch {}` / 早返回 ——
          // 服务未就绪或调用失败时的静默表现是
          // 「界面完美、点了完全没反应」，既无控制台线索也无界面线索，排查成本极高。
          const fail = (titleKey, e) => setWsError({
            title: bstT(titleKey),
            message: typeof e === 'string' ? e : ((e && e.message) || String(e)),
          })
          const wsRenameRef = React.useRef(null)
          const ssRenameRef = React.useRef(null)
          const openWsRename = (w) => { setWsRename({ id: w.workspaceId, currentTitle: w.title, draft: w.title, busy: false, error: null }); wsRenameRef.current = false }
          const openWsDelete = (w) => setWsDelete({ id: w.workspaceId, title: w.title, busy: false, error: null })
          const openSsRename = (s) => { setSsRename({ id: s.id, currentTitle: s.displayTitle, draft: s.displayTitle, busy: false, error: null }); ssRenameRef.current = false }
          const confirmWsRename = async () => {
            if (!workspaces || !wsRename) return
            const trimmed = wsRename.draft.trim()
            if (trimmed === '' || trimmed === wsRename.currentTitle) { setWsRename(null); return }
            setWsRename({ ...wsRename, busy: true, error: null })
            try {
              await workspaces.rename(wsRename.id, trimmed)
              setWsRename(null)
            } catch (e) {
              setWsRename({ ...wsRename, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          const confirmWsDelete = async () => {
            if (!workspaces || !wsDelete) return
            setWsDelete({ ...wsDelete, busy: true, error: null })
            try {
              await workspaces.delete(wsDelete.id)
              setWsDelete(null)
            } catch (e) {
              setWsDelete({ ...wsDelete, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          const confirmSsRename = async () => {
            if (!sessions || !ssRename) return
            const trimmed = ssRename.draft.trim()
            if (trimmed === '') return
            setSsRename({ ...ssRename, busy: true, error: null })
            try {
              // 0.2.0-rc.2 原生路径（对齐 ui-workspace 的 renameSession）：
              // sessions.using 取引用后走 reference.binding.session.rename，返回 {ok,error}
              const result = await sessions.using(
                ssRename.id,
                { source: 'workspaceOperation' },
                (reference) => reference.binding.session.rename(trimmed),
              )
              if (!result.ok) throw new Error((result.error && result.error.message) || 'rename failed')
              setSsRename(null)
            } catch (e) {
              setSsRename({ ...ssRename, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          // 永久删除：调用 dsh-chat-manager（已内嵌为 dsh-session-enhance/chat-manager
          // 组件）的 /plugins/dsh-session-delete/delete 路由。组件被关掉时路由不存在，
          // 失败会走 fail() 给出可见错误，而不是静默不执行。
          const openSsDelete = (s) => setSsDelete({ id: s.id, title: s.displayTitle || s.id, busy: false, error: null })
          const confirmSsDelete = async () => {
            if (!ssDelete) return
            setSsDelete({ ...ssDelete, busy: true, error: null })
            try {
              const response = await fetch('/plugins/dsh-session-delete/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-dsh-session-delete-confirmation': 'delete-session' },
                body: JSON.stringify({ sessionId: ssDelete.id }),
              })
              const result = await response.json()
              if (!response.ok || result?.ok !== true) throw new Error(result?.error?.message || `HTTP ${response.status}`)
              const targetId = ssDelete.id
              const current = uiWorkspace?.selection?.getSnapshot?.().sessionId
              if (current === targetId) { try { uiWorkspace?.clearMain?.() } catch { /* 忽略 */ } }
              await Promise.allSettled([
                typeof sessions?.refresh === 'function' ? sessions.refresh() : Promise.resolve(),
                typeof workspaces?.refresh === 'function' ? workspaces.refresh() : Promise.resolve(),
              ])
              setSsDelete(null)
            } catch (e) {
              setSsDelete({ ...ssDelete, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          const forkSession = async (s) => {
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              // 原生 forkSession：sessions.fork({sessionId, increaseTitle:true}) → 打开子会话
              const newId = await uiWorkspace.forkSession(s.id)
              uiWorkspace.openSession(newId)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          const archiveSession = async (s) => {
            setSsOpen(false)
            if (!workspaces) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try { await workspaces.archiveSession(s.id) } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          // 置顶 / 取消置顶：原生会话菜单同款 —— uiWorkspace.pinSession / unpinSession。
          const togglePin = async (s) => {
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              if (pinnedSet.has(s.id)) await uiWorkspace.unpinSession(s.id)
              else await uiWorkspace.pinSession(s.id)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          // 复制 Session ID：primitives 的 writeClipboard 不在本插件导入面内，
          // 用浏览器剪贴板 + 旧式 execCommand 兜底（桌面壳支持前者）。
          const copySessionId = async (s) => {
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(s.id)
                return
              }
              const area = document.createElement('textarea')
              area.value = s.id
              area.style.position = 'fixed'
              area.style.opacity = '0'
              document.body.appendChild(area)
              area.select()
              const ok = document.execCommand('copy')
              area.remove()
              if (!ok) throw new Error('copy failed')
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          const renameKeyDown = (refState, confirm) => (e) => {
            if (e.key === 'Enter' && refState.current !== true) {
              e.preventDefault()
              confirm()
            }
          }

          // ---------- 列表数据 ----------
          // 工作区重命名的重复名校验（footer 禁用与错误行共用一次计算）
          const wsRenameDup = wsRename !== null && wsRename.draft.trim() !== ''
            && wsRename.draft.trim() !== wsRename.currentTitle
            && items.some((w) => w.title === wsRename.draft.trim() && w.workspaceId !== wsRename.id)
          const wsListItems = [
            { id: 'add', label: bstT('crumb.addWorkspace'), icon: React.createElement(IconProjectAddOutlineRegular, { size: 16 }) },
            { separator: true },
            ...(items.length === 0
              ? [{ id: 'none', label: bstT('crumb.noWorkspaces'), disabled: true }]
              : items.map((w) => ({
                  id: w.workspaceId,
                  label: w.title,
                  // 行内不显示工作区图标（节省空间）；仅「新建工作区」动作行保留图标
                  // 会话数 = 原生 sessionVisible 过滤后的成员数（对齐 sessionCount: g.sessions.length）
                  meta: `(${w.sessionIds.filter((id) => sessionVisible(byId[id])).length})`,
                  selected: w.workspaceId === (currentWs && currentWs.workspaceId),
                  actions: [
                    { id: 'rename', label: bstT('crumb.rename'), icon: React.createElement(IconEditOutlineRegular, null), action: () => openWsRename(w) },
                    { id: 'remove', label: bstT('crumb.remove'), icon: React.createElement(IconTrashOutlineRegular, null), danger: true, action: () => openWsDelete(w) },
                  ],
                }))),
          ]
          const ssListItems = [
            { id: 'new', label: bstT('crumb.newSession'), icon: React.createElement(IconNewChatOutlineRegular, { size: 16 }) },
            { separator: true },
            ...(sessionRows.length === 0
              ? [{ id: 'none', label: bstT('crumb.noSessions'), disabled: true }]
              : sessionRows.map((s) => ({
                  id: s.id,
                  label: s.displayTitle,
                  // 行内不显示会话图标（节省空间）；仅「新建会话」动作行保留图标
                  // 会话更新时间（原生相对时间规则）
                  meta: s.updatedAt ? fmtRel(s.updatedAt) : '',
                  selected: s.id === activeSessionId,
                  // 顺序与原生会话菜单一致：置顶 → 重命名 → 分支 → 归档 → 复制 ID
                  actions: [
                    {
                      id: 'pin',
                      label: bstT(pinnedSet.has(s.id) ? 'crumb.unpin' : 'crumb.pin'),
                      icon: React.createElement(pinnedSet.has(s.id) ? IconPinFillRegular : IconPinOutlineRegular, null),
                      action: () => togglePin(s),
                    },
                    { id: 'rename', label: bstT('crumb.rename'), icon: React.createElement(IconEditOutlineRegular, null), shortcut: scRename, action: () => openSsRename(s) },
                    { id: 'fork', label: bstT('crumb.fork'), icon: React.createElement(IconBranchOutlineRegular, null), shortcut: scFork, action: () => forkSession(s) },
                    { id: 'archive', label: bstT('crumb.archive'), icon: React.createElement(IconArchiveOutlineRegular, { size: 16 }), shortcut: scArchive, action: () => archiveSession(s) },
                    { id: 'copyId', label: bstT('crumb.copySessionId'), icon: React.createElement(IconCopyOutlineRegular, { size: 16 }), action: () => copySessionId(s) },
                    // 永久删除：挂在「更多操作」里，复用 dsh-chat-manager（已内嵌组件）的删除契约
                    { id: 'permanentDelete', label: bstT('crumb.permanentDelete'), icon: React.createElement(IconTrashOutlineRegular, null), danger: true, action: () => openSsDelete(s) },
                  ],
                }))),
          ]
          // 同级子代理行（仅子智能体会话使用）：当前项高亮；不挂行内操作（原生 switcher 行同样只有名称）
          const siblingItems = siblings.length === 0
            ? [{ id: 'none', label: bstT('crumb.noSiblings'), disabled: true }]
            : siblings.map((s) => ({ id: s.id, label: s.label, selected: s.id === activeSessionId }))
          // 工作区级的完整文案（title / aria-label / 文本共用一份，避免三处各写一遍）
          const wsTitle = (currentWs && currentWs.title) || bstT('crumb.workspaceNone')
          // 折叠（紧凑）模式下文本 display:none 会一并移出可访问名 —— 每个面包屑按钮都显式
          // 声明 aria-label，图标态仍有可读名字（原生 CatalogDropdown 同样做法）。
          // 每一级的图标：子智能体级用原生 switcher 字形，普通会话级用会话字形 ——
          // 逐级都有图标是「折叠成图标」在任意链长下都不会变空的前提。
          const crumbIcon = (subagent) => (subagent
            ? React.createElement(IconChevronsUpDownOutlineRegular, null)
            : React.createElement(IconQueueOutlineRegular, null))
          // 状态标记：复用原生 StateDot（ongoing=空心圆环运行中、warning=橙色待审批、done=完成），
          // 与 dsh 桌面端完全一致。图标态（文本移出文档流）下圆点仍可见；补 aria-label 保证可访问。
          const statusLabelOf = (st) => st === 'warning' ? bstT('status.pendingApproval') : st === 'ongoing' ? bstT('status.running') : bstT('status.completed')
          const StatusMark = ({ id }) => {
            const st = sessionStatuses.get(id)
            return st ? React.createElement(uiPrimitives.StateDot, {
              key: 'st-' + id,
              state: st.state,
              'aria-label': statusLabelOf(st.state),
              title: statusLabelOf(st.state),
            }) : null
          }

          return React.createElement(React.Fragment, null,
            React.createElement('div', { ref: ref, className: 'bst-crumbs' },
              // ---------- 工作区面包屑 ----------
              React.createElement('div', { className: 'bst-crumb' },
                React.createElement('button', {
                  ref: wsAnchorRef, type: 'button',
                  className: 'bst-crumb-btn' + (iconicSet.has('ws') ? ' bst-crumb-iconic' : ''),
                  'data-bst-crumb': 'ws',
                  title: wsTitle,
                  'aria-label': wsTitle,
                  'aria-expanded': wsOpen,
                  onClick: () => { setWsOpen((o) => !o); setSsOpen(false) },
                },
                  React.createElement(IconFolderCloseRegular, null),
                  React.createElement('span', { className: 'bst-crumb-text' }, wsTitle),
                  React.createElement(wsOpen ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { className: 'bst-chev' }),
                ),
              ),
              // ---------- 会话面包屑（含祖先链：子智能体会话多一级「父会话」） ----------
              // 末级 = 当前会话（点击开下拉）；祖先级 = 可点跳回（原生 crumb 同款行为）。
              // 子智能体会话的级用 .bst-crumb-sub 缩小字号，视觉上与原生的 crumbSubagent 一致。
              ...crumbs.flatMap((node, index) => {
                const last = index === crumbs.length - 1
                // 图标态：该级完整标题放不进自己的上限 → 只显示图标（全名留在 title/aria-label）
                const iconOnly = iconicSet.has(node.id) ? ' bst-crumb-iconic' : ''
                const cls = 'bst-crumb-btn bst-crumb-btn-sub' + (node.subagent ? ' bst-crumb-sub' : '')
                // 末级：子智能体会话开同级切换器、普通会话开会话下拉；祖先级：跳回该级会话。
                // 关键不变式：**每级都有图标**，图标态下链不会出现空洞（祖先级原先只有文本，
                // 隐藏文本后就变成一块看不见的可点区域）。
                const opened = last && (ssOpen || sbOpen)
                return [
                  React.createElement('span', { key: 'sep-' + node.id, className: 'bst-sep', 'aria-hidden': true }, '/'),
                  React.createElement('div', { key: 'seg-' + node.id, className: 'bst-crumb' },
                    last
                      ? React.createElement('button', {
                          ref: ssAnchorRef, type: 'button', className: cls + iconOnly,
                          'data-bst-crumb': node.id,
                          title: node.title,
                          'aria-label': node.title,
                          'aria-expanded': opened,
                          onClick: () => {
                            setWsOpen(false)
                            if (isSubagentSession) { setSbOpen((o) => !o); setSsOpen(false) }
                            else { setSsOpen((o) => !o); setSbOpen(false) }
                          },
                        },
                          crumbIcon(node.subagent),
                          React.createElement('span', { className: 'bst-crumb-text' }, node.title),
                          StatusMark({ id: node.id }),
                          React.createElement(opened ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { className: 'bst-chev' }),
                        )
                      : React.createElement('button', {
                          type: 'button', className: cls + iconOnly,
                          'data-bst-crumb': node.id,
                          title: node.title,
                          'aria-label': node.title,
                          onClick: () => { if (uiWorkspace) uiWorkspace.openSession(node.id) },
                        },
                          crumbIcon(node.subagent),
                          React.createElement('span', { className: 'bst-crumb-text' }, node.title),
                          StatusMark({ id: node.id }),
                        ),
                  ),
                ]
              }),
            ),
            // ---------- 下拉列表（自绘，样式复刻原生） ----------
            React.createElement(BstList, {
              open: wsOpen,
              anchorEl: wsAnchorRef.current,
              items: wsListItems,
              onSelect: (id) => {
                setWsOpen(false)
                if (id === 'add') { newWorkspace(); return }
                const w = items.find((x) => x.workspaceId === id)
                if (w) switchWorkspace(w)
              },
              onClose: () => setWsOpen(false),
              onMore: openMore,
            }),
            React.createElement(BstList, {
              open: ssOpen,
              anchorEl: ssAnchorRef.current,
              items: ssListItems,
              onSelect: (id) => {
                setSsOpen(false)
                if (id === 'new') { newSession(); return }
                if (uiWorkspace) uiWorkspace.openSession(id)
              },
              onClose: () => setSsOpen(false),
              onMore: openMore,
              sessionStatuses,
            }),
            // 同级子代理切换器（仅子智能体会话）：列出父会话的直接子代理，选中即切过去
            React.createElement(BstList, {
              open: sbOpen,
              anchorEl: ssAnchorRef.current,
              items: siblingItems,
              onSelect: (id) => { setSbOpen(false); if (uiWorkspace) uiWorkspace.openSession(id) },
              onClose: () => setSbOpen(false),
              onMore: openMore,
              sessionStatuses,
            }),
            // ---------- 更多菜单（原生 Menu，锚定 ellipsis） ----------
            // className: bst-more-menu → display:contents：原生 Menu 的空包裹
            // span 默认是 inline-flex，会作为 flex 项挤进顶栏 .headerActions
            // （gap 8px）使后续动作（如创造模式 chip）后移 8px；contents 让它
            // 不产生盒、完全不参与布局，菜单关闭/打开不再引起顶栏位移。
            moreMenu ? React.createElement(Menu, {
              open: true,
              onClose: closeMore,
              onSelect: (id) => {
                const a = moreMenu.actions.find((x) => x.id === id)
                setMoreMenu(null)
                // 更多菜单项的操作完成后关闭所在下拉（点击更多菜单项时
                // click 被原生 Menu 内部 stopPropagation 拦截，不会走到
                // BstList 的外部关闭，所以这里显式关闭）
                setWsOpen(false)
                setSsOpen(false)
                if (a) a.action()
              },
              items: moreMenu.actions.map((a) => ({ id: a.id, label: a.label, icon: a.icon, danger: a.danger })),
              portal: true,
              closeOnPointerLeave: true,
              align: 'end',
              getAnchorRect: getMoreAnchorRect,
              className: 'bst-more-menu',
            }) : null,
            // ---------- 对话框（原生 Modal） ----------
            React.createElement(Modal, {
              open: wsError !== null,
              onClose: () => setWsError(null),
              closeLabel: bstT('dialog.close'),
              title: wsError !== null ? wsError.title : bstT('dialog.pickerErrorTitle'),
              footer: React.createElement(Button, { variant: 'primary', onClick: () => setWsError(null) }, bstT('dialog.close')),
            },
              wsError !== null ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsError.message) : null,
            ),
            React.createElement(Modal, {
              open: wsRename !== null,
              onClose: () => { if (wsRename && !wsRename.busy) setWsRename(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.renameWsTitle'),
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: wsRename ? wsRename.busy : true, onClick: () => setWsRename(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'primary',
                  disabled: !wsRename || wsRename.busy || wsRename.draft.trim() === '' || wsRenameDup,
                  onClick: confirmWsRename,
                }, bstT('dialog.confirm')),
              ),
            },
              wsRename ? React.createElement(Input, {
                value: wsRename.draft,
                placeholder: bstT('dialog.renameWsPlaceholder'),
                'aria-label': bstT('dialog.renameWsTitle'),
                autoFocus: true,
                disabled: wsRename.busy,
                onFocus: (e) => { e.target.select() },
                onChange: (e) => setWsRename({ ...wsRename, draft: e.target.value, error: null }),
                onCompositionStart: () => { wsRenameRef.current = true },
                onCompositionEnd: () => { wsRenameRef.current = false },
                onKeyDown: renameKeyDown(wsRenameRef, confirmWsRename),
              }) : null,
              wsRenameDup
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, bstT('dialog.renameWsDuplicate')) : null,
              wsRename && wsRename.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsRename.error) : null,
            ),
            React.createElement(Modal, {
              open: wsDelete !== null,
              onClose: () => { if (wsDelete && !wsDelete.busy) setWsDelete(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.deleteWsTitle'),
              description: wsDelete ? bstT('dialog.deleteWsBody', { name: wsDelete.title }) : undefined,
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: wsDelete ? wsDelete.busy : true, onClick: () => setWsDelete(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'outline', className: 'bst-btn-danger-outline',
                  disabled: !wsDelete || wsDelete.busy,
                  onClick: confirmWsDelete,
                }, bstT('dialog.deleteWsTitle')),
              ),
            },
              wsDelete && wsDelete.busy
                ? React.createElement('div', { className: 'bst-dialog-note', role: 'status' }, bstT('dialog.busy')) : null,
              wsDelete && wsDelete.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsDelete.error) : null,
            ),
            // ---------- 永久删除会话确认（调用内嵌 dsh-chat-manager 的删除路由） ----------
            React.createElement(Modal, {
              open: ssDelete !== null,
              onClose: () => { if (ssDelete && !ssDelete.busy) setSsDelete(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.deleteSessionTitle'),
              description: bstT('dialog.deleteSessionBody'),
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: ssDelete ? ssDelete.busy : true, onClick: () => setSsDelete(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'outline', className: 'bst-btn-danger-outline',
                  disabled: !ssDelete || ssDelete.busy,
                  onClick: confirmSsDelete,
                }, ssDelete && ssDelete.busy ? bstT('dialog.busy') : bstT('dialog.permanentDeleteConfirm')),
              ),
            },
              ssDelete ? React.createElement('p', null, ssDelete.title) : null,
              ssDelete && ssDelete.busy
                ? React.createElement('div', { className: 'bst-dialog-note', role: 'status' }, bstT('dialog.busy')) : null,
              ssDelete && ssDelete.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, ssDelete.error) : null,
            ),
            React.createElement(Modal, {
              open: ssRename !== null,
              onClose: () => { if (ssRename && !ssRename.busy) setSsRename(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.renameSessionTitle'),
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: ssRename ? ssRename.busy : true, onClick: () => setSsRename(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'primary',
                  disabled: !ssRename || ssRename.busy || ssRename.draft.trim() === '',
                  onClick: confirmSsRename,
                }, bstT('dialog.confirm')),
              ),
            },
              ssRename ? React.createElement(Input, {
                value: ssRename.draft,
                placeholder: bstT('dialog.renameSessionPlaceholder'),
                'aria-label': bstT('dialog.renameSessionTitle'),
                autoFocus: true,
                disabled: ssRename.busy,
                onFocus: (e) => { e.target.select() },
                onChange: (e) => setSsRename({ ...ssRename, draft: e.target.value, error: null }),
                onCompositionStart: () => { ssRenameRef.current = true },
                onCompositionEnd: () => { ssRenameRef.current = false },
                onKeyDown: renameKeyDown(ssRenameRef, confirmSsRename),
              }) : null,
              ssRename && ssRename.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, ssRename.error) : null,
            ),
            // ---------- 目录浏览对话框（「添加工作区」） ----------
            // 原生 pickDirectory 在本机组合里不可用（只有 browse 能力），这里用
            // listDirectory / createDirectory 自建：crumbs 跳级、子目录列表、路径直输、新建文件夹。
            React.createElement(Modal, {
              open: picker !== null,
              onClose: () => { if (picker && !picker.busy) closePicker() },
              title: bstT('picker.title'),
              closeLabel: bstT('picker.cancel'),
              footer: picker !== null
                ? React.createElement('div', { className: 'bst-picker-footer' },
                    React.createElement(Button, {
                      variant: 'outline',
                      disabled: picker.busy || picker.level === null,
                      onClick: () => setPicker({ ...picker, folderDraft: picker.folderDraft === null ? '' : null, error: null }),
                    }, bstT('picker.newFolder')),
                    React.createElement(Button, {
                      variant: 'outline',
                      'aria-pressed': picker.showHidden,
                      disabled: picker.busy,
                      onClick: () => setPicker({ ...picker, showHidden: !picker.showHidden }),
                    }, bstT('picker.showHidden'),
                      picker.showHidden ? React.createElement(IconCheckOutlineRegular, { size: 14 }) : null),
                    React.createElement('span', { className: 'bst-picker-spacer' }),
                    React.createElement(Button, { variant: 'outline', disabled: picker.busy, onClick: closePicker }, bstT('picker.cancel')),
                    React.createElement(Button, {
                      variant: 'primary',
                      disabled: picker.busy || picker.loading || picker.level === null,
                      onClick: adoptDirectory,
                    }, picker.busy ? bstT('dialog.busy') : bstT('picker.open')),
                  )
                : null,
            },
              picker !== null ? React.createElement('div', { className: 'bst-picker' },
                // 面包屑条：原生在标题下方放一条可编辑的路径条（编辑时输入框替换面包屑），
                // 这里同样做「面包屑 ⇄ 输入框」二态，右端是编辑路径铅笔。
                React.createElement('div', { className: 'bst-picker-crumbar' },
                  picker.pathDraft !== null
                    ? React.createElement(Input, {
                        className: 'bst-picker-path',
                        value: picker.pathDraft,
                        placeholder: bstT('picker.editPath'),
                        'aria-label': bstT('picker.editPath'),
                        autoFocus: true,
                        disabled: picker.busy,
                        onFocus: (e) => { e.target.select() },
                        onChange: (e) => setPicker({ ...picker, pathDraft: e.target.value }),
                        onKeyDown: (e) => {
                          if (e.key === 'Escape') { e.preventDefault(); setPicker({ ...picker, pathDraft: null }); return }
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          const next = (picker.pathDraft || '').trim()
                          if (next !== '') loadLevel(next)
                        },
                      })
                    : React.createElement(React.Fragment, null,
                        ...(picker.level !== null && Array.isArray(picker.level.crumbs) ? picker.level.crumbs : []).map((c, i) => React.createElement(React.Fragment, { key: 'c' + c.path },
                          i > 0 ? React.createElement(IconChevronRight, { className: 'bst-picker-sep', size: 12, 'aria-hidden': true }) : null,
                          React.createElement('button', {
                            type: 'button',
                            className: 'bst-picker-crumb',
                            title: c.path,
                            disabled: picker.loading || picker.busy,
                            onClick: () => loadLevel(c.path),
                          }, c.name === '' ? bstT('picker.home') : c.name),
                        )),
                        React.createElement('button', {
                          type: 'button',
                          className: 'bst-picker-edit',
                          title: bstT('picker.editPath'),
                          'aria-label': bstT('picker.editPath'),
                          disabled: picker.busy || picker.loading || picker.level === null,
                          onClick: () => setPicker({ ...picker, pathDraft: (picker.level && picker.level.path) || '' }),
                        }, React.createElement(IconEditOutlineRegular, { size: 14 })),
                      ),
                ),
                React.createElement('div', { className: 'bst-picker-list', role: 'list' },
                  picker.loading
                    ? React.createElement('div', { className: 'bst-picker-note', role: 'status' }, bstT('picker.loading'))
                    : picker.level === null
                      ? null
                      : (() => {
                          // 隐藏目录默认不列出（原生同款）：显示隐藏文件开关只切换可见性。
                          const visible = picker.level.entries.filter((entry) => picker.showHidden || !entry.hidden)
                          if (visible.length === 0) return React.createElement('div', { className: 'bst-picker-note' }, bstT('picker.empty'))
                          return visible.map((entry) => React.createElement('button', {
                              key: entry.path,
                              type: 'button',
                              role: 'listitem',
                              className: 'bst-picker-entry' + (entry.hidden ? ' bst-picker-hidden' : ''),
                              title: entry.path,
                              disabled: picker.busy,
                              onClick: () => loadLevel(entry.path),
                            },
                              React.createElement(IconFolderCloseRegular, null),
                              React.createElement('span', { className: 'bst-picker-entry-text' }, entry.name),
                              React.createElement(IconChevronRight, { className: 'bst-picker-entry-chev', size: 12, 'aria-hidden': true }),
                            ))
                        })(),
                ),
                picker.folderDraft !== null
                  ? React.createElement('div', { className: 'bst-picker-newfolder' },
                      React.createElement(Input, {
                        value: picker.folderDraft,
                        placeholder: bstT('picker.folderName'),
                        'aria-label': bstT('picker.createIn', { name: picker.level !== null ? picker.level.path : '' }),
                        autoFocus: true,
                        disabled: picker.busy || picker.level === null,
                        onChange: (e) => setPicker({ ...picker, folderDraft: e.target.value }),
                        onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder() } },
                      }),
                      React.createElement(Button, {
                        variant: 'outline',
                        disabled: picker.busy || picker.level === null || (picker.folderDraft || '').trim() === '',
                        onClick: createFolder,
                      }, picker.busy ? bstT('dialog.busy') : bstT('picker.create')),
                    )
                  : null,
                picker.error !== null
                  ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, picker.error) : null,
              ) : null,
            ),
          )
        }

        // ---------- 顶栏 leading 槽：无会话态的面包屑 ----------
        // 宿主在「新会话」时会把顶栏让出来：conversation.session.header 的标题内容被
        // hideChrome 抑制（ConversationSessionHeader：!hideChrome 才渲染 titleCluster），
        // 而 conversation.header.leading 正是宿主为「会话之前就要有全局导航」预留的
        // 空位（scope=root、常驻渲染，当前无人占用）。于是新会话页顶栏是空的 ——
        // 想看历史会话只能开侧边栏。
        //
        // 与 header.actions 那一份**互斥**：这里只在「新会话态」时渲染；
        // 其余情况返回 null，把顶栏交回 header.actions 的那一份 ——
        // 同一时刻顶栏只有一条面包屑，不会出现两份。
        //
        // 判定「是不是新会话态」用宿主自己的信号：**主视图保留的会话是空白会话**
        // （宿主的主观新会话标记就是它，见宿主 mainBlank()：
        //   session.blank && (session.retainedBy.mainView ?? 0) > 0）。
        // 注意不能只看「有没有主视图会话」——新会话页**也**保留着一个空白会话，
        // 只看存在性会永远判成「有会话」，于是这一份永远不渲染（新会话页依然空）。
        function WorkspaceTitleBreadcrumbLeading(props) {
          useBstLocale()
          const isNewSession = props.useSessions((state) => {
            const main = Object.values(state.byId).find((s) => (s.retainedBy.mainView ?? 0) > 0)
            // 没有主视图会话 = 彻底无会话（宿主此时连空白会话都没建）→ 也是新会话态。
            return main === undefined || main.blank === true
          })
          if (!isNewSession) return null
          return React.createElement(WorkspaceTitleBreadcrumb, Object.assign({}, props, { sessionless: true }))
        }

        // ---------- 样式注入 ----------
        // 核心：面包屑代替原生会话标题（隐藏原生标题 nav）。
        // 0.2.0-rc.2 标题结构：header[data-conversation-header] > div[data-conversation-title-row]
        //   > div.titleCluster > [ nav.crumbs（原生标题）, div.headerActions（本面包屑） ]
        // 0.2.1-rc.2 起两个 data 属性被移除，新结构：
        //   header[data-window-drag] > div.titleRow > div.titleCluster
        //     > [ nav.crumbs, div.headerActions（本面包屑，同层兄弟） ]
        // 两代锚点都保留：新一代用 header[data-window-drag] 定界，nav 以
        // 「后面兄弟层里出现 .bst-crumbs」为条件（:has(~ div .bst-crumbs)），
        // 不依赖哈希类名；本插件未注册时规则不命中，原生标题自然保留（无需额外 JS）。
        insertStyle(`div[data-conversation-title-row]:has(.bst-crumbs) nav{display:none}`)
        insertStyle(`header[data-window-drag] nav:has(~ div .bst-crumbs){display:none}`)
        // 承载面包屑的三层容器默认不可收缩：实测 headerActions 是 `flex: 0 0 auto` +
        // `min-width: auto`，所以顶栏变窄时它不让位，面包屑整条溢出、在窗口边缘被裁掉 ——
        // 文本永远不会被挤出省略号（「文本不会被挤压缩」的根因），逐级图标态也就没有前提。
        // 让这三层回到可收缩（它们本就在原生 minmax(0,1fr) 的列里），文本才会正常省略。
        // 注意：原生头部是 <header>（不是 div），锚点必须限定在 header 上，
        // 写成 div[window-drag] 之类会永远匹配不到（静默失效）。
        insertStyle(`[data-conversation-header] div:has(.bst-crumbs){min-width:0;flex-shrink:1}`)
        insertStyle(`header[data-window-drag] div:has(.bst-crumbs){min-width:0;flex-shrink:1}`)
        // 无会话态的面包屑住在 headerLeading（顶栏第 1 列，grid-template-columns: auto minmax(0,1fr)）。
        // 该列按内容定宽（auto），面包屑一长就把顶栏撑宽、把内容挤出窗口 ——
        // 而第 2 列（titleRow）在无会话时是空的，宽度全在第 1 列。
        // 把第 1 列也纳入可收缩：minmax(0,1fr) 让它最多占满可用宽度，
        // 面包屑内部的 min-width:0 + flex-shrink:1 才有省略号可言。
        // 锚点用 [data-conversation-header-leading]（宿主给 leading 容器打的标记），
        // 不用哈希类名 —— 与本插件其它规则同一取向。
        insertStyle(`header[data-window-drag]:has([data-conversation-header-leading] .bst-crumbs){grid-template-columns:minmax(0,1fr)}`)
        insertStyle(`header[data-window-drag] [data-conversation-header-leading]:has(.bst-crumbs){min-width:0;overflow:hidden}`)
        // 面包屑 + 下拉列表（复刻原生 Menu.module.css）+ 对话框补充样式
        insertStyle(`.bst-crumbs{display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1}.bst-crumb{position:relative;min-width:0}.bst-crumb-btn{display:flex;align-items:center;gap:5px;border:none;background:transparent;border-radius:10px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;cursor:pointer;max-width:180px;min-width:0;padding:3px 6px;min-height:28px}.bst-crumb-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.bst-crumb-btn:active{background:var(--dsw-alias-interactive-bg-active)}.bst-crumb-btn-sub{color:var(--dsw-alias-label-secondary)}.bst-crumb-btn-sub:hover{color:var(--dsw-alias-label-primary)}.bst-crumb-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-crumb-btn svg{flex-shrink:0;color:var(--dsw-alias-label-tertiary);pointer-events:none}.bst-crumb-btn:hover .bst-chev{color:var(--dsw-alias-label-primary)}.bst-sep{color:var(--dsw-alias-label-tertiary);font-size:12px;user-select:none}.bst-crumb-iconic .bst-crumb-text{position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap}.bst-crumb-sub{font-size:12px;line-height:18px}`)
        // 下拉列表（行内度量与原生 AccountMenu 的 menuitem 一致；卡片沿用原生菜单 surface token）
        insertStyle(`.bst-list{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;min-width:220px;max-width:360px;max-height:calc(100vh - 24px);overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));box-shadow:var(--dsw-elevation-prominent)}.bst-list-sep{height:1px;margin:4px 2px;background:var(--dsw-alias-border-l1);flex:none}.bst-item{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left;box-sizing:border-box}.bst-item:hover:not(:disabled),.bst-item-selected{background:var(--dsw-alias-interactive-bg-hover)}.bst-item:disabled{opacity:.4;cursor:not-allowed}.bst-item-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}.bst-item-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px}.bst-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-item-meta{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.bst-item-status{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.bst-item-more{display:none;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}.bst-item:hover:not(:disabled) .bst-item-more{display:inline-flex}.bst-item:hover:not(:disabled) .bst-item-meta{display:none}.bst-item:hover:not(:disabled) .bst-item-status{display:none}.bst-item-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bst-more-menu{display:contents}@media (hover:none){.bst-item-more{display:inline-flex}.bst-item-meta{display:none}}`)
        // 对话框补充样式
        insertStyle(`.bst-dialog-error{font-size:12px;color:var(--dsw-alias-state-error-primary);word-break:break-all}.bst-dialog-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}.bst-btn-danger-outline{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}`)
    // 目录浏览对话框：路径面包屑 / 子目录列表 / 新建文件夹
    // 度量逐项对齐原生 dsh-client-ui-directory-picker-browse：面包屑条 min-height 24、
    // 行高 28、字号 13/20、行内文件夹图标 label-secondary、右端 chevron label-tertiary。
    insertStyle(`.bst-picker{display:flex;flex-direction:column;gap:8px;min-width:0}.bst-picker-crumbar{display:flex;align-items:center;gap:4px;min-height:24px;padding:0 8px;margin-left:-8px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);box-sizing:border-box}.bst-picker-crumbar:has(.bst-picker-crumb:hover:not(:disabled)),.bst-picker-crumbar:has(.bst-picker-edit:enabled:hover),.bst-picker-crumbar:has(.bst-picker-path){border-color:var(--dsw-alias-border-l2)}.bst-picker-crumb{border:none;background:transparent;padding:0;color:var(--dsw-alias-label-tertiary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-picker-crumb:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.bst-picker-crumb:disabled{opacity:.4;cursor:default}.bst-picker-sep{flex:none;color:var(--dsw-alias-label-tertiary)}.bst-picker-edit{display:inline-flex;align-items:center;justify-content:flex-end;flex:1 0 34px;min-width:34px;height:22px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}.bst-picker-edit:enabled:hover{color:var(--dsw-alias-label-primary)}.bst-picker-edit:disabled{color:var(--dsw-alias-label-caption);cursor:default}.bst-picker-path{direction:ltr;flex:1 1 0;min-width:0;height:22px}.bst-picker-list{display:flex;flex-direction:column;gap:2px;max-height:46vh;overflow-y:auto;padding:2px 0}.bst-picker-entry{display:flex;align-items:center;gap:4px;width:100%;height:28px;padding:4px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px;text-align:left;cursor:pointer;box-sizing:border-box}.bst-picker-entry:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.bst-picker-entry:disabled{opacity:.4;cursor:not-allowed}.bst-picker-entry>svg:first-child{flex:none;color:var(--dsw-alias-label-secondary)}.bst-picker-entry-chev{flex:none;color:var(--dsw-alias-label-tertiary)}.bst-picker-entry-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-picker-hidden{opacity:.5}.bst-picker-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:4px}.bst-picker-newfolder{display:flex;align-items:center;gap:8px}.bst-picker-newfolder>*:first-child{flex:1;min-width:0}`)

        // ---------- 注册：会话顶栏 actions 槽 ----------
        // order -40 → 该槽内最前（原生 subagent-catalog 为 -30、agent-team 为 -20、agent-preset 为 -10），
        // 于是面包屑落回「原生标题」所在的位置，成为会话顶栏最前端的元素。
        slots.inject('conversation.session.header.actions', () => slots.register(
          { name: 'conversation.session.header.actions', id: 'bst-breadcrumb', order: -40, label: () => bstT('slot.breadcrumb'), registrant: 'dsh-session-enhance' },
          WorkspaceTitleBreadcrumb,
        ))
        // ---------- 注册：顶栏 leading 槽（新会话态的面包屑） ----------
        // 宿主在新会话时把顶栏让出来：conversation.session.header 的标题内容被
        // hideChrome 抑制（ConversationSessionHeader：!hideChrome 才渲染 titleCluster），
        // 而 conversation.header.leading 正是宿主为「会话之前就要有全局导航」预留的
        // 空位（scope=root、常驻渲染，当前无人占用）—— 于是新会话页顶栏是空的，
        // 想看历史会话只能开侧边栏。
        //
        // 与上面那个注册**互斥**：leading 这一份只在「新会话态」时渲染，
        // 其余情况返回 null，把顶栏交回 header.actions 那一份 —— 同一时刻只有一份面包屑。
        // 判定「是不是新会话态」用宿主自己的信号：**主视图保留的是空白会话**
        // （宿主的新会话标记，见宿主 mainBlank()：session.blank && retainedBy.mainView > 0）。
        //
        // 注册选项只给 `name`：该槽的契约是 registerOptions: []（无 id/order/label），
        // 而 single 槽按「格」取第一个占用者（entriesOfSlot(...)[0]）——
        // 多带一个 id 会把占用者归到别的格去，宿主自己的例子
        // （conversation.approval.detail 等子槽）也都只给 name。
        slots.inject('conversation.header.leading', () => slots.register(
          { name: 'conversation.header.leading' },
          WorkspaceTitleBreadcrumbLeading,
        ))
        // ---------- 注册：内嵌会话管理（chat-manager）client 功能 ----------
        // 一个包只有一个 ./client bundle，子组件无法自带 client，故在此随主插件一并注册。
        // 需要 locale / slots 已就绪（上面 inject 已保证）；失败要可见，不能静默。
        try {
          if (locale !== undefined) registerChatManagerClient(ctx, React, uiPrimitives)
          else console.warn('会话增强: locale 服务缺失，内嵌会话管理 client 未注册')
        } catch (e) {
          console.warn('会话增强: 内嵌会话管理 client 注册失败', e)
        }
      },
    }
    return module.exports
  },
})
