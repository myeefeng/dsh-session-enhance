// 版本信息 host 路由：GET /plugins/dsh-session-enhance/version
// ------------------------------------------------------------
// 为什么需要它：插件的 client 半跑在浏览器里，读不到自己的 package.json；设置页要显示
// 「当前版本」就只能靠注入常量，而常量会漂（发版时忘了改就永远显示旧版本）。这里把
// **包根 package.json 的 version** 作为唯一权威源回传给浏览器半，升级后自动跟着变。
//
// 同时回传「怎么升级」所需的两条事实（都只有宿主侧知道）：
//   * profile —— 当前进程启动的 profile 名（`profileContext` 服务优先，其次环境变量）。
//     浏览器半拿不到它，写死 `web` 就会把 `--profile web` 指到另一个 profile 上；
//   * installKind —— 本包在该 profile 的 package.json 里是以什么形式装的
//     （`file:` 本地目录链接 / `github:` / npm registry / 未知）。这一条决定「更新命令」
//     到底该不该给：本地目录链接的装法，`dsh plugin add` 拉的是**另一个**副本，
//     并不会更新用户正在用的这个工作树，给命令等于给错答案。
//
// 边界与内嵌 chat-manager 的其它路由一致：只读 GET/HEAD、过宿主同源栅栏、no-store、
// 失败回结构化 error 而不是抛栈给浏览器。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// 本文件位于 lib/components/chat-manager/host/ → 上溯四级才是包根 package.json。
const PACKAGE_MANIFEST = new URL('../../../../package.json', import.meta.url)
const PACKAGE_NAME = 'dsh-session-enhance'

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

/**
 * Read this package's own manifest version. Resolved relative to this module
 * (lib/components/chat-manager/host/ → ../../../../package.json), so it keeps
 * working for a linked checkout and an installed copy alike.
 */
export async function readPluginVersion(readManifest = () => readFile(PACKAGE_MANIFEST, 'utf8')) {
  const manifest = JSON.parse(await readManifest())
  const version = manifest?.version
  if (typeof version !== 'string' || version.length === 0) throw Error('package.json carries no version')
  return version
}

/**
 * Classify how this package is installed in the profile, from the dependency
 * spec the profile's own package.json records.
 *
 * @param spec - the `dependencies[PACKAGE_NAME]` value, or undefined.
 * @returns `file` for a local path/link, `github` for a git spec, `npm` for a
 * registry range or exact version, `unknown` when there is no spec to read.
 */
export function classifyInstallSpec(spec) {
  if (typeof spec !== 'string' || spec.trim().length === 0) return 'unknown'
  const value = spec.trim()
  if (/^(file:|link:|portal:|workspace:)/.test(value) || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('.') || value.startsWith('/')) return 'file'
  if (/^(github:|git:|git\+|https?:\/\/|ssh:)/.test(value) || value.includes('github.com')) return 'github'
  // 剩下的形态都是 registry 版本范围（^1.8.0 / ~1.8 / 1.8.0 / latest / *）。
  return 'npm'
}

/**
 * The profile this host process booted. `profileContext` is the launcher's own
 * answer (it owns both the name and the directory); the environment variables
 * are the fallback for hosts that do not publish that service.
 */
export function readProfileFacts(ctx) {
  const context = typeof ctx?.get === 'function' ? ctx.get('profileContext') : undefined
  const name = typeof context?.name === 'string' && context.name.trim().length > 0
    ? context.name.trim()
    : (typeof process.env.DSH_PROFILE === 'string' && process.env.DSH_PROFILE.trim().length > 0 ? process.env.DSH_PROFILE.trim() : undefined)
  const dir = typeof context?.dir === 'string' && context.dir.trim().length > 0
    ? context.dir.trim()
    : (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR.trim().length > 0 ? process.env.DSH_PROFILE_DIR.trim() : undefined)
  return { name, dir }
}

/** Read the dependency spec for this package out of the profile's package.json. */
export async function readInstallSpec(profileDir, readManifest = (path) => readFile(path, 'utf8')) {
  if (typeof profileDir !== 'string' || profileDir.length === 0) return undefined
  try {
    const manifest = JSON.parse(await readManifest(join(profileDir, 'package.json')))
    const spec = manifest?.dependencies?.[PACKAGE_NAME]
    return typeof spec === 'string' ? spec : undefined
  } catch { return undefined }
}

/**
 * Same-origin check that tolerates a **missing** `Origin` header.
 *
 * The archive routes can require `Origin` because they are POST-only, and browsers
 * always send it on POST. This route is a plain GET, and browsers deliberately omit
 * `Origin` on same-origin GET requests — so reusing the strict check verbatim would
 * reject the page's own request with 403 and the badge would silently fall back to
 * the constant on any core without the Host's own connection fence.
 *
 * Being lenient here leaks nothing: the payload is a version number and an install
 * kind, and a cross-origin caller can neither read the response (no CORS grant) nor
 * trigger anything, since this endpoint has no side effect.
 */
const versionRequestTrusted = (req) => {
  const host = req.headers.host
  if (typeof host !== 'string') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  return origin === `http://${host}` || origin === `https://${host}`
}

/**
 * GET-only HTTP boundary for the plugin's version badge. `isTrustedRequest`
 * defaults to the same-origin check above; the embedded component passes the
 * Host's own fence (`connection.requestRejection`) when that service exists.
 */
export function createVersionRequestHandler({
  ctx,
  version = readPluginVersion,
  profile = () => readProfileFacts(ctx),
  installSpec = (dir) => readInstallSpec(dir),
  isTrustedRequest,
  warn = console.warn,
} = {}) {
  const trusted = isTrustedRequest ?? versionRequestTrusted
  const facts = async () => {
    const [currentVersion, launched] = await Promise.all([version(), Promise.resolve(profile())])
    const spec = await installSpec(launched?.dir)
    return {
      version: currentVersion,
      profile: launched?.name ?? null,
      installKind: classifyInstallSpec(spec),
      // 原始 spec 也回传：设置页要把它原样显示给用户看（比「本地目录」四个字更有说服力）。
      installSpec: typeof spec === 'string' ? spec : null,
    }
  }
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '版本信息只支持 GET。' } })
      return
    }
    if (!trusted(req)) {
      sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: '版本请求未通过同源校验。' } })
      return
    }
    // HEAD 只回头：版本是只读小对象，没有 body 也足以让健康检查判断路由存在。
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      res.end()
      return
    }
    try {
      sendJson(res, 200, { ok: true, value: await facts() })
    } catch (error) {
      warn('plugin version route failed:', error)
      sendJson(res, 500, { ok: false, error: { code: 'version-unavailable', message: '读取插件版本失败。' } })
    }
  }
}

export const __testing = { versionRequestTrusted, classifyInstallSpec }
