import { supabase } from './supabase.js'
import { escapeHtml } from './utils/utils.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Estado da prova
let questoes = []
let questaoAtual = 0
let respostas = {}
let respostasTexto = {}
let modoGabarito = 'apos'
let usarTimer = true
let tempoTotal = 100 * 60
let tempoRestante = 0
let intervalTimer = null
let provaIniciada = false
let provaId = null
let attemptId = null

// Pega parametros da URL
const params = new URLSearchParams(window.location.search)
provaId = params.get('prova_id')
const materia = params.get('materia') || 'Prova'
const ano = params.get('ano') || ''
const semestre = params.get('semestre') || ''

// Valida UUID do prova_id
if (!provaId || !UUID_REGEX.test(provaId)) {
  document.getElementById('prova-card').innerHTML = '<div class="loading-text">Prova nao encontrada.</div>'
} else {
  // Atualiza titulos
  document.getElementById('prova-titulo').textContent = `${materia} · ${ano}.${semestre}`
  document.getElementById('config-titulo').textContent = `${materia} · ${ano}.${semestre}`
  carregarQuestoes()
}

// Carrega questoes
async function carregarQuestoes() {
  const { data, error } = await supabase
    .from('questoes')
    .select('*')
    .eq('prova_id', provaId)
    .order('numero')

  if (error || !data || !data.length) {
    document.getElementById('prova-card').innerHTML = '<div class="loading-text">Erro ao carregar questoes.</div>'
    return
  }

  questoes = data
  renderBubbles()
}

// Selecionar modo gabarito
function selecionarModo(modo) {
  modoGabarito = modo
  document.getElementById('cfg-apos-responder').classList.toggle('active', modo === 'apos')
  document.getElementById('cfg-no-final').classList.toggle('active', modo === 'final')
}

// Toggle timer
document.getElementById('cfg-timer').addEventListener('change', function() {
  usarTimer = this.checked
  document.getElementById('timer-config').style.display = this.checked ? 'block' : 'none'
})

// Iniciar prova
document.getElementById('btn-iniciar').addEventListener('click', async () => {
  tempoTotal = parseInt(document.getElementById('cfg-tempo').value) * 60
  tempoRestante = tempoTotal

  document.getElementById('btn-iniciar').textContent = 'Iniciando...'
  document.getElementById('btn-iniciar').disabled = true

  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    const { data: attempt, error } = await supabase.from('exam_attempts').insert({
      user_id: session.user.id,
      prova_id: provaId,
      modo: modoGabarito,
      total: questoes.length
    }).select().single()

    if (!error && attempt) {
      attemptId = attempt.id
    }
  }

  document.getElementById('modal-config').classList.remove('active')
  provaIniciada = true
  renderQuestao()
  if (usarTimer) iniciarTimer()
})

// Timer
function iniciarTimer() {
  atualizarTimer()
  intervalTimer = setInterval(() => {
    tempoRestante--
    atualizarTimer()
    if (tempoRestante <= 0) {
      clearInterval(intervalTimer)
      finalizarProva()
    }
  }, 1000)
}

function atualizarTimer() {
  const min = Math.floor(tempoRestante / 60).toString().padStart(2, '0')
  const seg = (tempoRestante % 60).toString().padStart(2, '0')
  const el = document.getElementById('timer')
  el.textContent = `${min}:${seg}`
  el.classList.toggle('urgente', tempoRestante <= 300)
}

// Render bubbles
function renderBubbles() {
  const nav = document.getElementById('questao-nav')
  nav.innerHTML = questoes.map((q, i) => {
    let classe = 'questao-bubble'
    if (i === questaoAtual) classe += ' atual'
    else if (respostas[i] !== undefined) {
      if (q.tipo === 'aberta') {
        classe += respostas[i] === '0' ? ' respondida' : ' acertou'
      } else if (modoGabarito === 'apos') {
        classe += respostas[i] === questoes[i].gabarito ? ' acertou' : ' errou'
      } else {
        classe += ' respondida'
      }
    }
    return `<button class="${classe}" data-questao="${i}">${i + 1}</button>`
  }).join('')
}

// Event delegation for questao-nav bubbles
document.getElementById('questao-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-questao]')
  if (btn) {
    questaoAtual = parseInt(btn.dataset.questao)
    renderQuestao()
  }
})

// Event delegation for prova-card (responder, ver gabarito, notar aberta)
document.getElementById('prova-card').addEventListener('click', (e) => {
  const respBtn = e.target.closest('[data-resposta]')
  if (respBtn) {
    responder(respBtn.dataset.resposta)
    return
  }

  const gabBtn = e.target.closest('[data-action="ver-gabarito"]')
  if (gabBtn) {
    verGabaritoAberta()
    return
  }

  const notaBtn = e.target.closest('[data-nota]')
  if (notaBtn) {
    notarAberta(notaBtn.dataset.nota)
    return
  }
})

// Render questao
function renderQuestao() {
  if (!questoes.length) return

  const q = questoes[questaoAtual]
  const respondida = respostas[questaoAtual] !== undefined
  const percentual = ((questaoAtual + 1) / questoes.length) * 100
  document.getElementById('progress-fill').style.width = percentual + '%'

  const isAberta = q.tipo === 'aberta'
  let conteudoQuestao = ''

  if (isAberta) {
    const respostaAluno = respostasTexto[questaoAtual] || ''

    if (!respondida) {
      conteudoQuestao = `
        <textarea
          id="resposta-aberta"
          class="resposta-aberta-input"
          placeholder="Digite sua resposta aqui..."
          rows="6"
        >${escapeHtml(respostaAluno)}</textarea>
        <button class="btn-ver-gabarito" data-action="ver-gabarito">Ver gabarito</button>
      `
    } else {
      conteudoQuestao = `
        <div class="aberta-comparacao">
          <div class="aberta-col">
            <div class="aberta-col-label">Sua resposta</div>
            <div class="aberta-col-texto">${escapeHtml(respostaAluno)}</div>
          </div>
          <div class="aberta-col">
            <div class="aberta-col-label">Gabarito esperado</div>
            <div class="aberta-col-texto">${escapeHtml(q.gabarito)}</div>
          </div>
        </div>
        ${q.comentario ? `<div class="gabarito-box acerto"><div>${escapeHtml(q.comentario)}</div></div>` : ''}
        <div class="autoavaliacao">
          <div class="autoavaliacao-label">Quanto voce acertou?</div>
          <div class="autoavaliacao-btns">
            <button class="btn-nota ${respostas[questaoAtual] === '25' ? 'ativo' : ''}" data-nota="25">25%</button>
            <button class="btn-nota ${respostas[questaoAtual] === '50' ? 'ativo' : ''}" data-nota="50">50%</button>
            <button class="btn-nota ${respostas[questaoAtual] === '75' ? 'ativo' : ''}" data-nota="75">75%</button>
            <button class="btn-nota ${respostas[questaoAtual] === '100' ? 'ativo' : ''}" data-nota="100">100%</button>
          </div>
        </div>
      `
    }
  } else {
    const alternativas = [
      { letra: 'A', texto: q.alternativa_a },
      { letra: 'B', texto: q.alternativa_b },
      { letra: 'C', texto: q.alternativa_c },
      { letra: 'D', texto: q.alternativa_d }
    ]
    if (q.alternativa_e) {
      alternativas.push({ letra: 'E', texto: q.alternativa_e })
    }

    let gabaritoHTML = ''
    if (respondida && modoGabarito === 'apos') {
      const acertou = respostas[questaoAtual] === q.gabarito
      gabaritoHTML = `
        <div class="gabarito-box ${acertou ? 'acerto' : 'erro'}">
          <div class="gabarito-resultado ${acertou ? 'acerto' : 'erro'}">
            ${acertou ? '✓ Mandou bem!' : `✗ Resposta correta: ${escapeHtml(q.gabarito)}`}
          </div>
          ${q.comentario ? `<div>${escapeHtml(q.comentario)}</div>` : ''}
        </div>
      `
    }

    conteudoQuestao = `
      <div class="alternativas-list">
        ${alternativas.map(alt => {
          let classe = 'alternativa-btn'
          if (respondida) {
            if (alt.letra === q.gabarito) classe += ' correta'
            else if (alt.letra === respostas[questaoAtual]) classe += ' errada'
          }
          return `
            <button class="${classe}" ${respondida ? 'disabled' : ''} data-resposta="${alt.letra}">
              <span class="alternativa-letra">${alt.letra}</span>
              ${escapeHtml(alt.texto)}
            </button>
          `
        }).join('')}
      </div>
      ${gabaritoHTML}
    `
  }

  document.getElementById('prova-card').innerHTML = `
    <div class="questao-numero">QUESTÃO ${questaoAtual + 1} DE ${questoes.length}</div>
    <div class="questao-enunciado">${escapeHtml(q.enunciado)}</div>
    ${conteudoQuestao}
  `

  renderBubbles()
}

// Responder multipla escolha
function responder(letra) {
  if (respostas[questaoAtual] !== undefined) return
  respostas[questaoAtual] = letra
  salvarResposta(questoes[questaoAtual].id, letra, letra === questoes[questaoAtual].gabarito)
  renderQuestao()
}

// Questao aberta
function verGabaritoAberta() {
  const textarea = document.getElementById('resposta-aberta')
  const texto = textarea ? textarea.value.trim() : ''
  respostasTexto[questaoAtual] = texto
  respostas[questaoAtual] = '0'
  renderQuestao()
}

function notarAberta(nota) {
  respostas[questaoAtual] = nota
  salvarResposta(questoes[questaoAtual].id, nota, parseFloat(nota) / 100)
  renderQuestao()
  renderBubbles()
}

async function salvarResposta(questaoId, resposta, acertou) {
  if (!attemptId) return

  await supabase.from('attempt_answers').insert({
    attempt_id: attemptId,
    questao_id: questaoId,
    resposta,
    acertou
  })
}

// Navegacao
document.getElementById('btn-anterior').addEventListener('click', () => {
  if (questaoAtual > 0) { questaoAtual--; renderQuestao() }
})

document.getElementById('btn-proxima').addEventListener('click', () => {
  if (questaoAtual < questoes.length - 1) { questaoAtual++; renderQuestao() }
})

document.getElementById('btn-finalizar').addEventListener('click', finalizarProva)

// Finalizar
async function finalizarProva() {
  clearInterval(intervalTimer)

  document.getElementById('btn-finalizar').textContent = 'Finalizando...'
  document.getElementById('btn-finalizar').disabled = true

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

  document.getElementById('btn-finalizar').textContent = 'Finalizar Prova'
  document.getElementById('btn-finalizar').disabled = false

  document.getElementById('resultado-score').textContent = `${acertos}/${total}`
  document.getElementById('resultado-percent').textContent = `${percent}%`
  document.getElementById('resultado-msg').textContent =
    percent >= 70 ? '🎉 Otimo desempenho!' :
    percent >= 50 ? '📚 Continue estudando!' :
    '💪 Nao desista, revise o conteudo!'

  document.getElementById('resultado-grid').innerHTML = questoes.map((q, i) => {
    let classe = 'resultado-item'
    if (respostas[i] === undefined) classe += ' pulou'
    else if (q.tipo === 'aberta') {
      const nota = parseFloat(respostas[i]) || 0
      classe += nota >= 75 ? ' acerto' : nota > 0 ? ' respondida' : ' erro'
    } else if (respostas[i] === q.gabarito) classe += ' acerto'
    else classe += ' erro'
    return `<div class="${classe}">${i + 1}</div>`
  }).join('')

  document.getElementById('modal-resultado').classList.add('active')
}

// Confirmar saida
function confirmarSaida() {
  if (provaIniciada && Object.keys(respostas).length > 0) {
    if (confirm('Deseja sair? Seu progresso sera perdido.')) {
      window.location.href = 'index.html'
    }
  } else {
    window.location.href = 'index.html'
  }
}

// Event delegation for config modal buttons
document.getElementById('modal-config').addEventListener('click', (e) => {
  const modoBtn = e.target.closest('[data-modo]')
  if (modoBtn) {
    selecionarModo(modoBtn.dataset.modo)
  }
})

// Expose confirmarSaida for HTML onclick (btn-inicio in prova.html)
document.getElementById('btn-inicio').addEventListener('click', confirmarSaida)

// Timer slider oninput
const cfgTempo = document.getElementById('cfg-tempo')
cfgTempo.addEventListener('input', () => {
  document.getElementById('timer-valor').textContent = cfgTempo.value
})

// Limpar timer ao sair da pagina
window.addEventListener('beforeunload', () => {
  if (intervalTimer) clearInterval(intervalTimer)
})
