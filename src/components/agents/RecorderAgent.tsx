'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { processRecording, deleteRecording, retryAnalysis, createStudySetFromRecording } from '@/app/actions/recordings'
import type {
  AgentClassification,
  AgentInsight,
  ContentType,
  DetailType,
  ExamReadiness,
  ImportantDetail,
  KeyTerm,
  Recording,
  RecordingNotes,
  RecommendedAction,
  StudyRelevance,
  TranscriptDiagnostics,
  TranscriptQuality,
} from '@/types/recordings'
import type { Subject } from '@/types/subject'

// ── Types ─────────────────────────────────────────────────────────────────────

type RecorderState = 'idle' | 'recording' | 'recorded' | 'processing' | 'complete' | 'error' | 'analysis_failed'

type RecorderNoticeType =
  | 'general_note'       // non-study content or low/none relevance — neutral, not a failure
  | 'weak_audio_capture' // transcript too sparse for recording length
  | 'too_short'          // recording under minimum viable length
  | 'fallback_analysis'  // study-relevant content but advanced extraction fell back
  | 'partial_extraction' // study-relevant + good audio but very few terms/details found
  | 'none'               // full extraction worked — no notice needed

interface ProcessingStep {
  id: string
  label: string
  done: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DETAIL_TYPE_LABEL: Record<DetailType, string> = {
  definition: 'Definition',
  example: 'Example',
  warning: 'Warning',
  exam_hint: 'Exam Hint',
  process: 'Process',
  formula: 'Formula',
  concept: 'Concept',
  action_item: 'Action',
}

const DETAIL_TYPE_COLOR: Record<DetailType, string> = {
  definition: 'border-blue-500/20 bg-blue-500/[0.06] text-blue-400',
  example: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400',
  warning: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-400',
  exam_hint: 'border-primary/20 bg-primary/[0.06] text-primary/80',
  process: 'border-violet-500/20 bg-violet-500/[0.06] text-violet-400',
  formula: 'border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-400',
  concept: 'border-border bg-muted/30 text-foreground/55',
  action_item: 'border-orange-500/20 bg-orange-500/[0.06] text-orange-400',
}

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  lecture:           'Lecture',
  class_explanation: 'Class Explanation',
  meeting:           'Meeting',
  interview:         'Interview',
  podcast:           'Podcast / Conversation',
  personal_note:     'Personal Note',
  random_audio:      'Random Audio',
  unclear:           'Unclear',
}

const RELEVANCE_COLOR: Record<StudyRelevance, string> = {
  high:   'text-emerald-400',
  medium: 'text-amber-400',
  low:    'text-orange-400',
  none:   'text-foreground/35',
}

const RELEVANCE_LABEL: Record<StudyRelevance, string> = {
  high:   'High relevance',
  medium: 'Medium relevance',
  low:    'Low relevance',
  none:   'Not study material',
}

const ACTION_LABEL: Record<RecommendedAction, string> = {
  create_study_notes:        'Create study notes',
  record_longer_sample:      'Record a longer sample',
  save_as_general_note:      'Save as general note',
  ignore_or_delete:          'Consider deleting — no study value',
  send_to_study_agent_later: 'Send to Study Agent later',
}

const QUALITY_BADGE: Record<TranscriptQuality, { label: string; color: string }> = {
  good:      { label: 'Good quality',   color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.06]' },
  unclear:   { label: 'Partial quality',color: 'text-amber-400 border-amber-500/20 bg-amber-500/[0.06]' },
  weak:      { label: 'Weak capture',   color: 'text-orange-400 border-orange-500/20 bg-orange-500/[0.06]' },
  too_short: { label: 'Too short',      color: 'text-foreground/40 border-border bg-muted/20' },
}

const EXAM_READINESS_BADGE: Record<ExamReadiness, { label: string; color: string }> = {
  high:         { label: 'Exam ready',              color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.06]' },
  medium:       { label: 'Partially exam ready',    color: 'text-amber-400 border-amber-500/20 bg-amber-500/[0.06]' },
  low:          { label: 'Limited exam value',      color: 'text-orange-400 border-orange-500/20 bg-orange-500/[0.06]' },
  insufficient: { label: 'Not enough information',  color: 'text-foreground/30 border-border bg-muted/20' },
}

// Content types that are inherently non-study (regardless of relevance score)
const GENERAL_NOTE_CONTENT_TYPES: ContentType[] = ['podcast', 'interview', 'personal_note', 'random_audio']

function getRecorderNotice(
  notes: RecordingNotes | null,
  keyTermsCount: number,
  detailsCount: number,
): RecorderNoticeType {
  if (!notes) return 'none'

  const quality = notes.transcript_diagnostics?.transcript_quality
  const studyRelevance = notes.agent_classification?.study_relevance
  const contentType = notes.agent_classification?.content_type
  const mode = notes.analysis_mode

  // Audio/length failures — checked first, most fundamental
  if (quality === 'too_short') return 'too_short'
  if (quality === 'weak') return 'weak_audio_capture'

  // Non-study content: classified by type OR explicit low/none relevance
  const isNonStudyType = contentType ? GENERAL_NOTE_CONTENT_TYPES.includes(contentType) : false
  const isLowRelevance = studyRelevance === 'low' || studyRelevance === 'none'
  if (isNonStudyType || isLowRelevance) return 'general_note'

  // Study-relevant content that fell back to basic analysis
  const isStudyRelevant = studyRelevance === 'medium' || studyRelevance === 'high'
  if (mode === 'fallback' && isStudyRelevant) return 'fallback_analysis'

  // Study-relevant with good audio but very sparse results
  if (isStudyRelevant && quality === 'good' && keyTermsCount + detailsCount < 3) {
    return 'partial_extraction'
  }

  return 'none'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCEPTED_AUDIO = 'audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/m4a,audio/x-m4a'

function extFromMime(mime: string): string {
  if (mime.includes('mp4'))  return 'mp4'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('wav'))  return 'wav'
  if (mime.includes('m4a'))  return 'm4a'
  return 'webm'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecorderAgent({
  initialRecordings,
  initialSubjects = [],
  initialStudyDocIds = {},
}: {
  initialRecordings: Recording[]
  initialSubjects?: Subject[]
  initialStudyDocIds?: Record<string, string>
}) {
  const [state, setState]               = useState<RecorderState>('idle')
  const [seconds, setSeconds]           = useState(0)
  const [audioBlob, setAudioBlob]       = useState<Blob | null>(null)
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null)
  const [mimeType, setMimeType]         = useState('audio/webm')
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [title, setTitle]               = useState('')
  const [subject, setSubject]           = useState('')
  const [subjectId, setSubjectId]       = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [steps, setSteps]               = useState<ProcessingStep[]>([])
  const [result, setResult]             = useState<Recording | null>(null)
  const [insight, setInsight]           = useState<AgentInsight | null>(null)
  const [recordings, setRecordings]     = useState<Recording[]>(initialRecordings)
  const [activeTab, setActiveTab]       = useState<'notes' | 'terms' | 'details' | 'transcript'>('notes')
  const [studyDocIds, setStudyDocIds]   = useState<Map<string, string>>(() => new Map(Object.entries(initialStudyDocIds)))

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const blobUrlRef       = useRef<string | null>(null)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const tickTimer = useCallback(() => {
    setSeconds(s => s + 1)
  }, [])

  async function startRecording() {
    console.log('[recorder] start clicked')
    setError(null)
    setSeconds(0)
    chunksRef.current = []

    // Browser support checks
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support audio recording. Please use Chrome, Firefox, or Safari 14.1+.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser. Please use a modern browser.')
      return
    }

    let stream: MediaStream
    try {
      console.log('[recorder] requesting microphone')
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log('[recorder] microphone granted')
    } catch (err) {
      const name = (err as DOMException).name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Microphone permission was blocked. Click the microphone icon in the address bar or go to browser settings → Site permissions and allow microphone access for this site.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.')
      } else {
        setError(`Could not access microphone: ${(err as DOMException).message || String(err)}`)
      }
      console.error('[recorder] start failed', err)
      return
    }

    // MIME type selection — try candidates in order, fall back to no mimeType
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
    ]
    const selectedMime = candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    const resolvedMime = selectedMime || 'audio/webm'
    setMimeType(resolvedMime)
    console.log('[recorder] mime selected', resolvedMime || '(browser default)')

    let recorder: MediaRecorder
    try {
      recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream)
    } catch (err) {
      stream.getTracks().forEach(t => t.stop())
      setError(`Recording format not supported: ${(err as DOMException).message || String(err)}. Try a different browser.`)
      console.error('[recorder] start failed', err)
      return
    }

    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: resolvedMime })
      setAudioBlob(blob)
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      setAudioBlobUrl(url)
      stream.getTracks().forEach(t => t.stop())
      setState('recorded')
    }

    try {
      recorder.start(250)
    } catch (err) {
      stream.getTracks().forEach(t => t.stop())
      setError(`Failed to start recording: ${(err as DOMException).message || String(err)}`)
      console.error('[recorder] start failed', err)
      return
    }

    console.log('[recorder] recorder started')
    setState('recording')
    timerRef.current = setInterval(tickTimer, 1000)
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const url = URL.createObjectURL(file)
    blobUrlRef.current = url

    setAudioBlob(file)
    setAudioBlobUrl(url)
    setMimeType(file.type || 'audio/webm')
    setUploadedFileName(file.name)
    setSeconds(0)
    setState('recorded')

    // reset the input so the same file can be re-selected if needed
    e.target.value = ''
  }

  async function handleProcess() {
    if (!audioBlob || !title.trim()) {
      setError('Please enter a title before processing.')
      return
    }

    if (audioBlob.size > 24 * 1024 * 1024) {
      setError('Recording exceeds 24 MB (OpenAI Whisper limit). Please record a shorter segment.')
      return
    }

    setError(null)
    setState('processing')

    const processingSteps: ProcessingStep[] = [
      { id: 'upload',      label: 'Uploading audio to secure storage…', done: false },
      { id: 'transcribe',  label: 'Transcribing with Whisper…',          done: false },
      { id: 'analyse',     label: 'Analysing transcript (no guessing)…', done: false },
      { id: 'save',        label: 'Saving results…',                     done: false },
    ]
    setSteps(processingSteps)

    const markDone = (id: string) =>
      setSteps(prev => prev.map(s => s.id === id ? { ...s, done: true } : s))

    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Not authenticated. Please sign in again.')

      const recordingId = crypto.randomUUID()
      const ext = extFromMime(mimeType)
      const audio_path = `${user.id}/${recordingId}.${ext}`

      // Upload audio client-side
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(audio_path, audioBlob, { contentType: mimeType, upsert: false })

      if (uploadError) {
        if (uploadError.message.toLowerCase().includes('bucket')) {
          throw new Error(
            'STORAGE_SETUP_REQUIRED: The "recordings" storage bucket does not exist in your Supabase project. ' +
            'See setup instructions.',
          )
        }
        throw new Error(`Upload failed: ${uploadError.message}`)
      }
      markDone('upload')

      const { recording: rec, agent_insight, analysis_status, user_message } = await processRecording({
        recordingId,
        title: title.trim(),
        subject: subject.trim(),
        subject_id: subjectId,
        audio_path,
        duration_seconds: seconds,
        mime_type: mimeType,
      })

      markDone('transcribe')
      setRecordings(prev => [rec, ...prev])

      if (analysis_status === 'analysis_failed') {
        setResult(rec)
        setError(user_message ?? 'Transcript saved, but AI note analysis failed. Click "Retry analysis" to try again.')
        setState('analysis_failed')
      } else {
        markDone('analyse')
        markDone('save')
        setResult(rec)
        setInsight(agent_insight)
        setState('complete')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setState('error')
    }
  }

  function resetToIdle(keepRecent = false) {
    setState('idle')
    setAudioBlob(null)
    setAudioBlobUrl(null)
    setUploadedFileName(null)
    setTitle('')
    setSubject('')
    setSubjectId(null)
    setError(null)
    setSeconds(0)
    if (!keepRecent) {
      setResult(null)
      setInsight(null)
    }
    setSteps([])
  }

  function handleStudyDocCreated(recordingId: string, docId: string) {
    setStudyDocIds(prev => new Map(prev).set(recordingId, docId))
  }

  async function handleDeleteRecording(id: string) {
    try {
      await deleteRecording(id)
      setRecordings(prev => prev.filter(r => r.id !== id))
      if (result?.id === id) resetToIdle()
    } catch {
      // silent — not critical
    }
  }

  async function handleRetryAnalysis(recordingId: string) {
    setError(null)
    setState('processing')
    setSteps([{ id: 'analyse', label: 'Re-analysing saved transcript (no guessing)…', done: false }])

    try {
      const { recording: rec, agent_insight, analysis_status, user_message } = await retryAnalysis(recordingId)

      setRecordings(prev => prev.map(r => r.id === rec.id ? rec : r))

      if (analysis_status === 'analysis_failed') {
        setResult(rec)
        setError(user_message ?? 'Analysis failed again. Your transcript is still saved. Try again in a moment.')
        setState('analysis_failed')
      } else {
        setSteps(prev => prev.map(s => ({ ...s, done: true })))
        setResult(rec)
        setInsight(agent_insight)
        setState('complete')
        setActiveTab('notes')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setState('error')
    }
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col min-h-0 p-8 max-w-4xl">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/[0.08]">
            <MicIcon className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            AI Lecture Recorder
          </h1>
        </div>
        <p className="text-sm text-foreground/40 ml-11">
          Record lectures and turn them into grounded study notes
        </p>
      </div>

      <div className="flex flex-col gap-8">

        {/* ── Main recording card ── */}
        <div className="rounded-2xl border border-border bg-card/60 p-6">

          {/* Idle */}
          {state === 'idle' && (
            <div className="flex flex-col gap-6 py-2">

              {/* Record section */}
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl animate-pulse" />
                  <button
                    onClick={startRecording}
                    data-testid="record-button"
                    className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/[0.08] transition-all hover:border-primary/50 hover:bg-primary/[0.14] hover:scale-105"
                    aria-label="Start recording"
                  >
                    <MicIcon className="h-8 w-8 text-primary" />
                  </button>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground/60">Record live audio</p>
                    <p className="mt-1 text-xs text-foreground/30">
                      Uses your microphone — allow access when prompted
                    </p>
                  </div>
                  <button
                    onClick={startRecording}
                    className="rounded-xl border border-primary/25 bg-primary/[0.08] px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14]"
                  >
                    Start Recording
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-border/40" />
                <span className="text-[11px] text-foreground/25 shrink-0">or upload an audio file</span>
                <div className="flex-1 border-t border-border/40" />
              </div>

              {/* Upload section */}
              <div className="flex flex-col items-center gap-3 pb-2">
                <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-8 py-6 text-center transition-colors hover:border-foreground/20 hover:bg-muted/30 w-full">
                  <input
                    type="file"
                    accept={ACCEPTED_AUDIO}
                    className="sr-only"
                    onChange={handleFileUpload}
                  />
                  <UploadIcon className="h-7 w-7 text-foreground/20" />
                  <div>
                    <p className="text-sm font-medium text-foreground/55">Upload lecture audio</p>
                    <p className="mt-1 text-xs text-foreground/30">
                      webm · mp4 · mp3 · wav · m4a
                    </p>
                  </div>
                </label>
              </div>

              {/* Error (mic failures, etc.) */}
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs leading-relaxed text-red-400">
                  {error}
                  <p className="mt-1.5 text-red-400/60">
                    If recording is blocked, upload an audio file instead using the section above.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recording */}
          {state === 'recording' && (
            <div className="flex flex-col items-center gap-6 py-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <button
                  onClick={stopRecording}
                  className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/60 bg-primary/[0.14] transition-all hover:bg-primary/20"
                >
                  <StopIcon className="h-8 w-8 text-primary" />
                </button>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-2xl font-mono font-semibold tabular-nums text-foreground">
                    {formatDuration(seconds)}
                  </span>
                </div>
                <p className="text-xs text-foreground/35">Recording… click to stop</p>
                {seconds >= 1140 && (
                  <p className="text-xs text-amber-400/80">
                    Approaching 20 min — Whisper has a 25 MB file limit
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Recorded */}
          {state === 'recorded' && (
            <div className="flex flex-col gap-5">
              {/* Audio preview */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground/50">
                    {uploadedFileName ? `Uploaded: ${uploadedFileName}` : 'Recording preview'}
                  </p>
                  {!uploadedFileName && (
                    <span className="text-xs text-foreground/30">{formatDuration(seconds)}</span>
                  )}
                </div>
                {audioBlobUrl && (
                  <audio
                    controls
                    src={audioBlobUrl}
                    className="w-full h-10 rounded-lg [&::-webkit-media-controls-panel]:bg-muted/50"
                  />
                )}
              </div>

              {/* Title + subject */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground/50">
                    Lecture title <span className="text-primary">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. OOP — Inheritance and Polymorphism"
                    className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground/50">Subject / module</label>
                  {initialSubjects.length > 0 ? (
                    <select
                      value={subjectId ?? ''}
                      onChange={e => {
                        const id = e.target.value
                        setSubjectId(id || null)
                        const found = initialSubjects.find(s => s.id === id)
                        setSubject(found?.name ?? '')
                      }}
                      className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
                    >
                      <option value="">Unsorted</option>
                      {initialSubjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder="e.g. CS2001 — Object-Oriented Programming"
                      className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/25 focus:border-foreground/25 focus:outline-none focus:ring-1 focus:ring-foreground/12"
                    />
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleProcess}
                  disabled={!title.trim()}
                  className="flex-1 rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Transcribe &amp; Analyse
                </button>
                <button
                  onClick={() => resetToIdle()}
                  className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground/45 transition-colors hover:text-foreground/70"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* Processing */}
          {state === 'processing' && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <p className="text-sm font-medium text-foreground/70">Agent is working…</p>
              </div>
              <div className="flex flex-col gap-2 pl-9">
                {steps.map(step => (
                  <div key={step.id} className="flex items-center gap-2">
                    {step.done ? (
                      <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                    )}
                    <span className={`text-xs ${step.done ? 'text-foreground/50 line-through' : 'text-foreground/70'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs leading-relaxed text-red-400">
                {error}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setState('recorded')}
                  className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-sm text-foreground/55 hover:text-foreground/80"
                >
                  Go back
                </button>
                <button
                  onClick={() => resetToIdle()}
                  className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-sm text-foreground/55 hover:text-foreground/80"
                >
                  Start over
                </button>
              </div>
            </div>
          )}

          {/* Analysis failed — transcript saved, show retry */}
          {state === 'analysis_failed' && result && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-amber-400">Transcript saved — AI analysis failed</p>
                <p className="text-xs text-amber-400/70 leading-5">{error}</p>
              </div>

              {result.transcript && (
                <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 max-h-[280px] overflow-y-auto">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                    Saved transcript
                  </p>
                  <p className="text-xs text-foreground/50 leading-6 whitespace-pre-wrap font-mono select-text">
                    {result.transcript}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleRetryAnalysis(result.id)}
                  className="flex-1 rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14]"
                >
                  Retry analysis
                </button>
                <button
                  onClick={() => resetToIdle()}
                  className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground/45 transition-colors hover:text-foreground/70"
                >
                  New recording
                </button>
              </div>
            </div>
          )}

          {/* Complete */}
          {state === 'complete' && result && insight && (
            <RecordingResults
              recording={result}
              insight={insight}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onNewRecording={resetToIdle}
              studyDocId={studyDocIds.get(result.id) ?? null}
              onStudyDocCreated={(docId) => handleStudyDocCreated(result.id, docId)}
            />
          )}

        </div>

        {/* ── Recent recordings ── */}
        {recordings.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25">
              Recent recordings
            </p>
            <div className="flex flex-col gap-2">
              {recordings.map(rec => (
                <RecentRecordingRow
                  key={rec.id}
                  rec={rec}
                  isActive={result?.id === rec.id}
                  studyDocId={studyDocIds.get(rec.id) ?? null}
                  onOpen={() => {
                    if (rec.status === 'complete') {
                      setResult(rec)
                      setInsight({
                        key_terms_found: rec.key_terms?.length ?? 0,
                        exam_relevant_count: rec.important_details?.filter(d => d.type === 'exam_hint').length ?? 0,
                        unclear_count: rec.notes?.unclear_or_low_confidence_parts?.length ?? 0,
                        recommended_next: 'Review key terms and send to Study Agent when ready.',
                      })
                      setState('complete')
                      setActiveTab('notes')
                    }
                  }}
                  onRetry={() => handleRetryAnalysis(rec.id)}
                  onDelete={() => handleDeleteRecording(rec.id)}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── RecordingResults ──────────────────────────────────────────────────────────

type ConversionPhase = 'idle' | 'converting' | 'done' | 'error'

function RecordingResults({
  recording,
  insight,
  activeTab,
  onTabChange,
  onNewRecording,
  studyDocId,
  onStudyDocCreated,
}: {
  recording: Recording
  insight: AgentInsight
  activeTab: 'notes' | 'terms' | 'details' | 'transcript'
  onTabChange: (tab: 'notes' | 'terms' | 'details' | 'transcript') => void
  onNewRecording: () => void
  studyDocId: string | null
  onStudyDocCreated: (docId: string) => void
}) {
  const [conversionPhase, setConversionPhase] = useState<ConversionPhase>(studyDocId ? 'done' : 'idle')
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [resolvedDocId, setResolvedDocId] = useState<string | null>(studyDocId)

  async function handleConvert() {
    setConversionPhase('converting')
    setConversionError(null)
    try {
      const { documentId } = await createStudySetFromRecording(recording.id)
      setResolvedDocId(documentId)
      onStudyDocCreated(documentId)
      setConversionPhase('done')
    } catch (err) {
      setConversionError(err instanceof Error ? err.message : 'Conversion failed. Please try again.')
      setConversionPhase('error')
    }
  }
  const notes = recording.notes as RecordingNotes | null
  const classification = notes?.agent_classification as AgentClassification | undefined
  const diagnostics = notes?.transcript_diagnostics as TranscriptDiagnostics | undefined
  const examReadiness = notes?.exam_readiness as ExamReadiness | undefined
  const keyTerms = (recording.key_terms as KeyTerm[] | null) ?? []
  const importantDetails = (recording.important_details as ImportantDetail[] | null) ?? []
  const noticeType = getRecorderNotice(notes, keyTerms.length, importantDetails.length)

  return (
    <div className="flex flex-col gap-5">

      {/* Transcript diagnostics + exam readiness header */}
      <div className="rounded-xl border border-primary/12 bg-primary/[0.04] px-4 py-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <p className="text-xs font-semibold text-foreground/70">Agent summary</p>
          </div>
          {/* Exam readiness + quality badges */}
          <div className="flex items-center gap-2">
            {diagnostics && (
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${QUALITY_BADGE[diagnostics.transcript_quality].color}`}>
                {QUALITY_BADGE[diagnostics.transcript_quality].label}
              </span>
            )}
            {examReadiness && (
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${EXAM_READINESS_BADGE[examReadiness].color}`}>
                {EXAM_READINESS_BADGE[examReadiness].label}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/50 pl-5">
          <span>Found <strong className="text-foreground/70">{insight.key_terms_found}</strong> key terms</span>
          <span><strong className="text-foreground/70">{insight.exam_relevant_count}</strong> exam-relevant details</span>
          {insight.unclear_count > 0 && (
            <span className="text-amber-400/80">
              <strong>{insight.unclear_count}</strong> unclear areas
            </span>
          )}
          {diagnostics && (
            <span>
              {diagnostics.transcript_word_count} words · ~{diagnostics.words_per_minute} wpm
            </span>
          )}
        </div>

        {/* Weak quality warning */}
        {diagnostics && (diagnostics.transcript_quality === 'weak' || diagnostics.transcript_quality === 'too_short') && (
          <div className="ml-5 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
            <p className="text-xs text-amber-400/80 leading-5">{diagnostics.quality_reason}</p>
            {diagnostics.transcript_quality === 'weak' && (
              <p className="text-[11px] text-amber-400/55 mt-1">
                This recording did not capture enough detail to generate exam-ready notes.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-foreground/45 pl-5">
          <span className="text-foreground/30">Recommended: </span>{insight.recommended_next}
        </p>
      </div>

      {/* Agent judgement */}
      {classification && (
        <AgentJudgement classification={classification} />
      )}

      {/* Context-aware recorder notice */}
      <RecorderNotice
        type={noticeType}
        classification={classification}
        onNewRecording={onNewRecording}
      />

      {/* Summary */}
      {recording.summary && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-1.5">
            Summary
          </p>
          <p className="text-sm leading-6 text-foreground/65">{recording.summary}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/40">
        {(['notes', 'terms', 'details', 'transcript'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={[
              'px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'border-primary text-foreground/80'
                : 'border-transparent text-foreground/35 hover:text-foreground/60',
            ].join(' ')}
          >
            {tab === 'terms' ? 'Key Terms' : tab === 'details' ? 'Details' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'terms' && keyTerms.length > 0 && (
              <span className="ml-1.5 text-[10px] text-foreground/30">({keyTerms.length})</span>
            )}
            {tab === 'details' && importantDetails.length > 0 && (
              <span className="ml-1.5 text-[10px] text-foreground/30">({importantDetails.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0">

        {/* Notes tab */}
        {activeTab === 'notes' && notes && (
          <div className="flex flex-col gap-6">

            {notes.key_points.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Key points
                </p>
                <ul className="flex flex-col gap-1.5">
                  {notes.key_points.map((pt, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground/65">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notes.sections.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25">
                  Lecture outline
                </p>
                {notes.sections.map((s, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <p className="text-xs font-semibold text-foreground/65 mb-1.5">{s.heading}</p>
                    <p className="text-sm leading-6 text-foreground/55">{s.content}</p>
                  </div>
                ))}
              </div>
            )}

            {notes.definitions && notes.definitions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Definitions
                </p>
                <div className="flex flex-col gap-2">
                  {notes.definitions.map((d, i) => (
                    <div key={i} className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-4 py-2.5">
                      <p className="text-xs font-semibold text-blue-400/80 mb-0.5">{d.term}</p>
                      <p className="text-sm leading-6 text-foreground/60">{d.definition}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.examples && notes.examples.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Examples
                </p>
                <div className="flex flex-col gap-2">
                  {notes.examples.map((ex, i) => (
                    <div key={i} className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-2.5">
                      <p className="text-sm leading-6 text-foreground/65">{ex.description}</p>
                      {ex.context && (
                        <p className="text-xs text-foreground/35 mt-1 italic">{ex.context}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.common_mistakes && notes.common_mistakes.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Common mistakes
                </p>
                <div className="flex flex-col gap-2">
                  {notes.common_mistakes.map((m, i) => (
                    <div key={i} className="rounded-xl border border-red-500/15 bg-red-500/[0.04] px-4 py-2.5 flex flex-col gap-1">
                      <p className="text-xs text-red-400/70 line-through">{m.mistake}</p>
                      <p className="text-sm text-foreground/65 leading-6">{m.correction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.code_examples && notes.code_examples.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Code examples
                </p>
                <div className="flex flex-col gap-3">
                  {notes.code_examples.map((ce, i) => (
                    <div key={i} className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-violet-500/10">
                        <p className="text-[10px] font-semibold text-violet-400/70 uppercase tracking-wider">{ce.language}</p>
                      </div>
                      <pre className="px-4 py-3 text-xs text-foreground/65 leading-6 font-mono overflow-x-auto whitespace-pre-wrap">
                        {ce.code}
                      </pre>
                      {ce.description && (
                        <p className="px-4 pb-3 text-xs text-foreground/40 italic">{ce.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.formulas && notes.formulas.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Formulas
                </p>
                <div className="flex flex-col gap-2">
                  {notes.formulas.map((f, i) => (
                    <div key={i} className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] px-4 py-2.5">
                      <p className="text-sm font-mono text-cyan-400/80 mb-1">{f.expression}</p>
                      <p className="text-xs text-foreground/50">{f.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.possible_exam_questions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Possible exam questions
                </p>
                <ul className="flex flex-col gap-2">
                  {notes.possible_exam_questions.map((q, i) => (
                    <li key={i} className="flex gap-2.5 rounded-xl border border-primary/10 bg-primary/[0.03] px-4 py-2.5">
                      <span className="shrink-0 font-mono text-[10px] text-primary/50 mt-0.5 font-bold">Q{i + 1}</span>
                      <span className="text-sm text-foreground/65 leading-6">{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notes.flashcard_seed_items && notes.flashcard_seed_items.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/25 mb-2">
                  Flashcard seeds <span className="normal-case text-foreground/20 font-normal">({notes.flashcard_seed_items.length})</span>
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {notes.flashcard_seed_items.map((fc, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card/60 px-3 py-2.5 flex flex-col gap-1.5">
                      <p className="text-xs font-semibold text-foreground/70">{fc.front}</p>
                      <p className="text-xs text-foreground/45 leading-5 border-t border-border/40 pt-1.5">{fc.back}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes.unclear_or_low_confidence_parts.length > 0 && (
              <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-400/60 mb-2">
                  Unclear / low confidence areas
                </p>
                <ul className="flex flex-col gap-1.5">
                  {notes.unclear_or_low_confidence_parts.map((u, i) => (
                    <li key={i} className="text-xs text-amber-400/70 leading-5">{u}</li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}

        {/* Key terms tab */}
        {activeTab === 'terms' && (
          <div className="flex flex-col gap-3">
            {keyTerms.length === 0 ? (
              <p className="text-sm text-foreground/35">No key terms were extracted.</p>
            ) : (
              keyTerms.map((kt, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/60 px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground/80">{kt.term}</p>
                    <ImportanceScore score={kt.importance_score} />
                  </div>
                  <p className="text-sm leading-6 text-foreground/60">{kt.definition}</p>
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/25 mb-1">
                      Evidence
                    </p>
                    <p className="text-xs leading-5 text-foreground/45 italic">
                      &ldquo;{kt.evidence}&rdquo;
                    </p>
                  </div>
                  {kt.related_terms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {kt.related_terms.map(rt => (
                        <span
                          key={rt}
                          className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-foreground/40"
                        >
                          {rt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Details tab */}
        {activeTab === 'details' && (
          <div className="flex flex-col gap-3">
            {importantDetails.length === 0 ? (
              <p className="text-sm text-foreground/35">No important details were extracted.</p>
            ) : (
              importantDetails.map((d, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/60 px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${DETAIL_TYPE_COLOR[d.type]}`}
                    >
                      {DETAIL_TYPE_LABEL[d.type]}
                    </span>
                    <p className="text-sm font-semibold text-foreground/75">{d.title}</p>
                  </div>
                  <p className="text-sm leading-6 text-foreground/60">{d.explanation}</p>
                  <p className="text-xs text-foreground/40">
                    <span className="font-medium text-foreground/30">Why it matters: </span>
                    {d.why_it_matters}
                  </p>
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/25 mb-1">
                      Evidence
                    </p>
                    <p className="text-xs leading-5 text-foreground/45 italic">
                      &ldquo;{d.evidence}&rdquo;
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Transcript tab */}
        {activeTab === 'transcript' && (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 max-h-[400px] overflow-y-auto">
            {recording.transcript ? (
              <p className="text-sm leading-7 text-foreground/60 whitespace-pre-wrap select-text font-mono text-xs">
                {recording.transcript}
              </p>
            ) : (
              <p className="text-sm text-foreground/35">Transcript not available.</p>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
        {conversionError && (
          <p className="text-xs text-red-400/80">{conversionError}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={onNewRecording}
            className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-sm text-foreground/50 transition-colors hover:text-foreground/75"
          >
            New recording
          </button>
          <div className="flex-1" />
          {conversionPhase === 'done' && resolvedDocId ? (
            <a
              href={`/dashboard/study/${resolvedDocId}`}
              className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.15]"
            >
              Open Study Set →
            </a>
          ) : conversionPhase === 'converting' ? (
            <button
              disabled
              className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-2 text-sm text-primary/50 cursor-not-allowed"
            >
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/40 border-t-transparent" />
              Creating Study Set…
            </button>
          ) : (
            <button
              onClick={handleConvert}
              data-testid="send-to-study-btn"
              className="rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.14]"
            >
              Send to Study Agent
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── RecentRecordingRow ────────────────────────────────────────────────────────

function RecentRecordingRow({
  rec,
  isActive,
  studyDocId,
  onOpen,
  onRetry,
  onDelete,
}: {
  rec: Recording
  isActive: boolean
  studyDocId: string | null
  onOpen: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const statusColor: Record<string, string> = {
    complete:             'text-emerald-400',
    processing:           'text-amber-400',
    error:                'text-red-400',
    transcription_failed: 'text-red-400',
    analysis_failed:      'text-amber-400',
    draft:                'text-foreground/30',
  }

  const statusLabel: Record<string, string> = {
    complete:             'complete',
    processing:           'processing',
    error:                'failed',
    transcription_failed: 'no transcript',
    analysis_failed:      'analysis failed',
    draft:                'draft',
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        isActive
          ? 'border-primary/20 bg-primary/[0.04]'
          : 'border-border bg-card/40 hover:border-foreground/12',
      ].join(' ')}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground/75">{rec.title}</p>
          <span className={`text-[10px] font-semibold uppercase ${statusColor[rec.status] ?? 'text-foreground/30'}`}>
            {statusLabel[rec.status] ?? rec.status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-foreground/30 mt-0.5">
          {rec.subject && <span className="truncate max-w-[120px]">{rec.subject}</span>}
          {rec.subject && <span>·</span>}
          <span>{new Date(rec.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          {rec.duration_seconds ? <span>· {Math.floor(rec.duration_seconds / 60)}m {rec.duration_seconds % 60}s</span> : null}
          {rec.key_terms ? <span>· {(rec.key_terms as KeyTerm[]).length} terms</span> : null}
          {(() => {
            const cls = (rec.notes as (RecordingNotes & { agent_classification?: AgentClassification }) | null)?.agent_classification
            if (!cls) return null
            return (
              <>
                <span>·</span>
                <span>{CONTENT_TYPE_LABEL[cls.content_type]}</span>
                <span className={RELEVANCE_COLOR[cls.study_relevance]}>
                  · {RELEVANCE_LABEL[cls.study_relevance]}
                </span>
              </>
            )
          })()}
        </div>
      </div>
      {rec.status === 'complete' && (
        <div className="flex items-center gap-2 shrink-0">
          {studyDocId && (
            <a
              href={`/dashboard/study/${studyDocId}`}
              className="text-xs text-primary/60 hover:text-primary/90 transition-colors font-medium"
              title="Open Study Set"
            >
              Study Set
            </a>
          )}
          <button
            onClick={onOpen}
            className="text-xs text-foreground/35 hover:text-foreground/65 transition-colors"
          >
            Open
          </button>
        </div>
      )}
      {rec.status === 'analysis_failed' && (
        <button
          onClick={onRetry}
          className="shrink-0 text-xs text-amber-400/70 hover:text-amber-400 transition-colors font-medium"
          title="Re-run AI analysis on the saved transcript"
        >
          Retry
        </button>
      )}
      <button
        onClick={onDelete}
        className="shrink-0 text-foreground/20 hover:text-red-400/70 transition-colors"
        title="Delete recording"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── RecorderNotice ────────────────────────────────────────────────────────────

function RecorderNotice({
  type,
  classification,
  onNewRecording,
}: {
  type: RecorderNoticeType
  classification: AgentClassification | undefined
  onNewRecording: () => void
}) {
  if (type === 'none') return null

  if (type === 'general_note') {
    const contentLabel = classification
      ? CONTENT_TYPE_LABEL[classification.content_type]
      : 'non-study content'
    return (
      <div className="rounded-xl border border-foreground/10 bg-muted/30 px-4 py-2.5 flex items-start gap-2.5">
        <span className="text-foreground/30 shrink-0 mt-0.5 text-sm">ℹ</span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-foreground/55">General note created</p>
          <p className="text-xs text-foreground/40 leading-5">
            MoLis classified this as {contentLabel.toLowerCase()}, so it saved a grounded summary instead of creating exam materials.
          </p>
        </div>
      </div>
    )
  }

  if (type === 'too_short') {
    return (
      <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-2.5 flex items-start gap-2.5">
        <span className="text-amber-400/60 shrink-0 mt-0.5">⚠</span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-amber-400/80">Recording too short</p>
          <p className="text-xs text-amber-400/60 leading-5">
            MoLis needs more transcript content to create reliable study notes. Try recording at least 1–2 minutes of explanation.
          </p>
        </div>
      </div>
    )
  }

  if (type === 'weak_audio_capture') {
    return (
      <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-2.5 flex items-start gap-2.5">
        <span className="text-amber-400/60 shrink-0 mt-0.5">⚠</span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-amber-400/80">Weak audio capture</p>
          <p className="text-xs text-amber-400/60 leading-5">
            The transcript looks too sparse for the recording length. Record closer to the speaker or upload clearer audio for better notes.
          </p>
        </div>
      </div>
    )
  }

  if (type === 'fallback_analysis') {
    return (
      <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-2.5 flex items-start gap-2.5">
        <span className="text-amber-400/60 shrink-0 mt-0.5">⚠</span>
        <p className="text-xs text-amber-400/70 leading-5">
          <strong className="text-amber-400/80">Basic notes generated.</strong>{' '}
          MoLis saved useful notes, but advanced extraction was unavailable this time. You can{' '}
          <button
            onClick={onNewRecording}
            className="underline hover:text-amber-400 transition-colors"
          >
            record a clearer section
          </button>{' '}
          or retry analysis.
        </p>
      </div>
    )
  }

  if (type === 'partial_extraction') {
    return (
      <div className="rounded-xl border border-foreground/10 bg-muted/30 px-4 py-2.5 flex items-start gap-2.5">
        <span className="text-foreground/30 shrink-0 mt-0.5 text-sm">ℹ</span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-foreground/55">Limited study material found</p>
          <p className="text-xs text-foreground/40 leading-5">
            The recording was clear, but it did not contain many explicit definitions, key terms, or exam-style details.
          </p>
        </div>
      </div>
    )
  }

  return null
}

// ── AgentJudgement ────────────────────────────────────────────────────────────

function AgentJudgement({ classification }: { classification: AgentClassification }) {
  const relevanceColor = RELEVANCE_COLOR[classification.study_relevance]
  const isStudyWorthy = classification.study_relevance === 'high' || classification.study_relevance === 'medium'

  return (
    <div className={[
      'rounded-xl border px-4 py-3 flex flex-col gap-2',
      isStudyWorthy
        ? 'border-emerald-500/15 bg-emerald-500/[0.04]'
        : 'border-amber-500/15 bg-amber-500/[0.04]',
    ].join(' ')}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/30">
        Agent judgement
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-foreground/55">
          <span className="text-foreground/30">Content type: </span>
          <strong className="text-foreground/70">{CONTENT_TYPE_LABEL[classification.content_type]}</strong>
        </span>
        <span className={relevanceColor}>
          <strong>{RELEVANCE_LABEL[classification.study_relevance]}</strong>
        </span>
        <span className="text-foreground/30">
          Confidence: {classification.confidence_score}%
        </span>
      </div>
      <p className="text-xs text-foreground/50 leading-5">
        <span className="text-foreground/30">Reason: </span>
        {classification.reason}
      </p>
      <p className="text-xs text-foreground/55">
        <span className="text-foreground/30">Recommendation: </span>
        <span className={isStudyWorthy ? 'text-emerald-400/80' : 'text-amber-400/80'}>
          {ACTION_LABEL[classification.recommended_action]}
        </span>
      </p>
    </div>
  )
}

// ── ImportanceScore ───────────────────────────────────────────────────────────

function ImportanceScore({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0" title={`Importance: ${score}/5`}>
      {[1, 2, 3, 4, 5].map(n => (
        <div
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n <= score ? 'bg-primary' : 'bg-foreground/10'}`}
        />
      ))}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  )
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  )
}
