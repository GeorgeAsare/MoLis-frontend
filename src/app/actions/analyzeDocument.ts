'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { recordUsage } from '@/app/actions/recordUsage'
import { saveMemory } from '@/app/actions/userMemories'
import type {
  DocumentAnalysis,
  ConceptGraph,
  ConceptNode,
  ConceptEdge,
  KeyConcept,
  ConceptRelationship,
  Misconception,
  ExamTopic,
  DocumentSection,
  LearningPathData,
  LearningStep,
} from '@/types/documentAnalysis'
import { initConceptMastery } from '@/app/actions/conceptMastery'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 12_000

const SYSTEM_PROMPT =
  'You are an expert academic analyst. Deeply analyse study documents to extract structured knowledge that powers intelligent study tools — flashcards, quizzes, revision notes, and visual aids. Your analysis must be comprehensive, accurate, and academically precise.'

// ── JSON schema for structured outputs ───────────────────────────────────────

const ANALYSIS_SCHEMA = {
  type: 'object',
  required: [
    'subject_area',
    'difficulty_level',
    'estimated_study_minutes',
    'sections',
    'key_concepts',
    'definitions',
    'formulas',
    'examples',
    'keywords',
    'likely_exam_topics',
    'learning_objectives',
    'tables',
    'misconceptions',
    'relationships',
    'prerequisites',
  ],
  additionalProperties: false,
  properties: {
    subject_area: { type: 'string' },
    difficulty_level: {
      type: 'string',
      enum: ['beginner', 'intermediate', 'advanced'],
    },
    estimated_study_minutes: { type: 'integer' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'heading',
          'level',
          'summary',
          'key_points',
          'has_formulas',
          'has_examples',
          'has_diagrams',
          'difficulty',
          'learning_objectives',
        ],
        additionalProperties: false,
        properties: {
          heading: { type: 'string' },
          level: { type: 'integer', enum: [1, 2, 3] },
          summary: { type: 'string' },
          key_points: { type: 'array', items: { type: 'string' } },
          has_formulas: { type: 'boolean' },
          has_examples: { type: 'boolean' },
          has_diagrams: { type: 'boolean' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          learning_objectives: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    key_concepts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['concept', 'explanation', 'importance', 'section'],
        additionalProperties: false,
        properties: {
          concept: { type: 'string' },
          explanation: { type: 'string' },
          importance: {
            type: 'string',
            enum: ['core', 'supporting', 'supplementary'],
          },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['term', 'definition', 'section'],
        additionalProperties: false,
        properties: {
          term: { type: 'string' },
          definition: { type: 'string' },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    formulas: {
      type: 'array',
      items: {
        type: 'object',
        required: ['expression', 'description', 'variables', 'section'],
        additionalProperties: false,
        properties: {
          expression: { type: 'string' },
          description: { type: 'string' },
          variables: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'section'],
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
    },
    likely_exam_topics: {
      type: 'array',
      items: {
        type: 'object',
        required: ['topic', 'importance', 'question_types', 'related_concepts'],
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          importance: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          question_types: { type: 'array', items: { type: 'string' } },
          related_concepts: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    learning_objectives: {
      type: 'array',
      items: {
        type: 'object',
        required: ['objective', 'section'],
        additionalProperties: false,
        properties: {
          objective: { type: 'string' },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        required: ['caption', 'headers', 'rows', 'section'],
        additionalProperties: false,
        properties: {
          caption: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    misconceptions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['misconception', 'correction', 'related_concept'],
        additionalProperties: false,
        properties: {
          misconception: { type: 'string' },
          correction: { type: 'string' },
          related_concept: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        required: ['from_concept', 'to_concept', 'relationship'],
        additionalProperties: false,
        properties: {
          from_concept: { type: 'string' },
          to_concept: { type: 'string' },
          relationship: { type: 'string' },
        },
      },
    },
    prerequisites: {
      type: 'array',
      items: {
        type: 'object',
        required: ['concept', 'reason'],
        additionalProperties: false,
        properties: {
          concept: { type: 'string' },
          reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
    },
  },
} as const

// ── Knowledge graph builder ───────────────────────────────────────────────────

function toNodeId(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function classifyEdgeType(rel: string): ConceptEdge['type'] {
  const r = rel.toLowerCase()
  if (/depend|require|needs?|based on/.test(r)) return 'depends_on'
  if (/contrast|differ|oppos|versus|\bvs\b|unlike/.test(r)) return 'contrasts_with'
  if (/type of|kind of|subtype|subcategor|subclass|\bis a\b|form of/.test(r)) return 'is_a_type_of'
  if (/caus|leads? to|results? in/.test(r)) return 'causes'
  if (/enabl|allows?|support|facilitat|powers?/.test(r)) return 'enables'
  return 'related_to'
}

function computeLearningPath(nodes: ConceptNode[], edges: ConceptEdge[]): string[] {
  const depEdges = edges.filter(e => e.type === 'depends_on' || e.type === 'prerequisite')
  const inDegree = new Map<string, number>(nodes.map(n => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]))

  for (const e of depEdges) {
    if (inDegree.has(e.to)) inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
    if (adj.has(e.from)) adj.get(e.from)!.push(e.to)
  }

  const importanceRank: Record<string, number> = { core: 0, supporting: 1, supplementary: 2 }
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const rank = (id: string) => importanceRank[nodeById.get(id)?.importance ?? ''] ?? 3

  const queue = nodes
    .filter(n => (inDegree.get(n.id) ?? 0) === 0)
    .map(n => n.id)
    .sort((a, b) => rank(a) - rank(b))

  const result: string[] = []
  const visited = new Set<string>()

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    result.push(id)
    for (const nid of (adj.get(id) ?? []).sort((a, b) => rank(a) - rank(b))) {
      inDegree.set(nid, (inDegree.get(nid) ?? 0) - 1)
      if ((inDegree.get(nid) ?? 0) === 0) queue.push(nid)
    }
  }

  for (const n of [...nodes].sort((a, b) => rank(a.id) - rank(b.id))) {
    if (!visited.has(n.id)) result.push(n.id)
  }

  return result
}

function buildConceptGraph(
  key_concepts: KeyConcept[],
  relationships: ConceptRelationship[],
  misconceptions: Misconception[],
  likely_exam_topics: ExamTopic[],
  sections: DocumentSection[],
): ConceptGraph {
  const sectionDifficulty = new Map<string, 'easy' | 'medium' | 'hard'>()
  for (const s of sections) {
    if (s.difficulty) sectionDifficulty.set(s.heading, s.difficulty)
  }

  const examByName = new Map<string, ExamTopic>()
  for (const t of likely_exam_topics) {
    examByName.set(t.topic.toLowerCase(), t)
    for (const rc of t.related_concepts) examByName.set(rc.toLowerCase(), t)
  }

  const nodeMap = new Map<string, ConceptNode>()

  const ensureNode = (label: string): string => {
    const id = toNodeId(label)
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id, label, importance: null,
        is_exam_topic: false, exam_importance: null,
        section: null, difficulty: null, misconceptions: [],
      })
    }
    return id
  }

  for (const kc of key_concepts) {
    const id = toNodeId(kc.concept)
    const exam = examByName.get(kc.concept.toLowerCase()) ?? null
    const mc = misconceptions
      .filter(m => m.related_concept && toNodeId(m.related_concept) === id)
      .map(m => m.misconception)
    nodeMap.set(id, {
      id,
      label: kc.concept,
      importance: kc.importance,
      is_exam_topic: !!exam,
      exam_importance: exam?.importance ?? null,
      section: kc.section,
      difficulty: kc.section ? (sectionDifficulty.get(kc.section) ?? null) : null,
      misconceptions: mc,
    })
  }

  const edges: ConceptEdge[] = []
  for (const rel of relationships) {
    const from = ensureNode(rel.from_concept)
    const to = ensureNode(rel.to_concept)
    edges.push({ from, to, type: classifyEdgeType(rel.relationship), label: rel.relationship })
  }

  const nodes = Array.from(nodeMap.values())
  return { nodes, edges, learning_path: computeLearningPath(nodes, edges) }
}

function buildLearningPath(
  graph: ConceptGraph,
  estimated_study_minutes: number | null,
): LearningPathData {
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]))

  const prereqsOf = new Map<string, string[]>(graph.nodes.map(n => [n.id, []]))
  const unlocksOf = new Map<string, string[]>(graph.nodes.map(n => [n.id, []]))
  const depTypes = new Set(['depends_on', 'prerequisite'])

  for (const edge of graph.edges) {
    if (depTypes.has(edge.type)) {
      prereqsOf.get(edge.to)?.push(edge.from)
      unlocksOf.get(edge.from)?.push(edge.to)
    }
  }

  const importanceWeight: Record<string, number> = { core: 3, supporting: 2, supplementary: 1 }
  const diffMultiplier: Record<string, number> = { hard: 1.4, medium: 1.0, easy: 0.7 }
  const baseMinutes: Record<string, number> = { core: 10, supporting: 7, supplementary: 4 }

  const orderedIds = graph.learning_path.filter(id => nodeById.has(id))

  let minuteOf: (id: string) => number

  if (estimated_study_minutes && estimated_study_minutes > 0) {
    const totalWeight = orderedIds.reduce(
      (sum, id) => sum + (importanceWeight[nodeById.get(id)?.importance ?? ''] ?? 1.5),
      0,
    )
    minuteOf = (id) => {
      const node = nodeById.get(id)!
      const w = importanceWeight[node.importance ?? ''] ?? 1.5
      return Math.max(1, Math.round((w / totalWeight) * estimated_study_minutes))
    }
  } else {
    minuteOf = (id) => {
      const node = nodeById.get(id)!
      const base = baseMinutes[node.importance ?? ''] ?? 6
      const diff = diffMultiplier[node.difficulty ?? ''] ?? 1.0
      return Math.max(1, Math.round(base * diff))
    }
  }

  const steps: LearningStep[] = orderedIds.map(id => {
    const node = nodeById.get(id)!
    return {
      concept_id: id,
      title: node.label,
      estimated_minutes: minuteOf(id),
      difficulty: node.difficulty ?? null,
      prerequisites: prereqsOf.get(id) ?? [],
      unlocks: unlocksOf.get(id) ?? [],
      is_exam_topic: node.is_exam_topic,
      exam_importance: node.exam_importance,
      importance: node.importance,
      section: node.section,
    }
  })

  return {
    steps,
    total_estimated_minutes: steps.reduce((sum, s) => sum + s.estimated_minutes, 0),
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildUserPrompt(title: string, text: string): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated for processing]'
      : text

  return `Analyse this academic document and extract its full structure and content.

Document title: ${title}

Content:
${body}

Extract:
- subject_area: The precise academic subject (e.g. "Cardiovascular Biology", "Binary Search Trees", "18th Century European History")
- difficulty_level: beginner (introductory) | intermediate (assumes prior knowledge) | advanced (specialist level)
- estimated_study_minutes: Realistic total study time for this material
- sections: All major sections/chapters with heading, level (1=chapter 2=section 3=subsection), 2-sentence summary, 3-5 key points, and boolean flags for whether the section contains formulas, examples, or visual/diagram content
- key_concepts: 8-15 core ideas. importance: core=must-know for exams, supporting=builds understanding, supplementary=nice to know
- definitions: All explicitly defined terms with precise academic definitions
- formulas: Mathematical, chemical, or scientific formulas/processes (include variables explanation)
- examples: Concrete examples, case studies, or worked examples from the document
- keywords: 10-20 important terms as a flat list
- likely_exam_topics: 5-10 topics most likely to be tested, with importance (high/medium/low), best question types (multiple_choice/true_false/short_answer/essay/calculation), and related concepts
- learning_objectives: 5-10 document-level learning objectives ("Explain how X works", "Apply Y to solve Z"), each linked to a section heading or null
- tables: Every table in the document — extract caption (or null), column headers, and all data rows as string arrays
- misconceptions: 3-8 common student errors or false beliefs about this subject, each with a correction and the related concept (or null)
- relationships: Key concept-to-concept connections using precise verbs (e.g. "depends on", "contrasts with", "is a type of", "causes", "enables")
- prerequisites: Prior knowledge required to understand this document (e.g. "Basic algebra", "Cell biology fundamentals"), with a reason explaining why it is needed
- For each section, also include: difficulty (easy/medium/hard based on content complexity) and 1-3 section-specific learning objectives as plain strings`
}

// ── Server action ─────────────────────────────────────────────────────────────

export async function analyzeDocument(documentId: string): Promise<DocumentAnalysis> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify document ownership and get extracted text
  const { data: doc } = await supabase
    .from('documents')
    .select('user_id, title, extracted_text')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')

  if (!doc.extracted_text?.trim()) {
    throw new Error('No extracted text found. Extract text from the document first.')
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env.local file.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_analysis',
          strict: true,
          schema: ANALYSIS_SCHEMA as Record<string, unknown>,
        },
      },
      temperature: 0.2,
      max_tokens: 6000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(doc.title, doc.extracted_text) },
      ],
    })

    rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('OpenAI returned an empty response')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota')) {
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    }
    if (msg.includes('401') || msg.includes('Incorrect API key')) {
      throw new Error('Invalid OpenAI API key. Check your OPENAI_API_KEY in .env.local.')
    }
    throw new Error(`OpenAI error: ${msg}`)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    throw new Error('OpenAI returned malformed JSON. Please try again.')
  }

  const conceptGraph = buildConceptGraph(
    Array.isArray(parsed.key_concepts) ? (parsed.key_concepts as KeyConcept[]) : [],
    Array.isArray(parsed.relationships) ? (parsed.relationships as ConceptRelationship[]) : [],
    Array.isArray(parsed.misconceptions) ? (parsed.misconceptions as Misconception[]) : [],
    Array.isArray(parsed.likely_exam_topics) ? (parsed.likely_exam_topics as ExamTopic[]) : [],
    Array.isArray(parsed.sections) ? (parsed.sections as DocumentSection[]) : [],
  )

  const learningPath = buildLearningPath(
    conceptGraph,
    typeof parsed.estimated_study_minutes === 'number' ? parsed.estimated_study_minutes : null,
  )

  // Delete any prior analysis for this document so we always have one current record
  await supabase
    .from('document_analysis')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)

  const { data: saved, error: saveError } = await supabase
    .from('document_analysis')
    .insert({
      document_id: documentId,
      user_id: user.id,
      subject_area: typeof parsed.subject_area === 'string' ? parsed.subject_area : 'General',
      difficulty_level:
        parsed.difficulty_level === 'beginner' ||
        parsed.difficulty_level === 'intermediate' ||
        parsed.difficulty_level === 'advanced'
          ? parsed.difficulty_level
          : 'intermediate',
      estimated_study_minutes:
        typeof parsed.estimated_study_minutes === 'number'
          ? parsed.estimated_study_minutes
          : null,
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      key_concepts: Array.isArray(parsed.key_concepts) ? parsed.key_concepts : [],
      definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [],
      formulas: Array.isArray(parsed.formulas) ? parsed.formulas : [],
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      likely_exam_topics: Array.isArray(parsed.likely_exam_topics)
        ? parsed.likely_exam_topics
        : [],
      learning_objectives: Array.isArray(parsed.learning_objectives)
        ? parsed.learning_objectives
        : [],
      tables: Array.isArray(parsed.tables) ? parsed.tables : [],
      misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : [],
      relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
      prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites : [],
      concept_graph: conceptGraph,
      learning_path: learningPath,
      model: 'gpt-4o-mini',
    })
    .select()
    .single()

  if (saveError || !saved) {
    throw new Error(saveError?.message ?? 'Failed to save document analysis')
  }

  initConceptMastery(documentId).catch(() => {})

  void recordUsage({ generation_type: 'analysis', document_id: documentId, success: true, model: 'gpt-4o-mini' })
  void saveMemory({
    source_agent: 'study',
    source_entity_type: 'document',
    source_entity_id: documentId,
    category: 'activity',
    content: `Analysed document: ${doc.title}`,
    metadata: { document_id: documentId, subject_area: (saved as DocumentAnalysis).subject_area },
    importance: 3,
  })

  return saved as DocumentAnalysis
}
