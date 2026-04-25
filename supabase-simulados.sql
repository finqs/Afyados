-- ===========================================
-- Banco de questões para Simulados
-- Execute no Supabase SQL Editor
-- ===========================================

CREATE TABLE IF NOT EXISTS simulados_questoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  materia       text        NOT NULL,           -- Ex: 'SOI', 'HAM', 'IESC'
  area          text        NOT NULL DEFAULT '', -- Grande área: 'Sistema Cardiovascular'
  subarea       text        NOT NULL DEFAULT '', -- Subárea: 'Irrigação Cardíaca'
  dificuldade   text        NOT NULL DEFAULT 'medio', -- 'facil' | 'medio' | 'dificil'
  numero        int,
  tipo          text        NOT NULL DEFAULT 'multipla_escolha',
  enunciado     text        NOT NULL,
  alternativa_a text        NOT NULL DEFAULT '',
  alternativa_b text        NOT NULL DEFAULT '',
  alternativa_c text        NOT NULL DEFAULT '',
  alternativa_d text        NOT NULL DEFAULT '',
  alternativa_e text        NOT NULL DEFAULT '',
  gabarito      text        NOT NULL,
  comentario    text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS idx_sq_materia       ON simulados_questoes (materia);
CREATE INDEX IF NOT EXISTS idx_sq_area          ON simulados_questoes (materia, area);
CREATE INDEX IF NOT EXISTS idx_sq_subarea       ON simulados_questoes (materia, area, subarea);
CREATE INDEX IF NOT EXISTS idx_sq_dificuldade   ON simulados_questoes (materia, dificuldade);

-- Se a tabela já existir e não tiver as colunas area/subarea, rode:
-- ALTER TABLE simulados_questoes ADD COLUMN IF NOT EXISTS area    text NOT NULL DEFAULT '';
-- ALTER TABLE simulados_questoes ADD COLUMN IF NOT EXISTS subarea text NOT NULL DEFAULT '';

-- ===========================================
-- RLS
-- ===========================================
ALTER TABLE simulados_questoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sq_select_public" ON simulados_questoes
  FOR SELECT USING (true);

CREATE POLICY "sq_insert_admin" ON simulados_questoes
  FOR INSERT WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

CREATE POLICY "sq_update_admin" ON simulados_questoes
  FOR UPDATE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

CREATE POLICY "sq_delete_admin" ON simulados_questoes
  FOR DELETE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );
