/**
 * HTTP-Hilfen für alle Edge Functions: CORS, JSON-Antworten, Fehler,
 * Grössenbegrenzung. Fehlermeldungen an Clients enthalten nie interne Details.
 */
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allow = ALLOWED.includes('*') ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'Anfrage zu gross.')
  const text = await req.text()
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Anfrage zu gross.')
  try {
    const v = JSON.parse(text || '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error()
    return v as T
  } catch {
    throw new HttpError(400, 'bad_json', 'Ungültige Anfrage.')
  }
}

/** Standard-Handler: OPTIONS, nur POST, Fehlerbehandlung. */
export function serve(fn: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
    if (req.method !== 'POST') return json(req, { error: 'method', message: 'Nur POST erlaubt.' }, 405)
    try {
      return await fn(req)
    } catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.code, message: e.message }, e.status)
      console.error('Unerwarteter Fehler', e instanceof Error ? e.message : String(e))
      return json(req, { error: 'internal', message: 'Interner Fehler. Bitte später erneut versuchen.' }, 500)
    }
  })
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unbekannt'
  )
}

export function str(v: unknown, field: string, { min = 1, max = 200, pattern }: { min?: number; max?: number; pattern?: RegExp } = {}): string {
  if (typeof v !== 'string' || v.length < min || v.length > max || (pattern && !pattern.test(v)))
    throw new HttpError(400, 'invalid', `Ungültiger Wert: ${field}`)
  return v
}

export const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/
export const TOKEN = /^[A-Za-z0-9_-]{40,64}$/
