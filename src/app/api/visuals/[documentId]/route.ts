// GET /api/visuals/[documentId]
//
// Server-side signed URL resolution for private study-visuals Storage bucket.
//
// Security model:
//   - Requires authentication (user session verified via createClient).
//   - Verifies document ownership (user_id on study_visuals row must match auth.uid()).
//   - Uses service-role client to issue signed URLs (bypasses bucket public=false).
//   - Signed URLs are valid for 5 minutes (VISUALS_SIGNED_URL_EXPIRY_SECONDS).
//   - Never returns a public URL or storage path directly to the client.
//   - Fails closed: missing ownership or signing error → 403/500 with opaque message.
//
// The response is a StudyVisualSet with image_url populated (signed URL) for each
// generated item. Failed or pending items have image_url = null.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/serviceClient'
import { logger } from '@/lib/logger'
import { VISUALS_STORAGE_BUCKET, VISUALS_SIGNED_URL_EXPIRY_SECONDS } from '@/lib/jobs/visualsStorage'
import type { StudyVisualItem, StudyVisualSet } from '@/types/studyVisual'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params

    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // ── Ownership check via authenticated client (RLS enforces user_id = auth.uid()) ──
    const { data: row, error: readError } = await supabase
      .from('study_visuals')
      .select('id, document_id, user_id, visuals, model, created_at')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (readError) {
      logger.error('visuals.signed_url.read_error', { error_code: 'READ_FAILED' })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // ── Resolve signed URLs for generated items ───────────────────────────────
    const serviceClient = createServiceClient()
    const rawVisuals = (row.visuals ?? []) as StudyVisualItem[]

    const resolvedVisuals: StudyVisualItem[] = await Promise.all(
      rawVisuals.map(async (item) => {
        if (item.status !== 'generated' || !item.storage_path) {
          return { ...item, image_url: null }
        }

        const { data: signedData, error: signError } = await serviceClient.storage
          .from(VISUALS_STORAGE_BUCKET)
          .createSignedUrl(item.storage_path, VISUALS_SIGNED_URL_EXPIRY_SECONDS)

        if (signError || !signedData?.signedUrl) {
          logger.warn('visuals.signed_url.sign_failed', { error_code: 'SIGN_FAILED' })
          return { ...item, image_url: null }
        }

        return { ...item, image_url: signedData.signedUrl }
      }),
    )

    const result: StudyVisualSet = {
      id:          row.id,
      document_id: row.document_id,
      user_id:     row.user_id,
      visuals:     resolvedVisuals,
      model:       row.model,
      created_at:  row.created_at,
    }

    return NextResponse.json(result)
  } catch {
    logger.error('visuals.signed_url.route_error', { error_code: 'ROUTE_ERROR' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
