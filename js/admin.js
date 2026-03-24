import { supabase } from './supabase.js'

const btnExtrair = document.getElementById('btn-extrair')
const btnColarJson = document.getElementById('btn-colar-json')
const adminStatus = document.getElementById('admin-status')
const questoesContainer = document.getElementById('questoes-container')

let questoesExtraidas = []

// MODO IA (Gemini)
btnExtrair.addEventListener('click', async () => {
  const { materia, periodo, ano, semestre, valido } = getDadosProva()
  if (!valido) return

  const pdfInput = document.getElementById('pdf-input')
  if (!pdfInput.files[0]) {
    setStatus('Selecione um PDF.', 'erro')
    return
  }

  const GEMINI_KEY = document.getElementById('gemini-key').value.trim()
  if (!GEMINI_KEY) {
    setStatus('Insira sua chave do Gemini.', 'erro')
    return
  }

  setStatus('🤖 Enviando PDF para o Gemini...', 'info')
  btnExtrair.disabled = true

  const file = pdfInput.files[0]
  const base64 = await fileToBase64(file)

  const prompt = `Extraia TODAS as questões desta prova de medicina e retorne APENAS um JSON válido, sem texto antes ou depois, sem markdown, sem backticks.

O formato deve ser exatamente este:
[
  {
    "numero": 1,
    "enunciado": "texto completo do enunciado",
    "alternativa_a": "texto da alternativa A",
    "alternativa_b": "texto da alternativa B",
    "alternativa_c": "texto da alternativa C",
    "alternativa_d": "texto da alternativa D",
    "gabarito": "A",
    "comentario": "explicação do gabarito se disponível"
  }
]

Regras:
- Inclua o enunciado completo com todas as informações
- O gabarito deve ser apenas a letra: A, B, C ou D
- Se não houver comentário, deixe o campo vazio ""
- Extraia todas as questões sem exceção`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: prompt }
            ]
          }]
        })
      }
    )

    const data = await response.json()
    console.log('Resposta Gemini:', JSON.stringify(data))
    const texto = data.candidates[0].content.parts[0].text.trim()
    const jsonLimpo = texto.replace(/```json|```/g, '').trim()
    questoesExtraidas = JSON.parse(jsonLimpo)

    setStatus(`✅ ${questoesExtraidas.length} questões extraídas com sucesso!`, 'sucesso')
    renderQuestoes(questoesExtraidas, materia, periodo, ano, semestre)

  } catch (err) {
    console.error(err)
    setStatus('❌ Erro ao extrair questões. Verifique a chave e tente novamente.', 'erro')
  }

  btnExtrair.disabled = false
})

// MODO MANUAL (colar JSON)
btnColarJson.addEventListener('click', () => {
  const { materia, periodo, ano, semestre, valido } = getDadosProva()
  if (!valido) return

  const jsonTexto = document.getElementById('json-input').value.trim()
  if (!jsonTexto) {
    setStatus('Cole o JSON no campo abaixo.', 'erro')
    return
  }

  try {
    questoesExtraidas = JSON.parse(jsonTexto)
    setStatus(`✅ ${questoesExtraidas.length} questões carregadas com sucesso!`, 'sucesso')
    renderQuestoes(questoesExtraidas, materia, periodo, ano, semestre)
  } catch (err) {
    setStatus('❌ JSON inválido. Verifique o formato.', 'erro')
  }
})

function getDadosProva() {
  const materia = document.getElementById('materia').value.trim()
  const periodo = document.getElementById('periodo').value
  const ano = document.getElementById('ano').value
  const semestre = document.getElementById('semestre').value

  if (!materia || !periodo || !ano) {
    setStatus('Preencha matéria, período e ano.', 'erro')
    return { valido: false }
  }

  return { materia, periodo, ano, semestre, valido: true }
}

function setStatus(msg, tipo) {
  adminStatus.textContent = msg
  adminStatus.style.color = tipo === 'erro' ? '#f87171' : tipo === 'sucesso' ? '#4ade80' : 'var(--accent)'
}

function renderQuestoes(questoes, materia, periodo, ano, semestre) {
  questoesContainer.innerHTML = ''

  const wrapper = document.createElement('div')
  wrapper.className = 'admin-card'
  wrapper.innerHTML = `
    <div class="sobre-label">${questoes.length} QUESTÕES · ${materia} · ${ano}.${semestre}</div>
    <div style="display:flex;flex-direction:column;gap:16px;margin-top:20px">
      ${questoes.map(q => `
        <div class="questao-card">
          <div class="questao-numero">QUESTÃO ${q.numero}</div>
          <div class="questao-enunciado">${q.enunciado}</div>
          <div class="alternativas-grid">
            <div class="alternativa-item"><span class="alternativa-letra">A)</span> ${q.alternativa_a}</div>
            <div class="alternativa-item"><span class="alternativa-letra">B)</span> ${q.alternativa_b}</div>
            <div class="alternativa-item"><span class="alternativa-letra">C)</span> ${q.alternativa_c}</div>
            <div class="alternativa-item"><span class="alternativa-letra">D)</span> ${q.alternativa_d}</div>
          </div>
          <div class="questao-gabarito">✓ Gabarito: ${q.gabarito}</div>
          ${q.comentario ? `<div class="questao-comentario">${q.comentario}</div>` : ''}
        </div>
      `).join('')}
    </div>
    <button class="btn-salvar-prova" id="btn-salvar">💾 Salvar prova no banco de dados</button>
  `
  questoesContainer.appendChild(wrapper)
  document.getElementById('btn-salvar').addEventListener('click', () => salvarProva(materia, periodo, ano, semestre))
}

async function salvarProva(materia, periodo, ano, semestre) {
  const btnSalvar = document.getElementById('btn-salvar')
  btnSalvar.textContent = 'Salvando...'
  btnSalvar.disabled = true

  const { data: prova, error: erroProva } = await supabase
    .from('provas')
    .insert({ materia, periodo: parseInt(periodo), ano: parseInt(ano), semestre: parseInt(semestre) })
    .select()
    .single()

  if (erroProva) {
    alert('Erro ao salvar prova: ' + erroProva.message)
    btnSalvar.disabled = false
    return
  }

  const questoesParaSalvar = questoesExtraidas.map(q => ({
    prova_id: prova.id,
    numero: q.numero,
    enunciado: q.enunciado,
    alternativa_a: q.alternativa_a,
    alternativa_b: q.alternativa_b,
    alternativa_c: q.alternativa_c,
    alternativa_d: q.alternativa_d,
    gabarito: q.gabarito,
    comentario: q.comentario || ''
  }))

  const { error: erroQuestoes } = await supabase
    .from('questoes')
    .insert(questoesParaSalvar)

  if (erroQuestoes) {
    alert('Erro ao salvar questões: ' + erroQuestoes.message)
    btnSalvar.disabled = false
    return
  }

  btnSalvar.textContent = '✅ Prova salva com sucesso!'
  btnSalvar.style.background = '#4ade80'
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}