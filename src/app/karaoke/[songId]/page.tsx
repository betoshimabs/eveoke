'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Y2KWindow, Button, StarRating, Ticker } from '@/components/ui'
import type { LyricsLine, PitchFrame, SessionScore } from '@/types/audio.types'
import { detectPitch } from '@/lib/audio/yin-detector'
import { scoreFrame, calculateFinalScore, findRefPitchAt, comboMultiplier } from '@/lib/audio/dtw-scorer'

// ============================================================
// Lyrics Display Component
// ============================================================
function LyricsDisplay({ lines, currentTime }: { lines: LyricsLine[]; currentTime: number }) {
  const currentIdx = lines.findIndex((l) => currentTime >= l.start && currentTime <= l.end)
  const prev = currentIdx > 0 ? lines[currentIdx - 1] : null
  const current = currentIdx >= 0 ? lines[currentIdx] : null
  const next = currentIdx >= 0 && currentIdx < lines.length - 1 ? lines[currentIdx + 1] : null

  return (
    <div className="lyrics-wrapper">
      <p className="lyrics-prev">{prev?.text ?? ' '}</p>
      <div className="lyrics-current">
        {current
          ? current.tokens.map((token, i) => {
              const isSung = currentTime > token.end
              const isActive = currentTime >= token.start && currentTime <= token.end
              return (
                <span key={i} className={`lyrics-word ${isActive ? 'active' : ''} ${isSung ? 'sung' : ''}`}>
                  {token.word}
                </span>
              )
            })
          : <span className="lyrics-word" style={{ color: 'rgba(255,255,255,0.3)' }}>♪ ♪ ♪</span>
        }
      </div>
      <p className="lyrics-next">{next?.text ?? ' '}</p>
    </div>
  )
}

// ============================================================
// Pitch Highway Canvas
// ============================================================
function PitchHighway({
  referencePitch, userPitch, currentTime, duration
}: {
  referencePitch: PitchFrame[]
  userPitch: Array<{ time: number; frequency: number }>
  currentTime: number
  duration: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Background grid
    ctx.strokeStyle = 'rgba(155,93,229,0.15)'
    ctx.lineWidth = 1
    for (let y = 0; y < H; y += H / 8) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    for (let x = 0; x < W; x += W / 16) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // Pitch normalization helpers
    const minFreq = 80, maxFreq = 1000
    const freqToY = (f: number) => f <= 0 ? -10 : H - ((f - minFreq) / (maxFreq - minFreq)) * H

    const windowSec = 6 // show 6 seconds window
    const timeToX = (t: number) => ((t - (currentTime - windowSec * 0.4)) / windowSec) * W

    // Draw reference pitch line
    const refWindow = referencePitch.filter(
      (f) => f.time >= currentTime - windowSec * 0.4 && f.time <= currentTime + windowSec * 0.6
    )
    if (refWindow.length > 1) {
      ctx.strokeStyle = '#00F5FF'
      ctx.lineWidth = 3
      ctx.shadowColor = '#00F5FF'
      ctx.shadowBlur = 6
      ctx.beginPath()
      let started = false
      for (const frame of refWindow) {
        if (frame.frequency <= 0) { started = false; continue }
        const x = timeToX(frame.time)
        const y = freqToY(frame.frequency)
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Draw user pitch line
    const userWindow = userPitch.filter(
      (f) => f.time >= currentTime - windowSec * 0.4 && f.time <= currentTime + 0.1
    )
    if (userWindow.length > 1) {
      ctx.strokeStyle = '#39FF14'
      ctx.lineWidth = 3
      ctx.shadowColor = '#39FF14'
      ctx.shadowBlur = 8
      ctx.beginPath()
      let started = false
      for (const frame of userWindow) {
        if (frame.frequency <= 0) { started = false; continue }
        const x = timeToX(frame.time)
        const y = freqToY(frame.frequency)
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Playhead
    const playX = timeToX(currentTime)
    ctx.strokeStyle = 'rgba(255,230,0,0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(playX, 0)
    ctx.lineTo(playX, H)
    ctx.stroke()
    ctx.setLineDash([])

  }, [referencePitch, userPitch, currentTime])

  return (
    <div className="pitch-highway-container" style={{ height: 180 }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={180}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

// ============================================================
// Score Display
// ============================================================
function ScoreDisplay({ score, combo }: { score: number; combo: number }) {
  return (
    <div className="flex items-center gap-4">
      <div>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'var(--purple-mid)', marginBottom: 4 }}>
          PONTUAÇÃO
        </p>
        <p className="score-display">{score.toLocaleString().padStart(6, '0')}</p>
      </div>
      {combo >= 3 && (
        <div className="combo-badge">
          x{comboMultiplier(combo)} COMBO
        </div>
      )}
    </div>
  )
}

// ============================================================
// Result Modal
// ============================================================
function ResultModal({ score, onReplay, onDone }: { score: SessionScore; onReplay: () => void; onDone: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500, backdropFilter: 'blur(6px)',
    }}>
      <Y2KWindow title="🎤 RESULTADO FINAL" style={{ width: '90%', maxWidth: 440 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>
          <StarRating stars={score.stars} />

          <div>
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--purple-mid)', marginBottom: 6 }}>
              PONTUAÇÃO TOTAL
            </p>
            <p className="score-display" style={{ fontSize: '42px' }}>
              {score.totalScore.toLocaleString()}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'TIMING', value: `${Math.round(score.timingScore * 100)}%` },
              { label: 'AFINAÇÃO', value: `${Math.round(score.pitchScore * 100)}%` },
              { label: 'COMBO MÁX', value: `x${score.comboMax}` },
            ].map(({ label, value }) => (
              <div key={label} style={{ border: '1px solid var(--purple-mid)', padding: 8 }}>
                <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', color: 'var(--cyan-electric)' }}>{value}</p>
              </div>
            ))}
          </div>

          <div style={{
            background: 'rgba(155,93,229,0.2)', border: '1px solid var(--purple-mid)',
            padding: '8px 16px', display: 'inline-block',
          }}>
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '9px', color: 'var(--yellow-hot)' }}>
              RANK: {score.rank}
            </p>
          </div>

          <div className="flex gap-4">
            <Button id="btn-replay" variant="secondary" className="w-full" onClick={onReplay}>
              ↺ CANTAR DE NOVO
            </Button>
            <Button id="btn-done" variant="primary" className="w-full" onClick={onDone}>
              ✓ SALVAR
            </Button>
          </div>
        </div>
      </Y2KWindow>
    </div>
  )
}

// ============================================================
// Main Karaoke Page
// ============================================================
export default function KaraokePage() {
  const router = useRouter()
  const params = useParams()
  const songId = params.songId as string
  const supabase = createClient()

  const [song, setSong] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [stemsUrl, setStemsUrl] = useState<string | null>(null)

  // Mic state
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number>(0)
  const [micActive, setMicActive] = useState(false)

  // Scoring state
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const userPitchHistory = useRef<Array<{ time: number; frequency: number }>>([])
  const pitchScores = useRef<number[]>([])
  const timingScores = useRef<number[]>([])
  const lastScoredAt = useRef<number>(0)

  // Result
  const [sessionScore, setSessionScore] = useState<SessionScore | null>(null)
  const [showResult, setShowResult] = useState(false)

  // Lyrics / pitch reference
  const [lyricsLines, setLyricsLines] = useState<LyricsLine[]>([])
  const [referencePitch, setReferencePitch] = useState<PitchFrame[]>([])

  useEffect(() => {
    loadSong()
    return () => {
      stopMic()
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [songId])

  async function loadSong() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('id', songId)
        .single()
      if (error) throw error
      setSong(data)
      setLyricsLines((data.lyrics_json as LyricsLine[]) ?? [])
      setReferencePitch((data.reference_pitch_json as PitchFrame[]) ?? [])

      // Load stems
      if (data.stems_storage_path) {
        const { data: urlData } = await supabase.storage
          .from('audio-stems')
          .createSignedUrl(data.stems_storage_path, 3600)
        if (urlData?.signedUrl) setStemsUrl(urlData.signedUrl)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      micStreamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 44100 })
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyserRef.current = analyser

      setMicActive(true)
      startPitchLoop()
    } catch (err) {
      alert('Não foi possível acessar o microfone. Verifique as permissões.')
    }
  }

  function stopMic() {
    cancelAnimationFrame(animFrameRef.current)
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    setMicActive(false)
  }

  function startPitchLoop() {
    const analyser = analyserRef.current
    if (!analyser) return

    const buffer = new Float32Array(analyser.fftSize)

    const loop = () => {
      animFrameRef.current = requestAnimationFrame(loop)
      analyser.getFloatTimeDomainData(buffer)

      const { frequency, confidence } = detectPitch(buffer, 44100)
      const time = audioRef.current?.currentTime ?? 0

      // Rate-limit scoring to once per 200ms (prevents 60fps inflation)
      const now = performance.now()
      if (now - lastScoredAt.current < 200) return
      lastScoredAt.current = now

      // Only score when audio is playing AND reference pitch data exists
      if (confidence > 0.5 && frequency > 0 && audioRef.current && !audioRef.current.paused && referencePitch.length > 0) {
        userPitchHistory.current.push({ time, frequency })
        if (userPitchHistory.current.length > 10000) userPitchHistory.current.shift()

        // Score this frame
        const refFreq = findRefPitchAt(referencePitch, time)
        const { pitchScore } = scoreFrame(frequency, refFreq)
        const timingScore = 1.0 // simplified timing score

        pitchScores.current.push(pitchScore)
        timingScores.current.push(timingScore)

        const newCombo = pitchScore > 0.5 ? combo + 1 : 0
        setCombo(newCombo)
        setMaxCombo((prev) => Math.max(prev, newCombo))

        // Base pts: 8 per evaluation at perfect pitch, max 32 with combo
        // At 5 evals/sec perfect: 32*5=160 pts/sec → ~10k in ~60s of perfect singing
        const pts = Math.round(pitchScore * 8 * comboMultiplier(newCombo))
        setScore((prev) => Math.min(10000, prev + pts))
      }
    }

    loop()
  }

  function handlePlayPause() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
      if (!micActive) startMic()
    }
    setPlaying(!playing)
  }

  function handleEnded() {
    setPlaying(false)
    stopMic()
    const finalScore = calculateFinalScore(pitchScores.current, timingScores.current, maxCombo)
    setSessionScore(finalScore)
    setShowResult(true)
  }

  async function saveSession(score: SessionScore) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('karaoke_sessions').insert({
      user_id: user.id,
      song_id: songId,
      timing_score: score.timingScore,
      pitch_score: score.pitchScore,
      total_score: score.totalScore,
      combo_max: score.comboMax,
      stars: score.stars,
      rank: score.rank,
    })

    // Add XP based on score
    const xpGained = Math.floor(score.totalScore / 100)
    try { await supabase.rpc('increment_xp', { user_id: user.id, amount: xpGained }) } catch { /* ignore xp errors */ }
  }

  function handleReplay() {
    setShowResult(false)
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    pitchScores.current = []
    timingScores.current = []
    userPitchHistory.current = []
    setCurrentTime(0)
    if (audioRef.current) { audioRef.current.currentTime = 0 }
  }

  async function handleDone() {
    if (sessionScore) await saveSession(sessionScore)
    router.push('/dashboard')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Y2KWindow title="⟳ CARREGANDO">
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--cyan-electric)', animation: 'blink 1s infinite' }}>
          Preparando pista de karaokê...
        </p>
      </Y2KWindow>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Y2KWindow title="⚠ ERRO">
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--red-miss)' }}>{error}</p>
        <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard')} className="mt-4">
          ← Voltar
        </Button>
      </Y2KWindow>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--black-pixel)' }}>
      {showResult && sessionScore && (
        <ResultModal score={sessionScore} onReplay={handleReplay} onDone={handleDone} />
      )}

      {/* Hidden audio element */}
      {stemsUrl && (
        <audio
          ref={audioRef}
          src={stemsUrl}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={handleEnded}
        />
      )}

      {/* Header */}
      <div style={{
        background: 'rgba(26,0,48,0.9)', borderBottom: '2px solid var(--cyan-electric)',
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '9px', color: 'var(--white-pure)' }}>
            {song?.title}
          </p>
          {song?.artist && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--purple-mid)' }}>
              {song.artist}
            </p>
          )}
        </div>
        <ScoreDisplay score={score} combo={combo} />
        <Button id="btn-back" variant="danger" size="sm" onClick={() => { stopMic(); router.push('/dashboard') }}>
          ✕ SAIR
        </Button>
      </div>

      {/* Lyrics */}
      <div style={{ flex: 1, background: 'rgba(26,0,48,0.7)' }}>
        <LyricsDisplay lines={lyricsLines} currentTime={currentTime} />
      </div>

      {/* Pitch Highway */}
      <PitchHighway
        referencePitch={referencePitch}
        userPitch={userPitchHistory.current}
        currentTime={currentTime}
        duration={duration}
      />

      {/* Controls */}
      <div style={{
        background: 'rgba(26,0,48,0.95)', borderTop: '2px solid var(--purple-deep)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <Button
          id="btn-play"
          variant="primary"
          size="lg"
          onClick={handlePlayPause}
          disabled={!stemsUrl && !song}
        >
          {playing ? '⏸ PAUSAR' : '▶ CANTAR'}
        </Button>

        {/* Progress bar */}
        <div style={{ flex: 1 }}>
          <div style={{
            height: 8, background: 'rgba(155,93,229,0.3)',
            border: '1px solid var(--purple-mid)', cursor: 'pointer',
          }}
            onClick={(e) => {
              if (!audioRef.current || !duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              audioRef.current.currentTime = (x / rect.width) * duration
            }}
          >
            <div style={{
              height: '100%',
              width: `${duration ? (currentTime / duration) * 100 : 0}%`,
              background: 'var(--gradient-holo)',
              backgroundSize: '200% 100%',
              transition: 'width 0.1s linear',
            }} />
          </div>
          <div className="flex justify-between mt-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--purple-mid)' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: micActive ? 'var(--green-pitch)' : 'var(--red-miss)' }}>
            {micActive ? '● MIC ATIVO' : '○ MIC OFF'}
          </p>
          {!micActive && playing && (
            <Button id="btn-mic" variant="secondary" size="sm" onClick={startMic}>MIC ON</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
