'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Y2KWindow, Button, ProgressBar } from '@/components/ui'
import {
  isFolderPickerSupported, pickMusicFolder, loadSavedFolder,
  scanAudioFiles, fmtSize, type LocalMusicFile,
} from '@/lib/filesystem/music-folder'
import type { ProcessingProgress } from '@/types/audio.types'

interface Song { id: string; title: string; artist?: string; original_filename?: string; duration_seconds?: number }
interface RankEntry { username: string; total_score: number; stars: number }

type CenterState = 'idle' | 'file-selected' | 'db-selected' | 'processing' | 'done'

function Clock() {
  const [t, setT] = useState('')
  useEffect(() => { const up = () => setT(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })); up(); const id = setInterval(up, 1000); return () => clearInterval(id) }, [])
  return <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--cyan-electric)' }}>{t}</span>
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<any>(null)
  const [dbSongs, setDbSongs] = useState<Song[]>([])
  const [rankings, setRankings] = useState<RankEntry[]>([])
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [folderName, setFolderName] = useState('')
  const [localFiles, setLocalFiles] = useState<LocalMusicFile[]>([])
  const [scanning, setScanning] = useState(false)
  const [selectedLocal, setSelectedLocal] = useState<LocalMusicFile | null>(null)
  const [selectedDb, setSelectedDb] = useState<Song | null>(null)
  const [centerState, setCenterState] = useState<CenterState>('idle')
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [followSearch, setFollowSearch] = useState('')
  const [followMsg, setFollowMsg] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true); init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const [p, s] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('songs').select('id,title,artist,original_filename,duration_seconds').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    if (p.data) setProfile(p.data)
    if (s.data) setDbSongs(s.data)

    // Try to restore saved folder
    const saved = await loadSavedFolder()
    if (saved) { setFolderHandle(saved); setFolderName(saved.name); doScan(saved) }
  }

  async function doScan(handle: FileSystemDirectoryHandle) {
    setScanning(true)
    const files = await scanAudioFiles(handle)
    setLocalFiles(files)
    setScanning(false)
  }

  async function handlePickFolder() {
    const handle = await pickMusicFolder()
    if (!handle) return
    setFolderHandle(handle); setFolderName(handle.name)
    doScan(handle)
  }

  function handleFallbackFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    const fakes: LocalMusicFile[] = picked.map(f => ({ name: f.name, handle: null as any, size: f.size }))
    setLocalFiles(fakes)
  }

  function selectLocal(f: LocalMusicFile) {
    setSelectedLocal(f); setSelectedDb(null)
    const match = dbSongs.find(s => s.original_filename === f.name)
    if (match) { setSelectedDb(match); setCenterState('db-selected') }
    else setCenterState('file-selected')
  }

  function selectDb(s: Song) {
    setSelectedDb(s); setSelectedLocal(null); setCenterState('db-selected')
  }

  async function handleProcess() {
    if (!selectedLocal) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCenterState('processing')
    setProgress({ stage: 'analyzing', progress: 5, message: 'Iniciando...' })
    try {
      let file: File
      if (selectedLocal.handle) {
        file = await selectedLocal.handle.getFile()
      } else {
        const inputFile = fileInputRef.current?.files
          ? Array.from(fileInputRef.current.files).find(f => f.name === selectedLocal.name)
          : null
        if (!inputFile) throw new Error('Arquivo não encontrado')
        file = inputFile
      }
      const { processAudioFile } = await import('@/lib/audio/audio-processor')
      const songId = await processAudioFile(file, user.id, supabase, setProgress)
      const { data: newSong } = await supabase.from('songs').select('id,title,artist,original_filename,duration_seconds').eq('id', songId).single()
      if (newSong) { setDbSongs(prev => [newSong, ...prev]); setSelectedDb(newSong) }
      setCenterState('done')
    } catch (err: any) {
      setProgress({ stage: 'error', progress: 0, message: err.message })
      setCenterState('file-selected')
    }
  }

  async function handleFollow() {
    if (!followSearch.trim()) return
    const { data: target } = await supabase.from('profiles').select('id').eq('username', followSearch.trim()).single()
    if (!target) { setFollowMsg('Usuário não encontrado'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('follows').insert({ follower_id: user.id, following_id: target.id })
    setFollowMsg(`Seguindo ${followSearch}!`); setFollowSearch('')
  }

  const processedNames = new Set(dbSongs.map(s => s.original_filename).filter(Boolean))

  const pxStyle = (size: string, color: string) => ({ fontFamily: 'var(--font-pixel)', fontSize: size, color })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 260px', gridTemplateRows: 'auto 1fr auto', height: '100vh', overflow: 'hidden', background: 'var(--bg-deep)' }}>

      {/* ── HEADER ── */}
      <header style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '2px solid var(--purple-mid)', background: 'rgba(26,0,48,0.95)' }}>
        <h1 style={{ ...pxStyle('clamp(14px,2vw,22px)', 'var(--white-pure)'), margin: 0 }}>
          Eve<span style={{ color: 'var(--yellow-hot)' }}>Okê</span>
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button id="btn-profile" variant="secondary" size="sm" onClick={() => router.push('/profile')}>
            👤 {profile?.username ?? '...'}
          </Button>
          <Button id="btn-signout" variant="danger" size="sm" onClick={async () => { await supabase.auth.signOut(); router.push('/') }}>
            SAIR
          </Button>
        </div>
      </header>

      {/* ── LEFT COLUMN ── */}
      <aside style={{ borderRight: '2px solid var(--purple-mid)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Y2KWindow title="📁 PASTA DE MÚSICAS">
          {folderHandle ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={pxStyle('7px', 'var(--green-pitch)')}>✓ {folderName}</p>
              <Button id="btn-change-folder" variant="secondary" size="sm" onClick={handlePickFolder}>Trocar Pasta</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mounted && isFolderPickerSupported() ? (
                <Button id="btn-pick-folder" variant="primary" size="sm" onClick={handlePickFolder}>
                  📂 Selecionar Pasta
                </Button>
              ) : (
                <>
                  <p style={pxStyle('6px', 'var(--yellow-hot)')}>⚠ Seu browser não suporta seleção de pasta. Selecione os arquivos:</p>
                  <Button id="btn-pick-files" variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    🎵 Selecionar Arquivos
                  </Button>
                  <input ref={fileInputRef} type="file" multiple accept=".mp3,.wav,.ogg,.m4a" style={{ display: 'none' }} onChange={handleFallbackFiles} />
                </>
              )}
              <p style={pxStyle('6px', 'rgba(255,255,255,0.4)')}>Aponte para a pasta onde estão seus arquivos de áudio</p>
            </div>
          )}
        </Y2KWindow>

        <Y2KWindow title={`🎵 MÚSICAS (${localFiles.length || dbSongs.length})`} style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
            {scanning && <p style={pxStyle('7px', 'var(--cyan-electric)')}>Escaneando pasta...</p>}

            {/* Local files not yet processed */}
            {localFiles.filter(f => !processedNames.has(f.name)).map(f => (
              <div key={f.name} onClick={() => selectLocal(f)} style={{ padding: '6px 8px', cursor: 'pointer', border: `1px solid ${selectedLocal?.name === f.name ? 'var(--cyan-electric)' : 'var(--purple-mid)'}`, background: selectedLocal?.name === f.name ? 'rgba(0,245,255,0.1)' : 'rgba(155,93,229,0.05)', borderRadius: 2 }}>
                <p style={pxStyle('7px', 'var(--white-pure)')}>{f.name.substring(0, 28)}</p>
                <p style={pxStyle('6px', 'var(--purple-mid)')}>{fmtSize(f.size)} · Processar</p>
              </div>
            ))}

            {/* Already processed songs */}
            {dbSongs.map(s => (
              <div key={s.id} onClick={() => selectDb(s)} style={{ padding: '6px 8px', cursor: 'pointer', border: `1px solid ${selectedDb?.id === s.id ? 'var(--yellow-hot)' : 'var(--purple-mid)'}`, background: selectedDb?.id === s.id ? 'rgba(255,215,0,0.1)' : 'rgba(155,93,229,0.05)', borderRadius: 2 }}>
                <p style={pxStyle('7px', 'var(--yellow-hot)')}>★ {s.title.substring(0, 26)}</p>
                {s.artist && <p style={pxStyle('6px', 'var(--purple-mid)')}>{s.artist}</p>}
              </div>
            ))}

            {localFiles.length === 0 && dbSongs.length === 0 && !scanning && (
              <p style={{ ...pxStyle('7px', 'rgba(255,255,255,0.3)'), textAlign: 'center', padding: '12px 0' }}>
                Selecione uma pasta<br />para ver suas músicas
              </p>
            )}
          </div>
        </Y2KWindow>
      </aside>

      {/* ── CENTER STAGE ── */}
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 24, position: 'relative' }}>

        {centerState === 'idle' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div className="glitch" data-text="EVEOKÊ" style={{ ...pxStyle('clamp(32px,6vw,72px)', 'var(--white-pure)'), letterSpacing: 8 }}>
              EVEOKÊ
            </div>
            <p style={pxStyle('8px', 'var(--cyan-electric)')}>SELECIONE UMA MÚSICA PARA COMEÇAR</p>
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              {['📁 Selecione a pasta', '⚡ Processe a música', '🎤 Cante e pontue'].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <p style={pxStyle('20px', 'var(--yellow-hot)')}>{s.split(' ')[0]}</p>
                  <p style={pxStyle('6px', 'var(--purple-mid)')}>{s.split(' ').slice(1).join(' ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {centerState === 'file-selected' && selectedLocal && (
          <Y2KWindow title="📄 ARQUIVO SELECIONADO" style={{ maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={pxStyle('10px', 'var(--white-pure)')}>{selectedLocal.name}</p>
                <p style={pxStyle('7px', 'var(--purple-mid)')}>{fmtSize(selectedLocal.size)}</p>
              </div>
              <p style={pxStyle('7px', 'rgba(255,255,255,0.5)')}>
                Este arquivo ainda não foi processado.<br />
                Clique em Processar para extrair a letra e o pitch.
              </p>
              <Button id="btn-process" variant="primary" onClick={handleProcess}>
                ⚡ PROCESSAR MÚSICA
              </Button>
            </div>
          </Y2KWindow>
        )}

        {centerState === 'processing' && progress && (
          <Y2KWindow title="⚙ PROCESSANDO..." style={{ maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(['analyzing', 'separating', 'transcribing', 'syncing'] as const).map((stage, i) => {
                const order = ['analyzing', 'separating', 'transcribing', 'syncing', 'complete']
                const cur = order.indexOf(progress.stage)
                const isDone = cur > i; const isActive = cur === i
                return (
                  <div key={stage}>
                    <p style={pxStyle('7px', isActive ? 'var(--cyan-electric)' : isDone ? 'var(--green-pitch)' : 'rgba(255,255,255,0.3)')}>
                      {isDone ? '✓' : isActive ? '▶' : '○'} {stage.toUpperCase()}
                    </p>
                    {isActive && <ProgressBar progress={progress.progress} />}
                    {isDone && <div style={{ height: 3, background: 'var(--green-pitch)', opacity: 0.5, marginTop: 4 }} />}
                  </div>
                )
              })}
              {progress.message && <p style={pxStyle('7px', 'var(--cyan-electric)')}>{progress.message}</p>}
            </div>
          </Y2KWindow>
        )}

        {(centerState === 'db-selected' || centerState === 'done') && selectedDb && (
          <Y2KWindow title="🎵 PRONTO PARA CANTAR" style={{ maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={pxStyle('14px', 'var(--yellow-hot)')}>{selectedDb.title}</p>
                {selectedDb.artist && <p style={pxStyle('9px', 'var(--purple-mid)')}>{selectedDb.artist}</p>}
                {selectedDb.duration_seconds && (
                  <p style={pxStyle('7px', 'rgba(255,255,255,0.4)')}>{Math.floor(selectedDb.duration_seconds / 60)}:{String(selectedDb.duration_seconds % 60).padStart(2, '0')}</p>
                )}
              </div>
              <Button id="btn-sing" variant="primary" style={{ width: '100%', fontSize: '14px', padding: '14px' }} onClick={() => router.push(`/karaoke/${selectedDb.id}`)}>
                🎤 CANTAR AGORA
              </Button>
              {centerState === 'done' && (
                <p style={pxStyle('7px', 'var(--green-pitch)')}>✓ Processamento concluído com sucesso!</p>
              )}
            </div>
          </Y2KWindow>
        )}
      </main>

      {/* ── RIGHT COLUMN ── */}
      <aside style={{ borderLeft: '2px solid var(--purple-mid)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {profile && (
          <Y2KWindow title="👤 PERFIL">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, background: 'var(--gradient-holo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', border: '2px solid var(--cyan-electric)' }}>🎤</div>
                <div>
                  <p style={pxStyle('8px', 'var(--yellow-hot)')}>{profile.username}</p>
                  <p style={pxStyle('7px', 'var(--cyan-electric)')}>LVL {profile.level} · {profile.xp} XP</p>
                </div>
              </div>
              <ProgressBar progress={(profile.xp % 1000) / 10} />
              <Button id="btn-go-profile" variant="secondary" size="sm" onClick={() => router.push('/profile')}>Ver Perfil</Button>
            </div>
          </Y2KWindow>
        )}

        <Y2KWindow title="🏆 RANKINGS">
          {rankings.length === 0 ? (
            <p style={{ ...pxStyle('7px', 'rgba(255,255,255,0.3)'), textAlign: 'center', padding: '8px 0' }}>
              Cante músicas para aparecer no ranking!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rankings.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderBottom: '1px solid rgba(155,93,229,0.3)' }}>
                  <p style={pxStyle('7px', i === 0 ? 'var(--yellow-hot)' : 'var(--white-pure)')}>{i + 1}. {r.username}</p>
                  <p style={pxStyle('7px', 'var(--cyan-electric)')}>{r.total_score?.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
          <Button id="btn-rankings" variant="secondary" size="sm" style={{ marginTop: 8, width: '100%' }} onClick={() => router.push('/rankings')}>
            Ver Rankings Globais
          </Button>
        </Y2KWindow>

        <Y2KWindow title="👥 SOCIAL">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={pxStyle('7px', 'var(--purple-mid)')}>Seguir por username:</p>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={followSearch}
                onChange={e => setFollowSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFollow()}
                placeholder="username"
                style={{ flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--purple-mid)', color: 'var(--white-pure)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 6px' }}
              />
              <Button id="btn-follow" variant="secondary" size="sm" onClick={handleFollow}>+</Button>
            </div>
            {followMsg && <p style={pxStyle('6px', 'var(--green-pitch)')}>{followMsg}</p>}
          </div>
        </Y2KWindow>
      </aside>

      {/* ── TASKBAR ── */}
      <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px', borderTop: '2px solid var(--purple-mid)', background: 'rgba(26,0,48,0.95)' }}>
        <p style={pxStyle('6px', 'var(--pink-neon)')}>♪ EveOkê · {dbSongs.length} músicas processadas</p>
        <Clock />
      </div>
    </div>
  )
}
