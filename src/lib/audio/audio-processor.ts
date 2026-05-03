'use client'

/**
 * Client-side audio processor.
 * Files stay on the user's device — only processed metadata is sent to Supabase.
 * The instrumental stem is uploaded for karaoke playback.
 */

import type { ProcessingProgress, LyricsLine, PitchFrame } from '@/types/audio.types'
import { detectProcessingTier } from './capability-detect'
import { detectPitch } from './yin-detector'

type ProgressCallback = (p: ProcessingProgress) => void
type SupabaseClient = any

export async function processAudioFile(
  file: File,
  userId: string,
  supabase: SupabaseClient,
  onProgress: ProgressCallback,
  opts: { playlistId?: string } = {}
): Promise<string> {

  const tier = await detectProcessingTier()
  onProgress({ stage: 'analyzing', progress: 10, message: 'Analisando áudio...', tier })

  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0))

  // --- Vocal removal ---
  onProgress({ stage: 'separating', progress: 22, message: 'Removendo vocais...' })
  const stemBlob = await removeVocalsToBlob(audioBuffer)
  onProgress({ stage: 'separating', progress: 44, message: 'Pista instrumental pronta!' })

  // --- Whisper transcription ---
  onProgress({ stage: 'transcribing', progress: 50, message: 'Carregando Whisper...' })
  let lyricsLines: LyricsLine[] = []
  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.useBrowserCache = true
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      dtype: tier === 'webgpu' ? 'fp16' : 'fp32',
    })
    onProgress({ stage: 'transcribing', progress: 68, message: 'Transcrevendo letra...' })
    const result: any = await transcriber(mixToMono(audioBuffer), {
      return_timestamps: 'word',
      language: undefined,
      task: 'transcribe',
    })
    lyricsLines = groupTokensIntoLines(result.chunks ?? [])
    onProgress({ stage: 'transcribing', progress: 84, message: 'Letra extraída!' })
  } catch (err) {
    console.warn('Whisper failed:', err)
  }

  // --- Reference pitch ---
  onProgress({ stage: 'syncing', progress: 88, message: 'Extraindo pitch de referência...' })
  const referencePitch = extractReferencePitch(audioBuffer)
  await audioCtx.close()

  // --- Upload stem (instrumental only — original stays local) ---
  onProgress({ stage: 'syncing', progress: 92, message: 'Enviando pista instrumental...' })
  const stemPath = `${userId}/${Date.now()}_stem.webm`
  const { error: stemErr } = await supabase.storage
    .from('audio-stems')
    .upload(stemPath, stemBlob, { contentType: 'audio/webm', upsert: false })
  if (stemErr) console.warn('Stem upload failed:', stemErr.message)

  // --- Parse title/artist from filename ---
  const base = file.name.replace(/\.[^.]+$/, '')
  const parts = base.split(' - ')
  const title = parts.length > 1 ? parts[1].trim() : base
  const artist = parts.length > 1 ? parts[0].trim() : undefined

  const songIdentity = `${artist ? artist + ' - ' : ''}${title}`
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 -]/g, '').trim()

  // --- Save to DB ---
  onProgress({ stage: 'syncing', progress: 96, message: 'Salvando na base de dados...' })
  const { data: song, error: songErr } = await supabase.from('songs').insert({
    user_id: userId,
    title,
    artist,
    duration_seconds: Math.round(audioBuffer.duration),
    stems_storage_path: stemErr ? null : stemPath,
    lyrics_json: lyricsLines,
    reference_pitch_json: referencePitch.slice(0, 5000),
    original_filename: file.name,
    file_size_bytes: file.size,
    processing_tier: tier,
    rights_declared: true,
    song_identity: songIdentity,
  }).select().single()

  if (songErr) throw new Error(songErr.message)

  // --- Add to playlist ---
  const targetPlaylistId = opts.playlistId ?? (await getDefaultPlaylist(supabase, userId))
  if (targetPlaylistId) {
    await supabase.from('playlist_songs').insert({
      playlist_id: targetPlaylistId, song_id: song.id, position: 0,
    })
  }

  return song.id
}

async function getDefaultPlaylist(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from('playlists').select('id').eq('user_id', userId).eq('is_default', true).single()
  return data?.id ?? null
}

async function removeVocalsToBlob(audioBuffer: AudioBuffer): Promise<Blob> {
  const numCh = audioBuffer.numberOfChannels
  const offCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate)

  if (numCh >= 2) {
    const L = audioBuffer.getChannelData(0), R = audioBuffer.getChannelData(1)
    const mono = new Float32Array(L.length)
    for (let i = 0; i < L.length; i++) mono[i] = (L[i] - R[i]) * 0.5
    const buf = offCtx.createBuffer(1, mono.length, audioBuffer.sampleRate)
    buf.copyToChannel(mono, 0)
    const src = offCtx.createBufferSource(); src.buffer = buf; src.connect(offCtx.destination); src.start()
  } else {
    const src = offCtx.createBufferSource(); src.buffer = audioBuffer; src.connect(offCtx.destination); src.start()
  }

  const rendered = await offCtx.startRendering()
  return audioBufferToBlob(rendered)
}

function audioBufferToBlob(buf: AudioBuffer): Blob {
  const samples = buf.getChannelData(0)
  const wav = encodeWAV(samples, 1, buf.sampleRate)
  return new Blob([wav], { type: 'audio/webm' })
}

function encodeWAV(samples: Float32Array, ch: number, sr: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); offset += 2
  }
  return buf
}

function mixToMono(ab: AudioBuffer): Float32Array {
  const mono = new Float32Array(ab.length)
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const ch = ab.getChannelData(c)
    for (let i = 0; i < ab.length; i++) mono[i] += ch[i] / ab.numberOfChannels
  }
  return mono
}

function groupTokensIntoLines(chunks: any[]): LyricsLine[] {
  if (!chunks.length) return []
  const lines: LyricsLine[] = []; let cur: any[] = []; let lineStart = chunks[0]?.timestamp?.[0] ?? 0
  for (const c of chunks) {
    cur.push(c)
    const txt = cur.map((x: any) => x.text).join(' ')
    if (txt.length > 40 || c.text?.includes(',') || c.text?.includes('.')) {
      lines.push({ tokens: cur.map((x: any) => ({ word: x.text.trim(), start: x.timestamp?.[0] ?? 0, end: x.timestamp?.[1] ?? 0 })), start: lineStart, end: c.timestamp?.[1] ?? 0, text: txt.trim() })
      cur = []; lineStart = c.timestamp?.[1] ?? 0
    }
  }
  if (cur.length) lines.push({ tokens: cur.map((x: any) => ({ word: x.text.trim(), start: x.timestamp?.[0] ?? 0, end: x.timestamp?.[1] ?? 0 })), start: lineStart, end: cur[cur.length - 1]?.timestamp?.[1] ?? 0, text: cur.map((x: any) => x.text).join(' ').trim() })
  return lines
}

function extractReferencePitch(ab: AudioBuffer): PitchFrame[] {
  const mono = mixToMono(ab); const sr = ab.sampleRate; const fs = 2048; const hs = 512; const frames: PitchFrame[] = []
  for (let i = 0; i + fs < mono.length; i += hs) {
    const { frequency, confidence } = detectPitch(mono.slice(i, i + fs), sr)
    frames.push({ time: i / sr, frequency, confidence })
  }
  return frames
}
