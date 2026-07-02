'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { motion } from 'motion/react'

const ACCEPTED = '.pdf,.doc,.docx,.txt,.ppt,.pptx'
const ACCEPTED_LABEL = 'PDF, Word, PowerPoint or plain text'

interface Props {
  onUploadSuccess?: () => void
}

export function StudyUploadForm({ onUploadSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)

  function handleFile(selected: File | null) {
    setStatus(null)
    setFile(selected)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0] ?? null)
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file) {
      setStatus({ type: 'error', message: 'Please choose a file first.' })
      return
    }

    setLoading(true)
    setStatus(null)

    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      setStatus({ type: 'error', message: 'You must be logged in to upload.' })
      setLoading(false)
      return
    }

    const filePath = `${user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('study-documents')
      .upload(filePath, file)

    if (uploadError) {
      setStatus({ type: 'error', message: uploadError.message })
      setLoading(false)
      return
    }

    const { error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      title: file.name,
      file_path: filePath,
      file_type: file.type,
    })

    if (dbError) {
      setStatus({ type: 'error', message: dbError.message })
      setLoading(false)
      return
    }

    setStatus({ type: 'success', message: 'Document uploaded. MoLis is processing it.' })
    setFile(null)
    setLoading(false)
    onUploadSuccess?.()
  }

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
        className={[
          'relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors duration-250',
          dragging
            ? 'border-primary/55 bg-primary/[0.05]'
            : file
              ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
              : 'border-border bg-card/80 hover:border-foreground/20 hover:bg-card',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
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
              dragging
                ? 'border-primary/40 bg-primary/[0.12]'
                : 'border-border bg-muted/50',
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

      {/* Status message */}
      {status && (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-xs leading-relaxed',
            status.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
              : 'border-red-500/20 bg-red-500/[0.07] text-red-400',
          ].join(' ')}
        >
          {status.message}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={loading} disabled={!file} size="md">
          Upload document
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
