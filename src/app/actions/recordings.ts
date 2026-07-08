'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type {
  AgentClassification,
  AgentInsight,
  ImportantDetail,
  KeyTerm,
  ProcessRecordingInput,
  ProcessRecordingResult,
  Recording,
  RecordingNotes,
} from '@/types/recordings'

// ── Constants ─────────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `You are an AI Lecture Analyser embedded in a student study app.

Your jobs:
1. Classify the audio content type and judge its study relevance honestly.
2. Extract structured study materials — but ONLY if the content warrants it.

CONTENT CLASSIFICATION RULES:
- lecture: structured teaching by an instructor to students, academic content
- class_explanation: one-on-one or small group academic explanation
- meeting: work or project meeting, not academic teaching
- interview: job interview, journalistic interview, or research interview
- podcast: conversational discussion, not structured teaching
- personal_note: someone speaking notes to themselves
- random_audio: music, ambient noise, non-speech content
- unclear: too short, too noisy, or impossible to determine

STUDY RELEVANCE RULES:
- high: structured academic content with clear concepts, definitions, or explanations
- medium: partially academic, some useful content but mixed with non-study material
- low: conversational or professional but not structured academic teaching
- none: no academic study value whatsoever

RECOMMENDED ACTION RULES:
- create_study_notes: study_relevance is high or medium AND content_type is lecture or class_explanation
- record_longer_sample: content looks potentially academic but transcript is too short to judge
- save_as_general_note: content has some useful information but is not study material
- ignore_or_delete: random audio, noise, or clearly non-useful recording
- send_to_study_agent_later: high-quality academic content that could feed the Study Agent

SHORT TRANSCRIPT RULE:
- If the transcript has fewer than 50 words, set study_relevance to "none" or "low", recommended_action to "record_longer_sample", and include in unclear_or_low_confidence_parts: "This recording is too short to extract reliable study material."

CRITICAL NO-GUESSING RULE:
- Only use information explicitly present in the transcript.
- Do NOT invent definitions, key terms, exam hints, or facts.
- Do NOT add background knowledge unless you clearly label it as "background context".
- If a section is unclear, inaudible, or ambiguous, mark it in unclear_or_low_confidence_parts.
- If a term appears but is not defined in the transcript, say "mentioned but not defined in transcript".
- Evidence must be a direct quote or very close paraphrase from the transcript.
- Timestamps should reference the approximate time notation from the transcript if available (e.g. [04:12]).
- If the recording is not academic content, key_terms and possible_exam_questions MUST be empty arrays.`

const ANALYSIS_SCHEMA = {
  type: 'object' as const,
  required: [
    'key_terms',
    'important_details',
    'notes',
    'summary',
    'agent_insight',
  ],
  additionalProperties: false,
  properties: {
    key_terms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['term', 'definition', 'importance_score', 'evidence', 'related_terms'],
        additionalProperties: false,
        properties: {
          term: { type: 'string' },
          definition: { type: 'string' },
          importance_score: { type: 'integer', minimum: 1, maximum: 5 },
          evidence: { type: 'string' },
          related_terms: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    important_details: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'explanation', 'why_it_matters', 'evidence', 'type'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          why_it_matters: { type: 'string' },
          evidence: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'definition',
              'example',
              'warning',
              'exam_hint',
              'process',
              'formula',
              'concept',
              'action_item',
            ],
          },
        },
      },
    },
    notes: {
      type: 'object',
      required: [
        'title',
        'summary',
        'sections',
        'key_points',
        'definitions',
        'examples',
        'formulas',
        'possible_exam_questions',
        'flashcard_seed_items',
        'concepts_detected',
        'unclear_or_low_confidence_parts',
        'agent_classification',
      ],
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['heading', 'content'],
            additionalProperties: false,
            properties: {
              heading: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
        key_points: { type: 'array', items: { type: 'string' } },
        definitions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['term', 'definition'],
            additionalProperties: false,
            properties: {
              term: { type: 'string' },
              definition: { type: 'string' },
            },
          },
        },
        examples: {
          type: 'array',
          items: {
            type: 'object',
            required: ['description', 'context'],
            additionalProperties: false,
            properties: {
              description: { type: 'string' },
              context: { type: 'string' },
            },
          },
        },
        formulas: {
          type: 'array',
          items: {
            type: 'object',
            required: ['expression', 'description'],
            additionalProperties: false,
            properties: {
              expression: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        possible_exam_questions: { type: 'array', items: { type: 'string' } },
        flashcard_seed_items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['front', 'back'],
            additionalProperties: false,
            properties: {
              front: { type: 'string' },
              back: { type: 'string' },
            },
          },
        },
        concepts_detected: { type: 'array', items: { type: 'string' } },
        unclear_or_low_confidence_parts: { type: 'array', items: { type: 'string' } },
        agent_classification: {
          type: 'object',
          required: ['content_type', 'study_relevance', 'confidence_score', 'reason', 'recommended_action'],
          additionalProperties: false,
          properties: {
            content_type: {
              type: 'string',
              enum: ['lecture', 'class_explanation', 'meeting', 'interview', 'podcast', 'personal_note', 'random_audio', 'unclear'],
            },
            study_relevance: {
              type: 'string',
              enum: ['high', 'medium', 'low', 'none'],
            },
            confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
            reason: { type: 'string' },
            recommended_action: {
              type: 'string',
              enum: ['create_study_notes', 'record_longer_sample', 'save_as_general_note', 'ignore_or_delete', 'send_to_study_agent_later'],
            },
          },
        },
      },
    },
    summary: { type: 'string' },
    agent_insight: {
      type: 'object',
      required: ['key_terms_found', 'exam_relevant_count', 'unclear_count', 'recommended_next'],
      additionalProperties: false,
      properties: {
        key_terms_found: { type: 'integer' },
        exam_relevant_count: { type: 'integer' },
        unclear_count: { type: 'integer' },
        recommended_next: { type: 'string' },
      },
    },
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTranscriptWithTimestamps(
  fullText: string,
  segments: { start: number; text: string }[],
): string {
  if (!segments || segments.length === 0) return fullText

  return segments
    .map(seg => {
      const mins = Math.floor(seg.start / 60)
      const secs = Math.floor(seg.start % 60)
      const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      return `[${ts}] ${seg.text.trim()}`
    })
    .join('\n')
}

function buildAnalysisPrompt(title: string, subject: string, timestampedTranscript: string): string {
  const wordCount = timestampedTranscript.split(/\s+/).filter(Boolean).length

  return `Analyse the following audio transcript. First classify it honestly, then extract study materials only if warranted.

TITLE: ${title}
SUBJECT: ${subject || 'Not specified'}
WORD COUNT: ~${wordCount} words

TRANSCRIPT:
${timestampedTranscript}

Step 1 — Classify (notes.agent_classification):
- Determine the content_type honestly based on what the transcript sounds like.
- Rate study_relevance: is this structured academic teaching, or something else?
- Give a confidence_score (0–100) for your classification.
- Write a short reason explaining your classification.
- Choose the recommended_action based on the rules in your instructions.
- If the transcript is fewer than 50 words, set study_relevance to "none" or "low" and recommended_action to "record_longer_sample".

Step 2 — Extract study material (only if study_relevance is high or medium):
- Extract key terms with definitions AS STATED in the transcript, importance score, and a direct evidence quote.
- Extract important details (definitions, examples, warnings, formulas, exam hints) — only those explicitly stated.
- Build structured notes reflecting what was actually taught.
- List possible exam questions only based on what was covered.
- Generate flashcard seed items from explained concepts.

Step 3 — If study_relevance is low or none:
- key_terms must be an empty array.
- possible_exam_questions must be an empty array.
- flashcard_seed_items must be an empty array.
- unclear_or_low_confidence_parts should explain what was missing or why this is not study material.
- important_details may still include genuinely useful non-academic information (e.g. action items from a meeting).

Remember: Do NOT invent. Ground every output in the transcript.`
}

// ── Server Actions ─────────────────────────────────────────────────────────────

export async function processRecording(
  input: ProcessRecordingInput,
): Promise<ProcessRecordingResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify the audio_path belongs to this user (path is {userId}/{recordingId}.*)
  if (!input.audio_path.startsWith(user.id + '/')) {
    throw new Error('Not authorized: audio path does not belong to this user')
  }

  // 1. Create the recording row with status=processing
  const { error: insertError } = await supabase
    .from('recordings')
    .insert({
      id: input.recordingId,
      user_id: user.id,
      title: input.title.trim(),
      subject: input.subject.trim() || null,
      audio_path: input.audio_path,
      duration_seconds: input.duration_seconds,
      status: 'processing',
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.message.includes('relation "recordings" does not exist')) {
      throw new Error(
        'DATABASE_SETUP_REQUIRED: The recordings table does not exist. ' +
        'Run the SQL setup in your Supabase project before using the Recorder Agent.',
      )
    }
    throw new Error(`Database error: ${insertError.message}`)
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1'
  const analysisModel = 'gpt-4o-mini'

  let transcript = ''
  let transcriptSegments: unknown = null

  try {
    // 2. Get signed URL for the audio file
    const { data: signed, error: signedError } = await supabase.storage
      .from('recordings')
      .createSignedUrl(input.audio_path, 120)

    if (signedError || !signed?.signedUrl) {
      const storageMsg = signedError instanceof Error ? signedError.message : String(signedError ?? '')
      throw new Error(
        !signed
          ? 'STORAGE_SETUP_REQUIRED: The recordings storage bucket does not exist or is not accessible.'
          : `Storage error: ${storageMsg}`,
      )
    }

    // 3. Fetch audio and transcribe
    const audioResponse = await fetch(signed.signedUrl)
    if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`)

    const audioBuffer = await audioResponse.arrayBuffer()

    const mimeExt = input.mime_type.includes('mp4') ? 'mp4'
      : input.mime_type.includes('mpeg') ? 'mp3'
      : input.mime_type.includes('wav') ? 'wav'
      : input.mime_type.includes('m4a') ? 'm4a'
      : 'webm'
    const audioFile = new File([audioBuffer], `recording.${mimeExt}`, { type: input.mime_type })

    const transcriptionResult = await openai.audio.transcriptions.create({
      file: audioFile,
      model: transcriptionModel,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    transcript = transcriptionResult.text ?? ''
    transcriptSegments = transcriptionResult.segments ?? null

    if (!transcript.trim()) {
      throw new Error(
        'Transcription returned empty text. The audio may be too quiet, too short, or contain no speech.',
      )
    }

    // 4. Format transcript with timestamps for grounded analysis
    const segs = (transcriptSegments as { start: number; text: string }[] | null) ?? []
    const timestampedTranscript = formatTranscriptWithTimestamps(transcript, segs)

    // 5. Run transcript-grounded analysis
    const completion = await openai.chat.completions.create({
      model: analysisModel,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'lecture_analysis',
          strict: true,
          schema: ANALYSIS_SCHEMA as Record<string, unknown>,
        },
      },
      temperature: 0.2,
      max_tokens: 6000,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildAnalysisPrompt(input.title, input.subject, timestampedTranscript),
        },
      ],
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('Analysis returned empty response')

    const analysis = JSON.parse(rawContent) as {
      key_terms: KeyTerm[]
      important_details: ImportantDetail[]
      notes: RecordingNotes & { agent_classification: AgentClassification }
      summary: string
      agent_insight: AgentInsight
    }

    // 6. Save complete results to DB
    const { data: updated, error: updateError } = await supabase
      .from('recordings')
      .update({
        transcript,
        transcript_segments: transcriptSegments,
        key_terms: analysis.key_terms,
        important_details: analysis.important_details,
        notes: analysis.notes,
        summary: analysis.summary,
        status: 'complete',
        transcription_model: transcriptionModel,
        analysis_model: analysisModel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.recordingId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) throw new Error(`Failed to save results: ${updateError.message}`)

    return {
      recording: updated as Recording,
      agent_insight: analysis.agent_insight,
    }
  } catch (err) {
    // Mark the row as error so the user can see it failed
    await supabase
      .from('recordings')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', input.recordingId)
      .eq('user_id', user.id)

    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota')) {
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    }
    if (msg.startsWith('DATABASE_SETUP_REQUIRED') || msg.startsWith('STORAGE_SETUP_REQUIRED')) {
      throw err
    }
    throw new Error(msg)
  }
}

export async function getRecentRecordings(): Promise<Recording[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('recordings')
    .select(
      'id, user_id, title, subject, audio_path, audio_url, transcript, key_terms, important_details, notes, summary, duration_seconds, status, transcription_model, analysis_model, created_at, updated_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return []
  return (data ?? []) as Recording[]
}

export async function deleteRecording(recordingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rec } = await supabase
    .from('recordings')
    .select('audio_path, user_id')
    .eq('id', recordingId)
    .single()

  if (!rec || rec.user_id !== user.id) throw new Error('Not found')

  if (rec.audio_path) {
    await supabase.storage.from('recordings').remove([rec.audio_path])
  }

  await supabase.from('recordings').delete().eq('id', recordingId).eq('user_id', user.id)
}
