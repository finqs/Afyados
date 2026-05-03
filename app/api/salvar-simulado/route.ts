import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Codex #1: Escrita de simulados via rota server-side
// Codex #7: Validação server-side dos campos

const VALID_GABARITO   = new Set(['A', 'B', 'C', 'D', 'E'])
const VALID_DIFICULDADE = new Set(['facil', 'medio', 'dificil'])

interface SimQuestaoInput {
  numero: number
  tipo: string
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e: string
  gabarito: string
  comentario: string
  tem_imagem: boolean
  imagem_descricao: string
  apg_numero: number | null
}

function validateQuestao(q: unknown, idx: number): SimQuestaoInput {
  if (typeof q !== 'object' || q === null) {
    throw new Error(`Questão ${idx + 1}: não é um objeto.`)
  }
  const raw = q as Record<string, unknown>
  const enunciado = String(raw.enunciado ?? '').trim()
  const gabarito  = String(raw.gabarito  ?? '').trim()
  const tipo      = String(raw.tipo      ?? 'multipla_escolha').trim()

  if (!enunciado) throw new Error(`Questão ${idx + 1}: "enunciado" ausente.`)
  if (!gabarito)  throw new Error(`Questão ${idx + 1}: "gabarito" ausente.`)
  if (tipo === 'multipla_escolha' && !VALID_GABARITO.has(gabarito.toUpperCase())) {
    throw new Error(`Questão ${idx + 1}: gabarito "${gabarito}" inválido.`)
  }
  const numeroRaw = raw.numero
  const numero = Number.isInteger(numeroRaw) && (numeroRaw as number) > 0
    ? (numeroRaw as number) : idx + 1

  return {
    numero,
    tipo,
    enunciado,
    alternativa_a: String(raw.alternativa_a ?? ''),
    alternativa_b: String(raw.alternativa_b ?? ''),
    alternativa_c: String(raw.alternativa_c ?? ''),
    alternativa_d: String(raw.alternativa_d ?? ''),
    alternativa_e: raw.alternativa_e ? String(raw.alternativa_e) : '',
    gabarito: tipo === 'multipla_escolha' ? gabarito.toUpperCase() : gabarito,
    comentario: String(raw.comentario ?? ''),
    tem_imagem: Boolean(raw.tem_imagem ?? false),
    imagem_descricao: String(raw.imagem_descricao ?? ''),
    apg_numero: raw.apg_numero != null && raw.apg_numero !== '' ? Number(raw.apg_numero) : null,
  }
}

export async function POST(req: NextRequest) {
  // 1. Autenticação
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')

  // 2. Env vars
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseService) {
    return NextResponse.json({ error: 'Erro de configuração do servidor.' }, { status: 500 })
  }

  // 3. Validar token e role admin
  const sb = createClient(supabaseUrl, supabaseService)
  const { data: { user }, error: authError } = await sb.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
  }

  // 4. Ler e validar body
  let body: { materia?: unknown; area?: unknown; subarea?: unknown; dificuldade?: unknown; questoes?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const materia    = String(body.materia    ?? '').trim()
  const area       = String(body.area       ?? '').trim()
  const subarea    = String(body.subarea    ?? '').trim()
  const dificuldade = String(body.dificuldade ?? 'medio').trim()

  if (!materia)    return NextResponse.json({ error: 'Matéria ausente.'    }, { status: 422 })
  if (!area)       return NextResponse.json({ error: 'Grande Área ausente.' }, { status: 422 })
  if (!subarea)    return NextResponse.json({ error: 'Subárea ausente.'     }, { status: 422 })
  if (!VALID_DIFICULDADE.has(dificuldade)) {
    return NextResponse.json({ error: 'Dificuldade inválida (facil|medio|dificil).' }, { status: 422 })
  }

  if (!Array.isArray(body.questoes) || body.questoes.length === 0) {
    return NextResponse.json({ error: 'Nenhuma questão fornecida.' }, { status: 422 })
  }
  if (body.questoes.length > 500) {
    return NextResponse.json({ error: 'Máximo de 500 questões por lote.' }, { status: 422 })
  }

  let questoes: SimQuestaoInput[]
  try {
    questoes = (body.questoes as unknown[]).map(validateQuestao)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }

  // 5. Inserir questões de simulado
  const rows = questoes.map(q => ({
    materia,
    area,
    subarea,
    dificuldade,
    numero:        q.numero,
    tipo:          q.tipo,
    enunciado:     q.enunciado,
    alternativa_a: q.alternativa_a,
    alternativa_b: q.alternativa_b,
    alternativa_c: q.alternativa_c,
    alternativa_d: q.alternativa_d,
    alternativa_e: q.alternativa_e,
    gabarito:          q.gabarito,
    comentario:        q.comentario,
    tem_imagem:        q.tem_imagem,
    imagem_descricao:  q.imagem_descricao,
    apg_numero:        q.apg_numero,
  }))

  const { error: insertErr } = await sb.from('simulados_questoes').insert(rows)
  if (insertErr) {
    console.error('Erro ao inserir questões de simulado:', insertErr.message)
    return NextResponse.json({ error: 'Erro ao salvar questões.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: questoes.length })
}
