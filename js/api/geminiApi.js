import { fileToBase64 } from '../utils/utils.js'
import { normalizeQuestoes } from '../utils/parsers.js'

export async function extrairQuestoesDoPdf(file) {
  const base64 = await fileToBase64(file)

  const response = await fetch('/api/extrair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64: base64 })
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Erro ao processar o PDF.')
  }

  if (!data.questoes || !data.questoes.length) {
    throw new Error('Nenhuma questão foi extraída.')
  }

  return normalizeQuestoes(data.questoes)
}
