import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const MAX_PDF_BASE64_LENGTH = 14_000_000 // ~10MB PDF

// ── Rate limiting (in-memory; resets per serverless instance) ──
// Codex #6: limita abuso de créditos Anthropic por usuário
const RATE_LIMIT_MAX    = 10               // requisições por janela
const RATE_LIMIT_WINDOW = 60 * 60 * 1000  // 1 hora em ms
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true, retryAfterSec: 0 }
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfterSec }
  }
  entry.count++
  return { allowed: true, retryAfterSec: 0 }
}

export async function POST(req: NextRequest) {
  // 1. Verificar Bearer token
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')

  // 2. Validar env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Variáveis NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.')
    return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 })
  }
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY não configurada.')
    return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 })
  }

  // 3. Validar usuário via Supabase service role
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 })
  }

  // 4. Verificar role admin
  if (user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
  }

  // 4b. Rate limiting por usuário (Codex #6)
  const rl = checkRateLimit(user.id)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Muitas requisições. Tente novamente em ${rl.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  // 5. Ler body
  let body: { pdfBase64?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const { pdfBase64 } = body
  if (!pdfBase64) {
    return NextResponse.json({ error: 'PDF não fornecido.' }, { status: 400 })
  }

  if (pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
    return NextResponse.json({ error: 'PDF muito grande. Tamanho máximo: 10MB.' }, { status: 413 })
  }

  // 6. Chamar Anthropic (mesmo prompt do api/extrair.js original)
  try {
    const client = new Anthropic({ apiKey })

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
    "comentario": "explicacao do gabarito se disponivel",
    "tem_imagem": false,
    "imagem_descricao": ""
  }
]

Regras gerais:
- Para questoes de multipla escolha: tipo = "multipla_escolha", gabarito = letra (A, B, C, D ou E)
- Para questoes dissertativas ou abertas: tipo = "aberta", gabarito = texto completo da resposta esperada, alternativas = strings vazias ""
- Extraia TODAS as questoes sem excecao, incluindo as abertas
- O gabarito de multipla escolha deve ser apenas a letra
- Se nao houver comentario, use ""

Regras para imagens:
- Se a questao contiver uma imagem (radiografia, ECG, tomografia, ressonancia, histologia, fotografia clinica, grafico, tabela ou qualquer elemento visual), defina tem_imagem = true
- Em imagem_descricao forneca uma descricao clinica detalhada da imagem, com informacoes suficientes para responder a questao sem ver a imagem original. Exemplos:
  * ECG: ritmo, frequencia, intervalo PR, QRS, eixo, alteracoes de ST/T, diagnostico sugerido
  * Radiografia: projecao, orgaos em foco, achados patologicos, localizacao, diagnostico diferencial
  * Histologia: tecido, coloracao, celulas em destaque, achados microscopicos
  * Imagem clinica: local anatomico, lesao descrita, caracteristicas morfologicas
  * Grafico/tabela: tipo, eixos, valores relevantes, tendencia ou resultado principal
- Se nao houver imagem, tem_imagem = false e imagem_descricao = ""
- Retorne somente o array JSON valido`
            }
          ]
        }
      ]
    })

    const texto = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonLimpo = texto.replace(/```json|```/g, '').trim()

    // Limite de tamanho do retorno para evitar payloads abusivos
    if (jsonLimpo.length > 2_000_000) {
      console.error('Resposta do Claude excedeu limite de tamanho.')
      return NextResponse.json({ error: 'Resposta muito grande.' }, { status: 502 })
    }

    let questoes: unknown
    try {
      questoes = JSON.parse(jsonLimpo)
    } catch {
      return NextResponse.json({ error: 'Resposta da IA inválida.' }, { status: 502 })
    }

    // Valida estrutura básica: array não-vazio, tamanho razoável
    if (!Array.isArray(questoes)) {
      return NextResponse.json({ error: 'Resposta da IA não é um array.' }, { status: 502 })
    }
    if (questoes.length === 0 || questoes.length > 500) {
      return NextResponse.json({ error: 'Quantidade de questões inválida (1-500).' }, { status: 502 })
    }

    return NextResponse.json({ questoes })
  } catch (error) {
    console.error('Erro na API:', error)
    return NextResponse.json({ error: 'Erro ao processar o PDF.' }, { status: 500 })
  }
}
