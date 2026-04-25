-- ===========================================
-- Migrations de segurança / atomicidade
-- Execute no Supabase SQL Editor
-- ===========================================

-- ─────────────────────────────────────────────
-- Codex #3: Evitar duplicatas em attempt_answers
-- ─────────────────────────────────────────────
-- Garante que cada questão seja registrada apenas
-- uma vez por tentativa (upsert no cliente usa isso).
-- Um índice único tem o mesmo efeito de uma UNIQUE constraint
-- e aceita IF NOT EXISTS nativamente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attempt_questao
  ON attempt_answers (attempt_id, questao_id);


-- ─────────────────────────────────────────────
-- Codex #2: RPC atômica para insert de prova + questões
-- ─────────────────────────────────────────────
-- SECURITY DEFINER: executa com os privilégios do
-- owner da função (service role via API route).
-- A autenticação/autorização é feita na rota Next.js
-- antes de chamar esta função via service role key.
CREATE OR REPLACE FUNCTION insert_prova_com_questoes(
  p_materia   text,
  p_periodo   int,
  p_ano       int,
  p_semestre  int,
  p_questoes  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prova_id uuid;
BEGIN
  -- Inserir a prova e obter o ID gerado
  INSERT INTO provas (materia, periodo, ano, semestre)
  VALUES (p_materia, p_periodo, p_ano, p_semestre)
  RETURNING id INTO v_prova_id;

  -- Inserir todas as questões em um único statement (atômico)
  INSERT INTO questoes (
    prova_id, numero, tipo, enunciado,
    alternativa_a, alternativa_b, alternativa_c, alternativa_d, alternativa_e,
    gabarito, comentario
  )
  SELECT
    v_prova_id,
    (q->>'numero')::int,
    COALESCE(q->>'tipo', 'multipla_escolha'),
    q->>'enunciado',
    COALESCE(q->>'alternativa_a', ''),
    COALESCE(q->>'alternativa_b', ''),
    COALESCE(q->>'alternativa_c', ''),
    COALESCE(q->>'alternativa_d', ''),
    COALESCE(q->>'alternativa_e', ''),
    q->>'gabarito',
    COALESCE(q->>'comentario', '')
  FROM jsonb_array_elements(p_questoes) AS q;

  RETURN v_prova_id;

EXCEPTION WHEN OTHERS THEN
  -- Qualquer falha faz rollback automático da transação inteira
  RAISE;
END;
$$;

-- Permissão: a função só é chamada pelo service role via API route
-- (não conceder EXECUTE para anon/authenticated)
REVOKE EXECUTE ON FUNCTION insert_prova_com_questoes FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION insert_prova_com_questoes FROM authenticated;
REVOKE EXECUTE ON FUNCTION insert_prova_com_questoes FROM anon;
-- O service_role (usado na rota Next.js) tem EXECUTE por padrão como superusuário


-- ─────────────────────────────────────────────
-- FSRS: Tabela de revisão espaçada por usuário
-- ─────────────────────────────────────────────
-- Um "card" por (user_id, materia, area).
-- Armazena o estado completo do algoritmo FSRS (ts-fsrs).
CREATE TABLE IF NOT EXISTS user_reviews (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  materia         text        NOT NULL,           -- Ex: 'SOI'
  area            text        NOT NULL DEFAULT '', -- Ex: 'Sistema Nervoso'
  -- Estado FSRS (mapeado de ts-fsrs Card)
  stability       float8      NOT NULL DEFAULT 0,
  difficulty      float8      NOT NULL DEFAULT 0,
  elapsed_days    int         NOT NULL DEFAULT 0,
  scheduled_days  int         NOT NULL DEFAULT 0,
  reps            int         NOT NULL DEFAULT 0,  -- número de revisões
  lapses          int         NOT NULL DEFAULT 0,  -- número de erros
  state           smallint    NOT NULL DEFAULT 0,  -- 0=New,1=Learning,2=Review,3=Relearning
  last_review     timestamptz,
  next_review     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_review UNIQUE (user_id, materia, area)
);

CREATE INDEX IF NOT EXISTS idx_ur_user_due
  ON user_reviews (user_id, next_review);

-- RLS
ALTER TABLE user_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ur_select_own" ON user_reviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ur_insert_own" ON user_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ur_update_own" ON user_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ur_delete_own" ON user_reviews
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- APGs: Aprendizado Baseado em Problemas
-- ─────────────────────────────────────────────
-- ANTES de executar: crie o bucket no Supabase Dashboard:
--   Storage > New bucket > Name: "apgs" > Public: ON
CREATE TABLE IF NOT EXISTS apgs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  materia    text        NOT NULL,            -- Ex: 'SOI'
  semestre   int         NOT NULL DEFAULT 1,  -- Ex: 2  →  SOI 2
  numero     int         NOT NULL,            -- Ex: 6
  titulo     text        NOT NULL,            -- Ex: 'Penso, logo caminho'
  url_pdf    text        NOT NULL,            -- URL pública do PDF no Storage
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_apg UNIQUE (materia, semestre, numero)
);

CREATE INDEX IF NOT EXISTS idx_apgs_materia ON apgs (materia, semestre, numero);

-- RLS: leitura pública, escrita só via service role (rota /api/upload-apg)
ALTER TABLE apgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apgs_select" ON apgs FOR SELECT USING (true);
