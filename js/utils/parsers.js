import { cleanText } from './utils.js'

export function extractFirstJsonArray(text) {
  const semMarkdown = text.replace(/```json|```/gi, '').trim()

  const start = semMarkdown.indexOf('[')
  const end = semMarkdown.lastIndexOf(']')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Não foi possível localizar um array JSON na resposta.')
  }

  return semMarkdown.slice(start, end + 1)
}

export function normalizeQuestoes(input) {
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

export function normalizeQuestao(q, index) {
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
