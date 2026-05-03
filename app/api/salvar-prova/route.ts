import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Codex #1: Escrita no banco via rota server-side (não mais cliente direto)
// Codex #2: Insert atômico usando RPC insert_prova_com_questoes
// Codex #7: Validação de campos server-side

const VALID_GABARITO = new Set(['A', 'B', 'C', 'D', 'E'])

interface QuestaoInput {
  numero: number
  tipo?: string
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e?: string
  gabarito: string
  comentario?: string
  tem_imagem: boolean
  imagem_descricao: string
  area: string
  apg_numero: number | null
}

function validateQuestao(q: unknown, idx: number): QuestaoInput {
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
    area: String(raw.area ?? ''),
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
  let body: { materia?: unknown; periodoNum?: unknown; ano?: unknown; semestre?: unknown; questoes?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const materia    = String(body.materia ?? '').trim()
  const periodoNum = Number(body.periodoNum)
  const ano        = Number(body.ano)
  const semestre   = Number(body.semestre)

  if (!materia)                                   return NextResponse.json({ error: 'Matéria ausente.'           }, { status: 422 })
  if (!Number.isInteger(periodoNum) || periodoNum < 1) return NextResponse.json({ error: 'Período inválido.'         }, { status: 422 })
  if (!Number.isInteger(ano)   || ano < 2000 || ano > 2100) return NextResponse.json({ error: 'Ano inválido.'          }, { status: 422 })
  if (!Number.isInteger(semestre) || ![1, 2].includes(semestre)) return NextResponse.json({ error: 'Semestre inválido.' }, { status: 422 })

  if (!Array.isArray(body.questoes) || body.questoes.length === 0) {
    return NextResponse.json({ error: 'Nenhuma questão fornecida.' }, { status: 422 })
  }
  if (body.questoes.length > 500) {
    return NextResponse.json({ error: 'Máximo de 500 questões por prova.' }, { status: 422 })
  }

  let questoes: QuestaoInput[]
  try {
    questoes = (body.questoes as unknown[]).map(validateQuestao)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }

  // 5. Insert atômico via RPC (Codex #2)
  //    Tenta RPC primeiro; fallback para insert manual se a função não existir
  const { data: rpcData, error: rpcError } = await sb.rpc('insert_prova_com_questoes', {
    p_materia:   materia,
    p_periodo:   periodoNum,
    p_ano:       ano,
    p_semestre:  semestre,
    p_questoes:  JSON.stringify(questoes)
  })

  if (!rpcError) {
    return NextResponse.json({ ok: true, prova_id: rpcData })
  }

  // Fallback: se a RPC ainda não foi criada no Supabase, insert manual com rollback
  if (rpcError.code !== 'PGRST202') {
    // Código diferente de "function not found" = erro real
    console.error('RPC insert_prova_com_questoes falhou:', rpcError.message)
    return NextResponse.json({ error: 'Erro ao salvar prova.' }, { status: 500 })
  }

  // Fallback manual (sem transação verdadeira, mas com rollback via delete)
  const { data: prova, error: provaErr } = await sb
    .from('provas')
    .insert({ materia, periodo: periodoNum, ano, semestre })
    .select()
    .single()
  if (provaErr || !prova) {
    console.error('Erro ao criar prova:', provaErr?.message)
    return NextResponse.json({ error: 'Erro ao criar prova.' }, { status: 500 })
  }

  const questoesRows = questoes.map(q => ({
    prova_id:      prova.id,
    numero:        q.numero,
    tipo:          q.tipo ?? 'multipla_escolha',
    enunciado:     q.enunciado,
    alternativa_a: q.alternativa_a,
    alternativa_b: q.alternativa_b,
    alternativa_c: q.alternativa_c,
    alternativa_d: q.alternativa_d,
    alternativa_e: q.alternativa_e ?? '',
    gabarito:          q.gabarito,
    comentario:        q.comentario ?? '',
    tem_imagem:        q.tem_imagem,
    imagem_descricao:  q.imagem_descricao,
    area:              q.area,
    apg_numero:        q.apg_numero,
  }))

  const { error: qErr } = await sb.from('questoes').insert(questoesRows)
  if (qErr) {
    // Rollback manual
    await sb.from('provas').delete().eq('id', prova.id)
    console.error('Erro ao inserir questões (rollback feito):', qErr.message)
    return NextResponse.json({ error: 'Erro ao salvar questões.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, prova_id: prova.id })
}
