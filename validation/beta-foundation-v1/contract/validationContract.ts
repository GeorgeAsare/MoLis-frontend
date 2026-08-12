// VALIDATION ONLY — never import from application code
//
// Canonical typed constants for the Beta Foundation V1 validation harness.
// ALL detailed fingerprints live here — assertion files consume from this contract.
//
// Sourced from:
//   - .ai/inspection/d11-catalogue-results-2026-07-31.csv
//   - .ai/inspection/d11-additional-authority-results-2026-07-31.csv
//   - migrations/20260729120001_generation_job_state_machine_schema.sql

// ── Shared interfaces ─────────────────────────────────────────────────────────

export interface ColumnSpec {
  ordinal:        number
  name:           string
  data_type:      string   // information_schema data_type (ANSI SQL form)
  udt_name:       string
  is_nullable:    string   // 'YES' | 'NO'
  column_default: string | null
}

export interface DefaultAclTuple {
  grantor:        string
  grantee:        string
  privilege_type: string
  is_grantable:   boolean
}

export interface TriggerSpec {
  schema:             string
  table:              string
  name:               string
  tgenabled:          string
  tgtype:             number
  tgisconstraint:     boolean
  condeferrable:      boolean
  condeferred:        boolean
  pg_get_triggerdef:  string
}

// Constraint fingerprint. exact_def is pg_get_constraintdef(oid, true).
// Complex CHECK constraint exact_def strings are derived from migration source analysis
// and PostgreSQL deparser rules; they may need minor string adjustment on first DB run.
// confupdtype/confdeltype (FK only): 'a'=NO ACTION, 'c'=CASCADE, 'n'=SET NULL, 'r'=RESTRICT, 'd'=SET DEFAULT.
// Absent on non-FK entries; assertion skips comparison when undefined.
export interface ConstraintSpec {
  name:           string
  contype:        'p' | 'u' | 'f' | 'c'
  exact_def:      string
  condeferrable?: boolean
  condeferred?:   boolean
  confupdtype?:   string
  confdeltype?:   string
}

export interface IndexSpec {
  schema:          string
  table:           string
  name:            string
  is_unique:       boolean
  is_partial:      boolean
  predicate:       string | null
  pg_get_indexdef: string
}

export interface AclTuple {
  grantee:        string
  privilege_type: string
  is_grantable:   boolean
}

export interface FunctionSpec {
  name:          string
  identity_args: string   // pg_get_function_identity_arguments(oid)
  provolatile:   'v' | 's' | 'i'
  prosecdef:     boolean
  proconfig_sp:  string   // expected value of proconfig[0], e.g. 'search_path=' or 'search_path=extensions, pg_catalog'
  acl:           AclTuple[]
}

// ── D11 Baseline: Column counts ───────────────────────────────────────────────

export const D11_COLUMN_COUNTS = {
  documents:         10,
  document_analysis: 22,
  generation_jobs:   13,  // post-historical (beta_foundation_v1.sql), pre-corrective
  study_visuals:      6,
} as const

// ── Post-corrective column counts ─────────────────────────────────────────────

export const POST_CORRECTIVE_COLUMN_COUNTS = {
  generation_jobs:              28,
  study_visuals:                10,
  generation_job_requests:       9,
  generation_source_snapshots:  18,
  generation_job_usage:         12,
} as const

// ── D11 Baseline: Expected table names ───────────────────────────────────────

export const D11_TABLES_PRE_HISTORICAL = [
  'documents', 'document_analysis', 'study_visuals',
] as const

export const D11_TABLES_POST_HISTORICAL = [
  'documents', 'document_analysis', 'study_visuals', 'generation_jobs',
] as const

export const POST_CORRECTIVE_NEW_TABLES = [
  'generation_job_requests',
  'generation_source_snapshots',
  'generation_job_usage',
] as const

// ── D11 Baseline: Trigger functions ──────────────────────────────────────────

export const D11_TRIGGER_FUNCTIONS = [
  'validate_resource_subject_ownership',
  'set_subjects_updated_at',
  'set_user_profiles_updated_at',
  'sync_user_profiles_identity',
  'update_updated_at',
] as const

// ── D11 Baseline: Storage bucket state ───────────────────────────────────────

export const D11_STUDY_VISUALS_BUCKET = {
  id:                 'study-visuals',
  public:             true,
  file_size_limit:    null as null,
  allowed_mime_types: null as null,
} as const

// ── Post-corrective: Storage bucket state ────────────────────────────────────

export const POST_CORRECTIVE_STUDY_VISUALS_BUCKET = {
  id:                 'study-visuals',
  public:             false,
  file_size_limit:    5242880,
  allowed_mime_types: ['image/png'],
} as const

// ── D11 Baseline: Storage policy names ───────────────────────────────────────

export const D11_STUDY_VISUALS_PERMISSIVE_POLICIES = [
  'For full customization 137qt67_0',
  'For full customization 137qt67_1',
  'For full customization 137qt67_2',
  'For full customization 137qt67_3',
] as const

export const D11_UNRELATED_STORAGE_POLICIES = [
  'Users can delete own files',
  'Users can read own files',
  'Users can upload to own folder',
  'recordings_delete',
  'recordings_read',
  'recordings_update',
  'recordings_upload',
] as const

// Total D11 storage policies on storage.objects: 4 study-visuals + 7 unrelated = 11
export const D11_STORAGE_POLICY_COUNT = 11

// ── Post-corrective: Storage policy state ────────────────────────────────────

export const POST_CORRECTIVE_RESTRICTIVE_POLICIES = [
  'study_visuals_block_authenticated',
  'study_visuals_block_anon',
] as const

// Post-corrective total: 0 study-visuals permissive + 7 unrelated + 2 new restrictive = 9
export const POST_CORRECTIVE_STORAGE_POLICY_COUNT = 9

// ── Migration checksums ───────────────────────────────────────────────────────

export const MIGRATION_CHECKSUMS = {
  historical: 'd2bc6e2cd63c243d8577b3b4785fb8638e13466472917cbd79203e3442fdb60b',
  corrective: '12b4eeb2b673dfd6378555ab9c43cd0ba239de20608f309f85d6c25fbf1bc404',
} as const

// ── D11 Baseline: column name arrays (for absence assertions) ─────────────────

export const D11_GENERATION_JOBS_COLUMNS = [
  'id', 'user_id', 'document_id', 'job_type', 'status',
  'input_data', 'result_data', 'error', 'correlation_id',
  'created_at', 'updated_at', 'started_at', 'completed_at',
] as const

export const POST_CORRECTIVE_GENERATION_JOBS_NEW_COLUMNS = [
  'state_version', 'worker_id', 'lease_token', 'lease_expires_at',
  'heartbeat_at', 'attempt_count', 'max_attempts',
  'request_idempotency_key', 'request_payload_hash', 'request_classification',
  'public_error_code', 'public_message_key', 'support_reference',
  'snapshot_id', 'originating_request_id',
] as const

export const POST_CORRECTIVE_STUDY_VISUALS_NEW_COLUMNS = [
  'source_job_id', 'source_snapshot_id', 'source_request_hash', 'publication_attempt',
] as const

// ── D11 Baseline: Detailed column specs (canonical fingerprints) ──────────────
// Source: d11-catalogue-results-2026-07-31.csv (S2_columns section)

export const D11_DOCUMENTS_COLUMNS: ColumnSpec[] = [
  { ordinal: 1,  name: 'id',                  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: 'gen_random_uuid()' },
  { ordinal: 2,  name: 'user_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 3,  name: 'title',               data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal: 4,  name: 'file_path',           data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 5,  name: 'file_type',           data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 6,  name: 'extracted_text',      data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 7,  name: 'created_at',          data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: 'now()' },
  { ordinal: 8,  name: 'subject_id',          data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 9,  name: 'source_type',         data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 10, name: 'source_recording_id', data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
]

export const D11_DOCUMENT_ANALYSIS_COLUMNS: ColumnSpec[] = [
  { ordinal: 1,  name: 'id',                      data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: 'gen_random_uuid()' },
  { ordinal: 2,  name: 'document_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal: 3,  name: 'user_id',                 data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal: 4,  name: 'subject_area',            data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal: 5,  name: 'difficulty_level',        data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal: 6,  name: 'estimated_study_minutes', data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'YES', column_default: null },
  { ordinal: 7,  name: 'sections',                data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 8,  name: 'key_concepts',            data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 9,  name: 'definitions',             data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 10, name: 'formulas',                data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 11, name: 'examples',                data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 12, name: 'keywords',                data_type: 'ARRAY',                    udt_name: '_text',       is_nullable: 'NO',  column_default: "'{}'::text[]" },
  { ordinal: 13, name: 'likely_exam_topics',      data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 14, name: 'model',                   data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal: 15, name: 'created_at',              data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal: 16, name: 'learning_objectives',     data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 17, name: 'misconceptions',          data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 18, name: 'relationships',           data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 19, name: 'prerequisites',           data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 20, name: 'tables',                  data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal: 21, name: 'concept_graph',           data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
  { ordinal: 22, name: 'learning_path',           data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
]

// study_visuals D11 uses data_type (information_schema long form) for created_at
// to match the existing assertStudyVisualsBaselineShape query; udt_name is used for all others.
// The assertStudyVisualsBaselineShape function uses data_type column; we store udt_name here
// but annotate the timestamp column's long form for reference.
export const D11_STUDY_VISUALS_COLUMNS: ColumnSpec[] = [
  { ordinal: 1, name: 'id',          data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: 'gen_random_uuid()' },
  { ordinal: 2, name: 'document_id', data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: null },
  { ordinal: 3, name: 'user_id',     data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: null },
  { ordinal: 4, name: 'visuals',     data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO', column_default: "'[]'::jsonb" },
  { ordinal: 5, name: 'model',       data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO', column_default: "'gpt-4o-mini'::text" },
  { ordinal: 6, name: 'created_at',  data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO', column_default: 'now()' },
]

export const D11_GENERATION_JOBS_BASELINE_COLUMNS: ColumnSpec[] = [
  { ordinal: 1,  name: 'id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: 'gen_random_uuid()' },
  { ordinal: 2,  name: 'user_id',        data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal: 3,  name: 'document_id',    data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 4,  name: 'job_type',       data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal: 5,  name: 'status',         data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: "'queued'::text" },
  { ordinal: 6,  name: 'input_data',     data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
  { ordinal: 7,  name: 'result_data',    data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
  { ordinal: 8,  name: 'error',          data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 9,  name: 'correlation_id', data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 10, name: 'created_at',     data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal: 11, name: 'updated_at',     data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal: 12, name: 'started_at',     data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 13, name: 'completed_at',   data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
]

// ── Post-corrective: Detailed column specs ────────────────────────────────────

export const POST_CORRECTIVE_GENERATION_JOBS_COLUMNS: ColumnSpec[] = [
  { ordinal: 1,  name: 'id',                      data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: 'gen_random_uuid()' },
  { ordinal: 2,  name: 'user_id',                 data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal: 3,  name: 'document_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 4,  name: 'job_type',                data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal: 5,  name: 'status',                  data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: "'queued'::text" },
  { ordinal: 6,  name: 'input_data',              data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
  { ordinal: 7,  name: 'result_data',             data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
  { ordinal: 8,  name: 'error',                   data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 9,  name: 'correlation_id',          data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 10, name: 'created_at',              data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal: 11, name: 'updated_at',              data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal: 12, name: 'started_at',              data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 13, name: 'completed_at',            data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 14, name: 'state_version',           data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: '1' },
  { ordinal: 15, name: 'worker_id',               data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 16, name: 'lease_token',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 17, name: 'lease_expires_at',        data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 18, name: 'heartbeat_at',            data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 19, name: 'attempt_count',           data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: '0' },
  { ordinal: 20, name: 'max_attempts',            data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: '3' },
  { ordinal: 21, name: 'request_idempotency_key', data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 22, name: 'request_payload_hash',    data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 23, name: 'request_classification',  data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: "'client_verified'::text" },
  { ordinal: 24, name: 'public_error_code',       data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 25, name: 'public_message_key',      data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 26, name: 'support_reference',       data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 27, name: 'snapshot_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 28, name: 'originating_request_id',  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
]

export const POST_CORRECTIVE_GENERATION_JOB_REQUESTS_COLUMNS: ColumnSpec[] = [
  { ordinal: 1, name: 'id',                      data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: 'gen_random_uuid()' },
  { ordinal: 2, name: 'user_id',                 data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: null },
  { ordinal: 3, name: 'request_idempotency_key', data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO', column_default: null },
  { ordinal: 4, name: 'request_payload_hash',    data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO', column_default: null },
  { ordinal: 5, name: 'document_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: null },
  { ordinal: 6, name: 'job_type',                data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO', column_default: null },
  { ordinal: 7, name: 'job_id',                  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: null },
  { ordinal: 8, name: 'snapshot_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO', column_default: null },
  { ordinal: 9, name: 'created_at',              data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO', column_default: 'now()' },
]

export const POST_CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_COLUMNS: ColumnSpec[] = [
  { ordinal:  1, name: 'id',                           data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: 'gen_random_uuid()' },
  { ordinal:  2, name: 'user_id',                      data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  3, name: 'document_id',                  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  4, name: 'snapshot_schema_version',      data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: '1' },
  { ordinal:  5, name: 'captured_at',                  data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal:  6, name: 'document_title',               data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal:  7, name: 'document_extracted_text',      data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal:  8, name: 'document_file_type',           data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal:  9, name: 'document_source_type',         data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 10, name: 'document_subject_id',          data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 11, name: 'document_created_at',          data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 12, name: 'document_source_recording_id', data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 13, name: 'analysis_id',                  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal: 14, name: 'analysis_data',                data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'YES', column_default: null },
  { ordinal: 15, name: 'analysis_created_at',          data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
  { ordinal: 16, name: 'analysis_model',               data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 17, name: 'operation_descriptor',         data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: null },
  { ordinal: 18, name: 'content_hash',                 data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
]

export const POST_CORRECTIVE_GENERATION_JOB_USAGE_COLUMNS: ColumnSpec[] = [
  { ordinal:  1, name: 'job_id',               data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  2, name: 'user_id',              data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  3, name: 'document_id',          data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  4, name: 'snapshot_id',          data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  5, name: 'request_payload_hash', data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal:  6, name: 'job_type',             data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal:  7, name: 'attempt_count',        data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: null },
  { ordinal:  8, name: 'model',                data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: null },
  { ordinal:  9, name: 'generated_count',      data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: null },
  { ordinal: 10, name: 'failed_count',         data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'NO',  column_default: null },
  { ordinal: 11, name: 'result_code',          data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 12, name: 'created_at',           data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
]

export const POST_CORRECTIVE_STUDY_VISUALS_COLUMNS: ColumnSpec[] = [
  { ordinal:  1, name: 'id',                  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: 'gen_random_uuid()' },
  { ordinal:  2, name: 'document_id',         data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  3, name: 'user_id',             data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'NO',  column_default: null },
  { ordinal:  4, name: 'visuals',             data_type: 'jsonb',                    udt_name: 'jsonb',       is_nullable: 'NO',  column_default: "'[]'::jsonb" },
  { ordinal:  5, name: 'model',               data_type: 'text',                     udt_name: 'text',        is_nullable: 'NO',  column_default: "'gpt-4o-mini'::text" },
  { ordinal:  6, name: 'created_at',          data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'NO',  column_default: 'now()' },
  { ordinal:  7, name: 'source_job_id',       data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal:  8, name: 'source_snapshot_id',  data_type: 'uuid',                     udt_name: 'uuid',        is_nullable: 'YES', column_default: null },
  { ordinal:  9, name: 'source_request_hash', data_type: 'text',                     udt_name: 'text',        is_nullable: 'YES', column_default: null },
  { ordinal: 10, name: 'publication_attempt', data_type: 'integer',                  udt_name: 'int4',        is_nullable: 'YES', column_default: null },
]

// ── D11 Baseline: Constraint specs ────────────────────────────────────────────
// exact_def: pg_get_constraintdef(oid) output. Confirmed from migration preflight assertions.

export const D11_DOCUMENTS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'documents_pkey',                     contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'documents_user_id_fkey',             contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',           condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
  { name: 'documents_subject_id_fkey',          contype: 'f', exact_def: 'FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL',          condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'n' },
  { name: 'documents_source_recording_id_fkey', contype: 'f', exact_def: 'FOREIGN KEY (source_recording_id) REFERENCES recordings(id) ON DELETE SET NULL', condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'n' },
  { name: 'documents_source_type_check',        contype: 'c', exact_def: "CHECK (source_type IS NULL OR (source_type = ANY (ARRAY['upload'::text, 'recording'::text])))" },
]

export const D11_DOCUMENT_ANALYSIS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'document_analysis_pkey',             contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'document_analysis_document_id_fkey', contype: 'f', exact_def: 'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE',     condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
  { name: 'document_analysis_user_id_fkey',     contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',         condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
]

export const D11_STUDY_VISUALS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'study_visuals_pkey',                    contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'study_visuals_document_id_user_id_key', contype: 'u', exact_def: 'UNIQUE (document_id, user_id)' },
  { name: 'study_visuals_document_id_fkey',        contype: 'f', exact_def: 'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE', condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
  { name: 'study_visuals_user_id_fkey',            contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',   condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
]

// D11 generation_jobs baseline constraints (post-historical, pre-corrective).
// Status check has the D11 form (without cancel_requested).
export const D11_GENERATION_JOBS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'generation_jobs_pkey',          contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'generation_jobs_user_id_fkey',  contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',   condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
  { name: 'generation_jobs_document_id_fkey', contype: 'f', exact_def: 'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE', condeferrable: false, condeferred: false, confupdtype: 'a', confdeltype: 'c' },
  { name: 'generation_jobs_status_check',  contype: 'c', exact_def: "CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))" },
  { name: 'generation_jobs_type_check',    contype: 'c', exact_def: "CHECK (job_type = ANY (ARRAY['visuals'::text, 'flashcards'::text, 'quiz'::text, 'revision_notes'::text, 'analysis'::text]))" },
]

// ── Post-corrective: Complete constraint sets per table ───────────────────────
// exact_def strings derived from migration SQL + PostgreSQL deparser normalization rules.
// Note: Complex CHECK constraint strings (classification_coherence, operation_descriptor_check)
// are best-guess normalizations — may need minor adjustment on first live DB run.

export const POST_CORRECTIVE_DOCUMENTS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'documents_pkey',                  contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'documents_user_id_fkey',          contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  { name: 'documents_subject_id_fkey',       contype: 'f', exact_def: 'FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL', condeferrable: false, condeferred: false },
  { name: 'documents_source_recording_id_fkey', contype: 'f', exact_def: 'FOREIGN KEY (source_recording_id) REFERENCES recordings(id) ON DELETE SET NULL', condeferrable: false, condeferred: false },
  { name: 'documents_source_type_check',     contype: 'c', exact_def: "CHECK (source_type IS NULL OR (source_type = ANY (ARRAY['upload'::text, 'recording'::text])))" },
  { name: 'documents_id_user_id_unique',     contype: 'u', exact_def: 'UNIQUE (id, user_id)' },
]

export const POST_CORRECTIVE_DOCUMENT_ANALYSIS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'document_analysis_pkey',                    contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'document_analysis_document_id_fkey',        contype: 'f', exact_def: 'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  { name: 'document_analysis_user_id_fkey',            contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  { name: 'document_analysis_id_document_user_unique', contype: 'u', exact_def: 'UNIQUE (id, document_id, user_id)' },
  { name: 'document_analysis_document_user_unique',    contype: 'u', exact_def: 'UNIQUE (document_id, user_id)' },
  { name: 'document_analysis_document_owner_fk',       contype: 'f', exact_def: 'FOREIGN KEY (document_id, user_id) REFERENCES documents(id, user_id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
]

export const POST_CORRECTIVE_STUDY_VISUALS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'study_visuals_pkey',                    contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'study_visuals_document_id_user_id_key', contype: 'u', exact_def: 'UNIQUE (document_id, user_id)' },
  { name: 'study_visuals_document_id_fkey',        contype: 'f', exact_def: 'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  { name: 'study_visuals_user_id_fkey',            contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  { name: 'study_visuals_source_job_fk',           contype: 'f', exact_def: 'FOREIGN KEY (source_job_id) REFERENCES generation_jobs(id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'study_visuals_source_snapshot_fk',      contype: 'f', exact_def: 'FOREIGN KEY (source_snapshot_id) REFERENCES generation_source_snapshots(id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'study_visuals_request_hash_format',     contype: 'c', exact_def: "CHECK (source_request_hash IS NULL OR source_request_hash ~ '^[0-9a-f]{64}$'::text)" },
  { name: 'study_visuals_provenance_coherence',    contype: 'c', exact_def: 'CHECK (((source_job_id IS NULL) AND (source_snapshot_id IS NULL) AND (source_request_hash IS NULL) AND (publication_attempt IS NULL)) OR ((source_job_id IS NOT NULL) AND (source_snapshot_id IS NOT NULL) AND (source_request_hash IS NOT NULL) AND (publication_attempt IS NOT NULL)))' },
  { name: 'study_visuals_publication_attempt_positive', contype: 'c', exact_def: 'CHECK ((publication_attempt IS NULL) OR (publication_attempt > 0))' },
  { name: 'study_visuals_usage_provenance_fk',     contype: 'f', exact_def: 'FOREIGN KEY (source_job_id, user_id, document_id, source_snapshot_id, source_request_hash, publication_attempt) REFERENCES generation_job_usage(job_id, user_id, document_id, snapshot_id, request_payload_hash, attempt_count) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
]

// Post-corrective generation_jobs: 12 constraints total.
// status_check is REPLACED by corrective migration section 3 (new form includes cancel_requested).
export const POST_CORRECTIVE_GENERATION_JOBS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'generation_jobs_pkey',                      contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'generation_jobs_user_id_fkey',              contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  { name: 'generation_jobs_document_id_fkey',          contype: 'f', exact_def: 'FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE', condeferrable: false, condeferred: false },
  // status_check replaced by section 3 with cancel_requested added
  { name: 'generation_jobs_status_check',              contype: 'c', exact_def: "CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'cancel_requested'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))" },
  { name: 'generation_jobs_type_check',                contype: 'c', exact_def: "CHECK (job_type = ANY (ARRAY['visuals'::text, 'flashcards'::text, 'quiz'::text, 'revision_notes'::text, 'analysis'::text]))" },
  // section 7: classification coherence
  { name: 'generation_jobs_classification_coherence',  contype: 'c', exact_def: "CHECK (((request_classification = 'client_verified'::text) AND (request_idempotency_key IS NOT NULL) AND (request_payload_hash IS NOT NULL) AND (originating_request_id IS NOT NULL)) OR ((request_classification = 'legacy_unverified'::text) AND (request_idempotency_key IS NULL) AND (request_payload_hash IS NULL) AND (originating_request_id IS NULL)))" },
  // section 8: format checks
  { name: 'generation_jobs_key_format',                contype: 'c', exact_def: "CHECK ((request_idempotency_key IS NULL) OR (request_idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))" },
  { name: 'generation_jobs_hash_format',               contype: 'c', exact_def: "CHECK ((request_payload_hash IS NULL) OR (request_payload_hash ~ '^[0-9a-f]{64}$'::text))" },
  // section 10: composite unique
  { name: 'generation_jobs_id_user_id_unique',         contype: 'u', exact_def: 'UNIQUE (id, user_id)' },
  // section 17c: full-binding uniques and composite FKs
  { name: 'generation_jobs_verified_binding_unique',   contype: 'u', exact_def: 'UNIQUE (id, user_id, document_id, snapshot_id, request_payload_hash, job_type)' },
  { name: 'generation_jobs_snapshot_scope_fk',         contype: 'f', exact_def: 'FOREIGN KEY (snapshot_id, user_id, document_id) REFERENCES generation_source_snapshots(id, user_id, document_id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'generation_jobs_originating_request_fk',    contype: 'f', exact_def: 'FOREIGN KEY (originating_request_id, user_id, request_idempotency_key, request_payload_hash, id, document_id, snapshot_id, job_type) REFERENCES generation_job_requests(id, user_id, request_idempotency_key, request_payload_hash, job_id, document_id, snapshot_id, job_type) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED', condeferrable: true, condeferred: true },
]

export const POST_CORRECTIVE_GENERATION_JOB_REQUESTS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'generation_job_requests_pkey',              contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'generation_job_requests_unique_key',        contype: 'u', exact_def: 'UNIQUE (user_id, request_idempotency_key)' },
  { name: 'generation_job_requests_user_fk',           contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'generation_job_requests_hash_format',       contype: 'c', exact_def: "CHECK ((request_payload_hash ~ '^[0-9a-f]{64}$'::text))" },
  { name: 'generation_job_requests_job_type_check',    contype: 'c', exact_def: "CHECK (job_type = ANY (ARRAY['visuals'::text, 'flashcards'::text, 'quiz'::text, 'revision_notes'::text, 'analysis'::text]))" },
  { name: 'generation_job_requests_binding_unique',    contype: 'u', exact_def: 'UNIQUE (user_id, request_idempotency_key, request_payload_hash, job_id, document_id, snapshot_id, job_type)' },
  { name: 'generation_job_requests_id_binding_unique', contype: 'u', exact_def: 'UNIQUE (id, user_id, request_idempotency_key, request_payload_hash, job_id, document_id, snapshot_id, job_type)' },
  { name: 'generation_job_requests_snapshot_scope_fk', contype: 'f', exact_def: 'FOREIGN KEY (snapshot_id, user_id, document_id) REFERENCES generation_source_snapshots(id, user_id, document_id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'generation_job_requests_job_scope_fk',      contype: 'f', exact_def: 'FOREIGN KEY (job_id, user_id, document_id, snapshot_id, request_payload_hash, job_type) REFERENCES generation_jobs(id, user_id, document_id, snapshot_id, request_payload_hash, job_type) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED', condeferrable: true, condeferred: true },
]

// operation_descriptor_check: complex multi-AND JSONB schema validation.
// exact_def derived from PostgreSQL deparser rules applied to migration section 17b-create.
// Normalizations: string literals get ::text; IN(...) → = ANY(ARRAY[...]); -> key gets ::text.
export const POST_CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'generation_source_snapshots_pkey',                    contype: 'p', exact_def: 'PRIMARY KEY (id)' },
  { name: 'generation_source_snapshots_scope_unique',            contype: 'u', exact_def: 'UNIQUE (id, user_id, document_id)' },
  { name: 'generation_source_snapshots_content_hash_format',     contype: 'c', exact_def: "CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text))" },
  { name: 'generation_source_snapshots_user_fk',                 contype: 'f', exact_def: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'generation_source_snapshots_operation_descriptor_check', contype: 'c', exact_def: "CHECK ((jsonb_typeof(operation_descriptor) = 'object'::text) AND (operation_descriptor ?& ARRAY['schema_version'::text, 'job_type'::text, 'text_model'::text, 'image_model'::text, 'temperature'::text, 'max_tokens'::text, 'image_size'::text, 'image_count'::text, 'prompt_schema_version'::text]) AND ((operation_descriptor - ARRAY['schema_version'::text, 'job_type'::text, 'text_model'::text, 'image_model'::text, 'temperature'::text, 'max_tokens'::text, 'image_size'::text, 'image_count'::text, 'prompt_schema_version'::text]) = '{}'::jsonb) AND (jsonb_typeof(operation_descriptor -> 'schema_version'::text) = 'number'::text) AND ((operation_descriptor ->> 'job_type'::text) = ANY (ARRAY['visuals'::text, 'flashcards'::text, 'quiz'::text, 'revision_notes'::text, 'analysis'::text])) AND (jsonb_typeof(operation_descriptor -> 'text_model'::text) = 'string'::text) AND (jsonb_typeof(operation_descriptor -> 'image_model'::text) = 'string'::text) AND (jsonb_typeof(operation_descriptor -> 'temperature'::text) = 'number'::text) AND (jsonb_typeof(operation_descriptor -> 'max_tokens'::text) = 'number'::text) AND (jsonb_typeof(operation_descriptor -> 'image_size'::text) = 'string'::text) AND (jsonb_typeof(operation_descriptor -> 'image_count'::text) = 'number'::text) AND (jsonb_typeof(operation_descriptor -> 'prompt_schema_version'::text) = 'number'::text))" },
  { name: 'generation_source_snapshots_document_scope_fk',       contype: 'f', exact_def: 'FOREIGN KEY (document_id, user_id) REFERENCES documents(id, user_id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'generation_source_snapshots_analysis_scope_fk',       contype: 'f', exact_def: 'FOREIGN KEY (analysis_id, document_id, user_id) REFERENCES document_analysis(id, document_id, user_id) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
]

export const POST_CORRECTIVE_GENERATION_JOB_USAGE_CONSTRAINTS: ConstraintSpec[] = [
  { name: 'generation_job_usage_pkey',               contype: 'p', exact_def: 'PRIMARY KEY (job_id)' },
  { name: 'generation_job_usage_counts_check',        contype: 'c', exact_def: 'CHECK ((attempt_count > 0) AND (generated_count >= 0) AND (failed_count >= 0) AND ((generated_count + failed_count) <= 10))' },
  { name: 'generation_job_usage_job_scope_fk',        contype: 'f', exact_def: 'FOREIGN KEY (job_id, user_id, document_id, snapshot_id, request_payload_hash, job_type) REFERENCES generation_jobs(id, user_id, document_id, snapshot_id, request_payload_hash, job_type) ON DELETE RESTRICT', condeferrable: false, condeferred: false },
  { name: 'generation_job_usage_publication_unique',  contype: 'u', exact_def: 'UNIQUE (job_id, user_id, document_id, snapshot_id, request_payload_hash, attempt_count)' },
]

// ── Post-corrective: Index specs ──────────────────────────────────────────────

export const CORRECTIVE_GENERATION_JOBS_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'generation_jobs',
    name:            'generation_jobs_active_exclusion',
    is_unique:       true,
    is_partial:      true,
    predicate:       `(status = ANY (ARRAY['queued'::text, 'processing'::text, 'cancel_requested'::text]))`,
    pg_get_indexdef: `CREATE UNIQUE INDEX generation_jobs_active_exclusion ON public.generation_jobs USING btree (user_id, document_id, job_type) WHERE (status = ANY (ARRAY['queued'::text, 'processing'::text, 'cancel_requested'::text]))`,
  },
  {
    schema:          'public',
    table:           'generation_jobs',
    name:            'generation_jobs_originating_key',
    is_unique:       true,
    is_partial:      true,
    predicate:       `(request_idempotency_key IS NOT NULL)`,
    pg_get_indexdef: `CREATE UNIQUE INDEX generation_jobs_originating_key ON public.generation_jobs USING btree (user_id, request_idempotency_key) WHERE (request_idempotency_key IS NOT NULL)`,
  },
  {
    schema:          'public',
    table:           'generation_jobs',
    name:            'generation_jobs_active_status',
    is_unique:       false,
    is_partial:      true,
    predicate:       `(status = ANY (ARRAY['queued'::text, 'processing'::text, 'cancel_requested'::text]))`,
    pg_get_indexdef: `CREATE INDEX generation_jobs_active_status ON public.generation_jobs USING btree (status) WHERE (status = ANY (ARRAY['queued'::text, 'processing'::text, 'cancel_requested'::text]))`,
  },
]

export const CORRECTIVE_GENERATION_JOB_REQUESTS_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'generation_job_requests',
    name:            'generation_job_requests_job_id',
    is_unique:       false,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE INDEX generation_job_requests_job_id ON public.generation_job_requests USING btree (job_id)`,
  },
]

export const CORRECTIVE_GENERATION_SOURCE_SNAPSHOTS_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'generation_source_snapshots',
    name:            'generation_source_snapshots_document_id',
    is_unique:       false,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE INDEX generation_source_snapshots_document_id ON public.generation_source_snapshots USING btree (document_id, user_id)`,
  },
]

// ── Post-corrective: Storage policy specs ────────────────────────────────────

export const POST_CORRECTIVE_STORAGE_POLICY_SPECS = [
  { name: 'Users can delete own files',        cmd: 'DELETE', mode: 'PERMISSIVE',  role: 'authenticated', qual: `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`, withCheck: null as string | null },
  { name: 'Users can read own files',          cmd: 'SELECT', mode: 'PERMISSIVE',  role: 'authenticated', qual: `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`, withCheck: null as string | null },
  { name: 'Users can upload to own folder',    cmd: 'INSERT', mode: 'PERMISSIVE',  role: 'authenticated', qual: null as string | null, withCheck: `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
  { name: 'recordings_delete',                 cmd: 'DELETE', mode: 'PERMISSIVE',  role: 'public',        qual: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`, withCheck: null as string | null },
  { name: 'recordings_read',                   cmd: 'SELECT', mode: 'PERMISSIVE',  role: 'public',        qual: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`, withCheck: null as string | null },
  { name: 'recordings_update',                 cmd: 'UPDATE', mode: 'PERMISSIVE',  role: 'public',        qual: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`, withCheck: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
  { name: 'recordings_upload',                 cmd: 'INSERT', mode: 'PERMISSIVE',  role: 'public',        qual: null as string | null, withCheck: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
  { name: 'study_visuals_block_authenticated', cmd: 'ALL',    mode: 'RESTRICTIVE', role: 'authenticated', qual: `(bucket_id <> 'study-visuals'::text)`, withCheck: `(bucket_id <> 'study-visuals'::text)` },
  { name: 'study_visuals_block_anon',          cmd: 'ALL',    mode: 'RESTRICTIVE', role: 'anon',          qual: `(bucket_id <> 'study-visuals'::text)`, withCheck: `(bucket_id <> 'study-visuals'::text)` },
] as const

// ── Post-corrective: RLS state per table ─────────────────────────────────────
// relrowsecurity=true, relforcerowsecurity=false for all 5 tables.
// Source: ENABLE ROW LEVEL SECURITY (no FORCE) in corrective migration sections 16, 17b, 17c, 22, 32.

export const POST_CORRECTIVE_RLS_STATES: Record<string, { relrowsecurity: boolean; relforcerowsecurity: boolean }> = {
  'generation_jobs':              { relrowsecurity: true, relforcerowsecurity: false },
  'generation_job_requests':      { relrowsecurity: true, relforcerowsecurity: false },
  'generation_source_snapshots':  { relrowsecurity: true, relforcerowsecurity: false },
  'generation_job_usage':         { relrowsecurity: true, relforcerowsecurity: false },
  'study_visuals':                { relrowsecurity: true, relforcerowsecurity: false },
}

// ── Post-corrective: Immutability triggers ────────────────────────────────────
// tgtype=27: BEFORE(2) | UPDATE(16) | DELETE(8) | ROW(1).
// tgenabled='O': DEFAULT enabled.
// pg_get_triggerdef: exact canonical string from pg_get_triggerdef(oid, true).

export const IMMUTABILITY_TRIGGERS = [
  {
    table:             'generation_source_snapshots',
    trigger:           'trg_snapshot_immutability',
    tgtype:            27,
    tgenabled:         'O' as const,
    pg_get_triggerdef: `CREATE TRIGGER trg_snapshot_immutability BEFORE UPDATE OR DELETE ON public.generation_source_snapshots FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_immutability_guard()`,
  },
  {
    table:             'generation_job_requests',
    trigger:           'trg_job_request_immutability',
    tgtype:            27,
    tgenabled:         'O' as const,
    pg_get_triggerdef: `CREATE TRIGGER trg_job_request_immutability BEFORE UPDATE OR DELETE ON public.generation_job_requests FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_immutability_guard()`,
  },
  {
    table:             'generation_job_usage',
    trigger:           'trg_generation_job_usage_immutability',
    tgtype:            27,
    tgenabled:         'O' as const,
    pg_get_triggerdef: `CREATE TRIGGER trg_generation_job_usage_immutability BEFORE UPDATE OR DELETE ON public.generation_job_usage FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_immutability_guard()`,
  },
] as const

// ── Post-corrective: Ledger binding trigger ───────────────────────────────────
// tgtype=21: AFTER(0) | INSERT(4) | UPDATE(16) | ROW(1) = 21.
// tgenabled='O': DEFAULT enabled.
// tgisconstraint=true: CONSTRAINT TRIGGER.
// condeferrable=true, condeferred=true: DEFERRABLE INITIALLY DEFERRED.

export const LEDGER_TRIGGER_SPEC: TriggerSpec = {
  schema:            'public',
  table:             'generation_jobs',
  name:              'trg_check_ledger_binding',
  tgenabled:         'O',
  tgtype:            21,
  tgisconstraint:    true,
  condeferrable:     true,
  condeferred:       true,
  pg_get_triggerdef: `CREATE CONSTRAINT TRIGGER trg_check_ledger_binding AFTER INSERT OR UPDATE ON public.generation_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_check_ledger_binding()`,
}

// ── Post-corrective: Default ACL tuples ──────────────────────────────────────
// After section 1b REVOKE ALL FROM anon/authenticated/service_role/PUBLIC:
// Only postgres self-grants remain.
// TABLE (r): 8 privileges — INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN.
// FUNCTION (f): 1 privilege — EXECUTE.
// SEQUENCE (S): 3 privileges — SELECT,UPDATE,USAGE.
// is_grantable=false for all; grantor=grantee=postgres.

export const POST_CORRECTIVE_DEFAULT_ACL_TUPLES: Record<string, DefaultAclTuple[]> = {
  'r': [
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'DELETE',     is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'INSERT',     is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'MAINTAIN',   is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'REFERENCES', is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'SELECT',     is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'TRIGGER',    is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'TRUNCATE',   is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'UPDATE',     is_grantable: false },
  ],
  'f': [
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'EXECUTE', is_grantable: false },
  ],
  'S': [
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'SELECT', is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'UPDATE', is_grantable: false },
    { grantor: 'postgres', grantee: 'postgres', privilege_type: 'USAGE',  is_grantable: false },
  ],
}

// ── Post-corrective: Corrective indexes (names only) ─────────────────────────

export const POST_CORRECTIVE_GENERATION_JOBS_INDEXES = [
  'generation_jobs_active_exclusion',
  'generation_jobs_originating_key',
  'generation_jobs_active_status',
] as const

export const DROPPED_GENERATION_JOBS_INDEXES = ['generation_jobs_status'] as const

// ── All corrective functions ──────────────────────────────────────────────────

export const CORRECTIVE_FUNCTIONS = [
  'fn_enqueue_job',
  'fn_claim_job',
  'fn_heartbeat_job',
  'fn_complete_job',
  'fn_complete_and_publish_job',
  'fn_fail_job',
  'fn_acknowledge_cancel',
  'fn_request_job_cancel',
  'fn_recover_stale_jobs',
  'fn_get_claimed_job_context',
  'fn_get_job_safe_dto',
  'fn_get_active_job_for_document',
  'fn_get_owner_study_visuals',
  'fn_get_visuals_signing_manifest',
  'fn_check_ledger_binding',
  'fn_sha256_hex',
  'fn_canonical_jsonb_v1',
  'fn_canonical_source_v1',
  'fn_canonical_request_v1',
  'fn_snapshot_immutability_guard',
] as const

// ── Function grant model (name categories) ───────────────────────────────────

export const FUNCTION_GRANT_MODEL = {
  service_role_only: [
    'fn_get_claimed_job_context',
    'fn_claim_job',
    'fn_heartbeat_job',
    'fn_complete_job',
    'fn_complete_and_publish_job',
    'fn_fail_job',
    'fn_acknowledge_cancel',
    'fn_recover_stale_jobs',
    'fn_get_visuals_signing_manifest',
  ],
  authenticated_only: [
    'fn_enqueue_job',
    'fn_get_job_safe_dto',
    'fn_get_active_job_for_document',
    'fn_get_owner_study_visuals',
    'fn_request_job_cancel',
  ],
  no_runtime_grants: [
    'fn_sha256_hex',
    'fn_canonical_jsonb_v1',
    'fn_canonical_source_v1',
    'fn_canonical_request_v1',
    'fn_snapshot_immutability_guard',
    'fn_check_ledger_binding',
  ],
} as const

// ── Corrective function full specs ────────────────────────────────────────────
// Source: migration sections 23–30c + section 32 ACL reconciliation block.
// ACL: after section 32 REVOKE ALL FROM PUBLIC/anon/authenticated/service_role then
//   GRANT to specific role. proconfig_sp: expected proconfig[0] (search_path setting).
// fn_sha256_hex: search_path=extensions, pg_catalog (NOT empty — uses extensions.digest).
// All others: search_path= (empty, prevents object shadowing).

const _execAcl = (grantee: string): AclTuple[] => [
  { grantee: 'postgres', privilege_type: 'EXECUTE', is_grantable: false },
  { grantee,             privilege_type: 'EXECUTE', is_grantable: false },
]
const _ownerOnlyAcl: AclTuple[] = [
  { grantee: 'postgres', privilege_type: 'EXECUTE', is_grantable: false },
]

export const CORRECTIVE_FUNCTION_SPECS: FunctionSpec[] = [
  { name: 'fn_enqueue_job',              identity_args: 'uuid, text, text, jsonb',                                   provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('authenticated') },
  { name: 'fn_claim_job',                identity_args: 'uuid, text, integer',                                        provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_heartbeat_job',            identity_args: 'uuid, text, uuid, integer, integer',                         provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_complete_job',             identity_args: 'uuid, text, uuid, integer, jsonb',                           provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_complete_and_publish_job', identity_args: 'uuid, text, uuid, integer, jsonb, text, text',               provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_fail_job',                 identity_args: 'uuid, text, uuid, integer, text, text, text',                provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_acknowledge_cancel',       identity_args: 'uuid, text, uuid, integer',                                  provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_request_job_cancel',       identity_args: 'uuid',                                                       provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('authenticated') },
  { name: 'fn_recover_stale_jobs',       identity_args: '',                                                           provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_get_claimed_job_context',  identity_args: 'uuid, text, uuid, integer',                                  provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_get_job_safe_dto',         identity_args: 'uuid',                                                       provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('authenticated') },
  { name: 'fn_get_active_job_for_document', identity_args: 'uuid, text',                                             provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('authenticated') },
  { name: 'fn_get_owner_study_visuals',  identity_args: 'uuid',                                                       provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('authenticated') },
  { name: 'fn_get_visuals_signing_manifest', identity_args: 'uuid, uuid',                                            provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _execAcl('service_role') },
  { name: 'fn_check_ledger_binding',     identity_args: '',                                                           provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _ownerOnlyAcl },
  // fn_sha256_hex: STABLE + extensions search_path for pgcrypto (NOT empty search_path)
  { name: 'fn_sha256_hex',               identity_args: 'text',                                                       provolatile: 's', prosecdef: true, proconfig_sp: 'search_path=extensions, pg_catalog', acl: _ownerOnlyAcl },
  // IMMUTABLE serialiser helpers
  { name: 'fn_canonical_jsonb_v1',       identity_args: 'jsonb',                                                      provolatile: 'i', prosecdef: true, proconfig_sp: 'search_path=', acl: _ownerOnlyAcl },
  { name: 'fn_canonical_source_v1',      identity_args: 'integer, text, text, text, text, text, text, text, text, text, jsonb, text, text', provolatile: 'i', prosecdef: true, proconfig_sp: 'search_path=', acl: _ownerOnlyAcl },
  { name: 'fn_canonical_request_v1',     identity_args: 'integer, text, text, jsonb, jsonb',                          provolatile: 'i', prosecdef: true, proconfig_sp: 'search_path=', acl: _ownerOnlyAcl },
  // Trigger function: no runtime grant; VOLATILE
  { name: 'fn_snapshot_immutability_guard', identity_args: '',                                                        provolatile: 'v', prosecdef: true, proconfig_sp: 'search_path=', acl: _ownerOnlyAcl },
]

// ── Table ACL tuples ──────────────────────────────────────────────────────────
// Source: migration section 32 + 33. All privilege_type values from arwdDxtm expansion.
// Note: table relacl uses arwdDxtm letters (a=INSERT, r=SELECT, w=UPDATE, d=DELETE,
// D=TRUNCATE, x=REFERENCES, t=TRIGGER, m=MAINTAIN). aclexplode returns one row per privilege.

const TABLE_PRIVILEGES_ALL = ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'] as const
const TABLE_PRIVILEGES_CRUD = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'] as const

// After section 32 REVOKE ALL FROM PUBLIC/anon/authenticated/service_role:
// Closed tables (generation_jobs, generation_job_requests, generation_source_snapshots,
// generation_job_usage, study_visuals) — only postgres retains all privileges.
export const CLOSED_TABLE_ACL: AclTuple[] = TABLE_PRIVILEGES_ALL.map(pt => ({
  grantee: 'postgres', privilege_type: pt, is_grantable: false,
}))

// documents/document_analysis: postgres=arwdDxtm, authenticated=arwd, service_role=arwd
// Source: migration section 33.
export const POST_CORRECTIVE_DOCUMENTS_ACL: AclTuple[] = [
  ...TABLE_PRIVILEGES_ALL.map(pt => ({ grantee: 'postgres',      privilege_type: pt, is_grantable: false })),
  ...TABLE_PRIVILEGES_CRUD.map(pt => ({ grantee: 'authenticated', privilege_type: pt, is_grantable: false })),
  ...TABLE_PRIVILEGES_CRUD.map(pt => ({ grantee: 'service_role',  privilege_type: pt, is_grantable: false })),
]

// ── D11 Baseline: Public schema ACL ──────────────────────────────────────────
// D11 SA10: nspacl={pg_database_owner=UC, =U (public), postgres=U, anon=U, authenticated=U, service_role=U}

export const D11_PUBLIC_SCHEMA_ACL: AclTuple[] = [
  { grantee: '',                   privilege_type: 'USAGE',  is_grantable: false },
  { grantee: 'anon',              privilege_type: 'USAGE',  is_grantable: false },
  { grantee: 'authenticated',     privilege_type: 'USAGE',  is_grantable: false },
  { grantee: 'pg_database_owner', privilege_type: 'CREATE', is_grantable: false },
  { grantee: 'pg_database_owner', privilege_type: 'USAGE',  is_grantable: false },
  { grantee: 'postgres',          privilege_type: 'USAGE',  is_grantable: false },
  { grantee: 'service_role',      privilege_type: 'USAGE',  is_grantable: false },
]

// ── D11 Baseline: FK delete/update behavior ───────────────────────────────────
// confdeltype / confupdtype: 'a'=NO ACTION, 'c'=CASCADE, 'n'=SET NULL, 'r'=RESTRICT, 'd'=SET DEFAULT

export interface FkBehaviorSpec {
  conname:      string
  confdeltype:  string
  confupdtype:  string
}

export const D11_DOCUMENTS_FK_BEHAVIOR: FkBehaviorSpec[] = [
  { conname: 'documents_user_id_fkey',             confdeltype: 'c', confupdtype: 'a' },
  { conname: 'documents_subject_id_fkey',          confdeltype: 'n', confupdtype: 'a' },
  { conname: 'documents_source_recording_id_fkey', confdeltype: 'n', confupdtype: 'a' },
]

// ── D11 Baseline: Trigger dependants ─────────────────────────────────────────
// D11 SA06: 7 trigger instances with exact table/event/timing.

export interface TriggerDependantSpec {
  table:  string
  name:   string
  events: string[]
  timing: string
}

export const D11_TRIGGER_DEPENDANTS: TriggerDependantSpec[] = [
  { table: 'documents',      name: 'validate_document_subject_ownership',  events: ['INSERT','UPDATE'], timing: 'BEFORE' },
  { table: 'recordings',     name: 'validate_recording_subject_ownership', events: ['INSERT','UPDATE'], timing: 'BEFORE' },
  { table: 'subjects',       name: 'set_subjects_updated_at',              events: ['UPDATE'],          timing: 'BEFORE' },
  { table: 'user_profiles',  name: 'set_user_profiles_updated_at',         events: ['UPDATE'],          timing: 'BEFORE' },
  { table: 'user_profiles',  name: 'sync_user_profiles_identity_trigger',  events: ['INSERT'],          timing: 'BEFORE' },
  { table: 'user_profiles',  name: 'user_profiles_updated_at',             events: ['UPDATE'],          timing: 'BEFORE' },
  { table: 'agent_memories', name: 'agent_memories_updated_at',            events: ['UPDATE'],          timing: 'BEFORE' },
]

// ── D11 Baseline: Storage policy specs with exact USING and WITH CHECK ────────
// qual = USING clause; withCheck = WITH CHECK clause; null means clause absent.

export interface StoragePolicyDetailSpec {
  name:      string
  cmd:       string
  role:      string
  qual:      string | null
  withCheck: string | null
}

export const D11_STUDY_VISUALS_STORAGE_POLICY_SPECS: StoragePolicyDetailSpec[] = [
  { name: 'For full customization 137qt67_0', cmd: 'SELECT', role: 'authenticated',
    qual:      `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
  { name: 'For full customization 137qt67_1', cmd: 'INSERT', role: 'authenticated',
    qual:      null,
    withCheck: `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
  { name: 'For full customization 137qt67_2', cmd: 'UPDATE', role: 'authenticated',
    qual:      `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
  { name: 'For full customization 137qt67_3', cmd: 'DELETE', role: 'authenticated',
    qual:      `((bucket_id = 'study-visuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
]

export const D11_UNRELATED_STORAGE_POLICY_SPECS: StoragePolicyDetailSpec[] = [
  { name: 'Users can delete own files', cmd: 'DELETE', role: 'authenticated',
    qual:      `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
  { name: 'Users can read own files', cmd: 'SELECT', role: 'authenticated',
    qual:      `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
  { name: 'Users can upload to own folder', cmd: 'INSERT', role: 'authenticated',
    qual:      null,
    withCheck: `((bucket_id = 'study-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
  { name: 'recordings_delete', cmd: 'DELETE', role: 'public',
    qual:      `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
  { name: 'recordings_read', cmd: 'SELECT', role: 'public',
    qual:      `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: null },
  { name: 'recordings_update', cmd: 'UPDATE', role: 'public',
    qual:      `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))`,
    withCheck: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
  { name: 'recordings_upload', cmd: 'INSERT', role: 'public',
    qual:      null,
    withCheck: `((bucket_id = 'recordings'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))` },
]

// ── Corrective absence contracts ──────────────────────────────────────────────
// Constraint and column names added by the corrective migration that must be ABSENT at D11.

export const CORRECTIVE_ABSENT_DA_CONSTRAINTS = [
  'document_analysis_id_document_user_unique',
  'document_analysis_document_user_unique',
  'document_analysis_document_owner_fk',
] as const

// ── Post-corrective: Immutability trigger type codes ─────────────────────────
// tgtype=27: BEFORE(2) | UPDATE(16) | DELETE(8) | ROW(1) = 27
// tgenabled='O': trigger is enabled in DEFAULT mode

export const IMMUTABILITY_TRIGGER_TGTYPE    = 27   // BEFORE UPDATE OR DELETE FOR EACH ROW
export const IMMUTABILITY_TRIGGER_TGENABLED = 'O'  // DEFAULT enabled

// ── Production environment ref (must never appear in test environments) ───────

export const PRODUCTION_PROJECT_REF = 'ujwfkhvmpdmgjausnbre' as const

// ── D11 Baseline: Public table policy specs ───────────────────────────────────
// Source: d11-catalogue-results-2026-07-31.csv S11_rls_policies section.
// roles field is roles::text array literal from pg_policies (e.g. '{authenticated}').

export interface PublicTablePolicySpec {
  policyname: string
  permissive: 'PERMISSIVE' | 'RESTRICTIVE'
  cmd:        string
  roles:      string
  qual:       string | null
  with_check: string | null
}

export const D11_DOCUMENTS_POLICY_SPECS: PublicTablePolicySpec[] = [
  { policyname: 'Users can delete own documents',       permissive: 'PERMISSIVE', cmd: 'DELETE', roles: '{authenticated}', qual: '(auth.uid() = user_id)', with_check: null },
  { policyname: 'Users can delete their own documents', permissive: 'PERMISSIVE', cmd: 'DELETE', roles: '{authenticated}', qual: '(user_id = auth.uid())', with_check: null },
  { policyname: 'Users can insert own documents',       permissive: 'PERMISSIVE', cmd: 'INSERT', roles: '{authenticated}', qual: null,                     with_check: '(auth.uid() = user_id)' },
  { policyname: 'Users can insert their own documents', permissive: 'PERMISSIVE', cmd: 'INSERT', roles: '{authenticated}', qual: null,                     with_check: '(user_id = auth.uid())' },
  { policyname: 'Users can view own documents',         permissive: 'PERMISSIVE', cmd: 'SELECT', roles: '{authenticated}', qual: '(auth.uid() = user_id)', with_check: null },
  { policyname: 'Users can view their own documents',   permissive: 'PERMISSIVE', cmd: 'SELECT', roles: '{authenticated}', qual: '(user_id = auth.uid())', with_check: null },
  { policyname: 'documents_update_own',                 permissive: 'PERMISSIVE', cmd: 'UPDATE', roles: '{authenticated}', qual: '(auth.uid() = user_id)', with_check: '(auth.uid() = user_id)' },
]

export const D11_DOCUMENT_ANALYSIS_POLICY_SPECS: PublicTablePolicySpec[] = [
  { policyname: 'owner_all', permissive: 'PERMISSIVE', cmd: 'ALL', roles: '{public}', qual: '(auth.uid() = user_id)', with_check: '(auth.uid() = user_id)' },
]

export const D11_STUDY_VISUALS_POLICY_SPECS: PublicTablePolicySpec[] = [
  { policyname: 'study_visuals_owner_all', permissive: 'PERMISSIVE', cmd: 'ALL', roles: '{public}', qual: '(auth.uid() = user_id)', with_check: '(auth.uid() = user_id)' },
]

export const D11_GENERATION_JOBS_BASELINE_POLICY_SPECS: PublicTablePolicySpec[] = [
  { policyname: 'Users see own jobs', permissive: 'PERMISSIVE', cmd: 'ALL', roles: '{public}', qual: '(auth.uid() = user_id)', with_check: null },
]

// ── D11 Baseline: Index specs ─────────────────────────────────────────────────
// Source: d11-catalogue-results-2026-07-31.csv S8_indexes section.
// pg_get_indexdef strings derived from S8_indexes index_method, columns, partial_predicate data.
// Primary-key indexes (is_primary=true) are also is_unique=true.

export const D11_DOCUMENTS_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'documents',
    name:            'documents_pkey',
    is_unique:       true,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id)`,
  },
  {
    schema:          'public',
    table:           'documents',
    name:            'documents_source_recording_unique',
    is_unique:       true,
    is_partial:      true,
    predicate:       `(source_recording_id IS NOT NULL)`,
    pg_get_indexdef: `CREATE UNIQUE INDEX documents_source_recording_unique ON public.documents USING btree (source_recording_id) WHERE (source_recording_id IS NOT NULL)`,
  },
  {
    schema:          'public',
    table:           'documents',
    name:            'documents_subject_id_idx',
    is_unique:       false,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE INDEX documents_subject_id_idx ON public.documents USING btree (subject_id)`,
  },
]

export const D11_DOCUMENT_ANALYSIS_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'document_analysis',
    name:            'document_analysis_pkey',
    is_unique:       true,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE UNIQUE INDEX document_analysis_pkey ON public.document_analysis USING btree (id)`,
  },
  {
    schema:          'public',
    table:           'document_analysis',
    name:            'idx_document_analysis_document_id',
    is_unique:       false,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE INDEX idx_document_analysis_document_id ON public.document_analysis USING btree (document_id)`,
  },
  {
    schema:          'public',
    table:           'document_analysis',
    name:            'idx_document_analysis_user_id',
    is_unique:       false,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE INDEX idx_document_analysis_user_id ON public.document_analysis USING btree (user_id)`,
  },
]

export const D11_STUDY_VISUALS_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'study_visuals',
    name:            'study_visuals_pkey',
    is_unique:       true,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE UNIQUE INDEX study_visuals_pkey ON public.study_visuals USING btree (id)`,
  },
  {
    schema:          'public',
    table:           'study_visuals',
    name:            'study_visuals_document_id_user_id_key',
    is_unique:       true,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE UNIQUE INDEX study_visuals_document_id_user_id_key ON public.study_visuals USING btree (document_id, user_id)`,
  },
]

// generation_jobs_status is the pre-corrective baseline partial index (dropped by corrective migration).
export const D11_GENERATION_JOBS_BASELINE_INDEX_SPECS: IndexSpec[] = [
  {
    schema:          'public',
    table:           'generation_jobs',
    name:            'generation_jobs_pkey',
    is_unique:       true,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE UNIQUE INDEX generation_jobs_pkey ON public.generation_jobs USING btree (id)`,
  },
  {
    schema:          'public',
    table:           'generation_jobs',
    name:            'generation_jobs_status',
    is_unique:       false,
    is_partial:      true,
    predicate:       `(status = ANY (ARRAY['queued'::text, 'processing'::text]))`,
    pg_get_indexdef: `CREATE INDEX generation_jobs_status ON public.generation_jobs USING btree (status) WHERE (status = ANY (ARRAY['queued'::text, 'processing'::text]))`,
  },
  {
    schema:          'public',
    table:           'generation_jobs',
    name:            'generation_jobs_user_doc_type',
    is_unique:       false,
    is_partial:      false,
    predicate:       null,
    pg_get_indexdef: `CREATE INDEX generation_jobs_user_doc_type ON public.generation_jobs USING btree (user_id, document_id, job_type)`,
  },
]

// ── D11 Baseline: Table ACL tuples with grantor ───────────────────────────────
// All 4 tables have relacl = {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
// authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}.
// aclexplode() yields 4 grantees × 8 privileges = 32 tuples per table.
// grantor=postgres for all; is_grantable=false for all.
// MAINTAIN (arwdDxtm 'm') is included — information_schema omits it but aclexplode returns it.

const _d11TableAclTuples = (): DefaultAclTuple[] => {
  const grantees  = ['anon', 'authenticated', 'postgres', 'service_role']
  const privTypes = ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
  return grantees.flatMap(g => privTypes.map(pt => ({
    grantor: 'postgres', grantee: g, privilege_type: pt, is_grantable: false,
  })))
}

export const D11_TABLE_ACL_TUPLES: Record<string, DefaultAclTuple[]> = {
  'documents':         _d11TableAclTuples(),
  'document_analysis': _d11TableAclTuples(),
  'study_visuals':     _d11TableAclTuples(),
  'generation_jobs':   _d11TableAclTuples(),
}
