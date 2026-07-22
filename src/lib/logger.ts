type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const REDACTED_KEYS = new Set([
  'content', 'transcript', 'extracted_text', 'message', 'password',
  'token', 'api_key', 'secret', 'authorization', 'cookie',
])

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[deep]'
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(v => redact(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(data ? (redact(data) as Record<string, unknown>) : {}),
    }
    const str = JSON.stringify(entry)
    if (level === 'error' || level === 'warn') {
      console.error(str)
    } else {
      console.log(str)
    }
  } catch {
    // never throw from logger
  }
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => emit('debug', event, data),
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
}
