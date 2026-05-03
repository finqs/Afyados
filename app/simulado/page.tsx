'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { SimuladoQuestao } from '@/types'
import { submitReview, type ReviewInput } from '@/app/actions/review'

const NOTA_ABERTA_ACERTO = 75
const SENTINEL_ABERTA_SEM_NOTA = '__aberta_pendente__'
const MAX_RESPOSTA_ABERTA_LEN = 10_000

function SimuladoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const materia      = searchParams.get('materia') || ''
  const areas        = searchParams.getAll('area')         // múltiplos ?area=X&area=Y
  const subareas     = searchParams.getAll('subarea')      // múltiplos ?subarea=X&subarea=Y
  const dificuldade  = searchParams.get('dificuldade') || 'all'
  const quantFechadas = Math.min(Math.max(parseInt(searchParams.get('quantFechadas') || '8'), 0), 200)
  const quantAbertas  = Math.min(Math.max(parseInt(searchParams.get('quantAbertas')  || '0'), 0), 100)

  const tituloHeader = areas.length === 1 ? `${materia} · ${areas[0]}` : materia

  // ── Questões e navegação ──
  const [questoes, setQuestoes] = useState<SimuladoQuestao[]>([])
  const [questaoAtual, setQuestaoAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<number, string>>({})
  const [respostasTexto, setRespostasTexto] = useState<Record<number, string>>({})
  const [modoGabarito, setModoGabarito] = useState<'apos' | 'final'>('apos')

  // ── Timer ──
  const [usarTimer, setUsarTimer] = useState(false)
  const [timerValor, setTimerValor] = useState(60)
  const [tempoRestante, setTempoRestante] = useState(0)

  // ── Estado geral ──
  const [loading, setLoading] = useState(true)
  const [erroCarregar, setErroCarregar] = useState('')
  const [provaIniciada, setProvaIniciada] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  // ── Modais ──
  const [modalConfigOpen, setModalConfigOpen] = useState(true)
  const [modalResultadoOpen, setModalResultadoOpen] = useState(false)
  const [modalSairOpen, setModalSairOpen] = useState(false)

  // ── Resultado ──
  const [resultadoScore, setResultadoScore] = useState('0/0')
  const [resultadoPercent, setResultadoPercent] = useState('0%')
  const [resultadoMsg, setResultadoMsg] = useState('')
  const [resultadoItems, setResultadoItems] = useState<{ classe: string; num: number }[]>([])

  // ── Refs ──
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef  = useRef(true)
  const finalizarRef = useRef<() => Promise<void>>(async () => {})

  // ── FSRS: auto-avaliação após o simulado ──
  // Só aparece quando há pelo menos 1 área selecionada
  const fsrsAtivo = areas.length >= 1
  const [fsrsEnviando, setFsrsEnviando] = useState(false)
  const [fsrsDone, setFsrsDone]         = useState(false)
  const [fsrsDays, setFsrsDays]         = useState<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // ── Carregar questões ──
  const carregarQuestoes = useCallback(async () => {
    if (!materia) { setErroCarregar('Parâmetros inválidos.'); setLoading(false); return }
    if (quantFechadas + quantAbertas === 0) { setErroCarregar('Quantidade de questões inválida.'); setLoading(false); return }
    setLoading(true)

    let query = supabase.from('simulados_questoes').select('*').eq('materia', materia)
    if (areas.length > 0)    query = query.in('area', areas)
    if (subareas.length > 0) query = query.in('subarea', subareas)
    if (dificuldade !== 'all') query = query.eq('dificuldade', dificuldade)

    const { data, error } = await query

    if (!mountedRef.current) return
    if (error) { setErroCarregar('Erro ao carregar questões.'); setLoading(false); return }
    if (!data || data.length === 0) {
      setErroCarregar('Nenhuma questão disponível para esta seleção. Adicione questões no painel admin.')
      setLoading(false)
      return
    }

    // Separar por tipo, embaralhar cada pool e combinar
    const pool = [...data].sort(() => Math.random() - 0.5)
    const fechadas = pool.filter(q => q.tipo !== 'aberta').slice(0, quantFechadas)
    const abertas  = pool.filter(q => q.tipo === 'aberta').slice(0, quantAbertas)
    // Misturar a seleção final
    const combined = [...fechadas, ...abertas].sort(() => Math.random() - 0.5)
    setQuestoes(combined as SimuladoQuestao[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materia, dificuldade, quantFechadas, quantAbertas, areas.join(','), subareas.join(',')])

  useEffect(() => { carregarQuestoes() }, [carregarQuestoes])

  // ── Timer ──
  useEffect(() => {
    if (!provaIniciada || !usarTimer) return
    intervalRef.current = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          finalizarRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [provaIniciada, usarTimer])

  const formatTimer = () => {
    const min = Math.floor(tempoRestante / 60).toString().padStart(2, '0')
    const seg = (tempoRestante % 60).toString().padStart(2, '0')
    return `${min}:${seg}`
  }

  // ── Iniciar ──
  const iniciarProva = () => {
    setIniciando(true)
    if (usarTimer) setTempoRestante(timerValor * 60)
    setModalConfigOpen(false)
    setProvaIniciada(true)
    setIniciando(false)
  }

  // ── Finalizar ──
  const finalizarProva = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setFinalizando(true)

    const total = questoes.length
    const notaAberta = (v: string | undefined) => {
      if (!v || v === SENTINEL_ABERTA_SEM_NOTA) return 0
      const n = parseFloat(v); return isNaN(n) ? 0 : n
    }
    const acertos = questoes.filter((q, i) =>
      q.tipo === 'aberta'
        ? notaAberta(respostas[i]) >= NOTA_ABERTA_ACERTO
        : respostas[i] === q.gabarito
    ).length
    const percent = total > 0 ? Math.round((acertos / total) * 100) : 0

    if (!mountedRef.current) return

    setResultadoScore(`${acertos}/${total}`)
    setResultadoPercent(`${percent}%`)
    setResultadoMsg(
      percent >= 70 ? '🎉 Ótimo desempenho!' :
      percent >= 50 ? '📚 Continue estudando!' :
      '💪 Não desista, revise o conteúdo!'
    )
    setResultadoItems(questoes.map((q, i) => {
      let classe = 'resultado-item'
      const r = respostas[i]
      if (r === undefined) classe += ' pulou'
      else if (q.tipo === 'aberta') {
        const n = notaAberta(r)
        classe += n >= NOTA_ABERTA_ACERTO ? ' acerto' : n > 0 ? ' respondida' : ' erro'
      } else if (r === q.gabarito) classe += ' acerto'
      else classe += ' erro'
      return { classe, num: i + 1 }
    }))

    setFinalizando(false)
    setModalResultadoOpen(true)
  }, [questoes, respostas])

  useEffect(() => { finalizarRef.current = finalizarProva }, [finalizarProva])

  // ── Resposta ──
  const responder = (letra: string) => {
    if (respostas[questaoAtual] !== undefined) return
    setRespostas(prev => ({ ...prev, [questaoAtual]: letra }))
  }

  const verGabaritoAberta = () => {
    const texto = (textareaRef.current?.value.trim() ?? '').slice(0, MAX_RESPOSTA_ABERTA_LEN)
    setRespostasTexto(prev => ({ ...prev, [questaoAtual]: texto }))
    setRespostas(prev => ({ ...prev, [questaoAtual]: SENTINEL_ABERTA_SEM_NOTA }))
  }

  const notarAberta = (nota: string) => {
    setRespostas(prev => ({ ...prev, [questaoAtual]: nota }))
  }

  const confirmarSaida = () => {
    if (provaIniciada && Object.keys(respostas).length > 0) setModalSairOpen(true)
    else router.push('/')
  }

  const handleFsrsRate = async (rating: ReviewInput) => {
    if (fsrsEnviando || fsrsDone) return
    setFsrsEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setFsrsEnviando(false); return }
      const result = await submitReview(session.access_token, materia, areas[0], rating)
      if (result.ok) {
        setFsrsDays(result.daysUntil ?? null)
        setFsrsDone(true)
      }
    } finally {
      setFsrsEnviando(false)
    }
  }

  const percentual = questoes.length > 0 ? ((questaoAtual + 1) / questoes.length) * 100 : 0

  const getBubbleClass = (i: number) => {
    let cls = 'questao-bubble'
    if (i === questaoAtual) return cls + ' atual'
    const r = respostas[i]
    if (r !== undefined) {
      const q = questoes[i]
      if (q?.tipo === 'aberta') cls += r === SENTINEL_ABERTA_SEM_NOTA ? ' respondida' : ' acertou'
      else if (modoGabarito === 'apos') cls += r === q?.gabarito ? ' acertou' : ' errou'
      else cls += ' respondida'
    }
    return cls
  }

  // ── Render questão ──
  const renderQuestao = () => {
    if (!questoes.length || !provaIniciada) return null
    const q = questoes[questaoAtual]
    const respondida = respostas[questaoAtual] !== undefined
    const isAberta = q.tipo === 'aberta'

    if (isAberta) {
      if (!respondida) return (
        <>
          <textarea
            ref={textareaRef}
            className="resposta-aberta-input"
            placeholder="Digite sua resposta aqui..."
            rows={6}
            defaultValue={respostasTexto[questaoAtual] || ''}
          />
          <button className="btn-ver-gabarito" onClick={verGabaritoAberta}>Ver gabarito</button>
        </>
      )
      return (
        <>
          <div className="aberta-comparacao">
            <div className="aberta-col">
              <div className="aberta-col-label">Sua resposta</div>
              <div className="aberta-col-texto">{respostasTexto[questaoAtual] || ''}</div>
            </div>
            <div className="aberta-col">
              <div className="aberta-col-label">Gabarito esperado</div>
              <div className="aberta-col-texto">{q.gabarito}</div>
            </div>
          </div>
          {q.comentario && <div className="gabarito-box acerto"><div>{q.comentario}</div></div>}
          <div className="autoavaliacao">
            <div className="autoavaliacao-label">Quanto você acertou?</div>
            <div className="autoavaliacao-btns">
              {['25','50','75','100'].map(nota => (
                <button
                  key={nota}
                  className={`btn-nota${respostas[questaoAtual] === nota ? ' ativo' : ''}`}
                  onClick={() => notarAberta(nota)}
                >{nota}%</button>
              ))}
            </div>
          </div>
        </>
      )
    }

    const alternativas = [
      { letra: 'A', texto: q.alternativa_a },
      { letra: 'B', texto: q.alternativa_b },
      { letra: 'C', texto: q.alternativa_c },
      { letra: 'D', texto: q.alternativa_d },
      ...(q.alternativa_e ? [{ letra: 'E', texto: q.alternativa_e }] : []),
    ]

    return (
      <>
        <div className="alternativas-list">
          {alternativas.map(alt => {
            let cls = 'alternativa-btn'
            if (respondida) {
              if (alt.letra === q.gabarito) cls += ' correta'
              else if (alt.letra === respostas[questaoAtual]) cls += ' errada'
            }
            return (
              <button key={alt.letra} className={cls} disabled={respondida} onClick={() => responder(alt.letra)}>
                <span className="alternativa-letra">{alt.letra}</span>{alt.texto}
              </button>
            )
          })}
        </div>
        {respondida && modoGabarito === 'apos' && (() => {
          const acertou = respostas[questaoAtual] === q.gabarito
          return (
            <div className={`gabarito-box ${acertou ? 'acerto' : 'erro'}`}>
              <div className={`gabarito-resultado ${acertou ? 'acerto' : 'erro'}`}>
                {acertou ? '✓ Mandou bem!' : `✗ Resposta correta: ${q.gabarito}`}
              </div>
              {q.comentario && <div>{q.comentario}</div>}
            </div>
          )
        })()}
      </>
    )
  }

  return (
    <>
      {/* NAV */}
      <nav className="prova-nav">
        <button className="btn btn--ghost" onClick={confirmarSaida}>← Início</button>
        <div className="prova-nav-titulo">{tituloHeader}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="prova-nav-questao">
            Questão <span>{questaoAtual + 1}</span>/<span>{questoes.length || '?'}</span>
          </div>
          {provaIniciada && usarTimer && (
            <div className={`prova-timer${tempoRestante <= 300 ? ' urgente' : ''}`}>{formatTimer()}</div>
          )}
        </div>
      </nav>

      {/* PROGRESS */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: provaIniciada ? `${percentual}%` : '0%' }}></div>
      </div>

      {/* BUBBLES */}
      <div className="questao-nav-wrap">
        <div className="questao-nav">
          {questoes.map((_, i) => (
            <button key={i} className={getBubbleClass(i)} onClick={() => setQuestaoAtual(i)}>{i + 1}</button>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <main className="prova-main">
        <div className="prova-card">
          {loading && <div className="loading-text">Carregando questões...</div>}
          {erroCarregar && (
            <div style={{ textAlign: 'center' }}>
              <div className="loading-text">{erroCarregar}</div>
              <button className="btn btn--ghost" style={{ marginTop: '16px' }} onClick={() => router.push('/')}>← Voltar</button>
            </div>
          )}
          {!loading && !erroCarregar && provaIniciada && questoes.length > 0 && (
            <>
              <div className="questao-numero">QUESTÃO {questaoAtual + 1} DE {questoes.length}</div>
              <div className="questao-enunciado">{questoes[questaoAtual]?.enunciado}</div>
              {questoes[questaoAtual]?.tem_imagem && questoes[questaoAtual]?.imagem_descricao && (
                <div className="questao-imagem-callout">
                  <div className="questao-imagem-label">🖼️ Imagem da questão</div>
                  <div className="questao-imagem-desc">{questoes[questaoAtual].imagem_descricao}</div>
                </div>
              )}
              {renderQuestao()}
            </>
          )}
          {!loading && !erroCarregar && !provaIniciada && (
            <div className="loading-text">Configure e inicie o simulado.</div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="prova-footer">
        <button className="btn-nav" onClick={() => setQuestaoAtual(q => Math.max(0, q - 1))} disabled={questaoAtual === 0}>← Anterior</button>
        <button className="btn-finalizar" onClick={finalizarProva} disabled={finalizando}>
          {finalizando ? 'Finalizando...' : 'Finalizar Simulado'}
        </button>
        <button className="btn-nav" onClick={() => setQuestaoAtual(q => Math.min(questoes.length - 1, q + 1))} disabled={questaoAtual >= questoes.length - 1}>Próxima →</button>
      </footer>

      {/* MODAL CONFIG */}
      <div className={`modal-overlay${modalConfigOpen && !loading && !erroCarregar ? ' active' : ''}`}>
        <div className="modal">
          <div className="modal-title-bar">SIMULADO PERSONALIZADO</div>
          <div className="modal-subject">{tituloHeader}</div>
          {areas.length > 1 && (
            <div className="sim-tags-preview">
              {areas.map(a => <span key={a} className="sim-tag">{a}</span>)}
            </div>
          )}
          {subareas.length > 0 && (
            <div className="sim-tags-preview" style={{ marginTop: areas.length > 1 ? '4px' : 0 }}>
              {subareas.map(s => <span key={s} className="sim-tag" style={{ opacity: 0.7 }}>{s}</span>)}
            </div>
          )}
          <div className="config-opcoes">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '3px', color: 'var(--blue-neon)', marginBottom: '4px' }}>
              QUANDO MOSTRAR GABARITO?
            </div>
            <div className="config-grid">
              <button className={`config-btn${modoGabarito === 'apos' ? ' active' : ''}`} onClick={() => setModoGabarito('apos')}>
                <span>⚡</span>
                <div><div className="config-btn-title">Após responder</div><div className="config-btn-desc">Ver gabarito logo após cada questão</div></div>
              </button>
              <button className={`config-btn${modoGabarito === 'final' ? ' active' : ''}`} onClick={() => setModoGabarito('final')}>
                <span>🏁</span>
                <div><div className="config-btn-title">Apenas no final</div><div className="config-btn-desc">Ver resultado ao terminar</div></div>
              </button>
            </div>
            <div className="config-toggle-row">
              <div>
                <div className="config-toggle-label">Usar timer</div>
                <div className="config-toggle-desc">Tempo limitado</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={usarTimer} onChange={e => setUsarTimer(e.target.checked)} />
                <span className="toggle-slider"></span>
              </label>
            </div>
            {usarTimer && (
              <div>
                <div className="config-toggle-label" style={{ marginBottom: '8px', fontSize: '0.88rem' }}>Tempo total (minutos)</div>
                <div className="timer-slider-row">
                  <span>{timerValor}</span> min
                  <input type="range" min={10} max={180} value={timerValor} onChange={e => setTimerValor(parseInt(e.target.value))} />
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'center', marginTop: '12px' }}>
            {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'} selecionadas
          </p>
          <button
            className="btn btn--primary"
            style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
            onClick={iniciarProva}
            disabled={iniciando}
          >
            {iniciando ? 'Iniciando...' : 'INICIAR SIMULADO →'}
          </button>
        </div>
      </div>

      {/* MODAL SAÍDA */}
      <div role="dialog" aria-modal="true" className={`modal-overlay${modalSairOpen ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setModalSairOpen(false) }}>
        <div className="modal">
          <div className="modal-title-bar">SAIR DO SIMULADO?</div>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', textAlign: 'center', padding: '8px 0 16px' }}>
            Seu progresso será perdido.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn--ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setModalSairOpen(false)}>Cancelar</button>
            <button className="btn btn--primary" style={{ flex: 1, justifyContent: 'center', background: '#f87171' }} onClick={() => { setModalSairOpen(false); router.push('/') }}>Sair</button>
          </div>
        </div>
      </div>

      {/* MODAL RESULTADO */}
      <div className={`modal-overlay${modalResultadoOpen ? ' active' : ''}`}>
        <div className="modal">
          <div className="modal-title-bar">RESULTADO</div>
          <div className="resultado-score">{resultadoScore}</div>
          <div className="resultado-percent">{resultadoPercent}</div>
          <div className="resultado-msg">{resultadoMsg}</div>
          <div className="resultado-grid">
            {resultadoItems.map(item => <div key={item.num} className={item.classe}>{item.num}</div>)}
          </div>

          {/* ── FSRS: auto-avaliação do tema ── */}
          {fsrsAtivo && (
            <div className="fsrs-rating-box">
              {fsrsDone ? (
                <div className="fsrs-rating-done">
                  <span className="fsrs-rating-done-icon">✅</span>
                  <div>
                    <div className="fsrs-rating-done-title">Revisão agendada!</div>
                    <div className="fsrs-rating-done-sub">
                      {fsrsDays === 0
                        ? 'Próxima revisão: amanhã'
                        : `Próxima revisão: em ${fsrsDays} dia${fsrsDays === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="fsrs-rating-label">Como você se saiu neste tema?</div>
                  <div className="fsrs-rating-btns">
                    {([
                      { v: 0 as ReviewInput, l: 'Errei',   cls: 'fsrs-btn--again' },
                      { v: 1 as ReviewInput, l: 'Difícil', cls: 'fsrs-btn--hard'  },
                      { v: 2 as ReviewInput, l: 'Bom',     cls: 'fsrs-btn--good'  },
                      { v: 3 as ReviewInput, l: 'Fácil',   cls: 'fsrs-btn--easy'  },
                    ] as const).map(({ v, l, cls }) => (
                      <button
                        key={v}
                        className={`fsrs-btn ${cls}`}
                        onClick={() => handleFsrsRate(v)}
                        disabled={fsrsEnviando}
                      >{l}</button>
                    ))}
                  </div>
                  {fsrsEnviando && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: '6px' }}>
                      Salvando...
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <button className="btn btn--primary" style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }} onClick={() => router.push('/')}>
            ← Voltar ao início
          </button>
        </div>
      </div>
    </>
  )
}

export default function SimuladoPage() {
  return (
    <Suspense fallback={
      <main className="prova-main" style={{ paddingTop: '80px' }}>
        <div className="prova-card"><div className="loading-text">Carregando...</div></div>
      </main>
    }>
      <SimuladoContent />
    </Suspense>
  )
}
