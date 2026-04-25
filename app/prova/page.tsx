'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Questao } from '@/types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Threshold unificado para questões abertas: >= 75% = acerto
const NOTA_ABERTA_ACERTO = 75
const MAX_RESPOSTA_ABERTA_LEN = 10_000
// Sentinela para "viu gabarito mas ainda não auto-avaliou"
const SENTINEL_ABERTA_SEM_NOTA = '__aberta_pendente__'

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
  // Ref para sempre chamar a versão mais atual de finalizarProva (evita closure obsoleta no timer)
  const finalizarProvaRef = useRef<() => Promise<void>>(async () => {})

  // Modal de confirmação de saída
  const [modalSairOpen, setModalSairOpen] = useState(false)
  // Erro de inicialização
  const [erroInicio, setErroInicio] = useState('')

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

  // Timer — usa finalizarProvaRef para sempre pegar o estado atual
  useEffect(() => {
    if (!provaIniciada || !usarTimer) return
    intervalRef.current = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          finalizarProvaRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
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
    setErroInicio('')
    const tt = timerValor * 60
    setTempoTotal(tt)
    setTempoRestante(tt)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErroInicio('Você precisa estar logado para iniciar uma prova.')
      setIniciando(false)
      return
    }

    const { data: attempt, error } = await supabase.from('exam_attempts').insert({
      user_id: session.user.id,
      prova_id: provaId,
      modo: modoGabarito,
      total: questoes.length
    }).select().single()

    if (!mountedRef.current) return

    if (error || !attempt) {
      setErroInicio('Erro ao iniciar: ' + (error?.message || 'não foi possível criar a tentativa.'))
      setIniciando(false)
      return
    }

    setAttemptId(attempt.id)
    setModalConfigOpen(false)
    setProvaIniciada(true)
    setIniciando(false)
  }

  const salvarResposta = async (questaoId: string, resposta: string, acertou: boolean | number) => {
    if (!attemptId) return
    // Upsert evita duplicatas se o usuário rever gabarito múltiplas vezes (Codex #3)
    const { error } = await supabase.from('attempt_answers').upsert({
      attempt_id: attemptId,
      questao_id: questaoId,
      resposta,
      acertou
    }, { onConflict: 'attempt_id,questao_id' })
    if (error) {
      console.error('Falha ao salvar resposta:', error.message)
    }
  }

  const responder = (letra: string) => {
    if (respostas[questaoAtual] !== undefined) return
    const novas = { ...respostas, [questaoAtual]: letra }
    setRespostas(novas)
    const q = questoes[questaoAtual]
    salvarResposta(q.id, letra, letra === q.gabarito)
  }

  const verGabaritoAberta = () => {
    let texto = textareaRef.current?.value.trim() ?? ''
    if (texto.length > MAX_RESPOSTA_ABERTA_LEN) {
      texto = texto.slice(0, MAX_RESPOSTA_ABERTA_LEN)
    }
    setRespostasTexto(prev => ({ ...prev, [questaoAtual]: texto }))
    setRespostas(prev => ({ ...prev, [questaoAtual]: SENTINEL_ABERTA_SEM_NOTA }))
  }

  const notarAberta = (nota: string) => {
    setRespostas(prev => ({ ...prev, [questaoAtual]: nota }))
    const q = questoes[questaoAtual]
    const texto = respostasTexto[questaoAtual] ?? ''
    // Persistir resposta textual + nota auto-avaliada
    salvarResposta(q.id, `${nota}|${texto}`, parseFloat(nota) / 100)
  }

  const finalizarProva = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setFinalizando(true)

    const total = questoes.length
    const notaAberta = (v: string | undefined) => {
      if (!v || v === SENTINEL_ABERTA_SEM_NOTA) return 0
      const num = parseFloat(v)
      return isNaN(num) ? 0 : num
    }
    const acertos = questoes.filter((q, i) => {
      if (q.tipo === 'aberta') return notaAberta(respostas[i]) >= NOTA_ABERTA_ACERTO
      return respostas[i] === q.gabarito
    }).length
    const percent = total > 0 ? Math.round((acertos / total) * 100) : 0

    if (attemptId) {
      const { error } = await supabase.from('exam_attempts').update({
        finalizada: true,
        score: acertos
      }).eq('id', attemptId)
      if (error) console.error('Falha ao finalizar tentativa:', error.message)
    }

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
        const nota = notaAberta(r)
        classe += nota >= NOTA_ABERTA_ACERTO ? ' acerto' : nota > 0 ? ' respondida' : ' erro'
      } else if (r === q.gabarito) classe += ' acerto'
      else classe += ' erro'
      return { classe, num: i + 1 }
    }))

    setFinalizando(false)
    setModalResultadoOpen(true)
  }, [questoes, respostas, attemptId])

  // Mantém a ref sempre com a versão atual para o timer
  useEffect(() => {
    finalizarProvaRef.current = finalizarProva
  }, [finalizarProva])

  const confirmarSaida = () => {
    if (provaIniciada && Object.keys(respostas).length > 0) {
      setModalSairOpen(true)
    } else {
      router.push('/')
    }
  }

  const getBubbleClass = (i: number) => {
    let cls = 'questao-bubble'
    if (i === questaoAtual) return cls + ' atual'
    const r = respostas[i]
    if (r !== undefined) {
      const q = questoes[i]
      if (q?.tipo === 'aberta') {
        cls += r === SENTINEL_ABERTA_SEM_NOTA ? ' respondida' : ' acertou'
      } else if (modoGabarito === 'apos') {
        cls += r === q?.gabarito ? ' acertou' : ' errou'
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
          {erroInicio && (
            <p style={{ color: '#f87171', fontSize: '0.88rem', marginTop: '16px', textAlign: 'center' }}>
              {erroInicio}
            </p>
          )}
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

      {/* MODAL CONFIRMAÇÃO DE SAÍDA */}
      <div role="dialog" aria-modal="true" aria-label="Confirmar saída" className={`modal-overlay${modalSairOpen ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setModalSairOpen(false) }}>
        <div className="modal">
          <div className="modal-title-bar">SAIR DA PROVA?</div>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', textAlign: 'center', padding: '8px 0 16px' }}>
            Seu progresso será perdido. Tem certeza que deseja voltar ao início?
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              className="btn btn--ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setModalSairOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn--primary"
              style={{ flex: 1, justifyContent: 'center', background: '#f87171' }}
              onClick={() => { setModalSairOpen(false); router.push('/') }}
            >
              Sair mesmo assim
            </button>
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
