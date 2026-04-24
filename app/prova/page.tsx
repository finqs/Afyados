'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Questao } from '@/types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ProvaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const provaId = searchParams.get('prova_id')
  const materia = searchParams.get('materia') || 'Prova'
  const ano = searchParams.get('ano') || ''
  const semestre = searchParams.get('semestre') || ''

  const titulo = `${materia} · ${ano}.${semestre}`

  // UUID validation
  const isValidId = provaId && UUID_REGEX.test(provaId)

  // State
  const [questoes, setQuestoes] = useState<Questao[]>([])
  const [questaoAtual, setQuestaoAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<number, string>>({})
  const [respostasTexto, setRespostasTexto] = useState<Record<number, string>>({})
  const [modoGabarito, setModoGabarito] = useState<'apos' | 'final'>('apos')
  const [usarTimer, setUsarTimer] = useState(true)
  const [tempoTotal, setTempoTotal] = useState(100 * 60)
  const [tempoRestante, setTempoRestante] = useState(0)
  const [provaIniciada, setProvaIniciada] = useState(false)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [timerValor, setTimerValor] = useState(100)
  const [loading, setLoading] = useState(true)
  const [erroCarregar, setErroCarregar] = useState(false)

  // Modal state
  const [modalConfigOpen, setModalConfigOpen] = useState(true)
  const [modalResultadoOpen, setModalResultadoOpen] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  // Result state
  const [resultadoScore, setResultadoScore] = useState('0/0')
  const [resultadoPercent, setResultadoPercent] = useState('0%')
  const [resultadoMsg, setResultadoMsg] = useState('')
  const [resultadoItems, setResultadoItems] = useState<{ classe: string; num: number }[]>([])

  // Textarea ref for open questions
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  const carregarQuestoes = useCallback(async () => {
    if (!provaId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('questoes')
      .select('*')
      .eq('prova_id', provaId)
      .order('numero')

    if (error || !data || !data.length) {
      setErroCarregar(true)
      setLoading(false)
      return
    }
    setQuestoes(data as Questao[])
    setLoading(false)
  }, [provaId])

  useEffect(() => {
    if (isValidId) {
      carregarQuestoes()
    } else {
      setLoading(false)
      setErroCarregar(true)
    }
  }, [isValidId, carregarQuestoes])

  // Timer
  useEffect(() => {
    if (!provaIniciada || !usarTimer) return
    intervalRef.current = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          finalizarProva()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provaIniciada, usarTimer])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const formatTimer = () => {
    const min = Math.floor(tempoRestante / 60).toString().padStart(2, '0')
    const seg = (tempoRestante % 60).toString().padStart(2, '0')
    return `${min}:${seg}`
  }

  const percentual = questoes.length > 0 ? ((questaoAtual + 1) / questoes.length) * 100 : 0

  const iniciarProva = async () => {
    setIniciando(true)
    const tt = timerValor * 60
    setTempoTotal(tt)
    setTempoRestante(tt)

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: attempt, error } = await supabase.from('exam_attempts').insert({
        user_id: session.user.id,
        prova_id: provaId,
        modo: modoGabarito,
        total: questoes.length
      }).select().single()
      if (!error && attempt) setAttemptId(attempt.id)
    }

    setModalConfigOpen(false)
    setProvaIniciada(true)
    setIniciando(false)
  }

  const salvarResposta = async (questaoId: string, resposta: string, acertou: boolean | number) => {
    if (!attemptId) return
    await supabase.from('attempt_answers').insert({
      attempt_id: attemptId,
      questao_id: questaoId,
      resposta,
      acertou
    })
  }

  const responder = (letra: string) => {
    if (respostas[questaoAtual] !== undefined) return
    const novas = { ...respostas, [questaoAtual]: letra }
    setRespostas(novas)
    const q = questoes[questaoAtual]
    salvarResposta(q.id, letra, letra === q.gabarito)
  }

  const verGabaritoAberta = () => {
    const texto = textareaRef.current?.value.trim() ?? ''
    setRespostasTexto(prev => ({ ...prev, [questaoAtual]: texto }))
    setRespostas(prev => ({ ...prev, [questaoAtual]: '0' }))
  }

  const notarAberta = (nota: string) => {
    setRespostas(prev => ({ ...prev, [questaoAtual]: nota }))
    const q = questoes[questaoAtual]
    salvarResposta(q.id, nota, parseFloat(nota) / 100)
  }

  const finalizarProva = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setFinalizando(true)

    const total = questoes.length
    const acertos = questoes.filter((q, i) => {
      if (q.tipo === 'aberta') {
        const nota = parseFloat(respostas[i]) || 0
        return nota >= 100
      }
      return respostas[i] === q.gabarito
    }).length
    const percent = total > 0 ? Math.round((acertos / total) * 100) : 0

    if (attemptId) {
      await supabase.from('exam_attempts').update({
        finalizada: true,
        score: acertos
      }).eq('id', attemptId)
    }

    if (!mountedRef.current) return  // component unmounted, skip state updates

    setResultadoScore(`${acertos}/${total}`)
    setResultadoPercent(`${percent}%`)
    setResultadoMsg(
      percent >= 70 ? '🎉 Ótimo desempenho!' :
      percent >= 50 ? '📚 Continue estudando!' :
      '💪 Não desista, revise o conteúdo!'
    )
    setResultadoItems(questoes.map((q, i) => {
      let classe = 'resultado-item'
      if (respostas[i] === undefined) classe += ' pulou'
      else if (q.tipo === 'aberta') {
        const nota = parseFloat(respostas[i]) || 0
        classe += nota >= 75 ? ' acerto' : nota > 0 ? ' respondida' : ' erro'
      } else if (respostas[i] === q.gabarito) classe += ' acerto'
      else classe += ' erro'
      return { classe, num: i + 1 }
    }))

    setFinalizando(false)
    setModalResultadoOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questoes, respostas, attemptId])

  const confirmarSaida = () => {
    if (provaIniciada && Object.keys(respostas).length > 0) {
      if (confirm('Deseja sair? Seu progresso será perdido.')) {
        router.push('/')
      }
    } else {
      router.push('/')
    }
  }

  const getBubbleClass = (i: number) => {
    let cls = 'questao-bubble'
    if (i === questaoAtual) return cls + ' atual'
    if (respostas[i] !== undefined) {
      const q = questoes[i]
      if (q?.tipo === 'aberta') {
        cls += respostas[i] === '0' ? ' respondida' : ' acertou'
      } else if (modoGabarito === 'apos') {
        cls += respostas[i] === q?.gabarito ? ' acertou' : ' errou'
      } else {
        cls += ' respondida'
      }
    }
    return cls
  }

  // Current question render
  const renderQuestao = () => {
    if (!questoes.length || !provaIniciada) return null
    const q = questoes[questaoAtual]
    const respondida = respostas[questaoAtual] !== undefined
    const isAberta = q.tipo === 'aberta'

    if (isAberta) {
      if (!respondida) {
        return (
          <>
            <textarea
              ref={textareaRef}
              className="resposta-aberta-input"
              placeholder="Digite sua resposta aqui..."
              rows={6}
              defaultValue={respostasTexto[questaoAtual] || ''}
            />
            <button className="btn-ver-gabarito" onClick={verGabaritoAberta}>
              Ver gabarito
            </button>
          </>
        )
      }
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
          {q.comentario && (
            <div className="gabarito-box acerto">
              <div>{q.comentario}</div>
            </div>
          )}
          <div className="autoavaliacao">
            <div className="autoavaliacao-label">Quanto você acertou?</div>
            <div className="autoavaliacao-btns">
              {['25', '50', '75', '100'].map(nota => (
                <button
                  key={nota}
                  className={`btn-nota${respostas[questaoAtual] === nota ? ' ativo' : ''}`}
                  onClick={() => notarAberta(nota)}
                >
                  {nota}%
                </button>
              ))}
            </div>
          </div>
        </>
      )
    }

    // Multiple choice
    const alternativas = [
      { letra: 'A', texto: q.alternativa_a },
      { letra: 'B', texto: q.alternativa_b },
      { letra: 'C', texto: q.alternativa_c },
      { letra: 'D', texto: q.alternativa_d },
      ...(q.alternativa_e ? [{ letra: 'E', texto: q.alternativa_e }] : []),
    ]

    const gabaritoHTML = respondida && modoGabarito === 'apos' ? (() => {
      const acertou = respostas[questaoAtual] === q.gabarito
      return (
        <div className={`gabarito-box ${acertou ? 'acerto' : 'erro'}`}>
          <div className={`gabarito-resultado ${acertou ? 'acerto' : 'erro'}`}>
            {acertou ? '✓ Mandou bem!' : `✗ Resposta correta: ${q.gabarito}`}
          </div>
          {q.comentario && <div>{q.comentario}</div>}
        </div>
      )
    })() : null

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
              <button
                key={alt.letra}
                className={cls}
                disabled={respondida}
                onClick={() => responder(alt.letra)}
              >
                <span className="alternativa-letra">{alt.letra}</span>
                {alt.texto}
              </button>
            )
          })}
        </div>
        {gabaritoHTML}
      </>
    )
  }

  if (!isValidId) {
    return (
      <main className="prova-main" style={{ paddingTop: '80px' }}>
        <div className="prova-card">
          <div className="loading-text">Prova não encontrada.</div>
        </div>
      </main>
    )
  }

  return (
    <>
      {/* NAVBAR */}
      <nav className="prova-nav">
        <button className="btn btn--ghost" onClick={confirmarSaida}>← Início</button>
        <div className="prova-nav-titulo">{titulo}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="prova-nav-questao">
            Questão <span>{questaoAtual + 1}</span>/<span>{questoes.length || '?'}</span>
          </div>
          {provaIniciada && usarTimer && (
            <div className={`prova-timer${tempoRestante <= 300 ? ' urgente' : ''}`}>
              {formatTimer()}
            </div>
          )}
        </div>
      </nav>

      {/* PROGRESS BAR */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: provaIniciada ? `${percentual}%` : '0%' }}></div>
      </div>

      {/* BUBBLES */}
      <div className="questao-nav-wrap">
        <div className="questao-nav">
          {questoes.map((_, i) => (
            <button
              key={i}
              className={getBubbleClass(i)}
              onClick={() => { setQuestaoAtual(i) }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <main className="prova-main">
        <div className="prova-card">
          {loading && <div className="loading-text">Carregando prova...</div>}
          {erroCarregar && <div className="loading-text">Erro ao carregar questões.</div>}
          {!loading && !erroCarregar && provaIniciada && questoes.length > 0 && (
            <>
              <div className="questao-numero">
                QUESTÃO {questaoAtual + 1} DE {questoes.length}
              </div>
              <div className="questao-enunciado">{questoes[questaoAtual]?.enunciado}</div>
              {renderQuestao()}
            </>
          )}
          {!loading && !erroCarregar && !provaIniciada && (
            <div className="loading-text">Configure e inicie a prova.</div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="prova-footer">
        <button
          className="btn-nav"
          onClick={() => { if (questaoAtual > 0) setQuestaoAtual(q => q - 1) }}
          disabled={questaoAtual === 0}
        >
          ← Anterior
        </button>
        <button
          className="btn-finalizar"
          onClick={finalizarProva}
          disabled={finalizando}
        >
          {finalizando ? 'Finalizando...' : 'Finalizar Prova'}
        </button>
        <button
          className="btn-nav"
          onClick={() => { if (questaoAtual < questoes.length - 1) setQuestaoAtual(q => q + 1) }}
          disabled={questaoAtual >= questoes.length - 1}
        >
          Próxima →
        </button>
      </footer>

      {/* MODAL CONFIG */}
      <div className={`modal-overlay${modalConfigOpen ? ' active' : ''}`}>
        <div className="modal">
          <div className="modal-title-bar">CONFIGURAR PROVA</div>
          <div className="modal-subject">{titulo}</div>
          <div className="config-opcoes">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '3px', color: 'var(--blue-neon)', marginBottom: '4px' }}>
              QUANDO MOSTRAR GABARITO?
            </div>
            <div className="config-grid">
              <button
                className={`config-btn${modoGabarito === 'apos' ? ' active' : ''}`}
                onClick={() => setModoGabarito('apos')}
              >
                <span>⚡</span>
                <div>
                  <div className="config-btn-title">Após responder</div>
                  <div className="config-btn-desc">Ver gabarito logo após cada questão</div>
                </div>
              </button>
              <button
                className={`config-btn${modoGabarito === 'final' ? ' active' : ''}`}
                onClick={() => setModoGabarito('final')}
              >
                <span>🏁</span>
                <div>
                  <div className="config-btn-title">Apenas no final</div>
                  <div className="config-btn-desc">Ver resultado ao terminar</div>
                </div>
              </button>
            </div>
            <div className="config-toggle-row">
              <div>
                <div className="config-toggle-label">Usar timer</div>
                <div className="config-toggle-desc">Tempo limitado por questão</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={usarTimer}
                  onChange={e => setUsarTimer(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            {usarTimer && (
              <div>
                <div className="config-toggle-label" style={{ marginBottom: '8px', fontSize: '0.88rem' }}>
                  Tempo total (minutos)
                </div>
                <div className="timer-slider-row">
                  <span>{timerValor}</span> min
                  <input
                    type="range"
                    min={10}
                    max={180}
                    value={timerValor}
                    onChange={e => setTimerValor(parseInt(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
          <button
            className="btn btn--primary"
            style={{ marginTop: '24px', width: '100%', justifyContent: 'center' }}
            onClick={iniciarProva}
            disabled={iniciando || loading}
          >
            {iniciando ? 'Iniciando...' : 'INICIAR PROVA →'}
          </button>
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
            {resultadoItems.map(item => (
              <div key={item.num} className={item.classe}>{item.num}</div>
            ))}
          </div>
          <button
            className="btn btn--primary"
            style={{ marginTop: '24px', width: '100%', justifyContent: 'center' }}
            onClick={() => router.push('/')}
          >
            ← Voltar ao início
          </button>
        </div>
      </div>
    </>
  )
}

export default function ProvaPage() {
  return (
    <Suspense fallback={
      <main className="prova-main" style={{ paddingTop: '80px' }}>
        <div className="prova-card">
          <div className="loading-text">Carregando...</div>
        </div>
      </main>
    }>
      <ProvaContent />
    </Suspense>
  )
}
