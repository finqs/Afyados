import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svcKey) return NextResponse.json({ error: 'Configuração ausente.' }, { status: 500 })

  const sb = createClient(url, svcKey)
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  if (user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await req.json() as Record<string, unknown>
  const allowed = ['enunciado','alternativa_a','alternativa_b','alternativa_c','alternativa_d','alternativa_e','gabarito','comentario','area','subarea','apg_numero','tem_imagem','imagem_descricao']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (!update.enunciado) return NextResponse.json({ error: 'Enunciado obrigatório.' }, { status: 400 })

  const { error } = await sb.from('simulados_questoes').update(update).eq('id', params.id)
  if (error) {
    console.error('simulados_questoes update error:', error.message)
    return NextResponse.json({ error: 'Erro ao atualizar questão.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
