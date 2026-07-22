'use client'

import { useState, useRef, useEffect, type SyntheticEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createDocument } from '@/app/actions/subjects'
import { Button } from '@/components/ui/Button'
import { motion } from 'motion/react'
import type { Subject } from '@/types/subject'

const ACCEPTED = '.pdf,.doc,.docx,.txt,.ppt,.pptx'
const ACCEPTED_LABEL = 'PDF, Word, PowerPoint or plain text'
const HARD_NAV_MS = 4_000
const NAV_ERROR_MS = 12_000

type UploadPhase =
  | 'idle'
  | 'uploading_file'
  | 'creating_document'
  | 'opening_workspace'
  | 'error'

interface Props {
  subjects?: Subject[]
  onUploadSuccess?: () => void
}

export function StudyUploadForm({ subjects = [], onUploadSuccess }: Props) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [subjectId, setSubjectId] = useState<string>('')
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [fallbackDocId, setFallbackDocId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const hardNavigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigationErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const busy = phase !== 'idle' && phase !== 'error'

  // Track mounted state; clear both timers on unmount.
  // Successful navigation unmounts this component, which cancels all pending timers.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (hardNavigationTimeoutRef.current) clearTimeout(hardNavigationTimeoutRef.current)
      if (navigationErrorTimeoutRef.current) clearTimeout(navigationErrorTimeoutRef.current)
    }
  }, [])

  function clearNavigationTimers() {
    if (hardNavigationTimeoutRef.current) {
      clearTimeout(hardNavigationTimeoutRef.current)
      hardNavigationTimeoutRef.current = null
    }
    if (navigationErrorTimeoutRef.current) {
      clearTimeout(navigationErrorTimeoutRef.current)
      navigationErrorTimeoutRef.current = null
    }
  }

  function handleFile(selected: File | null) {
    setErrorMsg('')
    setFallbackDocId(null)
    setFile(selected)
    if (phase === 'error') setPhase('idle')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0] ?? null)
  }

  async function handleUpload(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file || busy) return

    // Cancel any leftover timers from a previous upload attempt
    clearNavigationTimers()

    setPhase('uploading_file')
    setErrorMsg('')
    setFallbackDocId(null)

    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMsg('You must be logged in to upload.')
      setPhase('error')
      return
    }

    const filePath = `${user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('study-documents')
      .upload(filePath, file)

    if (uploadError) {
      setErrorMsg(uploadError.message)
      setPhase('error')
      return
    }

    setPhase('creating_document')

    let documentId: string
    try {
      const result = await createDocument({
        title: file.name,
        file_path: filePath,
        file_type: file.type,
        subject_id: subjectId || null,
      })
      documentId = result.documentId
    } catch (err) {
      // DB failed — attempt to remove the orphaned storage object
      supabase.storage.from('study-documents').remove([filePath]).catch(() => {})
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save document. Please try again.')
      setPhase('error')
      return
    }

    setFallbackDocId(documentId)
    setFile(null)
    setSubjectId('')
    onUploadSuccess?.()

    setPhase('opening_workspace')

    const targetUrl = `/dashboard/study/${documentId}`

    // Hard-navigation fallback: if App Router navigation stalls and the component
    // is still mounted after HARD_NAV_MS, force a full page load.
    hardNavigationTimeoutRef.current = setTimeout(() => {
      hardNavigationTimeoutRef.current = null
      if (mountedRef.current) {
        window.location.assign(targetUrl)
      }
    }, HARD_NAV_MS)

    // Error timeout: if still mounted after NAV_ERROR_MS (both navigation methods failed),
    // show the error state with the manual workspace link.
    navigationErrorTimeoutRef.current = setTimeout(() => {
      navigationErrorTimeoutRef.current = null
      if (!mountedRef.current) return
      setPhase('error')
      setErrorMsg(
        'Your document was uploaded, but the workspace did not open. ' +
        'Open it from Your Documents below or try again.',
      )
    }, NAV_ERROR_MS)

    // Soft navigation — do NOT call router.refresh() immediately after this.
    // router.refresh() re-fetches the current route's server components while the
    // transition is in-flight, which races with router.push() and aborts the navigation.
    router.push(targetUrl)
    // Timers are cleared only by clearNavigationTimers() / the useEffect unmount cleanup.
  }

  const buttonLabel =
    phase === 'uploading_file'  ? 'Uploading document…' :
    phase === 'creating_document' ? 'Creating study set…' :
    phase === 'opening_workspace' ? 'Opening study workspace…' :
    'Upload document'

  return (
    <form onSubmit={handleUpload} className="flex flex-col gap-4">
      {/* Drop zone */}
      <motion.div
        animate={
          dragging
            ? { scale: 1.012, boxShadow: '0 0 52px -10px rgba(190, 28, 28, 0.32)' }
            : { scale: 1,     boxShadow: '0 0 0px 0px rgba(190, 28, 28, 0)' }
        }
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl"
      >
        <label
          data-testid="study-upload-zone"
          className={[
            'relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors duration-250',
            busy ? 'pointer-events-none opacity-60' : '',
            dragging
              ? 'border-primary/55 bg-primary/[0.05]'
              : file
                ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
                : 'border-border bg-card/80 hover:border-foreground/20 hover:bg-card',
          ].join(' ')}
          onDragOver={(e) => { if (!busy) { e.preventDefault(); setDragging(true) } }}
          onDragLeave={() => setDragging(false)}
          onDrop={busy ? undefined : handleDrop}
        >
          <input
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {phase === 'opening_workspace' ? (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08]">
                <SpinnerIcon className="h-5 w-5 text-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/70">Opening study workspace…</p>
                <p className="mt-0.5 text-xs text-foreground/30">Hang on, loading your document</p>
              </div>
            </>
          ) : file ? (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08]">
                <FileIcon className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/80">{file.name}</p>
                <p className="mt-0.5 text-xs text-foreground/30">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={[
                'flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300',
                dragging ? 'border-primary/40 bg-primary/[0.12]' : 'border-border bg-muted/50',
              ].join(' ')}>
                <UploadIcon className={`h-5 w-5 transition-colors duration-300 ${dragging ? 'text-primary' : 'text-foreground/25'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/50">
                  Drop a file or{' '}
                  <span className="text-foreground/75">click to browse</span>
                </p>
                <p className="mt-0.5 text-xs text-foreground/22">{ACCEPTED_LABEL}</p>
              </div>
            </>
          )}
        </label>
      </motion.div>

      {/* Subject selector */}
      {subjects.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/50">Subject (optional)</label>
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            disabled={busy}
            className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12 disabled:opacity-50"
          >
            <option value="">Unsorted</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error message */}
      {phase === 'error' && errorMsg && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs leading-relaxed text-red-400">
          <p>{errorMsg}</p>
          {fallbackDocId && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/study/${fallbackDocId}`)}
              className="mt-1.5 underline underline-offset-2 hover:text-red-300 transition-colors"
            >
              Open workspace manually →
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          loading={busy && phase !== 'opening_workspace'}
          disabled={!file || busy}
          size="md"
        >
          {buttonLabel}
        </Button>
      </div>
    </form>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}
