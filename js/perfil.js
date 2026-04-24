import { supabase } from './supabase.js'
import { escapeHtml } from './utils/utils.js'

async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = 'login.html'
    return
  }

  const user = session.user
  const nome = user.user_metadata?.nome || user.email.split('@')[0]
  document.getElementById('perfil-avatar').textContent = nome.charAt(0).toUpperCase()
  document.getElementById('perfil-nome').textContent = nome
  document.getElementById('perfil-email').textContent = user.email

  document.getElementById('btn-sair').addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.href = 'index.html'
  })

  // Período config
  const selectPeriodo = document.getElementById('perfil-periodo')
  const btnSalvarPeriodo = document.getElementById('btn-salvar-periodo')
  const periodoMsg = document.getElementById('periodo-msg')

  if (selectPeriodo) {
    selectPeriodo.value = user.user_metadata?.periodo || ''
  }

  if (btnSalvarPeriodo) {
    btnSalvarPeriodo.addEventListener('click', async () => {
      const novoPeriodo = selectPeriodo.value || null
      btnSalvarPeriodo.disabled = true
      btnSalvarPeriodo.textContent = 'Salvando...'

      const { error } = await supabase.auth.updateUser({
        data: { periodo: novoPeriodo }
      })

      if (error) {
        periodoMsg.style.color = '#f87171'
        periodoMsg.textContent = 'Erro ao salvar. Tente novamente.'
      } else {
        periodoMsg.style.color = '#4ade80'
        const label = novoPeriodo === 'internato' ? 'Internato'
          : novoPeriodo ? `${novoPeriodo}º Período` : 'não definido'
        periodoMsg.textContent = `✓ Período salvo: ${label}`
        setTimeout(() => { periodoMsg.textContent = '' }, 3500)
      }

      btnSalvarPeriodo.disabled = false
      btnSalvarPeriodo.textContent = 'Salvar'
    })
  }

  await carregarDados(user.id)
}

async function carregarDados(userId) {
  const { data: attempts } = await supabase
    .from('exam_attempts')
    .select(`
      id,
      score,
      total,
      finalizada,
      created_at,
      provas (
        materia,
        ano,
        semestre
      )
    `)
    .eq('user_id', userId)
    .eq('finalizada', true)
    .order('created_at', { ascending: false })

  if (!attempts || !attempts.length) {
    document.getElementById('stat-total').textContent = '0'
    document.getElementById('stat-acertos').textContent = '0%'
    document.getElementById('stat-provas').textContent = '0'
    document.getElementById('stat-materias').textContent = '0'
    document.getElementById('historico-lista').innerHTML = '<div class="loading-text">Nenhuma prova realizada ainda.</div>'
    document.getElementById('materias-lista').innerHTML = '<div class="loading-text">Nenhuma prova finalizada.</div>'
    return
  }

  const totalQuestoes = attempts.reduce((acc, a) => acc + a.total, 0)
  const totalAcertos = attempts.reduce((acc, a) => acc + a.score, 0)
  const percentGeral = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0

  document.getElementById('stat-total').textContent = totalQuestoes
  document.getElementById('stat-acertos').textContent = percentGeral + '%'
  document.getElementById('stat-provas').textContent = attempts.length

  const materiaMap = {}
  attempts.forEach(a => {
    const mat = a.provas?.materia || 'Outros'
    if (!materiaMap[mat]) materiaMap[mat] = { score: 0, total: 0 }
    materiaMap[mat].score += a.score
    materiaMap[mat].total += a.total
  })

  document.getElementById('stat-materias').textContent = Object.keys(materiaMap).length

  // Histórico
  const lista = document.getElementById('historico-lista')
  lista.innerHTML = attempts.map(p => {
    const percent = p.total > 0 ? Math.round((p.score / p.total) * 100) : 0
    const cor = percent >= 70 ? '#4ade80' : percent >= 50 ? 'var(--blue-neon)' : '#f87171'
    const dataStr = new Date(p.created_at).toLocaleDateString('pt-BR')
    const mat = p.provas?.materia || 'Prova'
    const anoSem = p.provas ? `${p.provas.ano}.${p.provas.semestre}` : ''
    return `
      <div class="historico-item">
        <div>
          <div class="historico-materia">${escapeHtml(mat)} · ${escapeHtml(anoSem)}</div>
          <div class="historico-data">${escapeHtml(dataStr)} · ${p.total} questões</div>
        </div>
        <div class="historico-score" style="color:${cor}">${p.score}/${p.total}</div>
      </div>
    `
  }).join('')

  // Barras de matérias
  const materiaLista = document.getElementById('materias-lista')
  materiaLista.innerHTML = Object.entries(materiaMap).map(([nome, dados]) => {
    const percent = dados.total > 0 ? Math.round((dados.score / dados.total) * 100) : 0
    const cor = percent >= 70 ? '#4ade80' : percent >= 50 ? '#38bdf8' : '#f87171'
    return `
      <div class="materia-item">
        <div class="materia-nome-perf">${escapeHtml(nome)}</div>
        <div class="materia-barra-bg">
          <div class="materia-barra-fill" style="width:${percent}%;background:${cor}"></div>
        </div>
        <div class="materia-percent" style="color:${cor}">${percent}%</div>
      </div>
    `
  }).join('')

  renderGrafico(attempts.map(p => ({
    materia: p.provas?.materia || 'Outros',
    ano: p.provas?.ano || '',
    semestre: p.provas?.semestre || '',
    acertos: p.score,
    total: p.total
  })).reverse())
}

let chartInstance = null

function renderGrafico(provas) {
  const ctx = document.getElementById('chart-materias').getContext('2d')
  if (chartInstance) chartInstance.destroy()

  const labels = provas.map(p => `${p.materia} ${p.ano}.${p.semestre}`)
  const valores = provas.map(p => Math.round((p.acertos / p.total) * 100))
  const cores = valores.map(v => v >= 70 ? '#4ade80' : v >= 50 ? '#38bdf8' : '#f87171')

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% de acertos',
        data: valores,
        backgroundColor: cores,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: '#8899b0', callback: val => val + '%' },
          grid: { color: 'rgba(56,189,248,0.06)' }
        },
        x: {
          ticks: { color: '#8899b0' },
          grid: { display: false }
        }
      }
    }
  })
}

init()