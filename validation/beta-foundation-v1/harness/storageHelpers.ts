// VALIDATION ONLY — never import from application code
// Storage test helpers for Beta Foundation V1 disposable validation.
// Prepares probes for the local disposable study-visuals bucket.
// DO NOT execute these probes without separate George approval.

import { randomUUID } from 'crypto'
import * as zlib from 'zlib'
import type { SupabaseClient } from '@supabase/supabase-js'

export const VALIDATION_BUCKET = 'study-visuals'
export const VALID_MIME_TYPE = 'image/png'

// CRC-32 polynomial table for PNG chunk CRC computation.
const CRC_TABLE: Uint32Array = (() => {
  const tbl = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    tbl[n] = c
  }
  return tbl
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Produces a content-valid 1×1 RGBA PNG (colour type 6, 8-bit depth).
// Signature, IHDR, IDAT, and IEND all use correct CRCs computed by CRC-32.
// Valid PNG signature, valid 13-byte IHDR, real zlib-deflated IDAT payload
// (one zero-filter scanline of [0x00, 0x00, 0x00, 0x00, 0xFF] = RGBA),
// zero-length IEND, no trailing bytes.
export function makeSyntheticPngBytes(): Buffer {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  // IHDR: 1×1, 8-bit, RGBA (colour type 6), deflate, adaptive filter, no interlace
  const ihdrType = Buffer.from('IHDR')
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08,                   // bit depth = 8
    0x06,                   // colour type = 6 (RGBA)
    0x00,                   // compression method = deflate
    0x00,                   // filter method = adaptive
    0x00,                   // interlace method = none
  ])
  const ihdrLen = Buffer.alloc(4); ihdrLen.writeUInt32BE(13)
  const ihdrCrcBuf = Buffer.concat([ihdrType, ihdrData])
  const ihdrCrc = Buffer.alloc(4); ihdrCrc.writeUInt32BE(crc32(ihdrCrcBuf))
  const ihdr = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc])

  // IDAT: one scanline, filter byte 0 (none), then R=0 G=0 B=0 A=255
  const rawPixels = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xFF])
  const compressed = zlib.deflateSync(rawPixels)
  const idatType = Buffer.from('IDAT')
  const idatLen = Buffer.alloc(4); idatLen.writeUInt32BE(compressed.byteLength)
  const idatCrcBuf = Buffer.concat([idatType, compressed])
  const idatCrc = Buffer.alloc(4); idatCrc.writeUInt32BE(crc32(idatCrcBuf))
  const idat = Buffer.concat([idatLen, idatType, compressed, idatCrc])

  // IEND: zero-length chunk, standard CRC
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])

  return Buffer.concat([sig, ihdr, idat, iend])
}

// Storage path: {userId}/{documentId}/{filename}
export function makeStoragePath(userId: string, documentId: string, filename?: string): string {
  return `${userId}/${documentId}/${filename ?? `${randomUUID()}.png`}`
}

export interface StorageProbeDescriptor {
  name: string
  description: string
  expectedOutcome: 'allowed' | 'denied'
}

// Probes to execute against the local disposable bucket after migration is applied.
export const STORAGE_PROBES: StorageProbeDescriptor[] = [
  {
    name: 'anonymous_public_url_denied',
    description: 'Anonymous user cannot fetch object via public URL',
    expectedOutcome: 'denied',
  },
  {
    name: 'user_a_direct_list_denied',
    description: 'User A cannot list study-visuals via direct authenticated table access',
    expectedOutcome: 'denied',
  },
  {
    name: 'user_a_direct_upload_denied',
    description: 'User A cannot upload directly via authenticated role (post-migration)',
    expectedOutcome: 'denied',
  },
  {
    name: 'user_b_denied_access_to_a_path',
    description: 'User B cannot access objects stored under User A path',
    expectedOutcome: 'denied',
  },
  {
    name: 'service_actor_valid_png_upload_succeeds',
    description: 'Local service actor can upload valid PNG to user path',
    expectedOutcome: 'allowed',
  },
  {
    name: 'invalid_mime_rejected',
    description: 'Upload with non-image MIME type is rejected',
    expectedOutcome: 'denied',
  },
  {
    name: 'oversized_upload_rejected',
    description: 'Upload exceeding bucket size limit is rejected',
    expectedOutcome: 'denied',
  },
  {
    name: 'signed_url_succeeds',
    description: 'Service actor can generate a signed URL for a stored object',
    expectedOutcome: 'allowed',
  },
  {
    name: 'signed_url_returns_image_png',
    description: 'Signed URL response has Content-Type: image/png',
    expectedOutcome: 'allowed',
  },
  {
    name: 'expired_signed_url_denied',
    description: 'Signed URL past its expiry is rejected',
    expectedOutcome: 'denied',
  },
  {
    name: 'unrelated_storage_policies_unaffected',
    description: 'study-documents and recordings policies remain unchanged after migration',
    expectedOutcome: 'allowed',
  },
]

// Upload a synthetic PNG via the service actor.
export async function uploadValidationPng(
  serviceClient: SupabaseClient,
  storagePath: string,
): Promise<{ path: string; error: null } | { path: null; error: Error }> {
  const pngBytes = makeSyntheticPngBytes()
  const { data, error } = await serviceClient.storage
    .from(VALIDATION_BUCKET)
    .upload(storagePath, pngBytes, { contentType: VALID_MIME_TYPE, upsert: false })

  if (error) return { path: null, error: new Error(error.message) }
  return { path: data.path, error: null }
}

// Remove a test object from the bucket.
export async function removeValidationObject(
  serviceClient: SupabaseClient,
  storagePath: string,
): Promise<void> {
  await serviceClient.storage.from(VALIDATION_BUCKET).remove([storagePath])
}
