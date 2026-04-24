'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fileToBase64 } from '@/lib/utils'
import type { Questao } from '@/types'

interface QuestaoExtraida {
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
}

function normalizeQuestoes(parsed: unknown): QuestaoExtraida[] {
  const arr = Array.isArray(parsed) ? parsed : (parsed as { questoes?: unknown[] }).questoes ?? []
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('JSON inválido: esperado um array de questões não vazio.')
  }
  return arr.map((item, i) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Questão ${i + 1}: item não é um objeto.`)
    }
    const q = item as Record<string, unknown>
    const enunciado = String(q.enunciado ?? '').trim()
    const gabarito = String(q.gabarito ?? '').trim()
    const tipo = String(q.tipo ?? 'multipla_escolha').trim()
    if (!enunciado) throw new Error(`Questão ${i + 1}: campo "enunciado" ausente ou vazio.`)
    if (!gabarito) throw new Error(`Questão ${i + 1}: campo "gabarito" ausente ou vazio.`)
    if (tipo === 'multipla_escolha' && !['A','B','C','D','E'].includes(gabarito.toUpperCase())) {
      throw new Error(`Questão ${i + 1}: gabarito "${gabarito}" inválido para múltipla escolha.`)
    }
    return {
      numero: typeof q.numero === 'number' ? q.numero : i + 1,
      tipo,
      enunciado,
      alternativa_a: String(q.alternativa_a ?? ''),
      alternativa_b: String(q.alternativa_b ?? ''),
      alternativa_c: String(q.alternativa_c ?? ''),
      alternativa_d: String(q.alternativa_d ?? ''),
      alternativa_e: q.alternativa_e ? String(q.alternativa_e) : '',
      gabarito: tipo === 'multipla_escolha' ? gabarito.toUpperCase() : gabarito,
      comentario: String(q.comentario ?? ''),
    }
  })
}

export default function AdminPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState('')

  // Form state
  const [materia, setMateria] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [ano, setAno] = useState('')
  const [semestre, setSemestre] = useState('1')

  // AI mode
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [extraindo, setExtraindo] = useState(false)

  // Manual mode
  const [jsonTexto, setJsonTexto] = useState('')

  // Status
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'info' | 'sucesso' | 'erro'>('info')

  // Questions
  const [questoes, setQuestoes] = useState<QuestaoExtraida[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      if (session.user.app_metadata?.role !== 'admin') {
        alert('Acesso restrito a administradores.')
        router.replace('/')
        return
      }
      setToken(session.access_token)
      setReady(true)
    })
  }, [router])

  const setStatusMsg = (msg: string, type: 'info' | 'sucesso' | 'erro' = 'info') => {
    setStatus(msg)
    setStatusType(type)
  }

  const getDadosProva = () => {
    if (!materia.trim() || !periodo || !ano) {
      setStatusMsg('Preencha matéria, período e ano.', 'erro')
      return null
    }
    return { materia: materia.trim(), periodo, ano, semestre }
  }

  const handleExtrair = async () => {
    const dados = getDadosProva()
    if (!dados) return
    if (!pdfFile) { setStatusMsg('Selecione um PDF.', 'erro'); return }
    if (pdfFile.size > 10 * 1024 * 1024) { setStatusMsg('O PDF deve ter no máximo 10MB.', 'erro'); return }

    setExtraindo(true)
    setStatusMsg('🤖 Enviando PDF para o Claude...', 'info')

    try {
      const base64 = await fileToBase64(pdfFile)
      const res = await fetch('/api/extrair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pdfBase64: base64 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar o PDF.')
      const extracted = normalizeQuestoes(data.questoes)
      setQuestoes(extracted)
      setStatusMsg(`✅ ${extracted.length} questões extraídas com sucesso!`, 'sucesso')
    } catch (err) {
      setStatusMsg(`❌ Erro: ${(err as Error).message}`, 'erro')
    } finally {
      setExtraindo(false)
    }
  }

  const handleCarregarJson = () => {
    const dados = getDadosProva()
    if (!dados) return
    if (!jsonTexto.trim()) { setStatusMsg('Cole o JSON no campo abaixo.', 'erro'); return }
    if (jsonTexto.length > 500_000) { setStatusMsg('JSON muito grande (max 500KB).', 'erro'); return }
    try {
      const parsed = JSON.parse(jsonTexto)
      const loaded = normalizeQuestoes(parsed)
      setQuestoes(loaded)
      setStatusMsg(`✅ ${loaded.length} questões carregadas com sucesso!`, 'sucesso')
    } catch (err) {
      setStatusMsg(`❌ JSON inválido: ${(err as Error).message}`, 'erro')
    }
  }

  const handleSalvar = async () => {
    const dados = getDadosProva()
    if (!dados) return
    if (!questoes.length) { setStatusMsg('Nenhuma questão para salvar.', 'erro'); return }

    setSalvando(true)
    try {
      const { data: prova, error: provaError } = await supabase
        .from('provas')
        .insert({
          materia: dados.materia,
          periodo: parseInt(dados.periodo),
          ano: parseInt(dados.ano),
          semestre: parseInt(dados.semestre)
        })
        .select()
        .single()

      if (provaError || !prova) throw new Error(provaError?.message || 'Erro ao criar prova.')

      const questoesParaSalvar = questoes.map(q => ({
        prova_id: prova.id,
        numero: q.numero,
        tipo: q.tipo ?? 'multipla_escolha',
        enunciado: q.enunciado,
        alternativa_a: q.alternativa_a,
        alternativa_b: q.alternativa_b,
        alternativa_c: q.alternativa_c,
        alternativa_d: q.alternativa_d,
        alternativa_e: q.alternativa_e ?? '',
        gabarito: q.gabarito,
        comentario: q.comentario ?? ''
      }))

      const { error: questoesError } = await supabase.from('questoes').insert(questoesParaSalvar)
      if (questoesError) throw new Error(questoesError.message)

      setStatusMsg('✅ Prova e questões salvas com sucesso!', 'sucesso')
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const statusColor = statusType === 'sucesso' ? '#4ade80' : statusType === 'erro' ? '#f87171' : 'var(--blue-neon)'

  if (!ready) return null

  return (
    <>
      <nav className="perfil-header-nav">
        <div className="container">
          <a href="/" className="logo">
            <span className="logo__icon">✦</span>
            <span className="logo__text">MedFlow.AI · Admin</span>
          </a>
        </div>
      </nav>

      <main className="admin-main">
        <div className="admin-card">
          <div className="sobre-label">NOVA PROVA</div>
          <div className="admin-form">
            <div className="admin-row">
              <div className="input-group">
                <label className="input-label">Matéria</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: SOI 1"
                  value={materia}
                  onChange={e => setMateria(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Período</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Ex: 1"
                  value={periodo}
                  onChange={e => setPeriodo(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Ano</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Ex: 2023"
                  value={ano}
                  onChange={e => setAno(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Semestre</label>
                <select
                  className="input-field"
                  value={semestre}
                  onChange={e => setSemestre(e.target.value)}
                >
                  <option value="1">1º semestre</option>
                  <option value="2">2º semestre</option>
                </select>
              </div>
            </div>

            {/* MODO IA */}
            <div className="admin-card" style={{ marginTop: '8px' }}>
              <div className="sobre-label">MODO IA · CLAUDE</div>
              <div className="admin-form" style={{ marginTop: '16px' }}>
                <div className="input-group">
                  <label className="input-label">PDF da prova</label>
                  <input
                    type="file"
                    className="input-field"
                    accept=".pdf"
                    onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <button
                  className="btn-primary"
                  onClick={handleExtrair}
                  disabled={extraindo}
                >
                  {extraindo ? '🤖 Extraindo...' : '🤖 Extrair questões com IA'}
                </button>
              </div>
            </div>

            {/* MODO MANUAL */}
            <div className="admin-card" style={{ marginTop: '8px' }}>
              <div className="sobre-label">MODO MANUAL · COLAR JSON</div>
              <div className="admin-form" style={{ marginTop: '16px' }}>
                <div className="input-group">
                  <label className="input-label">Cole o JSON aqui</label>
                  <textarea
                    className="input-field"
                    rows={8}
                    placeholder='[{"numero":1,"enunciado":"...","alternativa_a":"...","alternativa_b":"...","alternativa_c":"...","alternativa_d":"...","gabarito":"A","comentario":"..."}]'
                    value={jsonTexto}
                    onChange={e => setJsonTexto(e.target.value)}
                  />
                </div>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
                  onClick={handleCarregarJson}
                >
                  📋 Carregar JSON
                </button>
              </div>
            </div>

            <p className="admin-status" style={{ color: statusColor }}>{status}</p>
          </div>
        </div>

        {/* QUESTÕES PREVIEW */}
        {questoes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {questoes.map((q, idx) => (
              <div key={idx} className="questao-card">
                <div className="questao-numero">QUESTÃO {q.numero}</div>
                <div className="questao-enunciado-admin">{q.enunciado}</div>
                <div className="alternativas-grid">
                  {[
                    { letra: 'A', texto: q.alternativa_a },
                    { letra: 'B', texto: q.alternativa_b },
                    { letra: 'C', texto: q.alternativa_c },
                    { letra: 'D', texto: q.alternativa_d },
                    ...(q.alternativa_e ? [{ letra: 'E', texto: q.alternativa_e }] : []),
                  ].map(alt => (
                    <div key={alt.letra} className="alternativa-item">
                      <span className="alternativa-letra">{alt.letra}</span>
                      <span>{alt.texto}</span>
                    </div>
                  ))}
                </div>
                <div className="questao-gabarito">Gabarito: {q.gabarito}</div>
                {q.comentario && (
                  <div className="questao-comentario">{q.comentario}</div>
                )}
              </div>
            ))}
            <button
              className="btn-salvar-prova"
              onClick={handleSalvar}
              disabled={salvando}
              id="btn-salvar"
            >
              {salvando ? 'Salvando...' : 'Salvar prova no banco de dados'}
            </button>
          </div>
        )}
      </main>
    </>
  )
}
