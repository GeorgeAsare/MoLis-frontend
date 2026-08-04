// GET /api/visuals/[documentId]
//
// Server-side signed URL resolution for private study-visuals Storage bucket.
//
// Security model:
//   - Requires authentication (user session verified via createClient).
//   - fn_get_owner_study_visuals verifies ownership and returns public-safe fields
//     only (no storage_path, no image_prompt — stripped at the DB boundary by R8-H04).
//   - fn_get_visuals_signing_manifest (service_role only) returns raw storage_path
//     values for URL signing. Never callable by authenticated users directly.
//   - Signed URLs are valid for 5 minutes (VISUALS_SIGNED_URL_EXPIRY_SECONDS).
//   - Storage path prefix validated before signing: must start with {userId}/{documentId}/
//   - Fails closed: missing ownership or signing error → 403/500 with opaque message.
//
// The response is a PublicVisualSet with image_url populated (signed URL) for each
// generated item. Failed or pending items have image_url = null.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/serviceClient'
import { logger } from '@/lib/logger'
import { VISUALS_STORAGE_BUCKET, VISUALS_SIGNED_URL_EXPIRY_SECONDS } from '@/lib/jobs/visualsStorage'
import type { StudyVisualItem, PublicVisualItem, PublicVisualSet } from '@/types/studyVisual'

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

    // ── Ownership verification + public metadata (R8-H04) ────────────────────
    // fn_get_owner_study_visuals (authenticated) verifies ownership via auth.uid()
    // and returns only public-safe fields. storage_path and image_prompt are
    // stripped at the database boundary — not reachable via Data API either.
    const { data: publicData, error: readError } = await supabase.rpc(
      'fn_get_owner_study_visuals',
      { p_document_id: documentId },
    )

    if (readError) {
      logger.error('visuals.signed_url.read_error', { error_code: 'READ_FAILED' })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!publicData) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const publicRow = publicData as {
      id:          string
      document_id: string
      visuals:     PublicVisualItem[]
      model:       string
      created_at:  string
    }

    // ── Storage paths for URL signing (service_role only) ────────────────────
    // fn_get_visuals_signing_manifest takes p_user_id explicitly because
    // service_role bypasses RLS and auth.uid() is not available in that context.
    const serviceClient = createServiceClient()
    const { data: manifest, error: manifestError } = await serviceClient.rpc(
      'fn_get_visuals_signing_manifest',
      { p_document_id: documentId, p_user_id: user.id },
    )

    if (manifestError) {
      logger.error('visuals.signed_url.manifest_error', { error_code: 'MANIFEST_FAILED' })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Raw visuals from the signing manifest (includes storage_path). May be null
    // if no visuals row exists (concurrent delete between the two RPCs).
    const rawVisuals = (manifest ?? []) as StudyVisualItem[]

    // Expected storage path prefix: {userId}/{documentId}/
    const expectedPrefix = `${user.id}/${documentId}/`

    const resolvedVisuals: PublicVisualItem[] = await Promise.all(
      publicRow.visuals.map(async (publicItem): Promise<PublicVisualItem> => {
        // Correlate by database-validated immutable identifier, never array position.
        const rawItem = rawVisuals.find(item => item.id === publicItem.id)

        if (publicItem.status !== 'generated' || !rawItem?.storage_path) {
          return { ...publicItem, image_url: null }
        }

        // Storage path prefix ownership check.
        if (!rawItem.storage_path.startsWith(expectedPrefix)) {
          logger.error('visuals.signed_url.invalid_path_prefix', {
            error_code: 'INVALID_STORAGE_PATH_PREFIX',
          })
          return { ...publicItem, image_url: null }
        }

        const { data: signedData, error: signError } = await serviceClient.storage
          .from(VISUALS_STORAGE_BUCKET)
          .createSignedUrl(rawItem.storage_path, VISUALS_SIGNED_URL_EXPIRY_SECONDS)

        if (signError || !signedData?.signedUrl) {
          logger.warn('visuals.signed_url.sign_failed', { error_code: 'SIGN_FAILED' })
          return { ...publicItem, image_url: null }
        }

        return { ...publicItem, image_url: signedData.signedUrl }
      }),
    )

    const result: PublicVisualSet = {
      id:          publicRow.id,
      document_id: publicRow.document_id,
      visuals:     resolvedVisuals,
      model:       publicRow.model,
      created_at:  publicRow.created_at,
    }

    return NextResponse.json(result)
  } catch {
    logger.error('visuals.signed_url.route_error', { error_code: 'ROUTE_ERROR' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
