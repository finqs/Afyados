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
