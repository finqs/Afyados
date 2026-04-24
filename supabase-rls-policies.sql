-- ===========================================
-- RLS Policies para MedFlow.AI
-- Execute no Supabase SQL Editor
-- ===========================================

-- Primeiro, defina o role 'admin' para o usuario administrador:
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
-- WHERE email = 'filipenqs@hotmail.com';

-- ===========================================
-- Tabela: provas
-- ===========================================
ALTER TABLE provas ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler provas
CREATE POLICY "provas_select_public" ON provas
  FOR SELECT USING (true);

-- Apenas admins podem inserir
CREATE POLICY "provas_insert_admin" ON provas
  FOR INSERT WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Apenas admins podem atualizar
CREATE POLICY "provas_update_admin" ON provas
  FOR UPDATE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Apenas admins podem deletar
CREATE POLICY "provas_delete_admin" ON provas
  FOR DELETE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- ===========================================
-- Tabela: questoes
-- ===========================================
ALTER TABLE questoes ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler questoes
CREATE POLICY "questoes_select_public" ON questoes
  FOR SELECT USING (true);

-- Apenas admins podem inserir
CREATE POLICY "questoes_insert_admin" ON questoes
  FOR INSERT WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Apenas admins podem atualizar
CREATE POLICY "questoes_update_admin" ON questoes
  FOR UPDATE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Apenas admins podem deletar
CREATE POLICY "questoes_delete_admin" ON questoes
  FOR DELETE USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- ===========================================
-- Tabela: exam_attempts
-- ===========================================
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

-- Usuarios podem ler apenas suas proprias tentativas
CREATE POLICY "attempts_select_own" ON exam_attempts
  FOR SELECT USING (auth.uid() = user_id);

-- Usuarios podem criar tentativas para si mesmos
CREATE POLICY "attempts_insert_own" ON exam_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Usuarios podem atualizar apenas suas tentativas
CREATE POLICY "attempts_update_own" ON exam_attempts
  FOR UPDATE USING (auth.uid() = user_id);

-- ===========================================
-- Tabela: attempt_answers
-- ===========================================
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;

-- Usuarios podem ler respostas das suas tentativas
CREATE POLICY "answers_select_own" ON attempt_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_attempts.id = attempt_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()
    )
  );

-- Usuarios podem inserir respostas nas suas tentativas
CREATE POLICY "answers_insert_own" ON attempt_answers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_attempts.id = attempt_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()
    )
  );

-- Usuarios podem atualizar respostas das suas tentativas
CREATE POLICY "answers_update_own" ON attempt_answers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_attempts.id = attempt_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()
    )
  );

-- Usuarios podem deletar respostas das suas tentativas
CREATE POLICY "answers_delete_own" ON attempt_answers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM exam_attempts
      WHERE exam_attempts.id = attempt_answers.attempt_id
      AND exam_attempts.user_id = auth.uid()
    )
  );
