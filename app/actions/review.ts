'use server'

import { createClient } from '@supabase/supabase-js'
import { Rating } from 'ts-fsrs'
import { scheduleCard, dbToCard, createCard, cardToDb } from '@/lib/fsrs'

// Mapeamento de input 0-3 para ts-fsrs Rating (1-4)
// 0 = Errei (Again), 1 = Difícil (Hard), 2 = Bom (Good), 3 = Fácil (Easy)
const RATING_MAP: Record<0 | 1 | 2 | 3, Rating> = {
  0: Rating.Again,
  1: Rating.Hard,
  2: Rating.Good,
  3: Rating.Easy,
}

export type ReviewInput = 0 | 1 | 2 | 3

export interface ReviewResult {
  ok: boolean
  nextReview?: string   // ISO string
  daysUntil?: number    // dias até a próxima revisão
  error?: string
}

/**
 * Server Action: processa a auto-avaliação do usuário após um simulado
 * e persiste o novo estado FSRS em user_reviews.
 *
 * @param token    Bearer token do usuário (de supabase.auth.getSession())
 * @param materia  Ex: "SOI"
 * @param area     Ex: "Sistema Nervoso"
 * @param rating   0=Errei | 1=Difícil | 2=Bom | 3=Fácil
 */
export async function submitReview(
  token: string,
  materia: string,
  area: string,
  rating: ReviewInput,
): Promise<ReviewResult> {
  // Validação básica
  if (!token) return { ok: false, error: 'Token ausente.' }
  if (!materia || !area) return { ok: false, error: 'Matéria e área são obrigatórias.' }
  if (![0, 1, 2, 3].includes(rating)) return { ok: false, error: 'Avaliação inválida.' }

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svcKey) return { ok: false, error: 'Configuração do servidor ausente.' }

  // Usar service role para escrever; validar usuário pelo token
  const sb = createClient(url, svcKey)
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return { ok: false, error: 'Sessão inválida. Faça login novamente.' }

  const fsrsRating = RATING_MAP[rating]
  const now = new Date()

  // Buscar card existente ou criar novo
  const { data: existing } = await sb
    .from('user_reviews')
    .select('stability,difficulty,elapsed_days,scheduled_days,reps,lapses,state,last_review,next_review')
    .eq('user_id', user.id)
    .eq('materia', materia)
    .eq('area', area)
    .maybeSingle()

  const currentCard = existing ? dbToCard(existing) : createCard()
  const nextCard    = scheduleCard(currentCard, fsrsRating, now)
  const dbFields    = cardToDb(nextCard, now)

  const { error: upsertErr } = await sb
    .from('user_reviews')
    .upsert(
      { user_id: user.id, materia, area, ...dbFields },
      { onConflict: 'user_id,materia,area' }
    )

  if (upsertErr) {
    console.error('FSRS upsert error:', upsertErr.message)
    return { ok: false, error: 'Erro ao salvar revisão.' }
  }

  const diff = nextCard.due.getTime() - now.getTime()
  const daysUntil = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))

  return { ok: true, nextReview: nextCard.due.toISOString(), daysUntil }
}
