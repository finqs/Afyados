import { supabase } from './supabase.js'
import { escapeHtml } from './utils/utils.js'

const modal = document.getElementById('modal')
const modalSubject = document.getElementById('modal-subject')
const modalClose = document.getElementById('modal-close')
const modalSobre = document.getElementById('modal-sobre')
const modalSobreClose = document.getElementById('modal-sobre-close')
const pillsContainer = document.getElementById('pills-periodos')
const materiasGrid = document.getElementById('materias-grid')
const materiasLabel = document.getElementById('materias-label')

// ==========================================
// MODAL MATÉRIA
// ==========================================
function abrirModalMateria(nome, periodo) {
  modalSubject.textContent = nome
  modal.classList.add('active')
  document.body.style.overflow = 'hidden'

  document.getElementById('modal-btn-provas').onclick = () => {
    modal.classList.remove('active')
    document.body.style.overflow = ''
    carregarProvas(nome, periodo)
  }
}

modalClose.addEventListener('click', closeModal)
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); fecharModalSobre() }
})

function closeModal() {
  modal.classList.remove('active')
  document.body.style.overflow = ''
}

// ==========================================
// MODAL SOBRE
// ==========================================
const btnSobre = document.getElementById('btn-sobre')
if (btnSobre) btnSobre.addEventListener('click', () => abrirModalSobre())

if (modalSobreClose) modalSobreClose.addEventListener('click', fecharModalSobre)
if (modalSobre) modalSobre.addEventListener('click', (e) => { if (e.target === modalSobre) fecharModalSobre() })

function abrirModalSobre() {
  if (modalSobre) { modalSobre.classList.add('active'); document.body.style.overflow = 'hidden' }
}
function fecharModalSobre() {
  if (modalSobre) { modalSobre.classList.remove('active'); document.body.style.overflow = '' }
}

// Footer sobre
const flSobre = document.getElementById('fl-sobre')
if (flSobre) flSobre.addEventListener('click', () => abrirModalSobre())

const flContato = document.getElementById('fl-contato')
if (flContato) flContato.addEventListener('click', () => { window.location.href = 'mailto:filipenqs@hotmail.com' })

// ==========================================
// PERFIL
// ==========================================
const btnPerfil = document.getElementById('btn-perfil')
if (btnPerfil) btnPerfil.addEventListener('click', () => { window.location.href = 'perfil.html' })

// ==========================================
// NAVBAR LOGIN/LOGOUT
// ==========================================
async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession()
  atualizarBotaoSessao(session)
}

function atualizarBotaoSessao(session) {
  const btn = document.getElementById('btn-auth') || document.querySelector('.nav-apoie')
  if (!btn) return

  if (session) {
    btn.textContent = 'Sair'
    btn.onclick = async () => {
      await supabase.auth.signOut()
      window.location.reload()
    }
  } else {
    btn.textContent = 'Login'
    btn.onclick = () => { window.location.href = 'login.html' }
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  atualizarBotaoSessao(session)
  if (event === 'SIGNED_OUT') window.location.reload()
})

verificarSessao()

// ==========================================
// PERÍODOS → MATÉRIAS
// ==========================================
let periodoAtivo = null

if (pillsContainer) {
  pillsContainer.querySelectorAll('.pill, .period-tab').forEach(pill => {
    pill.addEventListener('click', () => {
      const periodo = pill.dataset.periodo

      if (periodoAtivo === periodo) {
        periodoAtivo = null
        pillsContainer.querySelectorAll('.pill, .period-tab').forEach(p => p.classList.remove('active'))
        if (materiasGrid) materiasGrid.innerHTML = ''
        if (materiasLabel) materiasLabel.textContent = 'MATÉRIAS'
        return
      }

      pillsContainer.querySelectorAll('.pill, .period-tab').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      periodoAtivo = periodo
      carregarMaterias(periodo)
    })
  })
}

async function carregarMaterias(periodo) {
  if (!materiasGrid) return
  materiasGrid.innerHTML = '<div class="loading-text">Carregando matérias...</div>'
  const periodoNum = parseInt(periodo)
  const isInternato = isNaN(periodoNum)

  if (materiasLabel) {
    materiasLabel.textContent = isInternato ? 'MATÉRIAS · INTERNATO' : `MATÉRIAS · ${periodo}º PERÍODO`
  }

  let query = supabase.from('provas').select('materia')
  if (isInternato) query = query.gte('periodo', 9)
  else query = query.eq('periodo', periodoNum)

  const { data, error } = await query

  if (error || !data || !data.length) {
    materiasGrid.innerHTML = '<div class="loading-text">Nenhuma matéria disponível para este período.</div>'
    return
  }

  const materias = [...new Set(data.map(p => p.materia))].sort()

  materiasGrid.innerHTML = materias.map(mat => `
    <div class="materia-card" data-materia="${escapeHtml(mat)}" data-periodo="${escapeHtml(periodo)}">
      <div class="materia-icon">📚</div>
      <div class="materia-nome">${escapeHtml(mat)}</div>
      <div class="materia-info">Provas disponíveis</div>
      <button class="btn-acessar"><span>Acessar</span><span>→</span></button>
    </div>
  `).join('')

  materiasGrid.querySelectorAll('.materia-card').forEach(card => {
    card.addEventListener('click', () => {
      abrirModalMateria(card.dataset.materia, parseInt(card.dataset.periodo))
    })
  })
}

// ==========================================
// CARREGAR PROVAS
// ==========================================
async function carregarProvas(materia, periodo) {
  let query = supabase.from('provas').select('*').eq('materia', materia).order('ano')
  if (typeof periodo === 'number' && !isNaN(periodo)) query = query.eq('periodo', periodo)

  const { data, error } = await query

  if (error || !data || !data.length) {
    alert('Nenhuma prova disponível para esta matéria ainda.')
    return
  }

  if (data.length === 1) {
    const p = data[0]
    window.location.href = `prova.html?prova_id=${p.id}&materia=${encodeURIComponent(p.materia)}&ano=${p.ano}&semestre=${p.semestre}`
    return
  }

  const lista = data.map(p =>
    `<button class="btn-primary" style="margin-bottom:8px;width:100%" data-pid="${p.id}" data-mat="${encodeURIComponent(p.materia)}" data-ano="${p.ano}" data-sem="${p.semestre}">
      ${escapeHtml(p.materia)} · ${escapeHtml(String(p.ano))}.${escapeHtml(String(p.semestre))}
    </button>`
  ).join('')

  modalSubject.innerHTML = `
    <div style="font-size:14px;margin-bottom:16px;color:var(--muted)">Escolha a prova:</div>
    ${lista}
  `

  modalSubject.querySelectorAll('[data-pid]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `prova.html?prova_id=${btn.dataset.pid}&materia=${btn.dataset.mat}&ano=${btn.dataset.ano}&semestre=${btn.dataset.sem}`
    })
  })

  modal.classList.add('active')
  document.body.style.overflow = 'hidden'
}

// ==========================================
// AÇÕES RÁPIDAS
// ==========================================
const acaoBanco = document.getElementById('acao-banco')
if (acaoBanco) {
  acaoBanco.addEventListener('click', () => {
    document.getElementById('periodos')?.scrollIntoView({ behavior: 'smooth' })
  })
}

const acaoSimulado = document.getElementById('acao-simulado')
if (acaoSimulado) {
  acaoSimulado.addEventListener('click', () => {
    alert('🚧 Simulados personalizados em breve!')
  })
}