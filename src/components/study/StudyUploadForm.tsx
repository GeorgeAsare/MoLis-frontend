'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

const ACCEPTED = '.pdf,.doc,.docx,.txt,.ppt,.pptx'
const ACCEPTED_LABEL = 'PDF, Word, PowerPoint, or plain text'

export function StudyUploadForm() {
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
    const dropped = e.dataTransfer.files[0] ?? null
    handleFile(dropped)
  }

  async function handleUpload(e: React.FormEvent) {
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
  }

  return (
    <form onSubmit={handleUpload} className="flex flex-col gap-4">
      {/* Drop zone */}
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? 'border-violet-500/50 bg-violet-500/5'
            : file
            ? 'border-white/20 bg-white/5'
            : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
        }`}
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
              <FileIcon className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{file.name}</p>
              <p className="mt-0.5 text-xs text-white/35">
                {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <UploadIcon className="h-5 w-5 text-white/30" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/60">
                Drop a file or <span className="text-white/80">click to browse</span>
              </p>
              <p className="mt-0.5 text-xs text-white/25">{ACCEPTED_LABEL}</p>
            </div>
          </>
        )}
      </label>

      {/* Status */}
      {status ? (
        <p
          className={`rounded-lg border px-3.5 py-2.5 text-xs ${
            status.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          {status.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" loading={loading} disabled={!file}>
          Upload document
        </Button>
      </div>

      {/* Empty documents state */}
      <div className="mt-6 border-t border-white/[0.06] pt-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-white/20">
          Your documents
        </p>
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] py-10 text-center">
          <DocumentsEmptyIcon className="mb-3 h-8 w-8 text-white/10" />
          <p className="text-sm text-white/30">No documents uploaded yet</p>
          <p className="mt-1 text-xs text-white/20">
            Uploaded files will appear here
          </p>
        </div>
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

function DocumentsEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  )
}
