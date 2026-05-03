/// <reference lib="webworker" />

/**
 * AudioWorklet Processor for EveOkê
 * Captures raw PCM Float32 audio from the microphone.
 * Runs in a dedicated audio rendering thread.
 *
 * Compatible with: Chrome, Firefox, Safari 14.5+
 * No codec dependency — sends raw PCM for pitch analysis.
 */

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: AudioWorkletNodeOptions)
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}

declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void
declare const sampleRate: number

class MicProcessor extends AudioWorkletProcessor {
  private _bufferSize: number
  private _buffer: Float32Array
  private _writeIndex: number

  constructor() {
    super()
    this._bufferSize = 2048 // ~46ms at 44.1kHz
    this._buffer = new Float32Array(this._bufferSize)
    this._writeIndex = 0
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channel = input[0]

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._writeIndex++] = channel[i]

      if (this._writeIndex >= this._bufferSize) {
        // Send filled buffer to the main thread
        this.port.postMessage({
          type: 'pcm',
          buffer: this._buffer.slice(),
          sampleRate: sampleRate,
        })
        this._writeIndex = 0
      }
    }

    return true
  }
}

registerProcessor('mic-processor', MicProcessor)
