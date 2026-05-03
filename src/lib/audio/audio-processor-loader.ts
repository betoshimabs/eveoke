/**
 * Lazy loader for the heavy audio processor.
 * Using this pattern prevents Turbopack from SSR-bundling
 * Transformers.js / ONNX WASM during the server build phase.
 */

import type { ProcessingProgress } from '@/types/audio.types'

type SupabaseClient = any
type ProgressCallback = (p: ProcessingProgress) => void

export async function loadAndProcessAudio(
  file: File,
  userId: string,
  supabase: SupabaseClient,
  onProgress: ProgressCallback
): Promise<string> {
  // Dynamic import evaluated at RUNTIME only, never statically traced by Turbopack
  const mod = await import('./audio-processor')
  return mod.processAudioFile(file, userId, supabase, onProgress)
}
