export interface Prova {
  id: string
  materia: string
  periodo: number
  ano: number
  semestre: number
}

export interface Questao {
  id: string
  prova_id: string
  numero: number
  tipo?: string
  enunciado: string
  alternativa_a: string
  alternativa_b: string
  alternativa_c: string
  alternativa_d: string
  alternativa_e?: string
  gabarito: string
  comentario?: string
}

export interface ExamAttempt {
  id: string
  user_id: string
  prova_id: string
  score: number
  total: number
  finalizada: boolean
  created_at: string
  provas?: {
    materia: string
    ano: number
    semestre: number
  }
}

export interface AttemptAnswer {
  id: string
  attempt_id: string
  questao_id: string
  resposta_usuario: string
  correta: boolean | number
}
