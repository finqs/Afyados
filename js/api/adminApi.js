import { supabase } from '../supabase.js'

export async function salvarProvaEBanco(materia, periodo, ano, semestre, questoesExtraidas) {
  if (!questoesExtraidas.length) {
    throw new Error('Nenhuma questão válida para salvar.')
  }

  const peri = parseInt(periodo, 10)
  const an = parseInt(ano, 10)
  const sem = parseInt(semestre, 10)

  if (isNaN(peri) || isNaN(an)) {
    throw new Error('Período e ano devem ser valores numéricos válidos.')
  }

  const { data: prova, error: erroProva } = await supabase
    .from('provas')
    .insert({
      materia,
      periodo: peri,
      ano: an,
      semestre: isNaN(sem) ? null : sem
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

  return true;
}
