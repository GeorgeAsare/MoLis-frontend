-- =============================================================================
-- D11 PRE-MIGRATION BASELINE FIXTURE
-- Beta Foundation V1 — Disposable Validation Only
-- =============================================================================
--
-- PURPOSE
--   Reproduces the exact D11 catalogue pre-state required by beta_foundation_v1.sql.
--   Applied to a LOCAL disposable Supabase instance before running the migration
--   validation sequence.
--
-- SAFETY
--   NEVER run on production.
--   Local loopback only: http://127.0.0.1:54321 or http://localhost:54321.
--   The production safety guard (productionGuard.ts) must pass before this runs.
--
-- DATA
--   Synthetic data only. No production data is referenced, copied, or reproduced.
--   Test users use addresses under .invalid (e.g. user-a@test.invalid).
--
-- EVIDENCE BASIS
--   Evidence source: .ai/inspection/d11-catalogue-results-2026-07-31.csv and
--   .ai/inspection/d11-additional-authority-results-2026-07-31.csv
--   Verified by the Database Architect in beta-foundation-v1-d11-final-reconciliation.md.
--
-- EXECUTION ORDER
--   This fixture must be applied BEFORE beta_foundation_v1.sql.
--   Corrective objects from 20260729120001_generation_job_state_machine_schema.sql
--   must NOT be present after this fixture runs. The baseline assertions in
--   baselineAssertions.ts verify that those objects are absent.
--
-- COLUMN COUNT RECONCILIATION
--   documents: 10 columns (id, user_id, title, file_path, file_type, extracted_text,
--              created_at, subject_id, source_type, source_recording_id) — D11 S2_columns.
--   document_analysis: 22 columns (id, document_id, user_id, subject_area,
--              difficulty_level, estimated_study_minutes, sections, key_concepts,
--              definitions, formulas, examples, keywords, likely_exam_topics, model,
--              learning_objectives, misconceptions, relationships, prerequisites,
--              tables, concept_graph, learning_path, created_at) — D11 S2_columns.
--   generation_jobs: 13 columns — D11 S2_columns confirmed.
--   study_visuals: 6 columns — D11 S24_study_visuals_columns confirmed.
--
-- WHAT IS NOT CREATED HERE
--   - fn_enqueue_job, fn_claim_job, fn_heartbeat_job (corrective migration objects)
--   - generation_source_snapshots (corrective migration table)
--   - cancel_requested status on generation_jobs (corrective migration change)
--   - generation_jobs_active_exclusion (corrective migration index)
--   - document_analysis_document_user_unique constraint (corrective migration)
-- =============================================================================

-- ── 0. EXTENSIONS (must exist before table creation) ─────────────────────────
-- pgcrypto and uuid-ossp are confirmed present in D11 S17_extensions.
-- In a local Supabase instance these are available; create if not present.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ── 1. DEFAULT ACL (pre-migration state from D11 SA11_default_privileges) ────
-- FUNCTION default ACL: {postgres=X/postgres, anon=X/postgres,
--   authenticated=X/postgres, service_role=X/postgres}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- TABLE default ACL: {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--   authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- SEQUENCE default ACL: {postgres=rwU/postgres, anon=rwU/postgres,
--   authenticated=rwU/postgres, service_role=rwU/postgres}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon, authenticated, service_role;

-- ── 2. SUPPORTING STRUCTURES (minimal, needed for FK constraints) ─────────────

-- subjects: needed for documents.subject_id FK.
-- Not one of the four target tables; reproduced minimally.
CREATE TABLE IF NOT EXISTS public.subjects (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects OWNER TO postgres;
GRANT ALL ON public.subjects TO postgres, anon, authenticated, service_role;

-- recordings: needed for documents.source_recording_id FK and trigger.
-- Not one of the four target tables; reproduced minimally.
CREATE TABLE IF NOT EXISTS public.recordings (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id  uuid        REFERENCES public.subjects(id) ON DELETE SET NULL,
  title       text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings OWNER TO postgres;
GRANT ALL ON public.recordings TO postgres, anon, authenticated, service_role;

-- user_profiles: needed as target for set_user_profiles_updated_at,
-- sync_user_profiles_identity_trigger, and user_profiles_updated_at triggers.
-- Not one of the four target tables; reproduced minimally.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles OWNER TO postgres;
GRANT ALL ON public.user_profiles TO postgres, anon, authenticated, service_role;

-- agent_memories: needed as target for agent_memories_updated_at trigger.
-- Not one of the four target tables; reproduced minimally.
CREATE TABLE IF NOT EXISTS public.agent_memories (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memories OWNER TO postgres;
GRANT ALL ON public.agent_memories TO postgres, anon, authenticated, service_role;

-- ── 3. documents (10 columns, exact D11 S2_columns pre-state) ─────────────────
-- D11 confirmed: no updated_at, no extracted_text_updated_at, no revision column.
-- Three indexes: documents_pkey (implicit via PK), documents_source_recording_unique
-- (partial unique), documents_subject_id_idx.
CREATE TABLE public.documents (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id               uuid,
  title                 text        NOT NULL,
  file_path             text,
  file_type             text,
  extracted_text        text,
  created_at            timestamptz DEFAULT now(),
  subject_id            uuid,
  source_type           text,
  source_recording_id   uuid,
  CONSTRAINT documents_pkey
    PRIMARY KEY (id),
  CONSTRAINT documents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT documents_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL,
  CONSTRAINT documents_source_recording_id_fkey
    FOREIGN KEY (source_recording_id) REFERENCES public.recordings(id) ON DELETE SET NULL,
  CONSTRAINT documents_source_type_check
    CHECK (source_type IN ('upload', 'recording') OR source_type IS NULL)
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents OWNER TO postgres;
GRANT ALL ON public.documents TO postgres, anon, authenticated, service_role;

-- Exact 3 indexes on documents (PK index is implicit above):
CREATE UNIQUE INDEX documents_source_recording_unique
  ON public.documents(source_recording_id)
  WHERE source_recording_id IS NOT NULL;

CREATE INDEX documents_subject_id_idx
  ON public.documents(subject_id);

-- documents RLS policies (from D11 S11_rls_policies):
CREATE POLICY "Users can view own documents"
  ON public.documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own documents"
  ON public.documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own documents"
  ON public.documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON public.documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "documents_update_own"
  ON public.documents AS PERMISSIVE FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON public.documents AS PERMISSIVE FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON public.documents AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 4. document_analysis (22 columns, exact D11 S2_columns pre-state) ─────────
-- D11 confirmed: NO unique(document_id, user_id) — added by corrective migration.
-- D11 confirmed: no updated_at column.
-- Three indexes: document_analysis_pkey (implicit), idx_document_analysis_document_id,
-- idx_document_analysis_user_id.
--
-- COLUMN ORDER: exact D11 ordinal positions (1–22).
-- NOT NULL: id, document_id, user_id, subject_area, difficulty_level, sections,
--   key_concepts, definitions, formulas, examples, keywords, likely_exam_topics,
--   model, created_at, learning_objectives, misconceptions, relationships,
--   prerequisites, tables.
-- NULLABLE: estimated_study_minutes, concept_graph, learning_path.
-- keywords is text[] (udt_name _text), NOT jsonb.
-- created_at is at ordinal 15 (confirmed by D11 S2_columns).
CREATE TABLE public.document_analysis (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),         -- ordinal 1
  document_id             uuid        NOT NULL,                                   -- ordinal 2
  user_id                 uuid        NOT NULL,                                   -- ordinal 3
  subject_area            text        NOT NULL,                                   -- ordinal 4
  difficulty_level        text        NOT NULL,                                   -- ordinal 5
  estimated_study_minutes integer,                                                -- ordinal 6 (nullable)
  sections                jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 7
  key_concepts            jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 8
  definitions             jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 9
  formulas                jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 10
  examples                jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 11
  keywords                text[]      NOT NULL DEFAULT '{}'::text[],              -- ordinal 12
  likely_exam_topics      jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 13
  model                   text        NOT NULL,                                   -- ordinal 14
  created_at              timestamptz NOT NULL DEFAULT now(),                     -- ordinal 15
  learning_objectives     jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 16
  misconceptions          jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 17
  relationships           jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 18
  prerequisites           jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 19
  tables                  jsonb       NOT NULL DEFAULT '[]'::jsonb,               -- ordinal 20
  concept_graph           jsonb,                                                  -- ordinal 21 (nullable)
  learning_path           jsonb,                                                  -- ordinal 22 (nullable)
  CONSTRAINT document_analysis_pkey
    PRIMARY KEY (id),
  CONSTRAINT document_analysis_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE,
  CONSTRAINT document_analysis_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.document_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_analysis OWNER TO postgres;
GRANT ALL ON public.document_analysis TO postgres, anon, authenticated, service_role;

-- Exact 3 indexes on document_analysis (PK implicit above):
CREATE INDEX idx_document_analysis_document_id
  ON public.document_analysis(document_id);

CREATE INDEX idx_document_analysis_user_id
  ON public.document_analysis(user_id);

-- document_analysis RLS policy (from D11 S11_rls_policies):
CREATE POLICY "owner_all"
  ON public.document_analysis AS PERMISSIVE FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 5. generation_jobs — NOT CREATED HERE ────────────────────────────────────
-- generation_jobs is created by beta_foundation_v1.sql, not present before it runs.
-- D11 shows it with 13 columns because D11 was taken AFTER beta_foundation_v1.sql was applied.
-- The pre-migration baseline (this fixture) must NOT create it.
-- Baseline assertions verify it DOES NOT exist. Post-historical assertions (after
-- beta_foundation_v1.sql) verify it has exactly 13 columns and the correct status check.

-- ── 6. study_visuals (6 columns, exact D11 S24_study_visuals_columns pre-state) ─
-- D11 confirmed: UNIQUE(document_id, user_id), cascading FKs.
-- Two indexes: study_visuals_pkey (implicit), study_visuals_document_id_user_id_key (unique).
CREATE TABLE public.study_visuals (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  visuals     jsonb       NOT NULL DEFAULT '[]',
  model       text        NOT NULL DEFAULT 'gpt-4o-mini',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_visuals_pkey
    PRIMARY KEY (id),
  CONSTRAINT study_visuals_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE,
  CONSTRAINT study_visuals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT study_visuals_document_id_user_id_key
    UNIQUE (document_id, user_id)
);
ALTER TABLE public.study_visuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_visuals OWNER TO postgres;
GRANT ALL ON public.study_visuals TO postgres, anon, authenticated, service_role;

-- study_visuals RLS policy (from D11 S11_rls_policies):
CREATE POLICY "study_visuals_owner_all"
  ON public.study_visuals AS PERMISSIVE FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 7. TRIGGER FUNCTIONS (five public routines from D11 SA01/SA02) ────────────

-- validate_resource_subject_ownership: SECURITY INVOKER, search_path=public
-- Used by the validate_document_subject_ownership trigger on documents.
CREATE OR REPLACE FUNCTION public.validate_resource_subject_ownership()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.subject_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.subjects s
       WHERE s.id = NEW.subject_id
         AND s.user_id = NEW.user_id
     )
  THEN
    RAISE EXCEPTION 'Selected subject does not belong to the resource owner';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.validate_resource_subject_ownership() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_resource_subject_ownership()
  TO postgres, anon, authenticated, service_role;

-- set_subjects_updated_at: SECURITY INVOKER, no search_path config
CREATE OR REPLACE FUNCTION public.set_subjects_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.set_subjects_updated_at() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.set_subjects_updated_at()
  TO postgres, anon, authenticated, service_role;

-- set_user_profiles_updated_at: SECURITY INVOKER, no search_path config
CREATE OR REPLACE FUNCTION public.set_user_profiles_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.set_user_profiles_updated_at() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.set_user_profiles_updated_at()
  TO postgres, anon, authenticated, service_role;

-- sync_user_profiles_identity: SECURITY INVOKER, no search_path config
CREATE OR REPLACE FUNCTION public.sync_user_profiles_identity()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    NEW.id := NEW.user_id;
  END IF;
  IF NEW.user_id IS NULL AND NEW.id IS NOT NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.sync_user_profiles_identity() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_user_profiles_identity()
  TO postgres, anon, authenticated, service_role;

-- update_updated_at: SECURITY INVOKER, no search_path config
CREATE OR REPLACE FUNCTION public.update_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
ALTER FUNCTION public.update_updated_at() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.update_updated_at()
  TO postgres, anon, authenticated, service_role;

-- ── 8. TRIGGERS (from D11 SA06 routine dependants) ──────────────────────────

-- D11 S9_triggers confirmed: BEFORE INSERT OR UPDATE, FOR EACH ROW on documents.
CREATE TRIGGER validate_document_subject_ownership
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_resource_subject_ownership();

-- validate_recording_subject_ownership on recordings (SA06 confirmed).
CREATE TRIGGER validate_recording_subject_ownership
  BEFORE INSERT OR UPDATE ON public.recordings
  FOR EACH ROW EXECUTE FUNCTION public.validate_resource_subject_ownership();

-- set_subjects_updated_at on subjects (SA06 confirmed).
CREATE TRIGGER set_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_subjects_updated_at();

-- set_user_profiles_updated_at on user_profiles (SA06 confirmed).
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_user_profiles_updated_at();

-- sync_user_profiles_identity_trigger on user_profiles (SA06 confirmed).
CREATE TRIGGER sync_user_profiles_identity_trigger
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profiles_identity();

-- user_profiles_updated_at on user_profiles — uses update_updated_at (SA06 confirmed).
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- agent_memories_updated_at on agent_memories — uses update_updated_at (SA06 confirmed).
CREATE TRIGGER agent_memories_updated_at
  BEFORE UPDATE ON public.agent_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 9. STORAGE BUCKET (local disposable only) ─────────────────────────────────
-- D11 S18_storage_bucket: study-visuals, public=true, no size limit, no MIME allowlist.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection)
VALUES ('study-visuals', 'study-visuals', true, null, null, false)
ON CONFLICT (id) DO NOTHING;

-- ── 10. STORAGE POLICIES (from D11 S19_storage_object_policies) ──────────────
-- Four study-visuals policies (exact policy names from D11):
CREATE POLICY "For full customization 137qt67_0"
  ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (bucket_id = 'study-visuals'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "For full customization 137qt67_1"
  ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'study-visuals'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "For full customization 137qt67_2"
  ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (bucket_id = 'study-visuals'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "For full customization 137qt67_3"
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    (bucket_id = 'study-visuals'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

-- Three study-documents policies (must NOT be modified by corrective migration):
CREATE POLICY "Users can read own files"
  ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (bucket_id = 'study-documents'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "Users can upload to own folder"
  ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'study-documents'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    (bucket_id = 'study-documents'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

-- Four recordings policies (must NOT be modified by corrective migration):
CREATE POLICY "recordings_read"
  ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (
    (bucket_id = 'recordings'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "recordings_upload"
  ON storage.objects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (bucket_id = 'recordings'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "recordings_update"
  ON storage.objects AS PERMISSIVE FOR UPDATE TO public
  USING (
    (bucket_id = 'recordings'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  )
  WITH CHECK (
    (bucket_id = 'recordings'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );

CREATE POLICY "recordings_delete"
  ON storage.objects AS PERMISSIVE FOR DELETE TO public
  USING (
    (bucket_id = 'recordings'::text)
    AND ((auth.uid())::text = (storage.foldername(name))[1])
  );
