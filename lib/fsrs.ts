import { FSRS, Card, Rating, State, Grade, createEmptyCard } from 'ts-fsrs'

export { Rating, State }
export type { Card }

const scheduler = new FSRS({})

/** Cria um novo card vazio (primeira vez que o usuário estuda este tema). */
export function createCard(): Card {
  return createEmptyCard(new Date())
}

/**
 * Aplica uma avaliação ao card e retorna o novo estado.
 * @param card   Estado atual do card (do banco ou novo)
 * @param rating Again=1 | Hard=2 | Good=3 | Easy=4  (ts-fsrs Rating enum, excludes Manual=0)
 * @param now    Data/hora da revisão (padrão = agora)
 */
export function scheduleCard(card: Card, rating: Rating, now: Date = new Date()): Card {
  const preview = scheduler.repeat(card, now)
  return preview[rating as Grade].card
}

/**
 * Converte uma linha do banco (user_reviews) para o tipo Card do ts-fsrs.
 */
export function dbToCard(row: {
  stability:      number
  difficulty:     number
  elapsed_days:   number
  scheduled_days: number
  reps:           number
  lapses:         number
  state:          number   // 0=New,1=Learning,2=Review,3=Relearning
  last_review:    string | null
  next_review:    string
}): Card {
  return {
    stability:      row.stability,
    difficulty:     row.difficulty,
    elapsed_days:   row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps:           row.reps,
    lapses:         row.lapses,
    state:          row.state as State,
    last_review:    row.last_review ? new Date(row.last_review) : new Date(0),
    due:            new Date(row.next_review),
    learning_steps: 0,
  }
}

/**
 * Converte o novo Card para as colunas a serem salvas no banco.
 */
export function cardToDb(card: Card, now: Date = new Date()) {
  return {
    stability:      card.stability,
    difficulty:     card.difficulty,
    elapsed_days:   card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps:           card.reps,
    lapses:         card.lapses,
    state:          card.state as number,
    last_review:    now.toISOString(),
    next_review:    card.due.toISOString(),
    updated_at:     now.toISOString(),
  }
}

/** Retorna quantos dias até a próxima revisão (0 = hoje, -X = atrasado). */
export function daysUntil(nextReview: string): number {
  const diff = new Date(nextReview).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
