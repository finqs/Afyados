import { supabase } from './supabase.js'

// Estado da prova
let questoes = []
let questaoAtual = 0
let respostas = {}
let modoGabarito = 'apos'
let usarTimer = true
let tempoTotal = 100 * 60
let tempoRestante = 0
let intervalTimer = null
let provaIniciada = false
let provaId = null

// Pega parâmetros da URL
const params = new URLSearchParams(window.location.search)
provaId = params.get('prova_id')
const materia = params.get('materia') || 'Prova'
const ano = params.get('ano') || ''
const semestre = params.get('semestre') || ''

// Atualiza títulos
document.getElementById('prova-titulo').textContent = `${materia} · ${ano}.${semestre}`
document.getElementById('config-titulo').textContent = `${materia} · ${ano}.${semestre}`

// Carrega questões
async function carregarQuestoes() {
  const { data, error } = await supabase
    .from('questoes')
    .select('*')
    .eq('prova_id', provaId)
    .order('numero')

  if (error || !data.length) {
    document.getElementById('prova-card').innerHTML = '<div class="loading-text">Erro ao carregar questões.</div>'
    return
  }

  questoes = data
  renderBubbles()
}

carregarQuestoes()

// Selecionar modo gabarito
window.selecionarModo = function(modo) {
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
document.getElementById('btn-iniciar').addEventListener('click', () => {
  tempoTotal = parseInt(document.getElementById('cfg-tempo').value) * 60
  tempoRestante = tempoTotal
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
      if (modoGabarito === 'apos') {
        classe += respostas[i] === questoes[i].gabarito ? ' acertou' : ' errou'
      } else {
        classe += ' respondida'
      }
    }
    return `<button class="${classe}" onclick="irParaQuestao(${i})">${i + 1}</button>`
  }).join('')
}

window.irParaQuestao = function(i) {
  questaoAtual = i
  renderQuestao()
}

// Render questão
function renderQuestao() {
  if (!questoes.length) return

  const q = questoes[questaoAtual]
  const respondida = respostas[questaoAtual] !== undefined
  const percentual = ((questaoAtual + 1) / questoes.length) * 100
  document.getElementById('progress-fill').style.width = percentual + '%'

  const alternativas = [
    { letra: 'A', texto: q.alternativa_a },
    { letra: 'B', texto: q.alternativa_b },
    { letra: 'C', texto: q.alternativa_c },
    { letra: 'D', texto: q.alternativa_d }
  ]

  let gabaritoHTML = ''
  if (respondida && modoGabarito === 'apos') {
    const acertou = respostas[questaoAtual] === q.gabarito
    gabaritoHTML = `
      <div class="gabarito-box ${acertou ? 'acerto' : 'erro'}">
        <div class="gabarito-resultado ${acertou ? 'acerto' : 'erro'}">
          ${acertou ? '✓ Mandou bem!' : `✗ Resposta correta: ${q.gabarito}`}
        </div>
        ${q.comentario ? `<div>${q.comentario}</div>` : ''}
      </div>
    `
  }

  document.getElementById('prova-card').innerHTML = `
    <div class="questao-numero">QUESTÃO ${questaoAtual + 1} DE ${questoes.length}</div>
    <div class="questao-enunciado">${q.enunciado}</div>
    <div class="alternativas-list">
      ${alternativas.map(alt => {
        let classe = 'alternativa-btn'
        if (respondida) {
          if (alt.letra === q.gabarito) classe += ' correta'
          else if (alt.letra === respostas[questaoAtual]) classe += ' errada'
        }
        return `
          <button class="${classe}" ${respondida ? 'disabled' : ''} onclick="responder('${alt.letra}')">
            <span class="alternativa-letra">${alt.letra}</span>
            ${alt.texto}
          </button>
        `
      }).join('')}
    </div>
    ${gabaritoHTML}
  `

  renderBubbles()
}

// Responder
window.responder = function(letra) {
  if (respostas[questaoAtual] !== undefined) return
  respostas[questaoAtual] = letra

  // Salvar resposta no banco
  salvarResposta(questoes[questaoAtual].id, letra, letra === questoes[questaoAtual].gabarito)

  renderQuestao()

  // Avançar automaticamente após 1.5s se modo "após responder"
  if (modoGabarito === 'apos' && questaoAtual < questoes.length - 1) {
    setTimeout(() => {
      questaoAtual++
      renderQuestao()
    }, 1800)
  }
}

async function salvarResposta(questaoId, resposta, acertou) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  await supabase.from('respostas').insert({
    user_id: session.user.id,
    questao_id: questaoId,
    resposta,
    acertou
  })
}

// Navegação
document.getElementById('btn-anterior').addEventListener('click', () => {
  if (questaoAtual > 0) { questaoAtual--; renderQuestao() }
})

document.getElementById('btn-proxima').addEventListener('click', () => {
  if (questaoAtual < questoes.length - 1) { questaoAtual++; renderQuestao() }
})

document.getElementById('btn-finalizar').addEventListener('click', finalizarProva)

// Finalizar
function finalizarProva() {
  clearInterval(intervalTimer)
  const total = questoes.length
  const acertos = questoes.filter((q, i) => respostas[i] === q.gabarito).length
  const percent = Math.round((acertos / total) * 100)

  document.getElementById('resultado-score').textContent = `${acertos}/${total}`
  document.getElementById('resultado-percent').textContent = `${percent}%`
  document.getElementById('resultado-msg').textContent =
    percent >= 70 ? '🎉 Ótimo desempenho!' :
    percent >= 50 ? '📚 Continue estudando!' :
    '💪 Não desista, revise o conteúdo!'

  document.getElementById('resultado-grid').innerHTML = questoes.map((q, i) => {
    let classe = 'resultado-item'
    if (respostas[i] === undefined) classe += ' pulou'
    else if (respostas[i] === q.gabarito) classe += ' acerto'
    else classe += ' erro'
    return `<div class="${classe}">${i + 1}</div>`
  }).join('')

  document.getElementById('modal-resultado').classList.add('active')
}

// Confirmar saída
window.confirmarSaida = function() {
  if (provaIniciada && Object.keys(respostas).length > 0) {
    if (confirm('Deseja sair? Seu progresso será perdido.')) {
      window.location.href = 'index.html'
    }
  } else {
    window.location.href = 'index.html'
  }
}