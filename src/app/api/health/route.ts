import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  let dbStatus: 'ok' | 'error' = 'ok'
  let dbLatencyMs: number | null = null

  try {
    const supabase = await createClient()
    const dbStart = Date.now()
    const { error } = await supabase.from('documents').select('id').limit(1)
    dbLatencyMs = Date.now() - dbStart
    if (error) dbStatus = 'error'
  } catch {
    dbStatus = 'error'
  }

  const status = dbStatus === 'ok' ? 200 : 503

  return NextResponse.json(
    {
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      checks: {
        database: { status: dbStatus, latency_ms: dbLatencyMs },
      },
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
    },
    { status },
  )
}
