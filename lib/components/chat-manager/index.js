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
}
