'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { detectPitch } from '@/lib/audio/yin-detector'

type MicStatus = 'idle' | 'requesting' | 'active' | 'error' | 'muted'

function MicPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session') ?? ''
  const token = searchParams.get('token') ?? ''
  const supabase = createClient()

  const [status, setStatus] = useState<MicStatus>('idle')
  const [connected, setConnected] = useState(false)
  const [volume, setVolume] = useState(0)
  const [latency, setLatency] = useState<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const channelRef = useRef<any>(null)
  const animFrameRef = useRef<number>(0)
  const lastSendRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!sessionId || !token) {
      setError('QR code inválido. Escaneie novamente.')
      return
    }
    connectToSession()
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      channelRef.current?.unsubscribe()
      audioCtxRef.current?.close()
    }
  }, [sessionId, token])

  async function connectToSession() {
    // Subscribe to the Supabase Realtime channel for this session
    const channel = supabase.channel(`mic-session-${sessionId}`, {
      config: { presence: { key: 'mobile' } }
    })

    channel
      .on('broadcast', { event: 'desktop-ping' }, () => {
        const rtt = Date.now() - lastSendRef.current
        setLatency(rtt)
        channel.send({ type: 'broadcast', event: 'mobile-pong', payload: {} })
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          setConnected(true)
          // Notify desktop that mobile connected
          await channel.send({
            type: 'broadcast',
            event: 'mobile-connected',
            payload: { token, timestamp: Date.now() },
          })
          // Auto-request mic
          requestMic(channel)
        }
      })

    channelRef.current = channel
  }

  async function requestMic(channel: any) {
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        }
      })
      streamRef.current = stream
      setStatus('active')
      setupAudioPipeline(stream, channel)
    } catch (err) {
      setStatus('error')
      setError('Permissão de microfone negada.')
    }
  }

  function setupAudioPipeline(stream: MediaStream, channel: any) {
    const ctx = new AudioContext({ sampleRate: 44100 })
    audioCtxRef.current = ctx

    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    analyserRef.current = analyser

    const pcmBuffer = new Float32Array(analyser.fftSize)
    let chunkBuffer: number[] = []
    const CHUNK_INTERVAL_MS = 100

    let lastChunkTime = Date.now()

    const loop = () => {
      animFrameRef.current = requestAnimationFrame(loop)
      if (muted) { setVolume(0); return }

      analyser.getFloatTimeDomainData(pcmBuffer)

      // Volume meter (RMS)
      let sum = 0
      for (let i = 0; i < pcmBuffer.length; i++) sum += pcmBuffer[i] * pcmBuffer[i]
      const rms = Math.sqrt(sum / pcmBuffer.length)
      setVolume(Math.min(1, rms * 4))

      // Detect pitch locally for display
      const { frequency } = detectPitch(pcmBuffer, 44100)

      // Send PCM chunks via Supabase Realtime broadcast
      const now = Date.now()
      if (now - lastChunkTime >= CHUNK_INTERVAL_MS) {
        lastSendRef.current = now
        channel.send({
          type: 'broadcast',
          event: 'audio-chunk',
          payload: {
            pcm: Array.from(pcmBuffer.subarray(0, 512)),
            frequency,
            timestamp: now,
          },
        }).catch(() => {})
        lastChunkTime = now
      }
    }

    loop()
  }

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next })
      setStatus(next ? 'muted' : 'active')
      return next
    })
  }

  const bars = 12
  const statusColors: Record<MicStatus, string> = {
    idle: 'var(--purple-mid)',
    requesting: 'var(--yellow-hot)',
    active: 'var(--green-pitch)',
    muted: 'var(--red-miss)',
    error: 'var(--red-miss)',
  }
  const statusLabels: Record<MicStatus, string> = {
    idle: 'AGUARDANDO...',
    requesting: 'SOLICITANDO MIC...',
    active: '● MICROFONE ATIVO',
    muted: '⏸ MUDO',
    error: '⚠ ERRO',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A0030 0%, #9B5DE5 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: '24px',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '20px', color: 'var(--white-pure)' }}>
          Eve<span style={{ color: 'var(--yellow-hot)' }}>Okê</span>
        </p>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--purple-mid)', marginTop: 6 }}>
          MODO MICROFONE WIRELESS
        </p>
      </div>

      {/* Main status window */}
      <div style={{
        width: '100%', maxWidth: 320,
        background: 'rgba(26,0,48,0.9)',
        border: '3px solid var(--white-pure)',
        boxShadow: '4px 4px 0 var(--black-pixel)',
      }}>
        <div style={{
          background: 'linear-gradient(90deg, #00F5FF, #9B5DE5)',
          padding: '6px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {['pink', 'yellow', 'cyan'].map((c) => (
              <span key={c} className={`window-dot window-dot-${c}`} />
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'white' }}>
            MIC CONTROLLER
          </span>
          <span />
        </div>

        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
          {/* Connection status */}
          <div style={{ textAlign: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-pixel)',
              fontSize: '8px',
              color: connected ? 'var(--green-pitch)' : 'var(--yellow-hot)',
            }}>
              {connected ? '● CONECTADO AO DESKTOP' : '○ CONECTANDO...'}
            </span>
            {latency !== null && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--purple-mid)', marginTop: 4 }}>
                latência ~{latency}ms
              </p>
            )}
          </div>

          {/* Mic status */}
          <div style={{
            width: 80, height: 80,
            borderRadius: '50%',
            border: `3px solid ${statusColors[status]}`,
            boxShadow: status === 'active' ? `0 0 20px ${statusColors[status]}` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px',
            transition: 'all 0.3s ease',
            animation: status === 'active' && volume > 0.1 ? 'comboPulse 0.3s ease-out' : 'none',
          }}>
            🎤
          </div>

          <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: statusColors[status] }}>
            {statusLabels[status]}
          </p>

          {/* Volume bars */}
          {status === 'active' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40 }}>
              {Array.from({ length: bars }, (_, i) => {
                const filled = volume * bars > i
                return (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: `${((i + 1) / bars) * 100}%`,
                      background: filled
                        ? i < bars * 0.6 ? 'var(--green-pitch)'
                        : i < bars * 0.85 ? 'var(--yellow-hot)'
                        : 'var(--red-miss)'
                        : 'rgba(255,255,255,0.1)',
                      transition: 'background 0.05s',
                    }}
                  />
                )
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'var(--red-miss)', textAlign: 'center' }}>
              ⚠ {error}
            </p>
          )}

          {/* Mute button */}
          {(status === 'active' || status === 'muted') && (
            <button
              id="btn-mute"
              onClick={toggleMute}
              style={{
                width: '100%',
                fontFamily: 'var(--font-pixel)',
                fontSize: '8px',
                padding: '10px',
                background: muted ? 'var(--red-miss)' : 'transparent',
                color: muted ? 'white' : 'var(--red-miss)',
                border: '2px solid var(--red-miss)',
                cursor: 'pointer',
              }}
            >
              {muted ? '▶ DESMUTAR' : '⏸ MUTAR'}
            </button>
          )}
        </div>
      </div>

      <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', maxWidth: 280 }}>
        Mantenha esta tela aberta enquanto canta.<br />
        O áudio é transmitido em tempo real para o desktop.
      </p>
    </div>
  )
}

export default function MicPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #1A0030 0%, #9B5DE5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--cyan-electric)' }}>Carregando...</p>
      </div>
    }>
      <MicPageInner />
    </Suspense>
  )
}
