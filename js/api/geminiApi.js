import { supabase } from '../supabase.js'
import { fileToBase64 } from '../utils/utils.js'
import { normalizeQuestoes } from '../utils/parsers.js'

const MAX_PDF_SIZE = 10 * 1024 * 1024 // 10MB

export async function extrairQuestoesDoPdf(file) {
  if (file.size > MAX_PDF_SIZE) {
    throw new Error('O PDF deve ter no maximo 10MB.')
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Voce precisa estar logado para extrair questoes.')
  }

  const base64 = await fileToBase64(file)

  const response = await fetch('/api/extrair', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ pdfBase64: base64 })
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Erro ao processar o PDF.')
  }

  if (!data.questoes || !data.questoes.length) {
    throw new Error('Nenhuma questao foi extraida.')
  }

  return normalizeQuestoes(data.questoes)
}
