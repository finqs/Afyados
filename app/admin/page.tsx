'use client'

import { useCallback, useEffect, useState } from 'react'
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
  tem_imagem?: boolean
  imagem_descricao?: string
  area?: string
  apg_numero?: number | null
}

interface BancoQProva {
  id: string; numero: number; tipo: string; enunciado: string
  alternativa_a: string; alternativa_b: string; alternativa_c: string; alternativa_d: string; alternativa_e: string
  gabarito: string; comentario: string; tem_imagem: boolean; imagem_descricao: string
  area: string; apg_numero: number | null
  provas: { id: string; materia: string; periodo: number; ano: number; semestre: number } | null
}
interface BancoQSim {
  id: string; materia: string; area: string; subarea: string; numero: number; tipo: string; enunciado: string
  alternativa_a: string; alternativa_b: string; alternativa_c: string; alternativa_d: string; alternativa_e: string
  gabarito: string; comentario: string; tem_imagem: boolean; imagem_descricao: string; apg_numero: number | null
}
interface EditForm {
  tipo_banco: 'prova' | 'simulado'; id: string; numero: number; tipo: string
  enunciado: string; alt_a: string; alt_b: string; alt_c: string; alt_d: string; alt_e: string
  gabarito: string; comentario: string; area: string; apg_numero: string
  tem_imagem: boolean; imagem_descricao: string; materia?: string; subarea?: string
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
      tem_imagem: Boolean(q.tem_imagem ?? false),
      imagem_descricao: String(q.imagem_descricao ?? ''),
      area: String(q.area ?? ''),
      apg_numero: q.apg_numero != null ? Number(q.apg_numero) : null,
    }
  })
}

export default function AdminPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  // Aba ativa
  const [aba, setAba] = useState<'provas' | 'simulados' | 'apgs' | 'integradora' | 'banco'>('provas')

  // ── Campos de PROVA ──
  const [materia, setMateria] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [ano, setAno] = useState('')
  const [semestre, setSemestre] = useState('1')

  // ── Campos de SIMULADO ──
  const [simMateria, setSimMateria] = useState('')
  const [simArea, setSimArea] = useState('')
  const [simSubarea, setSimSubarea] = useState('')
  const [simDificuldade, setSimDificuldade] = useState('medio')

  // ── APG upload ──
  const [apgMateria, setApgMateria] = useState('SOI')
  const [apgSemestre, setApgSemestre] = useState('2')
  const [apgNumero, setApgNumero] = useState('')
  const [apgTitulo, setApgTitulo] = useState('')
  const [apgPdfFile, setApgPdfFile] = useState<File | null>(null)
  const [uploadandoApg, setUploadandoApg] = useState(false)
  const [apgStatus, setApgStatus] = useState('')
  const [apgStatusType, setApgStatusType] = useState<'info' | 'sucesso' | 'erro'>('info')

  // ── Extração compartilhada ──
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [jsonTexto, setJsonTexto] = useState('')
  const [extraindo, setExtraindo] = useState(false)

  // ── Status e preview ──
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'info' | 'sucesso' | 'erro'>('info')
  const [questoes, setQuestoes] = useState<QuestaoExtraida[]>([])
  const [salvando, setSalvando] = useState(false)

  // Banco de questões
  const [bancoSection, setBancoSection] = useState<'provas' | 'simulados'>('provas')
  const [bancoQProvas, setBancoQProvas] = useState<BancoQProva[]>([])
  const [bancoQSims, setBancoQSims] = useState<BancoQSim[]>([])
  const [loadingBanco, setLoadingBanco] = useState(false)
  const [bancoFiltro, setBancoFiltro] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [salvandoEdit, setSalvandoEdit] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [editStatusType, setEditStatusType] = useState<'sucesso' | 'erro'>('sucesso')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      if (session.user.app_metadata?.role !== 'admin') {
        router.replace('/'); return
      }
      setReady(true)
    })
  }, [router])

  // Codex #5: sempre obter token fresco antes de cada requisição ao servidor
  const getFreshToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  // Trocar de aba limpa preview e status
  const trocarAba = (nova: 'provas' | 'simulados' | 'apgs' | 'integradora' | 'banco') => {
    setAba(nova)
    setQuestoes([])
    setStatus('')
    setPdfFile(null)
    setJsonTexto('')
    setApgStatus('')
    // Prova Integradora pré-fixa a matéria
    if (nova === 'integradora') setMateria('Integradora')
    else if (nova !== 'provas') setMateria('')
    if (nova === 'banco') carregarBanco('provas')
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
    return { materia: simMateria.trim(), area: simArea.trim(), subarea: simSubarea.trim(), dificuldade: simDificuldade }
  }

  const validarCampos = () =>
    (aba === 'provas' || aba === 'integradora') ? getDadosProva() !== null : getDadosSimulado() !== null

  // ── Extração compartilhada ──
  const handleExtrair = async () => {
    if (!validarCampos()) return
    if (!pdfFile) { setStatusMsg('Selecione um PDF.', 'erro'); return }
    if (pdfFile.size > 10 * 1024 * 1024) { setStatusMsg('O PDF deve ter no máximo 10MB.', 'erro'); return }

    setExtraindo(true)
    setStatusMsg('🤖 Enviando PDF para o Claude...', 'info')
    try {
      // Codex #5: token fresco a cada chamada (evita 401 após refresh de sessão)
      const freshToken = await getFreshToken()
      if (!freshToken) {
        setStatusMsg('Sessão expirada. Faça login novamente.', 'erro')
        return
      }
      const base64 = await fileToBase64(pdfFile)
      const res = await fetch('/api/extrair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
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

  // ── Salvar PROVA (Codex #1 + #2: via rota server-side, insert atômico) ──
  const handleSalvarProva = async () => {
    const dados = getDadosProva()
    if (!dados) return
    if (!questoes.length) { setStatusMsg('Nenhuma questão para salvar.', 'erro'); return }

    setSalvando(true)
    try {
      const freshToken = await getFreshToken()
      if (!freshToken) { setStatusMsg('Sessão expirada. Faça login novamente.', 'erro'); return }

      const res = await fetch('/api/salvar-prova', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({
          materia:    dados.materia,
          periodoNum: dados.periodoNum,
          ano:        parseInt(dados.ano),
          semestre:   parseInt(dados.semestre),
          questoes
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar prova.')

      setStatusMsg('✅ Prova e questões salvas com sucesso!', 'sucesso')
      setQuestoes([])
    } catch (err) {
      setStatusMsg(`❌ ${(err as Error).message}`, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  // ── Salvar SIMULADO (Codex #1: via rota server-side) ──
  const handleSalvarSimulado = async () => {
    const dados = getDadosSimulado()
    if (!dados) return
    if (!questoes.length) { setStatusMsg('Nenhuma questão para salvar.', 'erro'); return }

    setSalvando(true)
    try {
      const freshToken = await getFreshToken()
      if (!freshToken) { setStatusMsg('Sessão expirada. Faça login novamente.', 'erro'); return }

      const res = await fetch('/api/salvar-simulado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({
          materia:     dados.materia,
          area:        dados.area,
          subarea:     dados.subarea,
          dificuldade: dados.dificuldade,
          questoes
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar questões.')

      setStatusMsg(`✅ ${questoes.length} questões adicionadas → ${dados.materia}`, 'sucesso')
      setQuestoes([])
    } catch (err) {
      setStatusMsg(`❌ ${(err as Error).message}`, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const handleSalvar = () =>
    (aba === 'provas' || aba === 'integradora') ? handleSalvarProva() : handleSalvarSimulado()

  // ── Upload de APG ──
  const handleUploadApg = async () => {
    if (!apgMateria.trim()) { setApgStatus('Preencha a Matéria.'); setApgStatusType('erro'); return }
    if (!apgNumero || isNaN(Number(apgNumero))) { setApgStatus('Preencha o Número do APG.'); setApgStatusType('erro'); return }
    if (!apgTitulo.trim()) { setApgStatus('Preencha o Título.'); setApgStatusType('erro'); return }
    if (!apgPdfFile) { setApgStatus('Selecione o arquivo PDF.'); setApgStatusType('erro'); return }
    if (apgPdfFile.size > 20 * 1024 * 1024) { setApgStatus('PDF muito grande (máx 20 MB).'); setApgStatusType('erro'); return }

    setUploadandoApg(true)
    setApgStatus('⏳ Enviando PDF...')
    setApgStatusType('info')

    try {
      const freshToken = await getFreshToken()
      if (!freshToken) { setApgStatus('Sessão expirada. Faça login novamente.'); setApgStatusType('erro'); return }

      const pdfBase64 = await fileToBase64(apgPdfFile)
      const res = await fetch('/api/upload-apg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({
          materia:   apgMateria.trim(),
          semestre:  Number(apgSemestre),
          numero:    Number(apgNumero),
          titulo:    apgTitulo.trim(),
          pdfBase64,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao publicar APG.')

      setApgStatus(`✅ APG ${apgNumero} publicado com sucesso!`)
      setApgStatusType('sucesso')
      setApgNumero('')
      setApgTitulo('')
      setApgPdfFile(null)
    } catch (err) {
      setApgStatus(`❌ ${(err as Error).message}`)
      setApgStatusType('erro')
    } finally {
      setUploadandoApg(false)
    }
  }

  const updateQuestaoField = (idx: number, field: keyof QuestaoExtraida, value: unknown) => {
    setQuestoes(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  const carregarBanco = useCallback(async (section: 'provas' | 'simulados') => {
    setLoadingBanco(true)
    setBancoFiltro('')
    if (section === 'provas') {
      const { data } = await supabase
        .from('questoes')
        .select('id,numero,tipo,enunciado,alternativa_a,alternativa_b,alternativa_c,alternativa_d,alternativa_e,gabarito,comentario,tem_imagem,imagem_descricao,area,apg_numero,provas(id,materia,periodo,ano,semestre)')
        .order('numero', { ascending: true })
        .limit(500)
      setBancoQProvas((data ?? []) as unknown as BancoQProva[])
    } else {
      const { data } = await supabase
        .from('simulados_questoes')
        .select('*')
        .order('materia', { ascending: true })
        .order('area', { ascending: true })
        .order('numero', { ascending: true })
        .limit(500)
      setBancoQSims((data ?? []) as BancoQSim[])
    }
    setLoadingBanco(false)
  }, [])

  const iniciarEdicao = (q: BancoQProva | BancoQSim, tipo: 'prova' | 'simulado') => {
    const area = tipo === 'prova' ? (q as BancoQProva).area : (q as BancoQSim).area
    setEditForm({
      tipo_banco: tipo, id: q.id, numero: q.numero, tipo: q.tipo,
      enunciado: q.enunciado, alt_a: q.alternativa_a, alt_b: q.alternativa_b,
      alt_c: q.alternativa_c, alt_d: q.alternativa_d, alt_e: q.alternativa_e,
      gabarito: q.gabarito, comentario: q.comentario, area,
      apg_numero: q.apg_numero != null ? String(q.apg_numero) : '',
      tem_imagem: q.tem_imagem, imagem_descricao: q.imagem_descricao,
      materia: tipo === 'simulado' ? (q as BancoQSim).materia : undefined,
      subarea: tipo === 'simulado' ? (q as BancoQSim).subarea : undefined,
    })
    setEditStatus('')
  }

  const salvarEdicao = async () => {
    if (!editForm) return
    setSalvandoEdit(true)
    try {
      const freshToken = await getFreshToken()
      if (!freshToken) throw new Error('Sessão expirada.')
      const endpoint = editForm.tipo_banco === 'prova'
        ? `/api/questoes/${editForm.id}`
        : `/api/simulados-questoes/${editForm.id}`
      const body: Record<string, unknown> = {
        enunciado: editForm.enunciado,
        alternativa_a: editForm.alt_a, alternativa_b: editForm.alt_b,
        alternativa_c: editForm.alt_c, alternativa_d: editForm.alt_d,
        alternativa_e: editForm.alt_e, gabarito: editForm.gabarito,
        comentario: editForm.comentario, area: editForm.area,
        apg_numero: editForm.apg_numero ? Number(editForm.apg_numero) : null,
        tem_imagem: editForm.tem_imagem, imagem_descricao: editForm.imagem_descricao,
      }
      if (editForm.tipo_banco === 'simulado') body.subarea = editForm.subarea ?? ''
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
      setEditStatus('✅ Salvo!')
      setEditStatusType('sucesso')
      if (editForm.tipo_banco === 'prova') {
        setBancoQProvas(prev => prev.map(q => q.id === editForm.id
          ? { ...q, enunciado: editForm.enunciado, alternativa_a: editForm.alt_a, alternativa_b: editForm.alt_b, alternativa_c: editForm.alt_c, alternativa_d: editForm.alt_d, alternativa_e: editForm.alt_e, gabarito: editForm.gabarito, comentario: editForm.comentario, area: editForm.area, apg_numero: editForm.apg_numero ? Number(editForm.apg_numero) : null, tem_imagem: editForm.tem_imagem, imagem_descricao: editForm.imagem_descricao }
          : q))
      } else {
        setBancoQSims(prev => prev.map(q => q.id === editForm.id
          ? { ...q, enunciado: editForm.enunciado, alternativa_a: editForm.alt_a, alternativa_b: editForm.alt_b, alternativa_c: editForm.alt_c, alternativa_d: editForm.alt_d, alternativa_e: editForm.alt_e, gabarito: editForm.gabarito, comentario: editForm.comentario, area: editForm.area, subarea: editForm.subarea ?? '', apg_numero: editForm.apg_numero ? Number(editForm.apg_numero) : null, tem_imagem: editForm.tem_imagem, imagem_descricao: editForm.imagem_descricao }
          : q))
      }
      setTimeout(() => setEditForm(null), 1600)
    } catch (err) {
      setEditStatus(`❌ ${(err as Error).message}`)
      setEditStatusType('erro')
    } finally {
      setSalvandoEdit(false)
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
          <button
            className={`admin-tab${aba === 'apgs' ? ' active' : ''}`}
            onClick={() => trocarAba('apgs')}
          >
            📚 APGs
          </button>
          <button
            className={`admin-tab${aba === 'integradora' ? ' active' : ''}`}
            onClick={() => trocarAba('integradora')}
          >
            🔗 Integradora
          </button>
          <button
            className={`admin-tab${aba === 'banco' ? ' active' : ''}`}
            onClick={() => trocarAba('banco')}
          >
            📦 Banco
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

        {/* ─────────── ABA APGs ─────────── */}
        {aba === 'apgs' && (
          <div className="admin-card">
            <div className="sobre-label">PUBLICAR APG</div>
            <div className="admin-form">
              <div className="admin-row admin-row--2col">
                <div className="input-group">
                  <label className="input-label">Matéria</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: SOI, HAM..."
                    value={apgMateria}
                    onChange={e => setApgMateria(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Semestre / Módulo</label>
                  <select className="input-field" value={apgSemestre} onChange={e => setApgSemestre(e.target.value)}>
                    {[1,2,3,4,5,6,7,8].map(n => (
                      <option key={n} value={n}>{n}º</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="admin-row admin-row--2col">
                <div className="input-group">
                  <label className="input-label">Número do APG</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="Ex: 6"
                    min={1}
                    value={apgNumero}
                    onChange={e => setApgNumero(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Título</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: Penso, logo caminho"
                    value={apgTitulo}
                    onChange={e => setApgTitulo(e.target.value)}
                  />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Arquivo PDF</label>
                <input
                  type="file"
                  className="input-field"
                  accept=".pdf"
                  onChange={e => setApgPdfFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <button className="btn-primary" onClick={handleUploadApg} disabled={uploadandoApg}>
                {uploadandoApg ? '⏳ Publicando...' : '📤 Publicar APG'}
              </button>
              {apgStatus && (
                <p className="admin-status" style={{
                  color: apgStatusType === 'sucesso' ? '#4ade80' : apgStatusType === 'erro' ? '#f87171' : 'var(--blue-neon)'
                }}>
                  {apgStatus}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─────────── ABA INTEGRADORA ─────────── */}
        {aba === 'integradora' && (
          <div className="admin-card">
            <div className="sobre-label">PROVA INTEGRADORA</div>
            <div className="admin-integradora-badge">
              <span>IESC</span><span>HAM</span><span>SOI</span>
            </div>
            <div className="admin-form">
              <div className="admin-row">
                <div className="input-group">
                  <label className="input-label">Matéria</label>
                  <input
                    type="text"
                    className="input-field"
                    value="Integradora"
                    readOnly
                    style={{ opacity: 0.6, cursor: 'default' }}
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
                    placeholder="Ex: 2024"
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

        {/* ─────────── ABA BANCO ─────────── */}
        {aba === 'banco' && renderBancoView()}

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
                {(aba === 'provas' || aba === 'integradora') && (
                  <div className="questao-meta-row">
                    <div className="questao-meta-field">
                      <label className="questao-meta-label">Área</label>
                      <input
                        className="questao-meta-input"
                        placeholder="Ex: Sistema Nervoso Central"
                        value={q.area ?? ''}
                        onChange={e => updateQuestaoField(idx, 'area', e.target.value)}
                      />
                    </div>
                    <div className="questao-meta-field">
                      <label className="questao-meta-label">APG nº</label>
                      <input
                        type="number"
                        min={1}
                        className="questao-meta-input questao-meta-input--sm"
                        placeholder="0"
                        value={q.apg_numero ?? ''}
                        onChange={e => updateQuestaoField(idx, 'apg_numero', e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                  </div>
                )}
                {aba === 'simulados' && (
                  <div className="questao-meta-row">
                    <div className="questao-meta-field">
                      <label className="questao-meta-label">APG nº</label>
                      <input
                        type="number"
                        min={1}
                        className="questao-meta-input questao-meta-input--sm"
                        placeholder="0"
                        value={q.apg_numero ?? ''}
                        onChange={e => updateQuestaoField(idx, 'apg_numero', e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                  </div>
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
                : aba === 'provas' || aba === 'integradora'
                  ? 'Salvar prova no banco de dados'
                  : 'Adicionar questões ao banco de simulados'}
            </button>
          </div>
        )}

        {/* EDIT MODAL */}
        {editForm && renderEditModal()}
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

  function renderBancoView() {
    const filtro = bancoFiltro.toLowerCase()
    const qProvasFiltradas = bancoFiltro
      ? bancoQProvas.filter(q =>
          (q.provas?.materia ?? '').toLowerCase().includes(filtro) ||
          q.enunciado.toLowerCase().includes(filtro) ||
          q.area.toLowerCase().includes(filtro)
        )
      : bancoQProvas

    const qSimsFiltradas = bancoFiltro
      ? bancoQSims.filter(q =>
          q.materia.toLowerCase().includes(filtro) ||
          q.area.toLowerCase().includes(filtro) ||
          q.enunciado.toLowerCase().includes(filtro)
        )
      : bancoQSims

    // Group provas by materia > ano.semestre
    const provasGrupo: Record<string, Record<string, BancoQProva[]>> = {}
    qProvasFiltradas.forEach(q => {
      const mat = q.provas?.materia ?? '—'
      const chave = q.provas ? `${q.provas.ano}.${q.provas.semestre}` : '—'
      if (!provasGrupo[mat]) provasGrupo[mat] = {}
      if (!provasGrupo[mat][chave]) provasGrupo[mat][chave] = []
      provasGrupo[mat][chave].push(q)
    })

    // Group sims by materia > area
    const simsGrupo: Record<string, Record<string, BancoQSim[]>> = {}
    qSimsFiltradas.forEach(q => {
      if (!simsGrupo[q.materia]) simsGrupo[q.materia] = {}
      if (!simsGrupo[q.materia][q.area]) simsGrupo[q.materia][q.area] = []
      simsGrupo[q.materia][q.area].push(q)
    })

    const toggleGroup = (key: string) => {
      setExpandedGroups(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    return (
      <div className="banco-view">
        {/* sub-tabs */}
        <div className="banco-subtabs">
          <button
            className={`banco-subtab${bancoSection === 'provas' ? ' active' : ''}`}
            onClick={() => { setBancoSection('provas'); carregarBanco('provas') }}
          >
            📄 Provas <span className="banco-count">{bancoQProvas.length}</span>
          </button>
          <button
            className={`banco-subtab${bancoSection === 'simulados' ? ' active' : ''}`}
            onClick={() => { setBancoSection('simulados'); carregarBanco('simulados') }}
          >
            📝 Simulados <span className="banco-count">{bancoQSims.length}</span>
          </button>
        </div>

        {/* filter */}
        <div className="banco-filtro-row">
          <input
            className="input-field"
            placeholder="🔍 Filtrar por matéria, área ou trecho do enunciado..."
            value={bancoFiltro}
            onChange={e => setBancoFiltro(e.target.value)}
          />
          <button className="btn-primary" style={{ padding: '10px 20px', fontSize: '0.85rem' }} onClick={() => carregarBanco(bancoSection)}>
            ↺ Recarregar
          </button>
        </div>

        {loadingBanco ? (
          <div className="banco-loading">Carregando questões...</div>
        ) : bancoSection === 'provas' ? (
          Object.keys(provasGrupo).length === 0 ? (
            <div className="banco-loading">Nenhuma questão encontrada.</div>
          ) : (
            Object.entries(provasGrupo).map(([materia, provas]) => (
              <div key={materia} className="banco-grupo">
                <div className="banco-grupo-header">
                  <span className="banco-grupo-materia">{materia}</span>
                  <span className="banco-grupo-count">{Object.values(provas).flat().length} questões</span>
                </div>
                {Object.entries(provas).map(([provaChave, questoes]) => {
                  const gKey = `p-${materia}-${provaChave}`
                  const open = expandedGroups.has(gKey)
                  return (
                    <div key={provaChave} className="banco-subgrupo">
                      <button className="banco-subgrupo-toggle" onClick={() => toggleGroup(gKey)}>
                        <span>{open ? '▾' : '▸'} Prova {provaChave}</span>
                        <span className="banco-grupo-count">{questoes.length} questões</span>
                      </button>
                      {open && (
                        <div className="banco-questoes-list">
                          {questoes.map(q => (
                            <div key={q.id} className="banco-questao-item">
                              <div className="banco-questao-left">
                                <span className="banco-questao-num">Q{q.numero}</span>
                                <span className={`banco-tipo-badge banco-tipo-badge--${q.tipo === 'aberta' ? 'aberta' : 'mc'}`}>
                                  {q.tipo === 'aberta' ? 'Aberta' : 'MC'}
                                </span>
                                <span className="banco-questao-enunciado">{q.enunciado.slice(0, 80)}{q.enunciado.length > 80 ? '...' : ''}</span>
                              </div>
                              <div className="banco-questao-right">
                                {q.area && <span className="banco-area-badge">{q.area}</span>}
                                {q.apg_numero && <span className="banco-apg-badge">APG {q.apg_numero}</span>}
                                <button className="banco-edit-btn" onClick={() => iniciarEdicao(q, 'prova')}>✏️ Editar</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )
        ) : (
          Object.keys(simsGrupo).length === 0 ? (
            <div className="banco-loading">Nenhuma questão encontrada.</div>
          ) : (
            Object.entries(simsGrupo).map(([materia, areas]) => (
              <div key={materia} className="banco-grupo">
                <div className="banco-grupo-header">
                  <span className="banco-grupo-materia">{materia}</span>
                  <span className="banco-grupo-count">{Object.values(areas).flat().length} questões</span>
                </div>
                {Object.entries(areas).map(([area, questoes]) => {
                  const gKey = `s-${materia}-${area}`
                  const open = expandedGroups.has(gKey)
                  return (
                    <div key={area} className="banco-subgrupo">
                      <button className="banco-subgrupo-toggle" onClick={() => toggleGroup(gKey)}>
                        <span>{open ? '▾' : '▸'} {area}</span>
                        <span className="banco-grupo-count">{questoes.length} questões</span>
                      </button>
                      {open && (
                        <div className="banco-questoes-list">
                          {questoes.map(q => (
                            <div key={q.id} className="banco-questao-item">
                              <div className="banco-questao-left">
                                <span className="banco-questao-num">Q{q.numero}</span>
                                <span className={`banco-tipo-badge banco-tipo-badge--${q.tipo === 'aberta' ? 'aberta' : 'mc'}`}>
                                  {q.tipo === 'aberta' ? 'Aberta' : 'MC'}
                                </span>
                                <span className="banco-questao-enunciado">{q.enunciado.slice(0, 80)}{q.enunciado.length > 80 ? '...' : ''}</span>
                              </div>
                              <div className="banco-questao-right">
                                {q.subarea && <span className="banco-area-badge">{q.subarea}</span>}
                                {q.apg_numero && <span className="banco-apg-badge">APG {q.apg_numero}</span>}
                                <button className="banco-edit-btn" onClick={() => iniciarEdicao(q, 'simulado')}>✏️ Editar</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )
        )}
      </div>
    )
  }

  function renderEditModal() {
    if (!editForm) return null
    const ef = editForm
    const setEF = (patch: Partial<EditForm>) => setEditForm(prev => prev ? { ...prev, ...patch } : null)
    const editColor = editStatusType === 'sucesso' ? '#4ade80' : '#f87171'

    return (
      <div className="edit-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditForm(null) }}>
        <div className="edit-modal">
          <div className="edit-modal-header">
            <div className="edit-modal-title">
              ✏️ Editando Questão {ef.numero}
              <span className="edit-modal-badge">{ef.tipo_banco === 'prova' ? '📄 Prova' : '📝 Simulado'}</span>
            </div>
            <button className="edit-modal-close" onClick={() => setEditForm(null)}>×</button>
          </div>
          <div className="edit-modal-body">
            {/* Metadados */}
            <div className="edit-section-label">METADADOS</div>
            <div className="admin-row admin-row--2col">
              <div className="input-group">
                <label className="input-label">Área</label>
                <input className="input-field" value={ef.area} onChange={e => setEF({ area: e.target.value })} placeholder="Ex: Sistema Nervoso Central" />
              </div>
              <div className="input-group">
                <label className="input-label">APG nº</label>
                <input type="number" min={1} className="input-field" value={ef.apg_numero} onChange={e => setEF({ apg_numero: e.target.value })} placeholder="0" />
              </div>
            </div>
            {ef.tipo_banco === 'simulado' && (
              <div className="input-group">
                <label className="input-label">Subárea</label>
                <input className="input-field" value={ef.subarea ?? ''} onChange={e => setEF({ subarea: e.target.value })} placeholder="Ex: Irrigação Cardíaca" />
              </div>
            )}

            {/* Enunciado */}
            <div className="edit-section-label" style={{ marginTop: '20px' }}>ENUNCIADO</div>
            <div className="input-group">
              <textarea className="input-field" rows={5} value={ef.enunciado} onChange={e => setEF({ enunciado: e.target.value })} />
            </div>

            {/* Alternativas (only for multipla_escolha) */}
            {ef.tipo !== 'aberta' && (
              <>
                <div className="edit-section-label" style={{ marginTop: '20px' }}>ALTERNATIVAS</div>
                {(['A','B','C','D','E'] as const).map(letra => {
                  const field = `alt_${letra.toLowerCase()}` as keyof EditForm
                  return (
                    <div key={letra} className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                      <span className="alternativa-letra" style={{ minWidth: '28px' }}>{letra}</span>
                      <input className="input-field" value={String(ef[field] ?? '')} onChange={e => setEF({ [field]: e.target.value } as Partial<EditForm>)} />
                    </div>
                  )
                })}
              </>
            )}

            {/* Gabarito */}
            <div className="edit-section-label" style={{ marginTop: '20px' }}>GABARITO</div>
            <div className="input-group">
              <input className="input-field" value={ef.gabarito} onChange={e => setEF({ gabarito: e.target.value.toUpperCase() })} placeholder={ef.tipo === 'aberta' ? 'Resposta esperada' : 'A, B, C, D ou E'} />
            </div>

            {/* Comentario */}
            <div className="edit-section-label" style={{ marginTop: '20px' }}>COMENTÁRIO</div>
            <div className="input-group">
              <textarea className="input-field" rows={3} value={ef.comentario} onChange={e => setEF({ comentario: e.target.value })} placeholder="Explicação do gabarito..." />
            </div>

            {/* Imagem */}
            <div className="edit-section-label" style={{ marginTop: '20px' }}>IMAGEM</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#e2e8f0' }}>
                <input type="checkbox" checked={ef.tem_imagem} onChange={e => setEF({ tem_imagem: e.target.checked })} />
                Questão tem imagem
              </label>
            </div>
            {ef.tem_imagem && (
              <div className="input-group">
                <textarea className="input-field" rows={3} value={ef.imagem_descricao} onChange={e => setEF({ imagem_descricao: e.target.value })} placeholder="Descrição detalhada da imagem..." />
              </div>
            )}

            {/* Actions */}
            <div className="edit-modal-actions">
              <button className="btn btn--outline" onClick={() => setEditForm(null)}>Cancelar</button>
              <button className="btn btn--primary" onClick={salvarEdicao} disabled={salvandoEdit}>
                {salvandoEdit ? 'Salvando...' : '💾 Salvar Questão'}
              </button>
            </div>
            {editStatus && <p style={{ color: editColor, fontSize: '0.9rem', marginTop: '8px', textAlign: 'center' }}>{editStatus}</p>}
          </div>
        </div>
      </div>
    )
  }
}
