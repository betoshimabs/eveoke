'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Y2KWindow, Button, ProgressBar, Ticker } from '@/components/ui'
import type { ProcessingProgress } from '@/types/audio.types'

// NOTE: audio-processor is dynamically imported INSIDE the handler to avoid
// SSR bundling of Transformers.js/ONNX Runtime (which have WASM/WebGPU dependencies)

interface Song {
  id: string
  title: string
  artist?: string
  duration_seconds?: number
  created_at: string
  processing_tier?: string
}

interface KaraokeSession {
  id: string
  total_score: number
  stars: number
  rank: string
  completed_at: string
  songs?: { title: string; artist?: string }
}

function TaskbarClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="taskbar-clock text-pixel">{time}</span>
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [sessions, setSessions] = useState<KaraokeSession[]>([])
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const [profileRes, songsRes, sessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('songs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
      supabase.from('karaoke_sessions').select('*, songs(title, artist)').eq('user_id', user.id).order('completed_at', { ascending: false }).limit(5),
    ])

    if (profileRes.data) setProfile(profileRes.data)
    if (songsRes.data) setSongs(songsRes.data)
    if (sessionsRes.data) setSessions(sessionsRes.data as any)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  async function handleFileUpload(file: File) {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['mp3', 'wav', 'ogg', 'm4a'].includes(ext ?? '')) {
      alert('Formato não suportado. Use MP3, WAV, OGG ou M4A.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('Arquivo muito grande. Máximo 50MB.')
      return
    }

    setUploading(true)
    setProcessing(true)
    setProgress({ stage: 'analyzing', progress: 5, message: 'Analisando o áudio...' })

    try {
      // Dynamically import the heavy processor
      const { processAudioFile } = await import('@/lib/audio/audio-processor')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      await processAudioFile(file, user.id, supabase, (prog) => {
        setProgress(prog)
      })

      setProgress({ stage: 'complete', progress: 100, message: 'Música pronta! Pode cantar!' })
      await loadData()
      setTimeout(() => { setProcessing(false); setProgress(null) }, 2000)
    } catch (err: any) {
      setProgress({ stage: 'error', progress: 0, message: `Erro: ${err.message}` })
      setTimeout(() => { setProcessing(false); setProgress(null) }, 4000)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [])

  const processingMessages: Record<string, string> = {
    analyzing: 'Analisando o áudio...',
    separating: 'Expulsando o vocalista... 🎤',
    transcribing: 'Consultando as musas para extrair a letra...',
    syncing: 'Sincronizando timestamps...',
    complete: 'PRONTO! A pista está esperando você!',
    error: 'Algo deu errado. Vocalistas são difíceis mesmo.',
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ fontFamily: 'var(--font-pixel)', fontSize: 'clamp(14px, 3vw, 24px)' }}>
          <span style={{ color: 'var(--white-pure)' }}>Eve</span>
          <span style={{ color: 'var(--yellow-hot)' }}>Okê</span>
        </h1>
        <div className="flex gap-2">
          <Button id="btn-profile" variant="secondary" size="sm" onClick={() => router.push('/profile')}>
            👤 {profile?.username ?? 'Perfil'}
          </Button>
          <Button id="btn-signout" variant="danger" size="sm" onClick={handleSignOut}>
            SAIR
          </Button>
        </div>
      </div>

      {/* Processing modal */}
      {processing && progress && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, backdropFilter: 'blur(4px)',
        }}>
          <Y2KWindow title="⚙ EVEOKÊ PROCESSOR v2.1" style={{ width: '90%', maxWidth: 480 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(['analyzing', 'separating', 'transcribing', 'syncing'] as const).map((stage, i) => {
                const stageIndex = ['analyzing', 'separating', 'transcribing', 'syncing', 'complete'].indexOf(progress.stage)
                const thisIndex = i
                const isDone = stageIndex > thisIndex
                const isActive = stageIndex === thisIndex
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: isActive ? 'var(--cyan-electric)' : isDone ? 'var(--green-pitch)' : 'rgba(255,255,255,0.3)' }}>
                        {isDone ? '✓' : isActive ? '▶' : '○'} {processingMessages[stage]}
                      </span>
                    </div>
                    {isActive && <ProgressBar progress={progress.progress} />}
                    {isDone && <div style={{ height: 4, background: 'var(--green-pitch)', opacity: 0.6 }} />}
                  </div>
                )
              })}

              {progress.stage === 'complete' && (
                <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--green-pitch)', textAlign: 'center' }}>
                  ✓ {progress.message}
                </p>
              )}
              {progress.stage === 'error' && (
                <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--red-miss)', textAlign: 'center' }}>
                  ⚠ {progress.message}
                </p>
              )}
            </div>
          </Y2KWindow>
        </div>
      )}

      {/* Dashboard grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        {/* Upload Window */}
        <Y2KWindow title="📁 NOVA MÚSICA">
          <div
            id="upload-dropzone"
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '9px', color: 'var(--cyan-electric)', marginBottom: 8 }}>
              ⬆ UPLOAD DE MÚSICA
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
              Arraste MP3/WAV aqui ou clique para selecionar
            </p>
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)', marginTop: 8 }}>
              Processamento 100% local — sua privacidade é protegida
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,.m4a"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </div>
        </Y2KWindow>

        {/* My Songs */}
        <Y2KWindow title={`🎵 MINHAS MÚSICAS (${songs.length})`}>
          {songs.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
              Nenhuma música ainda.<br />Faça o upload da primeira!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {songs.map((song) => (
                <div
                  key={song.id}
                  id={`song-card-${song.id}`}
                  className="song-card"
                  onClick={() => router.push(`/karaoke/${song.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--white-pure)' }}>
                        {song.title.substring(0, 24)}{song.title.length > 24 ? '...' : ''}
                      </p>
                      {song.artist && (
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--purple-mid)', marginTop: 2 }}>
                          {song.artist}
                        </p>
                      )}
                    </div>
                    <Button variant="primary" size="sm" onClick={() => router.push(`/karaoke/${song.id}`)}>
                      ▶
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Y2KWindow>

        {/* Profile snapshot */}
        {profile && (
          <Y2KWindow title="👤 MEU PERFIL">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="flex items-center gap-4">
                <div style={{
                  width: 48, height: 48,
                  background: 'var(--gradient-holo)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', border: '2px solid var(--cyan-electric)',
                }}>
                  🎤
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '9px', color: 'var(--yellow-hot)' }}>
                    {profile.username}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--cyan-electric)', marginTop: 4 }}>
                    LVL {profile.level} — {profile.xp} XP
                  </p>
                </div>
              </div>
              <ProgressBar progress={(profile.xp % 1000) / 10} label={`XP: ${profile.xp} / ${Math.ceil(profile.xp / 1000) * 1000}`} />
              <Button id="btn-go-profile" variant="secondary" size="sm" className="w-full" onClick={() => router.push('/profile')}>
                VER PERFIL COMPLETO
              </Button>
            </div>
          </Y2KWindow>
        )}

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <Y2KWindow title="🏆 HISTÓRICO RECENTE">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map((s) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', border: '1px solid var(--purple-mid)',
                  background: 'rgba(155,93,229,0.1)',
                }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'var(--white-pure)' }}>
                      {(s.songs as any)?.title?.substring(0, 18) ?? 'Música'}
                    </p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--cyan-electric)' }}>
                      {s.total_score?.toLocaleString() ?? 0} pts
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '14px' }}>{'★'.repeat(s.stars ?? 1)}{'☆'.repeat(5 - (s.stars ?? 1))}</p>
                    <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)' }}>
                      {s.rank}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Y2KWindow>
        )}
      </div>

      {/* Taskbar */}
      <div className="taskbar">
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--pink-neon)' }}>
            ♪ EveOkê
          </span>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)' }}>
            {songs.length} músicas · {sessions.length} sessões
          </span>
        </div>
        <TaskbarClock />
      </div>
    </div>
  )
}
