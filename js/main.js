import { supabase } from './supabase.js'

// MODAL MATÉRIA
const modal = document.getElementById('modal')
const modalSubject = document.getElementById('modal-subject')
const modalClose = document.getElementById('modal-close')

document.querySelectorAll('.subject-card').forEach(card => {
  card.addEventListener('click', () => {
    const name = card.querySelector('.subject-name').textContent
    const periodoTexto = card.closest('.period-card').querySelector('.period-title').textContent
    const periodo = parseInt(periodoTexto.replace('º Período', '').trim())
    modalSubject.textContent = name
    modal.classList.add('active')
    document.body.style.overflow = 'hidden'

    document.querySelector('.modal-btn-primary').onclick = () => {
      modal.classList.remove('active')
      document.body.style.overflow = ''
      carregarProvas(name, periodo)
    }
  })
})

modalClose.addEventListener('click', closeModal)
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

function closeModal() {
  modal.classList.remove('active')
  document.body.style.overflow = ''
}

// MODAL SOBRE
const modalSobre = document.getElementById('modal-sobre')
const modalSobreClose = document.getElementById('modal-sobre-close')
const btnSobre = document.getElementById('btn-perfil') || document.querySelector('.nav-btn')

btnSobre.addEventListener('click', () => {
  modalSobre.classList.add('active')
  document.body.style.overflow = 'hidden'
})

modalSobreClose.addEventListener('click', () => {
  modalSobre.classList.remove('active')
  document.body.style.overflow = ''
})

modalSobre.addEventListener('click', (e) => {
  if (e.target === modalSobre) {
    modalSobre.classList.remove('active')
    document.body.style.overflow = ''
  }
})

// NAVBAR LOGIN/LOGOUT
const btnApoie = document.querySelector('.nav-apoie')

async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    btnApoie.textContent = 'Sair'
    btnApoie.addEventListener('click', async () => {
      await supabase.auth.signOut()
      window.location.reload()
    })
  } else {
    btnApoie.textContent = 'Login'
    btnApoie.addEventListener('click', () => {
      window.location.href = 'login.html'
    })
  }
}

verificarSessao()

// CARREGAR PROVAS DA MATÉRIA
async function carregarProvas(materia, periodo) {
  const { data, error } = await supabase
    .from('provas')
    .select('*')
    .eq('materia', materia)
    .eq('periodo', periodo)
    .order('ano')

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
    `<button class="btn-primary" style="margin-bottom:8px" onclick="window.location.href='prova.html?prova_id=${p.id}&materia=${encodeURIComponent(p.materia)}&ano=${p.ano}&semestre=${p.semestre}'">
      ${p.materia} · ${p.ano}.${p.semestre}
    </button>`
  ).join('')

  document.getElementById('modal-subject').innerHTML = `
    <div style="font-size:14px;margin-bottom:16px;color:var(--text-muted)">Escolha a prova:</div>
    ${lista}
  `
}
// Link perfil
const btnPerfil = document.getElementById('btn-perfil')
if (btnPerfil) {
  btnPerfil.addEventListener('click', () => {
    window.location.href = 'perfil.html'
  })
}