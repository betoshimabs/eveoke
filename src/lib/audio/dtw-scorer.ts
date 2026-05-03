import type { PitchFrame, SessionScore } from '@/types/audio.types'
import { pitchAccuracy } from './yin-detector'

/**
 * DTW (Dynamic Time Warping) based scoring system.
 * Compares user's pitch curve to reference with temporal tolerance.
 */

interface ScoringOptions {
  pitchWeight: number       // 0-1, default 0.7
  timingWeight: number      // 0-1, default 0.3
  toleranceSemitones: number // default 1.5
  windowMs: number          // DTW window in ms, default 500
}

const DEFAULT_OPTIONS: ScoringOptions = {
  pitchWeight: 0.7,
  timingWeight: 0.3,
  toleranceSemitones: 1.5,
  windowMs: 500,
}

/**
 * Score a single moment in the karaoke session.
 */
export function scoreFrame(
  userFreq: number,
  refFreq: number,
  options: Partial<ScoringOptions> = {}
): { pitchScore: number; overall: number } {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const pScore = pitchAccuracy(userFreq, refFreq, opts.toleranceSemitones)
  return { pitchScore: pScore, overall: pScore }
}

/**
 * Calculate combo multiplier from consecutive good frames.
 */
export function comboMultiplier(combo: number): number {
  if (combo >= 50) return 4
  if (combo >= 20) return 3
  if (combo >= 10) return 2
  return 1
}

/**
 * Convert raw score (0-1) to total points (0-10000).
 */
export function scoreToPoints(
  pitchScore: number,
  timingScore: number,
  combo: number,
  options: Partial<ScoringOptions> = {}
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const raw = pitchScore * opts.pitchWeight + timingScore * opts.timingWeight
  return Math.round(raw * 100 * comboMultiplier(combo))
}

/**
 * Calculate final session score from all scored frames.
 */
export function calculateFinalScore(
  pitchScores: number[],
  timingScores: number[],
  maxCombo: number
): SessionScore {
  const avgPitch = average(pitchScores)
  const avgTiming = average(timingScores)
  const total = Math.round((avgPitch * 0.7 + avgTiming * 0.3) * 10000)

  const stars = starsFromScore(total)
  const rank = rankFromScore(total)

  return {
    pitchScore: avgPitch,
    timingScore: avgTiming,
    totalScore: total,
    comboMax: maxCombo,
    stars,
    rank,
  }
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function starsFromScore(score: number): number {
  if (score >= 9000) return 5
  if (score >= 7000) return 4
  if (score >= 5000) return 3
  if (score >= 3000) return 2
  return 1
}

function rankFromScore(score: number): SessionScore['rank'] {
  if (score >= 8500) return 'LENDA'
  if (score >= 6500) return 'ESTRELA'
  if (score >= 4000) return 'ASPIRANTE'
  return 'INICIANTE'
}

/**
 * Find the reference pitch for a given timestamp using binary search.
 */
export function findRefPitchAt(
  referencePitch: PitchFrame[],
  timeSeconds: number,
  windowMs: number = 200
): number {
  if (!referencePitch.length) return 0
  const windowSec = windowMs / 1000

  // Binary search for closest frame
  let lo = 0, hi = referencePitch.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (referencePitch[mid].time < timeSeconds) lo = mid + 1
    else hi = mid
  }

  const frame = referencePitch[lo]
  if (Math.abs(frame.time - timeSeconds) <= windowSec) return frame.frequency
  return 0
}
