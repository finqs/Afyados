import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svcKey) return NextResponse.json({ error: 'Configuração do servidor ausente.' }, { status: 500 })

  const sb = createClient(url, svcKey)

  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida. Faça login novamente.' }, { status: 401 })
  if (user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await req.json() as {
    materia?: string
    semestre?: number
    numero?: number
    titulo?: string
    pdfBase64?: string
  }

  const { materia, semestre, numero, titulo, pdfBase64 } = body

  if (!materia?.trim())  return NextResponse.json({ error: 'Campo "materia" obrigatório.' }, { status: 400 })
  if (!semestre)         return NextResponse.json({ error: 'Campo "semestre" obrigatório.' }, { status: 400 })
  if (!numero)           return NextResponse.json({ error: 'Campo "numero" obrigatório.' }, { status: 400 })
  if (!titulo?.trim())   return NextResponse.json({ error: 'Campo "titulo" obrigatório.' }, { status: 400 })
  if (!pdfBase64)        return NextResponse.json({ error: 'PDF obrigatório.' }, { status: 400 })

  const buffer = Buffer.from(pdfBase64, 'base64')
  if (buffer.length > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'PDF muito grande (máx 20 MB).' }, { status: 400 })
  }

  const matUpper = materia.trim().toUpperCase()
  const numPad   = String(numero).padStart(2, '0')
  const filename = `${matUpper.toLowerCase()}/apg-${numPad}-sem${semestre}.pdf`

  const { error: uploadErr } = await sb.storage
    .from('apgs')
    .upload(filename, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('Storage upload error:', uploadErr.message)
    return NextResponse.json(
      { error: 'Erro ao enviar o PDF. Verifique se o bucket "apgs" existe e é público.' },
      { status: 500 }
    )
  }

  const { data: { publicUrl } } = sb.storage.from('apgs').getPublicUrl(filename)

  const { error: dbErr } = await sb.from('apgs').upsert(
    {
      materia:   matUpper,
      semestre:  Number(semestre),
      numero:    Number(numero),
      titulo:    titulo.trim(),
      url_pdf:   publicUrl,
    },
    { onConflict: 'materia,semestre,numero' }
  )

  if (dbErr) {
    console.error('APG DB upsert error:', dbErr.message)
    return NextResponse.json({ error: 'PDF enviado, mas erro ao salvar metadados.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: publicUrl })
}
