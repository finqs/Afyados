import { supabase } from './supabase.js'

const btnExtrair = document.getElementById('btn-extrair')
const btnColarJson = document.getElementById('btn-colar-json')
const adminStatus = document.getElementById('admin-status')
const questoesContainer = document.getElementById('questoes-container')

let questoesExtraidas = []
let respostaBrutaIA = ''

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

  btnExtrair.disabled = true
  setStatus('Enviando PDF para o Gemini...', 'info')

  try {
    const file = pdfInput.files[0]
    const base64 = await fileToBase64(file)

    const prompt = `
Extraia TODAS as questões de múltipla escolha desta prova de medicina e retorne APENAS um JSON válido.
Não escreva texto antes ou depois.
Não use markdown.
Não use backticks.

Formato esperado:
[
  {
    "numero": 1,
    "enunciado": "texto completo do enunciado",
    "alternativa_a": "texto da alternativa A",
    "alternativa_b": "texto da alternativa B",
    "alternativa_c": "texto da alternativa C",
    "alternativa_d": "texto da alternativa D",
    "alternativa_e": "texto da alternativa E se existir, senão string vazia",
    "gabarito": "A",
    "comentario": "explicação do gabarito se disponível"
  }
]

Regras:
- Inclua apenas questões de múltipla escolha
- Ignore questões discursivas
- Extraia todas as questões sem exceção
- Inclua o enunciado completo
- Preserve o texto das alternativas
- Se a questão não tiver alternativa E, use ""
- O gabarito deve ser somente uma letra: A, B, C, D ou E
- Se não houver comentário, use ""
- Retorne somente um array JSON válido
`.trim()

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: base64
                  }
                },
                { text: prompt }
              ]
            }
          ]
        })
      }
    )

    const data = await response.json()
    console.log('Resposta Gemini:', data)

    if (!response.ok) {
      throw new Error(data?.error?.message || 'Erro na API do Gemini.')
    }

    const texto =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('\n')
        .trim() || ''

    if (!texto) {
      throw new Error('A IA não retornou texto utilizável.')
    }

    respostaBrutaIA = texto

    const jsonLimpo = extractFirstJsonArray(texto)
    const parsed = JSON.parse(jsonLimpo)
    const normalizadas = normalizeQuestoes(parsed)

    if (!normalizadas.length) {
      throw new Error('Nenhuma questão válida foi encontrada.')
    }

    questoesExtraidas = normalizadas

    setStatus(`✅ ${questoesExtraidas.length} questões extraídas com sucesso!`, 'sucesso')
    renderQuestoes(questoesExtraidas, materia, periodo, ano, semestre)
  } catch (err) {
    console.error(err)
    setStatus(`❌ Erro ao extrair questões: ${err.message}`, 'erro')
  } finally {
    btnExtrair.disabled = false
  }
})

btnColarJson.addEventListener('click', () => {
  const { materia, periodo, ano, semestre, valido } = getDadosProva()
  if (!valido) return

  const jsonTexto = document.getElementById('json-input').value.trim()
  if (!jsonTexto) {
    setStatus('Cole o JSON no campo abaixo.', 'erro')
    return
  }

  try {
    const parsed = JSON.parse(jsonTexto)
    const normalizadas = normalizeQuestoes(parsed)

    if (!normalizadas.length) {
      throw new Error('Nenhuma questão válida foi encontrada no JSON.')
    }

    questoesExtraidas = normalizadas
    respostaBrutaIA = jsonTexto

    setStatus(`✅ ${questoesExtraidas.length} questões carregadas com sucesso!`, 'sucesso')
    renderQuestoes(questoesExtraidas, materia, periodo, ano, semestre)
  } catch (err) {
    console.error(err)
    setStatus(`❌ JSON inválido: ${err.message}`, 'erro')
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
  adminStatus.style.color =
    tipo === 'erro'
      ? '#f87171'
      : tipo === 'sucesso'
      ? '#4ade80'
      : 'var(--accent)'
}

function renderQuestoes(questoes, materia, periodo, ano, semestre) {
  questoesContainer.innerHTML = ''

  const wrapper = document.createElement('div')
  wrapper.className = 'admin-card'

  wrapper.innerHTML = `
    <h3>${questoes.length} QUESTÕES · ${escapeHtml(materia)} · ${escapeHtml(ano)}.${escapeHtml(semestre)}</h3>
    ${questoes
      .map(
        q => `
        <div class="questao-admin-item" style="margin-bottom: 1.5rem; padding: 1rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;">
          <h4>QUESTÃO ${q.numero}</h4>
          <p>${escapeHtml(q.enunciado)}</p>
          <p><strong>A)</strong> ${escapeHtml(q.alternativa_a)}</p>
          <p><strong>B)</strong> ${escapeHtml(q.alternativa_b)}</p>
          <p><strong>C)</strong> ${escapeHtml(q.alternativa_c)}</p>
          <p><strong>D)</strong> ${escapeHtml(q.alternativa_d)}</p>
          ${
            q.alternativa_e
              ? `<p><strong>E)</strong> ${escapeHtml(q.alternativa_e)}</p>`
              : ''
          }
          <p><strong>✓ Gabarito:</strong> ${escapeHtml(q.gabarito)}</p>
          ${
            q.comentario
              ? `<div style="margin-top: .75rem;"><strong>Comentário:</strong><br>${escapeHtml(q.comentario)}</div>`
              : ''
          }
        </div>
      `
      )
      .join('')}
    <button id="btn-salvar">Salvar prova no banco de dados</button>
  `

  questoesContainer.appendChild(wrapper)

  const btnSalvar = document.getElementById('btn-salvar')
  btnSalvar.addEventListener('click', () => salvarProva(materia, periodo, ano, semestre))
}

async function salvarProva(materia, periodo, ano, semestre) {
  if (!questoesExtraidas.length) {
    alert('Nenhuma questão válida para salvar.')
    return
  }

  const btnSalvar = document.getElementById('btn-salvar')
  btnSalvar.textContent = 'Salvando...'
  btnSalvar.disabled = true

  try {
    const { data: prova, error: erroProva } = await supabase
      .from('provas')
      .insert({
        materia,
        periodo: parseInt(periodo, 10),
        ano: parseInt(ano, 10),
        semestre: parseInt(semestre, 10)
        // Se depois você criar colunas extras, pode incluir:
        // resposta_bruta_ia: respostaBrutaIA
      })
      .select()
      .single()

    if (erroProva) {
      throw new Error(`Erro ao salvar prova: ${erroProva.message}`)
    }

    const questoesParaSalvar = questoesExtraidas.map(q => ({
      prova_id: prova.id,
      numero: q.numero,
      enunciado: q.enunciado,
      alternativa_a: q.alternativa_a,
      alternativa_b: q.alternativa_b,
      alternativa_c: q.alternativa_c,
      alternativa_d: q.alternativa_d,
      alternativa_e: q.alternativa_e || '',
      gabarito: q.gabarito,
      comentario: q.comentario || ''
    }))

    const { error: erroQuestoes } = await supabase
      .from('questoes')
      .insert(questoesParaSalvar)

    if (erroQuestoes) {
      throw new Error(`Erro ao salvar questões: ${erroQuestoes.message}`)
    }

    btnSalvar.textContent = '✅ Prova salva com sucesso!'
    btnSalvar.style.background = '#4ade80'
    setStatus('✅ Prova e questões salvas com sucesso!', 'sucesso')
  } catch (err) {
    console.error(err)
    alert(err.message)
    btnSalvar.textContent = 'Salvar prova no banco de dados'
    btnSalvar.disabled = false
  }
}

function normalizeQuestoes(input) {
  if (!Array.isArray(input)) {
    throw new Error('O JSON precisa ser um array de questões.')
  }

  const normalizadas = input
    .map((q, index) => normalizeQuestao(q, index))
    .filter(Boolean)

  if (!normalizadas.length) {
    throw new Error('Nenhuma questão válida foi encontrada após a normalização.')
  }

  return normalizadas
}

function normalizeQuestao(q, index) {
  if (!q || typeof q !== 'object') return null

  const numero = parseInt(q.numero, 10)
  const enunciado = cleanText(q.enunciado)
  const alternativa_a = cleanText(q.alternativa_a)
  const alternativa_b = cleanText(q.alternativa_b)
  const alternativa_c = cleanText(q.alternativa_c)
  const alternativa_d = cleanText(q.alternativa_d)
  const alternativa_e = cleanText(q.alternativa_e)
  const comentario = cleanText(q.comentario)

  let gabarito = cleanText(q.gabarito).toUpperCase()
  gabarito = gabarito.replace(/[^A-E]/g, '').charAt(0)

  if (!numero || !enunciado || !alternativa_a || !alternativa_b || !alternativa_c || !alternativa_d) {
    console.warn(`Questão ignorada por campos obrigatórios ausentes no índice ${index}:`, q)
    return null
  }

  if (!gabarito || !['A', 'B', 'C', 'D', 'E'].includes(gabarito)) {
    gabarito = ''
  }

  if (gabarito === 'E' && !alternativa_e) {
    console.warn(`Questão ${numero} tem gabarito E, mas não possui alternativa E.`)
  }

  return {
    numero,
    enunciado,
    alternativa_a,
    alternativa_b,
    alternativa_c,
    alternativa_d,
    alternativa_e,
    gabarito,
    comentario
  }
}

function extractFirstJsonArray(text) {
  const semMarkdown = text.replace(/```json|```/gi, '').trim()

  const start = semMarkdown.indexOf('[')
  const end = semMarkdown.lastIndexOf(']')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Não foi possível localizar um array JSON na resposta.')
  }

  return semMarkdown.slice(start, end + 1)
}

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}