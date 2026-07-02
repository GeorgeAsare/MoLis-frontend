export interface DocumentSection {
  heading: string
  level: 1 | 2 | 3
  summary: string
  key_points: string[]
  has_formulas: boolean
  has_examples: boolean
  has_diagrams: boolean
  difficulty?: 'easy' | 'medium' | 'hard' | null
  learning_objectives?: string[]
}

export interface KeyConcept {
  concept: string
  explanation: string
  importance: 'core' | 'supporting' | 'supplementary'
  section: string | null
}

export interface Definition {
  term: string
  definition: string
  section: string | null
}

export interface Formula {
  expression: string
  description: string
  variables: string | null
  section: string | null
}

export interface Example {
  description: string
  section: string | null
}

export interface ExamTopic {
  topic: string
  importance: 'high' | 'medium' | 'low'
  question_types: string[]
  related_concepts: string[]
}

export interface LearningObjective {
  objective: string
  section: string | null
}

export interface DocumentTable {
  caption: string | null
  headers: string[]
  rows: string[][]
  section: string | null
}

export interface Misconception {
  misconception: string
  correction: string
  related_concept: string | null
}

export interface ConceptRelationship {
  from_concept: string
  to_concept: string
  relationship: string
}

export interface Prerequisite {
  concept: string
  reason: string | null
}

export interface ConceptNode {
  id: string
  label: string
  importance: 'core' | 'supporting' | 'supplementary' | null
  is_exam_topic: boolean
  exam_importance: 'high' | 'medium' | 'low' | null
  section: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  misconceptions: string[]
}

export interface ConceptEdge {
  from: string
  to: string
  type: 'depends_on' | 'contrasts_with' | 'is_a_type_of' | 'causes' | 'enables' | 'prerequisite' | 'related_to'
  label: string
}

export interface ConceptGraph {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  learning_path: string[]
}

export interface LearningStep {
  concept_id: string
  title: string
  estimated_minutes: number
  difficulty: 'easy' | 'medium' | 'hard' | null
  prerequisites: string[]
  unlocks: string[]
  is_exam_topic: boolean
  exam_importance: 'high' | 'medium' | 'low' | null
  importance: 'core' | 'supporting' | 'supplementary' | null
  section: string | null
}

export interface LearningPathData {
  steps: LearningStep[]
  total_estimated_minutes: number
}

export interface DocumentAnalysis {
  id: string
  document_id: string
  user_id: string
  subject_area: string
  difficulty_level: 'beginner' | 'intermediate' | 'advanced'
  estimated_study_minutes: number | null
  sections: DocumentSection[]
  key_concepts: KeyConcept[]
  definitions: Definition[]
  formulas: Formula[]
  examples: Example[]
  keywords: string[]
  likely_exam_topics: ExamTopic[]
  learning_objectives: LearningObjective[]
  tables: DocumentTable[]
  misconceptions: Misconception[]
  relationships: ConceptRelationship[]
  prerequisites: Prerequisite[]
  concept_graph: ConceptGraph | null
  learning_path: LearningPathData | null
  model: string
  created_at: string
}
