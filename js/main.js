import { supabase } from './supabase.js'
import { escapeHtml } from './utils/utils.js'

// ==========================================
// TEMA DARK / LIGHT — gerenciado pelo tema.js
// ==========================================
// ELEMENTOS DO DOM
// ==========================================
const modal = document.getElementById('modal')
const modalSubject = document.getElementById('modal-subject')
const modalClose = document.getElementById('modal-close')
const modalSobre = document.getElementById('modal-sobre')
const modalSobreClose = document.getElementById('modal-sobre-close')
const pillsContainer = document.getElementById('pills-periodos')
const materiasGrid = document.getElementById('materias-grid')
const materiasLabel = document.getElementById('materias-label')

// ==========================================
// MODAL MATÉRIA (PAINEL DE CONTROLE)
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
  if (e.key === 'Escape') {
    closeModal()
    fecharModalSobre()
  }
})

function closeModal() {
  modal.classList.remove('active')
  document.body.style.overflow = ''
}

// ==========================================
// MODAL SOBRE (usa btn-sobre, NÃO btn-perfil)
// ==========================================
const btnSobre = document.getElementById('btn-sobre')
if (btnSobre) {
  btnSobre.addEventListener('click', () => abrirModalSobre())
}

modalSobreClose.addEventListener('click', fecharModalSobre)
modalSobre.addEventListener('click', (e) => {
  if (e.target === modalSobre) fecharModalSobre()
})

function abrirModalSobre() {
  modalSobre.classList.add('active')
  document.body.style.overflow = 'hidden'
}

function fecharModalSobre() {
  modalSobre.classList.remove('active')
  document.body.style.overflow = ''
}

// ==========================================
// PERFIL (btn-perfil agora SÓ redireciona)
// ==========================================
const btnPerfil = document.getElementById('btn-perfil')
if (btnPerfil) {
  btnPerfil.addEventListener('click', () => {
    window.location.href = 'perfil.html'
  })
}

// ==========================================
// NAVBAR LOGIN/LOGOUT
// ==========================================
async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession()
  atualizarBotaoSessao(session)
}

function atualizarBotaoSessao(session) {
  const btn = document.querySelector('.nav-apoie')
  if (!btn) return

  if (session) {
    btn.textContent = 'Sair'
    btn.onclick = async () => {
      await supabase.auth.signOut()
    }
  } else {
    btn.textContent = 'Login'
    btn.onclick = () => {
      window.location.href = 'login.html'
    }
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  atualizarBotaoSessao(session)
  if (event === 'SIGNED_OUT') {
    window.location.reload()
  }
})

verificarSessao()

// ==========================================
// PERÍODOS → CARREGAR MATÉRIAS
// ==========================================
let periodoAtivo = null

if (pillsContainer) {
  pillsContainer.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const periodo = pill.dataset.periodo

      if (periodoAtivo === periodo) {
        periodoAtivo = null
        pill.classList.remove('active')
        materiasGrid.innerHTML = ''
        if (materiasLabel) materiasLabel.textContent = 'MATÉRIAS'
        return
      }

      pillsContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      periodoAtivo = periodo
      carregarMaterias(periodo)
    })
  })
}

async function carregarMaterias(periodo) {
  materiasGrid.innerHTML = '<div class="loading-text">Carregando matérias...</div>'
  const periodoNum = parseInt(periodo)
  const isInternato = isNaN(periodoNum)

  if (materiasLabel) {
    materiasLabel.textContent = isInternato
      ? 'MATÉRIAS · INTERNATO'
      : `MATÉRIAS · ${periodo}º PERÍODO`
  }

  let query = supabase.from('provas').select('materia')
  if (isInternato) {
    query = query.gte('periodo', 9)
  } else {
    query = query.eq('periodo', periodoNum)
  }

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
      <button class="btn-acessar">Acessar <span>→</span></button>
    </div>
  `).join('')

  materiasGrid.querySelectorAll('.materia-card').forEach(card => {
    card.addEventListener('click', () => {
      const nome = card.dataset.materia
      const per = parseInt(card.dataset.periodo)
      abrirModalMateria(nome, per)
    })
  })
}

// ==========================================
// CARREGAR PROVAS DA MATÉRIA
// ==========================================
async function carregarProvas(materia, periodo) {
  let query = supabase
    .from('provas')
    .select('*')
    .eq('materia', materia)
    .order('ano')

  if (typeof periodo === 'number' && !isNaN(periodo)) {
    query = query.eq('periodo', periodo)
  }

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
    <div style="font-size:14px;margin-bottom:16px;color:var(--text-muted)">Escolha a prova:</div>
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
    document.getElementById('sec-periodos')?.scrollIntoView({ behavior: 'smooth' })
  })
}

const acaoSimulado = document.getElementById('acao-simulado')
if (acaoSimulado) {
  acaoSimulado.addEventListener('click', () => {
    alert('🚧 Simulados personalizados em breve!')
  })
}

// ==========================================
// BOTÕES DO RODAPÉ
// ==========================================
document.querySelectorAll('.footer-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const texto = btn.textContent.trim()
    if (texto === 'Sobre') {
      abrirModalSobre()
    } else if (texto === 'Apoie') {
      const apoieBtn = document.querySelector('.nav-apoie')
      if (apoieBtn) apoieBtn.click()
    } else if (texto === 'Contato') {
      window.location.href = 'mailto:filipenqs@hotmail.com'
    }
  })
})

// "Começar a estudar" → scroll para períodos
const heroBtn = document.querySelector('.hero-btns .btn-primary')
if (heroBtn) {
  heroBtn.addEventListener('click', () => {
    document.getElementById('sec-periodos')?.scrollIntoView({ behavior: 'smooth' })
  })
}