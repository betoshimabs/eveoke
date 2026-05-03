import type { ProcessingTier } from '@/types/audio.types'

/**
 * Detects the best available audio processing tier for the current browser.
 * webgpu > wasm > lite
 */
export async function detectProcessingTier(): Promise<ProcessingTier> {
  // Check WebGPU
  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter()
      if (adapter) return 'webgpu'
    } catch {
      // WebGPU not available
    }
  }

  // Check WASM with SIMD support (SharedArrayBuffer proxy)
  try {
    if (typeof WebAssembly === 'object' && WebAssembly.validate) {
      // Minimal SIMD test
      const simdBytes = new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
        10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
      ])
      if (WebAssembly.validate(simdBytes)) return 'wasm'
    }
  } catch {
    // WASM SIMD not supported
  }

  return 'lite'
}

export function getTierLabel(tier: ProcessingTier): string {
  const labels: Record<ProcessingTier, string> = {
    webgpu: '⚡ GPU Accelerated',
    wasm: '🔧 WASM Mode',
    lite: '🐢 Compatibility Mode',
  }
  return labels[tier]
}

export function getTierDescription(tier: ProcessingTier): string {
  const descriptions: Record<ProcessingTier, string> = {
    webgpu: 'Seu device suporta aceleração por GPU. Processamento rápido!',
    wasm: 'Processando via WebAssembly. Pode levar alguns minutos.',
    lite: 'Modo compatibilidade ativado. Processamento alternativo em uso.',
  }
  return descriptions[tier]
}
