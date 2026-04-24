'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Prova } from '@/types'

interface MateriaInfo {
  nome: string
  periodo: string
}

const PERIODOS = [
  { label: '1º Período', value: '1' },
  { label: '2º Período', value: '2' },
  { label: '3º Período', value: '3' },
  { label: '4º Período', value: '4' },
  { label: '5º Período', value: '5' },
  { label: '6º Período', value: '6' },
  { label: '7º Período', value: '7' },
  { label: '8º Período', value: '8' },
  { label: 'Internato', value: 'internato' },
]

function periodoLabel(periodo: string) {
  if (periodo === 'internato') return 'Internato'
  return `${periodo}º Período`
}

export default function HomePage() {
  const router = useRouter()
  const [session, setSession] = useState<{ user: { user_metadata?: { periodo?: string; nome?: string }; email?: string } } | null>(null)
  const [periodoAtivo, setPeriodoAtivo] = useState<string | null>(null)
  const [materias, setMaterias] = useState<MateriaInfo[]>([])
  const [loadingMaterias, setLoadingMaterias] = useState(false)
  const pillDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [userPeriodo, setUserPeriodo] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSubject, setModalSubject] = useState('')
  const [modalMateriaAtiva, setModalMateriaAtiva] = useState<MateriaInfo | null>(null)
  const [provasList, setProvasList] = useState<Prova[]>([])
  const [loadingProvas, setLoadingProvas] = useState(false)
  const [showProvasList, setShowProvasList] = useState(false)

  // Modal Sobre
  const [modalSobreOpen, setModalSobreOpen] = useState(false)

  // Header scroll effect
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Check session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s as typeof session)
      if (s?.user?.user_metadata?.periodo) {
        setUserPeriodo(s.user.user_metadata.periodo)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s as typeof session)
      if (s?.user?.user_metadata?.periodo) {
        setUserPeriodo(s.user.user_metadata.periodo)
      } else {
        setUserPeriodo(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Auto-activate user's period
  useEffect(() => {
    if (userPeriodo && periodoAtivo === null) {
      setPeriodoAtivo(userPeriodo)
      carregarMaterias(userPeriodo)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPeriodo])

  const carregarMaterias = useCallback(async (periodo: string) => {
    setLoadingMaterias(true)
    setMaterias([])
    const periodoNum = parseInt(periodo)
    const isInternato = isNaN(periodoNum)

    let query = supabase.from('provas').select('materia')
    if (isInternato) query = query.gte('periodo', 9)
    else query = query.eq('periodo', periodoNum)

    const { data, error } = await query

    if (error || !data || !data.length) {
      setLoadingMaterias(false)
      setMaterias([])
      return
    }

    const unique = Array.from(new Set(data.map((p: { materia: string }) => p.materia))).sort()
    setMaterias(unique.map(nome => ({ nome, periodo })))
    setLoadingMaterias(false)
  }, [])

  const handlePillClick = (periodo: string) => {
    if (pillDebounceRef.current) clearTimeout(pillDebounceRef.current)
    if (periodoAtivo === periodo) {
      setPeriodoAtivo(null)
      setMaterias([])
      return
    }
    setPeriodoAtivo(periodo)
    pillDebounceRef.current = setTimeout(() => carregarMaterias(periodo), 200)
  }

  const abrirModalMateria = (materia: MateriaInfo) => {
    setModalMateriaAtiva(materia)
    setModalSubject(materia.nome)
    setShowProvasList(false)
    setProvasList([])
    setModalOpen(true)
  }

  const fecharModal = () => {
    setModalOpen(false)
    setModalMateriaAtiva(null)
    setShowProvasList(false)
    setProvasList([])
  }

  const carregarProvas = async () => {
    if (!modalMateriaAtiva) return
    setLoadingProvas(true)

    const { nome, periodo } = modalMateriaAtiva
    const periodoNum = parseInt(periodo)

    let query = supabase.from('provas').select('*').eq('materia', nome).order('ano')
    if (!isNaN(periodoNum)) query = query.eq('periodo', periodoNum)

    const { data, error } = await query
    setLoadingProvas(false)

    if (error || !data || !data.length) {
      alert('Nenhuma prova disponível para esta matéria ainda.')
      return
    }

    if (data.length === 1) {
      const p = data[0] as Prova
      fecharModal()
      router.push(`/prova?prova_id=${p.id}&materia=${encodeURIComponent(p.materia)}&ano=${p.ano}&semestre=${p.semestre}`)
      return
    }

    setProvasList(data as Prova[])
    setShowProvasList(true)
  }

  const irParaProva = (p: Prova) => {
    fecharModal()
    router.push(`/prova?prova_id=${p.id}&materia=${encodeURIComponent(p.materia)}&ano=${p.ano}&semestre=${p.semestre}`)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUserPeriodo(null)
  }

  return (
    <>
      {/* HEADER */}
      <header className={`header${scrolled ? ' scrolled' : ''}`} id="header">
        <div className="container header__inner">
          <a href="#inicio" className="logo">
            <span className="logo__icon">✦</span>
            <span className="logo__text">MedFlow.AI</span>
          </a>
          <nav className={`nav${navOpen ? ' open' : ''}`} id="nav">
            <a href="#inicio" className="nav__link" onClick={() => setNavOpen(false)}>Início</a>
            <a href="#conteudo" className="nav__link" onClick={() => setNavOpen(false)}>Recursos</a>
            <a href="#periodos" className="nav__link" onClick={() => setNavOpen(false)}>Períodos</a>
          </nav>
          <div className="header__actions">
            {session && (
              <button className="btn btn--ghost" onClick={() => router.push('/perfil')}>
                Perfil
              </button>
            )}
            {session ? (
              <button className="btn btn--outline" onClick={handleSignOut}>
                Sair
              </button>
            ) : (
              <button className="btn btn--outline" onClick={() => router.push('/login')}>
                Login
              </button>
            )}
          </div>
          <button
            className="menu-toggle"
            id="menuToggle"
            aria-label="Abrir menu"
            onClick={() => setNavOpen(v => !v)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="hero" id="inicio">
        <div className="hero__bg-grid"></div>
        <div className="hero__orb hero__orb--1"></div>
        <div className="hero__orb hero__orb--2"></div>
        <div className="container hero__inner">
          <div className="hero__content hero__text">
            <div className="hero__badge">
              <span className="hero__badge-dot"></span>
              Medicina · PBL · Questões
            </div>
            <h1 className="hero__title">
              Seu ambiente completo<br />
              de <span className="hero__highlight">estudo em medicina</span>
            </h1>
            <p className="hero__subtitle">
              Organize seus estudos, resolva questões, crie simulados personalizados
              e utilize IA quando quiser. Tudo gratuito.
            </p>
            <div className="hero__actions">
              <a href="#periodos" className="btn btn--primary">Começar a estudar</a>
              <button className="btn btn--ghost" onClick={() => setModalSobreOpen(true)}>Saiba mais →</button>
            </div>
            <div className="hero__stats">
              <div className="stat">
                <span className="stat__number">8+</span>
                <span className="stat__label">Períodos</span>
              </div>
              <div className="stat__divider"></div>
              <div className="stat">
                <span className="stat__number">+500</span>
                <span className="stat__label">Questões</span>
              </div>
              <div className="stat__divider"></div>
              <div className="stat">
                <span className="stat__number">100%</span>
                <span className="stat__label">Gratuito</span>
              </div>
            </div>
          </div>

          <div className="hero__card-wrap">
            <div className="hero__card">
              <div className="hero__card-header">
                <span className="hero__card-dot"></span>
                <span className="hero__card-dot"></span>
                <span className="hero__card-dot"></span>
                <span className="hero__card-title">MedFlow.AI</span>
              </div>
              <ul className="hero__card-list">
                <li className="hero__card-item">
                  <span className="hero__card-icon">📄</span>
                  <div>
                    <strong>Provas antigas</strong>
                    <p>Organizadas por matéria e período</p>
                  </div>
                  <span className="hero__card-check">✓</span>
                </li>
                <li className="hero__card-item">
                  <span className="hero__card-icon">📝</span>
                  <div>
                    <strong>Simulados personalizados</strong>
                    <p>Fácil, médio e difícil</p>
                  </div>
                  <span className="hero__card-check">✓</span>
                </li>
                <li className="hero__card-item">
                  <span className="hero__card-icon">📊</span>
                  <div>
                    <strong>Desempenho detalhado</strong>
                    <p>Acompanhe sua evolução</p>
                  </div>
                  <span className="hero__card-check">✓</span>
                </li>
                <li className="hero__card-item">
                  <span className="hero__card-icon">🤖</span>
                  <div>
                    <strong>Diagnóstico por IA</strong>
                    <p>Identifica seus pontos fracos</p>
                  </div>
                  <span className="hero__card-check">✓</span>
                </li>
              </ul>
            </div>
            <div className="hero__floating-tag">
              <span className="hero__floating-icon">💡</span>
              &ldquo;De estudante para estudantes&rdquo;
            </div>
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section className="content-section" id="conteudo">
        <div className="container">
          <div className="section-label">O que você encontra</div>
          <h2 className="section-title">Três pilares do <em>seu estudo</em></h2>
          <p className="section-subtitle">
            Cada recurso foi pensado para cobrir uma etapa diferente do processo de aprendizado.
          </p>
          <div className="content-cards">
            <div className="content-card" onClick={() => document.getElementById('periodos')?.scrollIntoView({ behavior: 'smooth' })}>
              <div className="content-card__icon">📄</div>
              <h3 className="content-card__title">Provas antigas</h3>
              <p className="content-card__desc">
                Acesse provas anteriores organizadas por período e matéria.
                Gabarito comentado e timer incluídos.
              </p>
              <div className="content-card__tags">
                <span>SOI</span><span>HAM</span><span>IESC</span><span>+mais</span>
              </div>
              <a href="#periodos" className="content-card__link">Explorar provas →</a>
            </div>
            <div className="content-card content-card--featured" onClick={() => alert('🚧 Simulados personalizados em breve!')}>
              <div className="content-card__badge">Em breve</div>
              <div className="content-card__icon">📝</div>
              <h3 className="content-card__title">Simulados personalizados</h3>
              <p className="content-card__desc">
                Monte do seu jeito — escolha matérias, quantidade de questões
                e nível de dificuldade.
              </p>
              <div className="content-card__tags">
                <span>Fácil</span><span>Médio</span><span>Difícil</span>
              </div>
              <span className="content-card__link">Em breve →</span>
            </div>
            <div className="content-card">
              <div className="content-card__icon">🤖</div>
              <h3 className="content-card__title">Análise por IA</h3>
              <p className="content-card__desc">
                IA que analisa seu desempenho e identifica pontos fracos,
                sugerindo o que estudar a seguir.
              </p>
              <div className="content-card__tags">
                <span>Diagnóstico</span><span>Recomendações</span>
              </div>
              <span className="content-card__link">Em breve →</span>
            </div>
          </div>
        </div>
      </section>

      {/* PERÍODOS */}
      <section className="periods" id="periodos">
        <div className="periods__bg-glow"></div>
        <div className="container">
          <div className="section-label">Conteúdo por período</div>
          <h2 className="section-title">Selecione seu <em>período</em></h2>
          <p className="section-subtitle">
            Clique em um período para visualizar todas as matérias disponíveis.
          </p>

          {userPeriodo && (
            <div className="periodo-rec" aria-live="polite">
              <span className="periodo-rec__icon">🎯</span>
              <div className="periodo-rec__body">
                <div className="periodo-rec__title">Recomendado para você</div>
                <div className="periodo-rec__label">
                  Mostrando matérias do {periodoLabel(userPeriodo)}
                </div>
              </div>
              <a href="/perfil#config" className="periodo-rec__link">Alterar →</a>
            </div>
          )}

          <div className="periods__tabs" id="pills-periodos">
            {PERIODOS.map(p => {
              const isActive = periodoAtivo === p.value
              const isRecommended = userPeriodo === p.value
              let cls = 'period-tab'
              if (isActive) cls += ' active'
              if (isRecommended) cls += ' period-tab--recommended'
              return (
                <button
                  key={p.value}
                  className={cls}
                  data-periodo={p.value}
                  onClick={() => handlePillClick(p.value)}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          <div className="periods__content" id="materias-grid">
            {loadingMaterias && (
              <div className="loading-text">Carregando matérias...</div>
            )}
            {!loadingMaterias && periodoAtivo && materias.length === 0 && (
              <div className="loading-text">Nenhuma matéria disponível para este período.</div>
            )}
            {materias.map(mat => (
              <div
                key={mat.nome}
                className="materia-card"
                onClick={() => abrirModalMateria(mat)}
              >
                <div className="materia-icon">📚</div>
                <div className="materia-nome">{mat.nome}</div>
                <div className="materia-info">Provas disponíveis</div>
                <button className="btn-acessar">
                  <span>Acessar</span><span>→</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="cta__orb"></div>
        <div className="container cta__inner">
          <div className="cta__label">Comece agora</div>
          <h2 className="cta__title">
            Estude de forma<br /><span className="cta__highlight">inteligente.</span>
          </h2>
          <p className="cta__subtitle">
            Cada período da sua graduação, coberto com qualidade e clareza.
          </p>
          <a href="#periodos" className="btn btn--primary btn--large">Explorar conteúdos</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container footer__inner">
          <div className="footer__brand">
            <a href="#inicio" className="logo">
              <span className="logo__icon">✦</span>
              <span className="logo__text">MedFlow.AI</span>
            </a>
            <p>Plataforma gratuita de estudo em medicina.<br />Feito por estudantes, para estudantes.</p>
          </div>
          <div className="footer__links">
            <div className="footer__col">
              <span className="footer__col-title">Navegação</span>
              <a href="#inicio">Início</a>
              <a href="#conteudo">Recursos</a>
              <a href="#periodos">Períodos</a>
            </div>
            <div className="footer__col">
              <span className="footer__col-title">Plataforma</span>
              <a onClick={() => setModalSobreOpen(true)}>Sobre</a>
              <a href="mailto:filipenqs@hotmail.com">Contato</a>
            </div>
          </div>
        </div>
        <div className="footer__bottom">
          <div className="container">
            <p>© 2025 MedFlow.AI · Plataforma acadêmica de medicina.</p>
          </div>
        </div>
      </footer>

      {/* MODAL SOBRE */}
      <div role="dialog" aria-modal="true" aria-label="Sobre o projeto" className={`modal-overlay${modalSobreOpen ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setModalSobreOpen(false) }}>
        <div className="modal">
          <button className="modal-close" aria-label="Fechar" onClick={() => setModalSobreOpen(false)}>×</button>
          <div className="modal-title-bar">SOBRE O PROJETO</div>
          <p className="sobre-text">
            O <strong>MedFlow.AI</strong> é uma plataforma criada por estudantes de medicina para estudantes de medicina.
            O objetivo é centralizar provas antigas, simulados personalizados e materiais de estudo —
            tudo em um só lugar, de forma gratuita.
          </p>
          <div className="features-grid">
            <div className="feature-item"><span className="feature-icon">📄</span><span>Provas organizadas por matéria e período</span></div>
            <div className="feature-item"><span className="feature-icon">📝</span><span>Simulados com níveis fácil, médio e difícil</span></div>
            <div className="feature-item"><span className="feature-icon">📊</span><span>Acompanhamento do seu desempenho</span></div>
            <div className="feature-item"><span className="feature-icon">🤖</span><span>IA que identifica seus pontos fracos</span></div>
          </div>
        </div>
      </div>

      {/* MODAL PAINEL */}
      <div role="dialog" aria-modal="true" aria-label={`Painel - ${modalSubject}`} className={`modal-overlay${modalOpen ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) fecharModal() }}>
        <div className="modal">
          <button className="modal-close" aria-label="Fechar" onClick={fecharModal}>×</button>
          <div className="modal-title-bar">PAINEL DE CONTROLE</div>
          <div className="modal-subject">{modalSubject}</div>
          {!showProvasList ? (
            <div className="modal-actions">
              <button
                className="modal-btn modal-btn-primary"
                onClick={carregarProvas}
                disabled={loadingProvas}
              >
                <span className="modal-btn-icon">📄</span>
                <div>
                  <div className="modal-btn-title">{loadingProvas ? 'Carregando...' : 'Provas Antigas'}</div>
                  <div className="modal-btn-desc">Acesse as provas anteriores</div>
                </div>
              </button>
              <button className="modal-btn modal-btn-secondary">
                <span className="modal-btn-icon">📝</span>
                <div>
                  <div className="modal-btn-title">Simulados</div>
                  <div className="modal-btn-desc">Em breve</div>
                </div>
              </button>
              <button className="modal-btn modal-btn-disabled">
                <span className="modal-btn-icon">📊</span>
                <div>
                  <div className="modal-btn-title">Desempenho</div>
                  <div className="modal-btn-desc">Em breve</div>
                </div>
              </button>
              <button className="modal-btn modal-btn-disabled">
                <span className="modal-btn-icon">🤖</span>
                <div>
                  <div className="modal-btn-title">Análise por IA</div>
                  <div className="modal-btn-desc">Em breve</div>
                </div>
              </button>
            </div>
          ) : (
            <div className="modal-actions">
              <div style={{ gridColumn: '1/-1', fontSize: '0.82rem', color: 'var(--muted)', textAlign: 'center', marginBottom: '4px' }}>
                Escolha a prova:
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {provasList.map(p => (
                  <button
                    key={p.id}
                    className="btn btn--primary"
                    style={{ justifyContent: 'center' }}
                    onClick={() => irParaProva(p)}
                  >
                    {p.materia} · {p.ano}.{p.semestre}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="modal-footer">MEDFLOW.AI V1.0</div>
        </div>
      </div>
    </>
  )
}
