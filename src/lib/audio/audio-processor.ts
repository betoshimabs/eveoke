'use client'

/**
 * Client-side audio processor orchestrator.
 * Coordinates Whisper transcription, vocal removal, and pitch extraction.
 * Runs entirely in the user's browser — no audio sent to server.
 *
 * IMPORTANT: This file MUST remain a Client Component to prevent
 * Turbopack from trying to bundle WASM/WebGPU assets server-side.
 */

import type { ProcessingProgress, ProcessingTier, LyricsLine, PitchFrame } from '@/types/audio.types'
import { detectProcessingTier } from './capability-detect'
import { detectPitch } from './yin-detector'

type ProgressCallback = (progress: ProcessingProgress) => void
type SupabaseClient = any

export async function processAudioFile(
  file: File,
  userId: string,
  supabase: SupabaseClient,
  onProgress: ProgressCallback
): Promise<string> {
  const tier = await detectProcessingTier()

  onProgress({ stage: 'analyzing', progress: 10, message: 'Detectando capacidades do dispositivo...', tier })

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0))

  onProgress({ stage: 'separating', progress: 20, message: 'Removendo vocais da pista...' })

  // Vocal removal via EQ filtering (lite tier) or placeholder for full Demucs
  let instrumentalBlob: Blob
  if (tier === 'webgpu' || tier === 'wasm') {
    instrumentalBlob = await removeVocalsEQ(audioBuffer, audioCtx)
  } else {
    instrumentalBlob = await removeVocalsEQ(audioBuffer, audioCtx)
  }

  onProgress({ stage: 'separating', progress: 45, message: 'Stems separados com sucesso!' })

  // Whisper transcription
  onProgress({ stage: 'transcribing', progress: 50, message: 'Transcrevendo letra com timestamps...' })

  let lyricsLines: LyricsLine[] = []
  let referencePitch: PitchFrame[] = []

  try {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.useBrowserCache = true

    onProgress({ stage: 'transcribing', progress: 60, message: 'Carregando modelo Whisper...' })

    const transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-small',
      { dtype: tier === 'webgpu' ? 'fp16' : 'fp32' }
    )

    onProgress({ stage: 'transcribing', progress: 75, message: 'Transcrevendo letra...' })

    // Convert AudioBuffer to Float32Array for Whisper
    const mono = mixToMono(audioBuffer)

    const result: any = await transcriber(mono, {
      return_timestamps: 'word',
      language: undefined, // auto-detect
      task: 'transcribe',
    })

    lyricsLines = groupTokensIntoLines(result.chunks ?? [])

    onProgress({ stage: 'transcribing', progress: 88, message: 'Letra extraída!' })
  } catch (err) {
    console.warn('Whisper failed, using empty lyrics:', err)
    lyricsLines = []
  }

  // Extract reference pitch from original audio
  onProgress({ stage: 'syncing', progress: 90, message: 'Extraindo curva de pitch de referência...' })
  referencePitch = extractReferencePitch(audioBuffer)

  onProgress({ stage: 'syncing', progress: 95, message: 'Salvando no banco de dados...' })

  // Parse title/artist from filename
  const filename = file.name.replace(/\.[^.]+$/, '')
  const parts = filename.split(' - ')
  const title = parts.length > 1 ? parts[1].trim() : filename
  const artist = parts.length > 1 ? parts[0].trim() : undefined

  // Upload instrumental to Supabase Storage
  const stemPath = `${userId}/${Date.now()}_instrumental.webm`
  const { error: uploadError } = await supabase.storage
    .from('audio-stems')
    .upload(stemPath, instrumentalBlob, { contentType: 'audio/webm', upsert: false })

  if (uploadError) {
    console.warn('Storage upload failed:', uploadError.message)
  }

  // Save song record
  const { data: song, error: songError } = await supabase
    .from('songs')
    .insert({
      user_id: userId,
      title,
      artist,
      duration_seconds: Math.round(audioBuffer.duration),
      stems_storage_path: uploadError ? null : stemPath,
      lyrics_json: lyricsLines,
      reference_pitch_json: referencePitch.slice(0, 5000), // limit size
      original_filename: file.name,
      processing_tier: tier,
    })
    .select()
    .single()

  if (songError) throw new Error(songError.message)

  await audioCtx.close()
  return song.id
}

/**
 * Removes vocals using frequency-domain EQ (center-channel cancellation).
 * Works by subtracting the center channel (where vocals typically live).
 */
async function removeVocalsEQ(audioBuffer: AudioBuffer, ctx: AudioContext): Promise<Blob> {
  const offlineCtx = new OfflineAudioContext(
    1, // mono output
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer

  // High-pass filter to reduce low-freq bleed
  const highPass = offlineCtx.createBiquadFilter()
  highPass.type = 'highpass'
  highPass.frequency.value = 80

  // If stereo, do center-channel cancellation
  if (audioBuffer.numberOfChannels >= 2) {
    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)
    const mono = new Float32Array(left.length)
    for (let i = 0; i < left.length; i++) {
      // Center channel cancellation: subtract common signal
      mono[i] = (left[i] - right[i]) * 0.5
    }
    const monoBuffer = offlineCtx.createBuffer(1, mono.length, audioBuffer.sampleRate)
    monoBuffer.copyToChannel(mono, 0)
    const monoSource = offlineCtx.createBufferSource()
    monoSource.buffer = monoBuffer
    monoSource.connect(highPass)
    highPass.connect(offlineCtx.destination)
    monoSource.start()
  } else {
    source.connect(highPass)
    highPass.connect(offlineCtx.destination)
    source.start()
  }

  const rendered = await offlineCtx.startRendering()
  return audioBufferToBlob(rendered)
}

function audioBufferToBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const length = buffer.length
  const sampleRate = buffer.sampleRate
  const interleaved = new Float32Array(length * numChannels)

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      interleaved[i * numChannels + channel] = channelData[i]
    }
  }

  // Encode as WAV
  const wavBuffer = encodeWAV(interleaved, numChannels, sampleRate)
  return new Blob([wavBuffer], { type: 'audio/wav' })
}

function encodeWAV(samples: Float32Array, numChannels: number, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }
  return buffer
}

function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < numChannels; c++) {
    const ch = audioBuffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += ch[i] / numChannels
  }
  return mono
}

function groupTokensIntoLines(chunks: any[]): LyricsLine[] {
  if (!chunks.length) return []
  const lines: LyricsLine[] = []
  let currentLine: any[] = []
  let lineStart = chunks[0]?.timestamp?.[0] ?? 0

  for (const chunk of chunks) {
    currentLine.push(chunk)
    const text = currentLine.map((c: any) => c.text).join(' ')
    if (text.length > 40 || chunk.text?.includes(',') || chunk.text?.includes('.')) {
      lines.push({
        tokens: currentLine.map((c: any) => ({
          word: c.text.trim(),
          start: c.timestamp?.[0] ?? 0,
          end: c.timestamp?.[1] ?? 0,
        })),
        start: lineStart,
        end: chunk.timestamp?.[1] ?? 0,
        text: text.trim(),
      })
      currentLine = []
      lineStart = chunk.timestamp?.[1] ?? 0
    }
  }

  if (currentLine.length > 0) {
    lines.push({
      tokens: currentLine.map((c: any) => ({
        word: c.text.trim(),
        start: c.timestamp?.[0] ?? 0,
        end: c.timestamp?.[1] ?? 0,
      })),
      start: lineStart,
      end: currentLine[currentLine.length - 1]?.timestamp?.[1] ?? 0,
      text: currentLine.map((c: any) => c.text).join(' ').trim(),
    })
  }

  return lines
}

function extractReferencePitch(audioBuffer: AudioBuffer): PitchFrame[] {
  const mono = mixToMono(audioBuffer)
  const sampleRate = audioBuffer.sampleRate
  const frameSize = 2048
  const hopSize = 512
  const frames: PitchFrame[] = []

  for (let i = 0; i + frameSize < mono.length; i += hopSize) {
    const frame = mono.slice(i, i + frameSize)
    const { frequency, confidence } = detectPitch(frame, sampleRate)
    frames.push({ time: i / sampleRate, frequency, confidence })
  }

  return frames
}
