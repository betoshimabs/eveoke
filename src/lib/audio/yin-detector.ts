/**
 * YIN Pitch Detection Algorithm
 * Detects fundamental frequency from raw PCM audio data.
 * Works entirely in the browser via Web Audio API — no ML needed.
 */

const DEFAULT_SAMPLE_RATE = 44100
const YIN_THRESHOLD = 0.15

/**
 * Detect pitch from a Float32Array buffer using the YIN algorithm.
 * Returns frequency in Hz, or 0 if unvoiced.
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): { frequency: number; confidence: number } {
  const bufferSize = buffer.length
  const halfSize = Math.floor(bufferSize / 2)
  const yinBuffer = new Float32Array(halfSize)

  // Step 1: Difference function
  yinBuffer[0] = 1
  let runningSum = 0

  for (let tau = 1; tau < halfSize; tau++) {
    let sum = 0
    for (let i = 0; i < halfSize; i++) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    yinBuffer[tau] = sum

    // Step 2: Cumulative mean normalized difference
    runningSum += sum
    yinBuffer[tau] *= tau / runningSum
  }

  // Step 3: Absolute threshold
  let tau = 2
  while (tau < halfSize) {
    if (yinBuffer[tau] < YIN_THRESHOLD) {
      // Step 4: Parabolic interpolation
      while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++
      }
      const betterTau = parabolicInterpolation(yinBuffer, tau)
      const frequency = sampleRate / betterTau
      const confidence = 1 - yinBuffer[tau]
      return { frequency, confidence }
    }
    tau++
  }

  return { frequency: 0, confidence: 0 }
}

function parabolicInterpolation(array: Float32Array, x: number): number {
  const x0 = x < 1 ? x : x - 1
  const x2 = x + 1 < array.length ? x + 1 : x
  if (x0 === x) return array[x] <= array[x2] ? x : x2
  if (x2 === x) return array[x] <= array[x0] ? x : x0
  const s0 = array[x0]
  const s1 = array[x]
  const s2 = array[x2]
  return x + (s2 - s0) / (2 * (2 * s1 - s2 - s0))
}

/**
 * Convert frequency (Hz) to MIDI note number.
 */
export function frequencyToMidi(freq: number): number {
  if (freq <= 0) return -1
  return 12 * Math.log2(freq / 440) + 69
}

/**
 * Convert frequency (Hz) to note name (e.g. "A4", "C#3").
 */
export function frequencyToNoteName(freq: number): string {
  if (freq <= 0) return '—'
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const midi = Math.round(frequencyToMidi(freq))
  const octave = Math.floor(midi / 12) - 1
  const note = noteNames[midi % 12]
  return `${note}${octave}`
}

/**
 * Calculate semitone difference between two frequencies.
 */
export function semitoneDiff(freq1: number, freq2: number): number {
  if (freq1 <= 0 || freq2 <= 0) return Infinity
  return Math.abs(12 * Math.log2(freq1 / freq2))
}

/**
 * Calculate pitch accuracy score (0-1) based on semitone tolerance.
 */
export function pitchAccuracy(
  userFreq: number,
  refFreq: number,
  toleranceSemitones: number = 1.5
): number {
  if (refFreq <= 0) return 1 // No reference — don't penalize
  if (userFreq <= 0) return 0 // No audio captured

  const diff = semitoneDiff(userFreq, refFreq)
  if (diff <= 0.5) return 1.0           // Perfect
  if (diff <= toleranceSemitones) return 1 - (diff / toleranceSemitones) * 0.5
  if (diff <= toleranceSemitones * 2) return 0.2
  return 0
}
