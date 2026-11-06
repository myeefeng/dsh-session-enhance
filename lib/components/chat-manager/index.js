// 组件：dsh-session-enhance/chat-manager
// 内嵌自 dsh-chat-manager（MIT © WSL043）。作为本插件的「必选组件」，默认开启、可开关。
// 提供：会话永久删除 + 归档管理的 host 路由（/plugins/dsh-session-delete/*）。
// 面包屑「更多操作 → 永久删除」直接调用这里的删除路由。
import {
  createDeleteRequestHandler,
  deleteSessionSafely,
  hostRequestFence,
  installAgentHandleTracker,
} from './host/delete-session.mjs'
import {
  createArchiveRequestHandlers,
  deleteSessionAndReconcileArchive,
  restoreArchivedSession,
  searchArchivedSessions,
} from './host/archive-manager.mjs'
import { createVersionRequestHandler } from './host/version-manager.mjs'

// 组件 id 与 cordis.patch.yml 中 name: dsh-session-enhance/chat-manager 对应。
// name 用于宿主审计展示，逻辑与原 dsh-chat-manager 一致。
export const name = 'dsh-bst-chat-manager'
export const inject = ['webServer', 'sessionPersistence', 'sessions', 'agents', 'workspaceRegistry']

export function currentConnection(ctx) {
  return typeof ctx.get === 'function' ? ctx.get('connection') : undefined
}

export function apply(ctx) {
  const sessionRoot = ctx.sessionPersistence?.config?.root ?? ctx.sessionPersistence?.root
  if (typeof sessionRoot !== 'string' || sessionRoot.length === 0) {
    throw new Error('dsh-bst-chat-manager requires the per-session JSONL persistence backend')
  }

  const agentHandles = installAgentHandleTracker(ctx.agents, ctx.sessions)
  ctx.effect(() => () => agentHandles.release(), 'dsh-bst-chat-manager: agent lifecycle tracking')

  const deleteSession = sessionId => deleteSessionSafely({
    sessions: ctx.sessions,
    agents: ctx.agents,
    agentHandles,
    sessionPersistence: ctx.sessionPersistence,
  }, { sessionRoot, sessionId })
  const isTrustedRequest = req => hostRequestFence(currentConnection(ctx))(req)
  const handler = createDeleteRequestHandler({
    isTrustedRequest,
    deleteSession: sessionId => deleteSessionAndReconcileArchive({
      workspaceRegistry: ctx.workspaceRegistry,
      deleteSession,
    }, sessionId),
  })
  const archiveHandlers = createArchiveRequestHandlers({
    isTrustedRequest,
    restore: sessionId => restoreArchivedSession(ctx.workspaceRegistry, sessionId),
    search: (query, signal) => searchArchivedSessions({
      workspaceRegistry: ctx.workspaceRegistry,
      sessionQuery: ctx.get('sessionQuery'),
    }, query, signal),
  })

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-session-delete/delete',
      handler,
    }),
    'dsh-bst-chat-manager: confirmed permanent deletion route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-session-delete/restore',
      handler: archiveHandlers.restore,
    }),
    'dsh-bst-chat-manager: archived session restore route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-session-delete/archive-search',
      handler: archiveHandlers.search,
    }),
    'dsh-bst-chat-manager: archived history search route',
  )
  // 版本路由：设置页「已归档会话」里的版本徽标与「检查更新」用它取当前版本，
  // 以及「怎么升级」需要的两条宿主侧事实（profile 名 / 本包的安装形态）。
  //
  // 同源栅栏的选择很讲究，这里**不能**直接沿用归档那三条的 `isTrustedRequest`：
  //   * 新内核有 `connection.requestRejection` 时，宿主自己的判定是**允许缺 Origin** 的
  //     （见 dsh-client-connection 的 isTrustedApiRequest：origin 缺失即放行），所以用它最好；
  //   * 旧内核没有该服务时，`hostRequestFence` 回落到 `sameOriginRequest`，它要求
  //     `origin === http://<host>` —— 而浏览器对**同源 GET 不发 Origin**，页面自己的请求会被
  //     403，版本徽标永远停在回落常量（静默、无任何报错）。
  // 因此这里只在「宿主栅栏会退化成严格同源判定」时才换用 version-manager 自带的宽容判定
  // （仍拒绝带 Origin 的跨源请求）。该端点只读、无副作用、响应只有版本号与安装形态，
  // 放宽不引入可写面；归档那三条 POST 路由不受影响（POST 必带 Origin）。
  const connection = currentConnection(ctx)
  const hasHostFence = typeof connection?.requestRejection === 'function'
  const versionHandler = createVersionRequestHandler({
    ctx,
    ...(hasHostFence ? { isTrustedRequest } : {}),
  })
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-session-enhance/version',
      handler: versionHandler,
    }),
    'dsh-bst-chat-manager: plugin version route',
  )
}
