import { extrairQuestoesDoPdf } from './api/geminiApi.js'
import { salvarProvaEBanco } from './api/adminApi.js'
import { setStatus, renderQuestoesAdmin } from './ui/adminUi.js'
import { normalizeQuestoes } from './utils/parsers.js'

const btnExtrair = document.getElementById('btn-extrair')
const btnColarJson = document.getElementById('btn-colar-json')
const adminStatus = document.getElementById('admin-status')
const questoesContainer = document.getElementById('questoes-container')

let questoesExtraidas = []

btnExtrair.addEventListener('click', async () => {
  const { materia, ano, semestre, valido } = getDadosProva()
  if (!valido) return

  const pdfInput = document.getElementById('pdf-input')
  if (!pdfInput.files[0]) {
    setStatus(adminStatus, 'Selecione um PDF.', 'erro')
    return
  }

  btnExtrair.disabled = true
  setStatus(adminStatus, '🤖 Enviando PDF para o Claude...', 'info')

  try {
    const file = pdfInput.files[0]
    questoesExtraidas = await extrairQuestoesDoPdf(file)

    setStatus(adminStatus, `✅ ${questoesExtraidas.length} questões extraídas com sucesso!`, 'sucesso')
    renderQuestoesAdmin(questoesContainer, questoesExtraidas, materia, ano, semestre, handleSalvarProva)
  } catch (err) {
    console.error(err)
    setStatus(adminStatus, `❌ Erro ao extrair questões: ${err.message}`, 'erro')
  } finally {
    btnExtrair.disabled = false
  }
})

btnColarJson.addEventListener('click', () => {
  const { materia, ano, semestre, valido } = getDadosProva()
  if (!valido) return

  const jsonTexto = document.getElementById('json-input').value.trim()
  if (!jsonTexto) {
    setStatus(adminStatus, 'Cole o JSON no campo abaixo.', 'erro')
    return
  }

  try {
    const parsed = JSON.parse(jsonTexto)
    questoesExtraidas = normalizeQuestoes(parsed)

    setStatus(adminStatus, `✅ ${questoesExtraidas.length} questões carregadas com sucesso!`, 'sucesso')
    renderQuestoesAdmin(questoesContainer, questoesExtraidas, materia, ano, semestre, handleSalvarProva)
  } catch (err) {
    console.error(err)
    setStatus(adminStatus, `❌ JSON inválido: ${err.message}`, 'erro')
  }
})

function getDadosProva() {
  const materia = document.getElementById('materia').value.trim()
  const periodo = document.getElementById('periodo').value
  const ano = document.getElementById('ano').value
  const semestre = document.getElementById('semestre').value

  if (!materia || !periodo || !ano) {
    setStatus(adminStatus, 'Preencha matéria, período e ano.', 'erro')
    return { valido: false }
  }

  return { materia, periodo, ano, semestre, valido: true }
}

async function handleSalvarProva() {
  const { materia, periodo, ano, semestre, valido } = getDadosProva()
  if (!valido) return

  const btnSalvar = document.getElementById('btn-salvar')
  btnSalvar.textContent = 'Salvando...'
  btnSalvar.disabled = true

  try {
    await salvarProvaEBanco(materia, periodo, ano, semestre, questoesExtraidas)

    btnSalvar.textContent = '✅ Prova salva com sucesso!'
    btnSalvar.style.background = '#4ade80'
    setStatus(adminStatus, '✅ Prova e questões salvas com sucesso!', 'sucesso')
  } catch (err) {
    console.error(err)
    alert(err.message)
    btnSalvar.textContent = 'Salvar prova no banco de dados'
    btnSalvar.disabled = false
  }
}
