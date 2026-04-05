import { fileToBase64 } from '../utils/utils.js'
import { extractFirstJsonArray, normalizeQuestoes } from '../utils/parsers.js'

export async function extrairQuestoesDoPdf(file, apiKey) {
  const base64 = await fileToBase64(file)

  const prompt = `
Extraia TODAS as questões de múltipla escolha desta prova de medicina e retorne APENAS um JSON válido.
Não escreva texto antes ou depois.
Não use markdown.
Não use backticks.

Formato esperado:
[
  {
    "numero": 1,
    "enunciado": "texto completo do enunciado",
    "alternativa_a": "texto da alternativa A",
    "alternativa_b": "texto da alternativa B",
    "alternativa_c": "texto da alternativa C",
    "alternativa_d": "texto da alternativa D",
    "alternativa_e": "texto da alternativa E se existir, senão string vazia",
    "gabarito": "A",
    "comentario": "explicação do gabarito se disponível"
  }
]

Regras:
- Inclua apenas questões de múltipla escolha
- Ignore questões discursivas
- Extraia todas as questões sem exceção
- Inclua o enunciado completo
- Preserve o texto das alternativas
- Se a questão não tiver alternativa E, use ""
- O gabarito deve ser somente uma letra: A, B, C, D ou E
- Se não houver comentário, use ""
- Retorne somente um array JSON válido
`.trim()

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64
                }
              },
              { text: prompt }
            ]
          }
        ]
      })
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erro na API do Gemini.')
  }

  const texto =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('\n')
      .trim() || ''

  if (!texto) {
    throw new Error('A IA não retornou texto utilizável.')
  }

  const jsonLimpo = extractFirstJsonArray(texto)
  const parsed = JSON.parse(jsonLimpo)
  return normalizeQuestoes(parsed)
}
