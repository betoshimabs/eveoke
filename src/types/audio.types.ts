// ============================================================
// EveOkê — Audio & Session Types
// ============================================================

export type ProcessingTier = 'webgpu' | 'wasm' | 'lite'

export interface LyricsToken {
  word: string
  start: number // seconds
  end: number   // seconds
}

export interface LyricsLine {
  tokens: LyricsToken[]
  start: number
  end: number
  text: string
}

export interface PitchFrame {
  time: number       // seconds
  frequency: number  // Hz (0 = unvoiced)
  confidence: number // 0-1
}

export interface ProcessingProgress {
  stage: 'analyzing' | 'separating' | 'transcribing' | 'syncing' | 'complete' | 'error'
  progress: number // 0-100
  message: string
  tier?: ProcessingTier
}

export interface ProcessedSong {
  id: string
  title: string
  artist?: string
  duration: number
  stemsBlobUrl: string       // instrumental track URL (blob)
  lyricsLines: LyricsLine[]
  referencePitch: PitchFrame[]
  processingTier: ProcessingTier
}

export interface ScoreFrame {
  time: number
  userPitch: number
  refPitch: number
  pitchScore: number   // 0-1
  timingScore: number  // 0-1
  combo: number
}

export interface SessionScore {
  timingScore: number  // 0-1
  pitchScore: number   // 0-1
  totalScore: number   // 0-10000
  comboMax: number
  stars: number        // 1-5
  rank: 'INICIANTE' | 'ASPIRANTE' | 'ESTRELA' | 'LENDA'
}

export interface MicSession {
  sessionId: string
  token: string
  status: 'waiting' | 'connected' | 'expired'
  expiresAt: string
}

export type AudioCaptureStrategy = 'audioworklet' | 'mediarecorder-webm' | 'mediarecorder-mp4'
