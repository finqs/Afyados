import { supabase } from './supabase.js'

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

  await carregarDados(user.id)
}

async function carregarDados(userId) {
  // 1. Busca respostas do usuário
  const { data: respostas } = await supabase
    .from('respostas')
    .select('*')
    .eq('user_id', userId)

  if (!respostas || !respostas.length) {
    document.getElementById('stat-total').textContent = '0'
    document.getElementById('stat-acertos').textContent = '0%'
    document.getElementById('stat-provas').textContent = '0'
    document.getElementById('stat-materias').textContent = '0'
    document.getElementById('historico-lista').innerHTML = '<div class="loading-text">Nenhuma prova realizada ainda.</div>'
    document.getElementById('materias-lista').innerHTML = '<div class="loading-text">Nenhuma questão respondida ainda.</div>'
    return
  }

  // 2. Busca questões relacionadas
  const questaoIds = [...new Set(respostas.map(r => r.questao_id))]
  const { data: questoes } = await supabase
    .from('questoes')
    .select('id, prova_id, materia:prova_id')
    .in('id', questaoIds)

  // 3. Busca provas relacionadas
  const provaIds = [...new Set(questoes.map(q => q.prova_id))]
  const { data: provas } = await supabase
    .from('provas')
    .select('*')
    .in('id', provaIds)

  // Mapas para lookup rápido
  const questaoMap = {}
  questoes.forEach(q => questaoMap[q.id] = q)

  const provaMap = {}
  provas.forEach(p => provaMap[p.id] = p)

  // Estatísticas gerais
  const total = respostas.length
  const acertos = respostas.filter(r => r.acertou).length
  const percentGeral = Math.round((acertos / total) * 100)

  document.getElementById('stat-total').textContent = total
  document.getElementById('stat-acertos').textContent = percentGeral + '%'

  // Acertos por matéria
  const materiaMap = {}
  respostas.forEach(r => {
    const questao = questaoMap[r.questao_id]
    if (!questao) return
    const prova = provaMap[questao.prova_id]
    if (!prova) return
    const mat = prova.materia
    if (!materiaMap[mat]) materiaMap[mat] = { total: 0, acertos: 0 }
    materiaMap[mat].total++
    if (r.acertou) materiaMap[mat].acertos++
  })

  document.getElementById('stat-materias').textContent = Object.keys(materiaMap).length

  // Histórico por prova
  const provaHistMap = {}
  respostas.forEach(r => {
    const questao = questaoMap[r.questao_id]
    if (!questao) return
    const prova = provaMap[questao.prova_id]
    if (!prova) return
    const key = prova.id
    if (!provaHistMap[key]) {
      provaHistMap[key] = {
        materia: prova.materia,
        ano: prova.ano,
        semestre: prova.semestre,
        total: 0,
        acertos: 0,
        data: r.criado_em
      }
    }
    provaHistMap[key].total++
    if (r.acertou) provaHistMap[key].acertos++
  })

  const provasFeitas = Object.values(provaHistMap)
  document.getElementById('stat-provas').textContent = provasFeitas.length

  // Render histórico
  const lista = document.getElementById('historico-lista')
  lista.innerHTML = provasFeitas.map(p => {
    const percent = Math.round((p.acertos / p.total) * 100)
    const cor = percent >= 70 ? '#4ade80' : percent >= 50 ? 'var(--accent)' : '#f87171'
    const data = new Date(p.data).toLocaleDateString('pt-BR')
    return `
      <div class="historico-item">
        <div class="historico-info">
          <div class="historico-materia">${p.materia} · ${p.ano}.${p.semestre}</div>
          <div class="historico-data">${data} · ${p.total} questões</div>
        </div>
        <div class="historico-score" style="color:${cor}">${p.acertos}/${p.total}</div>
      </div>
    `
  }).join('')

  // Render matérias
  const materiaLista = document.getElementById('materias-lista')
  materiaLista.innerHTML = Object.entries(materiaMap).map(([nome, dados]) => {
    const percent = Math.round((dados.acertos / dados.total) * 100)
    const cor = percent >= 70 ? '#4ade80' : percent >= 50 ? 'var(--accent)' : '#f87171'
    return `
      <div class="materia-item">
        <div class="materia-nome">${nome}</div>
        <div class="materia-barra-bg">
          <div class="materia-barra-fill" style="width:${percent}%;background:${cor}"></div>
        </div>
        <div class="materia-percent" style="color:${cor}">${percent}%</div>
      </div>
    `
  }).join('')

  // Gráfico
  renderGrafico(provasFeitas)
}

function renderGrafico(provas) {
  const ctx = document.getElementById('chart-materias').getContext('2d')
  const labels = provas.map(p => `${p.materia} ${p.ano}.${p.semestre}`)
  const valores = provas.map(p => Math.round((p.acertos / p.total) * 100))
  const cores = valores.map(v => v >= 70 ? '#4ade80' : v >= 50 ? '#2d7ef7' : '#f87171')

  new Chart(ctx, {
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
          min: 0,
          max: 100,
          ticks: { color: '#5a6a84', callback: val => val + '%' },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        x: {
          ticks: { color: '#5a6a84' },
          grid: { display: false }
        }
      }
    }
  })
}

init()