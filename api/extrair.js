const Anthropic = require('@anthropic-ai/sdk')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API não configurada.' })
  }

  const client = new Anthropic({ apiKey })

  try {
    const { pdfBase64 } = req.body

    if (!pdfBase64) {
      return res.status(400).json({ error: 'PDF não fornecido.' })
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: `Extraia TODAS as questões de múltipla escolha desta prova de medicina e retorne APENAS um JSON válido, sem texto antes ou depois, sem markdown, sem backticks.

O formato deve ser exatamente este:
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
- O gabarito deve ser apenas a letra: A, B, C, D ou E
- Se não houver comentário, deixe o campo vazio ""
- Retorne somente o array JSON válido`
            }
          ]
        }
      ]
    })

    const texto = message.content[0].text.trim()
    const jsonLimpo = texto.replace(/```json|```/g, '').trim()
    const questoes = JSON.parse(jsonLimpo)

    return res.status(200).json({ questoes })

  } catch (error) {
    console.error('Erro na API:', error)
    return res.status(500).json({ error: error.message || 'Erro ao processar o PDF.' })
  }
}
