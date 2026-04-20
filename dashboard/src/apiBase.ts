/** Worker /agent base URL (no trailing slash). Empty until `initApiBase()` runs on hosted builds. */
let resolvedBase = ''

function trimBase(v: string): string {
  return v.replace(/\/$/, '')
}

function fromViteBuild(): string {
  const v = import.meta.env.VITE_MAHORAGA_API_BASE
  return typeof v === 'string' && v.trim() !== '' ? trimBase(v.trim()) : ''
}

/**
 * Call once before rendering the app. On production Pages, if the bundle has no
 * `VITE_MAHORAGA_API_BASE`, loads it from the Pages Function `/mahoraga-runtime-config`
 * (reads the same Pages env vars server-side).
 */
export async function initApiBase(): Promise<void> {
  resolvedBase = fromViteBuild()
  if (resolvedBase) return

  if (typeof window === 'undefined') return

  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1') return

  try {
    const r = await fetch('/mahoraga-runtime-config', { cache: 'no-store' })
    if (!r.ok) return
    const j = (await r.json()) as { apiBase?: string }
    const b = typeof j.apiBase === 'string' ? j.apiBase.trim() : ''
    if (b) resolvedBase = trimBase(b)
  } catch {
    /* offline or no function */
  }
}

/** Relative `/api` (local Vite proxy) or absolute Worker `/agent` URL. */
export function getApiBase(): string {
  if (resolvedBase) return resolvedBase
  return '/api'
}

export function hasWorkerApiBaseUrl(): boolean {
  const v = getApiBase()
  return v.startsWith('http://') || v.startsWith('https://')
}
