-- ===========================================
-- Banco de questões para Simulados
-- Execute no Supabase SQL Editor
-- ===========================================

CREATE TABLE IF NOT EXISTS simulados_questoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  materia     text NOT NULL,                        -- Ex: 'SOI', 'HAM', 'IESC'
  dificuldade text NOT NULL DEFAULT 'medio',        -- 'facil' | 'medio' | 'dificil'
  numero      int,
  tipo        text NOT NULL DEFAULT 'multipla_escolha',
  enunciado   text NOT NULL,
  alternativa_a text NOT NULL DEFAULT '',
  alternativa_b text NOT NULL DEFAULT '',
  alternativa_c text NOT NULL DEFAULT '',
  alternativa_d text NOT NULL DEFAULT '',
  alternativa_e text NOT NULL DEFAULT '',
  gabarito    text NOT NULL,
  comentario  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS simulados_questoes_materia_idx
  ON simulados_questoes (materia);

CREATE INDEX IF NOT EXISTS simulados_questoes_dificuldade_idx
  ON simulados_questoes (materia, dificuldade);

-- ===========================================
-- RLS
-- ===========================================
ALTER TABLE simulados_questoes ENABLE ROW LEVEL SECURITY;

-- Todos podem ler questões (inclusive anônimos)
CREATE POLICY "sq_select_public" ON simulados_questoes
  FOR SELECT USING (true);

-- Apenas admins podem inserir
CREATE POLICY "sq_insert_admin" ON simulados_questoes
  FOR INSERT WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Apenas admins podem atualizar
CREATE POLICY "sq_update_admin" ON simulados_questoes
  FOR UPDATE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Apenas admins podem deletar
CREATE POLICY "sq_delete_admin" ON simulados_questoes
  FOR DELETE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );
