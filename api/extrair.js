const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const MAX_PDF_BASE64_LENGTH = 14_000_000 // ~10MB PDF

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido.' })
  }

  // --- Auth: verify Supabase session ---
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nao autorizado.' })
  }

  const token = authHeader.replace('Bearer ', '')

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Variaveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configuradas.')
    return res.status(500).json({ error: 'Erro de configuracao do servidor.' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Token invalido ou expirado.' })
  }

  // Check admin role
  const role = user.app_metadata?.role
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' })
  }

  // --- API Key ---
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY nao configurada.')
    return res.status(500).json({ error: 'Erro de configuracao do servidor.' })
  }

  const client = new Anthropic({ apiKey })

  try {
    const { pdfBase64 } = req.body

    if (!pdfBase64) {
      return res.status(400).json({ error: 'PDF nao fornecido.' })
    }

    // Size limit
    if (pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
      return res.status(400).json({ error: 'PDF muito grande. Tamanho maximo: 10MB.' })
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
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
              text: `Extraia TODAS as questoes desta prova de medicina e retorne APENAS um JSON valido, sem texto antes ou depois, sem markdown, sem backticks.

O formato deve ser exatamente este:
[
  {
    "numero": 1,
    "tipo": "multipla_escolha",
    "enunciado": "texto completo do enunciado",
    "alternativa_a": "texto da alternativa A",
    "alternativa_b": "texto da alternativa B",
    "alternativa_c": "texto da alternativa C",
    "alternativa_d": "texto da alternativa D",
    "alternativa_e": "texto da alternativa E se existir, senao string vazia",
    "gabarito": "A",
    "comentario": "explicacao do gabarito se disponivel"
  }
]

Regras:
- Para questoes de multipla escolha: tipo = "multipla_escolha", gabarito = letra (A, B, C, D ou E)
- Para questoes dissertativas ou abertas: tipo = "aberta", gabarito = texto completo da resposta esperada, alternativas = strings vazias ""
- Extraia TODAS as questoes sem excecao, incluindo as abertas
- O gabarito de multipla escolha deve ser apenas a letra
- Se nao houver comentario, use ""
- Retorne somente o array JSON valido`
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
    return res.status(500).json({ error: 'Erro ao processar o PDF.' })
  }
}
