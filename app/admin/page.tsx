'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fileToBase64 } from '@/lib/utils'

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
    const numeroRaw = q.numero
    const numero = Number.isInteger(numeroRaw) && (numeroRaw as number) > 0
      ? (numeroRaw as number)
      : i + 1
    return {
      numero,
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

  // Aba ativa
  const [aba, setAba] = useState<'provas' | 'simulados'>('provas')

  // ── Campos de PROVA ──
  const [materia, setMateria] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [ano, setAno] = useState('')
  const [semestre, setSemestre] = useState('1')

  // ── Campos de SIMULADO ──
  const [simMateria, setSimMateria] = useState('')
  const [simDificuldade, setSimDificuldade] = useState('medio')

  // ── Extração compartilhada ──
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [jsonTexto, setJsonTexto] = useState('')
  const [extraindo, setExtraindo] = useState(false)

  // ── Status e preview ──
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'info' | 'sucesso' | 'erro'>('info')
  const [questoes, setQuestoes] = useState<QuestaoExtraida[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      if (session.user.app_metadata?.role !== 'admin') {
        router.replace('/'); return
      }
      setToken(session.access_token)
      setReady(true)
    })
  }, [router])

  // Trocar de aba limpa preview e status
  const trocarAba = (nova: 'provas' | 'simulados') => {
    setAba(nova)
    setQuestoes([])
    setStatus('')
    setPdfFile(null)
    setJsonTexto('')
  }

  const setStatusMsg = (msg: string, type: 'info' | 'sucesso' | 'erro' = 'info') => {
    setStatus(msg)
    setStatusType(type)
  }

  // ── Validações por aba ──
  const getDadosProva = () => {
    if (!materia.trim()) { setStatusMsg('Preencha o campo Matéria.', 'erro'); return null }
    if (periodo === '') { setStatusMsg('Selecione o Período.', 'erro'); return null }
    if (!ano) { setStatusMsg('Preencha o Ano.', 'erro'); return null }
    const periodoNum = parseInt(periodo)
    const anoNum = parseInt(ano)
    if (isNaN(periodoNum) || periodoNum < 1) { setStatusMsg('Período inválido.', 'erro'); return null }
    if (isNaN(anoNum) || anoNum < 2000 || anoNum > 2100) { setStatusMsg('Ano inválido.', 'erro'); return null }
    return { materia: materia.trim(), periodoNum, ano, semestre }
  }

  const getDadosSimulado = () => {
    if (!simMateria.trim()) { setStatusMsg('Preencha a Matéria.', 'erro'); return null }
    return { materia: simMateria.trim(), dificuldade: simDificuldade }
  }

  const validarCampos = () =>
    aba === 'provas' ? getDadosProva() !== null : getDadosSimulado() !== null

  // ── Extração compartilhada ──
  const handleExtrair = async () => {
    if (!validarCampos()) return
    if (!pdfFile) { setStatusMsg('Selecione um PDF.', 'erro'); return }
    if (pdfFile.size > 10 * 1024 * 1024) { setStatusMsg('O PDF deve ter no máximo 10MB.', 'erro'); return }

    setExtraindo(true)
    setStatusMsg('🤖 Enviando PDF para o Claude...', 'info')
    try {
      const base64 = await fileToBase64(pdfFile)
      const res = await fetch('/api/extrair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
    if (!validarCampos()) return
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

  // ── Salvar PROVA ──
  const handleSalvarProva = async () => {
    const dados = getDadosProva()
    if (!dados) return
    if (!questoes.length) { setStatusMsg('Nenhuma questão para salvar.', 'erro'); return }

    setSalvando(true)
    try {
      const anoSalvo = parseInt(dados.ano)
      const semestreSalvo = parseInt(dados.semestre)
      if (isNaN(dados.periodoNum) || isNaN(anoSalvo) || isNaN(semestreSalvo)) {
        throw new Error('Período, ano ou semestre inválidos.')
      }

      const { data: prova, error: provaError } = await supabase
        .from('provas')
        .insert({ materia: dados.materia, periodo: dados.periodoNum, ano: anoSalvo, semestre: semestreSalvo })
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
      if (questoesError) {
        await supabase.from('provas').delete().eq('id', prova.id)
        throw new Error('Erro ao salvar questões: ' + questoesError.message)
      }

      setStatusMsg('✅ Prova e questões salvas com sucesso!', 'sucesso')
      setQuestoes([])
    } catch (err) {
      setStatusMsg(`❌ ${(err as Error).message}`, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  // ── Salvar SIMULADO ──
  const handleSalvarSimulado = async () => {
    const dados = getDadosSimulado()
    if (!dados) return
    if (!questoes.length) { setStatusMsg('Nenhuma questão para salvar.', 'erro'); return }

    setSalvando(true)
    try {
      const questoesParaSalvar = questoes.map(q => ({
        materia: dados.materia,
        dificuldade: dados.dificuldade,
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

      const { error } = await supabase.from('simulados_questoes').insert(questoesParaSalvar)
      if (error) throw new Error(error.message)

      setStatusMsg(`✅ ${questoes.length} questões adicionadas ao banco de "${dados.materia}"!`, 'sucesso')
      setQuestoes([])
    } catch (err) {
      setStatusMsg(`❌ ${(err as Error).message}`, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const handleSalvar = () => aba === 'provas' ? handleSalvarProva() : handleSalvarSimulado()

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

        {/* ABAS */}
        <div className="admin-tabs">
          <button
            className={`admin-tab${aba === 'provas' ? ' active' : ''}`}
            onClick={() => trocarAba('provas')}
          >
            📄 Provas
          </button>
          <button
            className={`admin-tab${aba === 'simulados' ? ' active' : ''}`}
            onClick={() => trocarAba('simulados')}
          >
            📝 Simulados
          </button>
        </div>

        {/* ─────────── ABA PROVAS ─────────── */}
        {aba === 'provas' && (
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
                  <select className="input-field" value={periodo} onChange={e => setPeriodo(e.target.value)}>
                    <option value="">Selecionar</option>
                    <option value="1">1º Período</option>
                    <option value="2">2º Período</option>
                    <option value="3">3º Período</option>
                    <option value="4">4º Período</option>
                    <option value="5">5º Período</option>
                    <option value="6">6º Período</option>
                    <option value="7">7º Período</option>
                    <option value="8">8º Período</option>
                    <option value="9">Internato</option>
                  </select>
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
                  <select className="input-field" value={semestre} onChange={e => setSemestre(e.target.value)}>
                    <option value="1">1º semestre</option>
                    <option value="2">2º semestre</option>
                  </select>
                </div>
              </div>
              {renderExtracao()}
              <p className="admin-status" style={{ color: statusColor }}>{status}</p>
            </div>
          </div>
        )}

        {/* ─────────── ABA SIMULADOS ─────────── */}
        {aba === 'simulados' && (
          <div className="admin-card">
            <div className="sobre-label">BANCO DE QUESTÕES · SIMULADOS</div>
            <div className="admin-form">
              <div className="admin-row admin-row--2col">
                <div className="input-group">
                  <label className="input-label">Matéria</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: SOI, HAM, IESC..."
                    value={simMateria}
                    onChange={e => setSimMateria(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Dificuldade</label>
                  <select className="input-field" value={simDificuldade} onChange={e => setSimDificuldade(e.target.value)}>
                    <option value="facil">Fácil</option>
                    <option value="medio">Médio</option>
                    <option value="dificil">Difícil</option>
                  </select>
                </div>
              </div>
              {renderExtracao()}
              <p className="admin-status" style={{ color: statusColor }}>{status}</p>
            </div>
          </div>
        )}

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
            >
              {salvando
                ? 'Salvando...'
                : aba === 'provas'
                  ? 'Salvar prova no banco de dados'
                  : 'Adicionar questões ao banco de simulados'}
            </button>
          </div>
        )}
      </main>
    </>
  )

  // ── JSX compartilhado de extração ──
  function renderExtracao() {
    return (
      <>
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
            <button className="btn-primary" onClick={handleExtrair} disabled={extraindo}>
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
      </>
    )
  }
}
