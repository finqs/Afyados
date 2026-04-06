import { supabase } from './supabase.js'
import { escapeHtml } from './utils/utils.js'

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

  if (error || !data || !data.length) {
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
        <button class="btn-ver-gabarito" onclick="verGabaritoAberta()">Ver gabarito</button>
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
          <div class="autoavaliacao-label">Quanto você acertou?</div>
          <div class="autoavaliacao-btns">
            <button class="btn-nota ${respostas[questaoAtual] === '25' ? 'ativo' : ''}" onclick="notarAberta('25')">25%</button>
            <button class="btn-nota ${respostas[questaoAtual] === '50' ? 'ativo' : ''}" onclick="notarAberta('50')">50%</button>
            <button class="btn-nota ${respostas[questaoAtual] === '75' ? 'ativo' : ''}" onclick="notarAberta('75')">75%</button>
            <button class="btn-nota ${respostas[questaoAtual] === '100' ? 'ativo' : ''}" onclick="notarAberta('100')">100%</button>
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
            ${ac