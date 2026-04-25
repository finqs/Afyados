'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

// Partial type matching what the Supabase query actually returns
type AttemptRow = {
  id: string
  score: number
  total: number
  finalizada: boolean
  created_at: string
  provas: { materia: string; ano: number; semestre: number } | null
}

interface GraficoItem {
  materia: string
  ano: number | string
  semestre: number | string
  acertos: number
  total: number
}

interface MateriaStats {
  score: number
  total: number
}

interface ReviewDue {
  id: string
  materia: string
  area: string
  next_review: string
  reps: number
  state: number
}

function labelEstado(state: number, reps: number): string {
  if (reps === 0) return 'Novo'
  if (state === 1) return 'Aprendendo'
  if (state === 2) return 'Revisão'
  if (state === 3) return 'Reaprendendo'
  return 'Novo'
}

export default function PerfilPage() {
  const router = useRouter()

  const [nome, setNome] = useState('Carregando...')
  const [email, setEmail] = useState('')
  const [avatarLetra, setAvatarLetra] = useState('?')

  const [statTotal, setStatTotal] = useState('--')
  const [statAcertos, setStatAcertos] = useState('--%')
  const [statProvas, setStatProvas] = useState('--')
  const [statMaterias, setStatMaterias] = useState('--')

  const [historico, setHistorico] = useState<AttemptRow[]>([])
  const [materiaMap, setMateriaMap] = useState<Record<string, MateriaStats>>({})
  const [graficoData, setGraficoData] = useState<GraficoItem[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // FSRS — revisões pendentes
  const [reviewsDue, setReviewsDue] = useState<ReviewDue[]>([])
  const [loadingReviews, setLoadingReviews] = useState(true)

  // Configurações
  const [perfPeriodo, setPerfPeriodo] = useState('')
  const [periodoMsg, setPeriodoMsg] = useState('')
  const [periodoMsgColor, setPeriodoMsgColor] = useState('#4ade80')
  const [salvandoPeriodo, setSalvandoPeriodo] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const carregarReviews = useCallback(async (userId: string) => {
    setLoadingReviews(true)
    const { data, error } = await supabase
      .from('user_reviews')
      .select('id, materia, area, next_review, reps, state')
      .eq('user_id', userId)
      .lte('next_review', new Date().toISOString())
      .order('next_review', { ascending: true })
    if (!mountedRef.current) return
    if (error) { console.error('Erro ao carregar revisões:', error.message) }
    else setReviewsDue((data ?? []) as ReviewDue[])
    setLoadingReviews(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mountedRef.current) return
      if (!session) { router.replace('/login'); return }

      const user = session.user
      const nomeUser = user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuário'
      setNome(nomeUser)
      setEmail(user.email || '')
      setAvatarLetra(nomeUser.charAt(0).toUpperCase())
      setPerfPeriodo(user.user_metadata?.periodo || '')

      await Promise.all([carregarDados(user.id), carregarReviews(user.id)])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const carregarDados = async (userId: string) => {
    setLoadingData(true)
    const { data: attempts, error: attemptsError } = await supabase
      .from('exam_attempts')
      .select(`
        id,
        score,
        total,
        finalizada,
        created_at,
        provas (
          materia,
          ano,
          semestre
        )
      `)
      .eq('user_id', userId)
      .eq('finalizada', true)
      .order('created_at', { ascending: false })

    if (!mountedRef.current) return
    setLoadingData(false)

    if (attemptsError) {
      console.error('Erro ao carregar histórico:', attemptsError.message)
      return
    }
    if (!attempts || !attempts.length) {
      setStatTotal('0')
      setStatAcertos('0%')
      setStatProvas('0')
      setStatMaterias('0')
      return
    }

    const typed = attempts as unknown as AttemptRow[]

    const totalQuestoes = typed.reduce((acc, a) => acc + a.total, 0)
    const totalAcertos  = typed.reduce((acc, a) => acc + a.score, 0)
    const percentGeral  = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0

    setStatTotal(String(totalQuestoes))
    setStatAcertos(`${percentGeral}%`)
    setStatProvas(String(typed.length))

    const mMap: Record<string, MateriaStats> = {}
    typed.forEach(a => {
      const mat = a.provas?.materia || 'Outros'
      if (!mMap[mat]) mMap[mat] = { score: 0, total: 0 }
      mMap[mat].score += a.score
      mMap[mat].total += a.total
    })

    setStatMaterias(String(Object.keys(mMap).length))
    setHistorico(typed)
    setMateriaMap(mMap)

    setGraficoData([...typed].reverse().map(p => ({
      materia:  p.provas?.materia  || 'Outros',
      ano:      p.provas?.ano      || '',
      semestre: p.provas?.semestre || '',
      acertos:  p.score,
      total:    p.total
    })))
  }

  const handleSalvarPeriodo = async () => {
    setSalvandoPeriodo(true)
    const novoPeriodo = perfPeriodo || null
    const { error } = await supabase.auth.updateUser({ data: { periodo: novoPeriodo } })
    if (error) {
      setPeriodoMsgColor('#f87171')
      setPeriodoMsg('Erro ao salvar. Tente novamente.')
    } else {
      setPeriodoMsgColor('#4ade80')
      const label = novoPeriodo === 'internato' ? 'Internato'
        : novoPeriodo ? `${novoPeriodo}º Período` : 'não definido'
      setPeriodoMsg(`✓ Período salvo: ${label}`)
      setTimeout(() => setPeriodoMsg(''), 3500)
    }
    setSalvandoPeriodo(false)
  }

  const handleSair = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const irParaRevisao = (r: ReviewDue) => {
    const params = new URLSearchParams({
      materia:       r.materia,
      area:          r.area,
      dificuldade:   'all',
      quantFechadas: '10',
      quantAbertas:  '2',
    })
    router.push(`/simulado?${params.toString()}`)
  }

  // Chart data
  const labels  = graficoData.map(p => `${p.materia} ${p.ano}.${p.semestre}`)
  const valores  = graficoData.map(p => Math.round((p.acertos / p.total) * 100))
  const cores    = valores.map(v => v >= 70 ? '#4ade80' : v >= 50 ? '#38bdf8' : '#f87171')

  const chartData = {
    labels,
    datasets: [{
      label: '% de acertos',
      data: valores,
      backgroundColor: cores,
      borderRadius: 6,
      borderSkipped: false as const,
    }]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        min: 0, max: 100,
        ticks: { color: '#8899b0', callback: (val: string | number) => `${val}%` },
        grid: { color: 'rgba(56,189,248,0.06)' }
      },
      x: {
        ticks: { color: '#8899b0' },
        grid: { display: false }
      }
    }
  }

  return (
    <>
      <nav className="perfil-header-nav">
        <div className="container">
          <a href="/" className="logo">
            <span className="logo__icon">✦</span>
            <span className="logo__text">MedFlow.AI</span>
          </a>
          <button className="btn btn--outline" onClick={handleSair}>Sair</button>
        </div>
      </nav>

      <main className="perfil-main">

        {/* HERO PERFIL */}
        <div className="perfil-hero">
          <div className="perfil-avatar">{avatarLetra}</div>
          <div className="perfil-info">
            <div className="perfil-nome">{nome}</div>
            <div className="perfil-email">{email}</div>
          </div>
        </div>

        {/* STATS */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-valor">{statTotal}</span>
            <div className="stat-label">Questões respondidas</div>
          </div>
          <div className="stat-card">
            <span className="stat-valor accent">{statAcertos}</span>
            <div className="stat-label">Taxa de acertos</div>
          </div>
          <div className="stat-card">
            <span className="stat-valor">{statProvas}</span>
            <div className="stat-label">Provas realizadas</div>
          </div>
          <div className="stat-card">
            <span className="stat-valor">{statMaterias}</span>
            <div className="stat-label">Matérias estudadas</div>
          </div>
        </div>

        {/* ── REVISÃO DE HOJE (FSRS) ── */}
        <div className="perfil-card fsrs-card">
          <div className="perfil-card-label">
            <span>📅 Revisão de hoje</span>
            {reviewsDue.length > 0 && (
              <span className="fsrs-badge">{reviewsDue.length}</span>
            )}
          </div>

          {loadingReviews ? (
            <div className="loading-text">Carregando...</div>
          ) : reviewsDue.length === 0 ? (
            <div className="fsrs-empty">
              <span className="fsrs-empty-icon">✅</span>
              <div>
                <div className="fsrs-empty-title">Nada para revisar hoje!</div>
                <div className="fsrs-empty-sub">
                  Conclua simulados por área e avalie seu desempenho para criar cartões de revisão.
                </div>
              </div>
            </div>
          ) : (
            <div className="fsrs-list">
              {reviewsDue.map(r => (
                <div key={r.id} className="fsrs-item">
                  <div className="fsrs-item-info">
                    <div className="fsrs-item-area">{r.area || r.materia}</div>
                    <div className="fsrs-item-meta">
                      <span className="fsrs-item-materia">{r.materia}</span>
                      <span className="fsrs-item-estado">{labelEstado(r.state, r.reps)}</span>
                    </div>
                  </div>
                  <button
                    className="fsrs-revisar-btn"
                    onClick={() => irParaRevisao(r)}
                  >
                    Revisar →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* GRÁFICO */}
        <div className="perfil-card">
          <div className="perfil-card-label">Desempenho por matéria</div>
          <div className="chart-container">
            {graficoData.length > 0 ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <div className="loading-text">
                {loadingData ? 'Carregando...' : 'Nenhuma prova finalizada.'}
              </div>
            )}
          </div>
        </div>

        {/* HISTÓRICO */}
        <div className="perfil-card">
          <div className="perfil-card-label">Histórico de provas</div>
          {loadingData ? (
            <div className="loading-text">Carregando...</div>
          ) : historico.length === 0 ? (
            <div className="loading-text">Nenhuma prova realizada ainda.</div>
          ) : (
            historico.map(p => {
              const percent = p.total > 0 ? Math.round((p.score / p.total) * 100) : 0
              const cor = percent >= 70 ? '#4ade80' : percent >= 50 ? 'var(--blue-neon)' : '#f87171'
              const dataStr = new Date(p.created_at).toLocaleDateString('pt-BR')
              const mat = p.provas?.materia || 'Prova'
              const anoSem = p.provas ? `${p.provas.ano}.${p.provas.semestre}` : ''
              return (
                <div key={p.id} className="historico-item">
                  <div>
                    <div className="historico-materia">{mat} · {anoSem}</div>
                    <div className="historico-data">{dataStr} · {p.total} questões</div>
                  </div>
                  <div className="historico-score" style={{ color: cor }}>
                    {p.score}/{p.total}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* BARRAS POR MATÉRIA */}
        <div className="perfil-card">
          <div className="perfil-card-label">Acertos por matéria</div>
          {Object.keys(materiaMap).length === 0 ? (
            <div className="loading-text">
              {loadingData ? 'Carregando...' : 'Nenhuma prova finalizada.'}
            </div>
          ) : (
            Object.entries(materiaMap).map(([mat, dados]) => {
              const percent = dados.total > 0 ? Math.round((dados.score / dados.total) * 100) : 0
              const cor = percent >= 70 ? '#4ade80' : percent >= 50 ? '#38bdf8' : '#f87171'
              return (
                <div key={mat} className="materia-item">
                  <div className="materia-nome-perf">{mat}</div>
                  <div className="materia-barra-bg">
                    <div className="materia-barra-fill" style={{ width: `${percent}%`, background: cor }}></div>
                  </div>
                  <div className="materia-percent" style={{ color: cor }}>{percent}%</div>
                </div>
              )
            })
          )}
        </div>

        {/* CONFIGURAÇÕES */}
        <div className="perfil-card" id="config">
          <div className="perfil-card-label">Configurações do perfil</div>
          <div className="config-row">
            <label className="config-label" htmlFor="perfil-periodo">Período atual</label>
            <select
              id="perfil-periodo"
              className="config-select"
              value={perfPeriodo}
              onChange={e => setPerfPeriodo(e.target.value)}
            >
              <option value="">Não informado</option>
              <option value="1">1º Período</option>
              <option value="2">2º Período</option>
              <option value="3">3º Período</option>
              <option value="4">4º Período</option>
              <option value="5">5º Período</option>
              <option value="6">6º Período</option>
              <option value="7">7º Período</option>
              <option value="8">8º Período</option>
              <option value="internato">Internato</option>
            </select>
            <span className="config-hint">
              O site recomendará provas e matérias do seu período na página inicial.
            </span>
            <button
              className="btn btn--primary config-btn"
              onClick={handleSalvarPeriodo}
              disabled={salvandoPeriodo}
            >
              {salvandoPeriodo ? 'Salvando...' : 'Salvar'}
            </button>
            {periodoMsg && (
              <p className="config-msg" style={{ color: periodoMsgColor }}>{periodoMsg}</p>
            )}
          </div>
        </div>

      </main>
    </>
  )
}
