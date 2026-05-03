'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Y2KWindow, Button, StarRating } from '@/components/ui'

interface Session {
  id: string
  total_score: number
  pitch_score: number
  timing_score: number
  combo_max: number
  stars: number
  rank: string
  completed_at: string
  songs?: { title: string; artist?: string }
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [songs, setSongs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const [profileRes, sessionsRes, songsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('karaoke_sessions')
        .select('*, songs(title, artist)')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(20),
      supabase.from('songs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    if (profileRes.data) setProfile(profileRes.data)
    if (sessionsRes.data) setSessions(sessionsRes.data as any)
    if (songsRes.data) setSongs(songsRes.data)
    setLoading(false)
  }

  const bestScore = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.total_score ?? 0))
    : 0

  const avgPitch = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + (s.pitch_score ?? 0), 0) / sessions.length * 100)
    : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '8px', color: 'var(--cyan-electric)', animation: 'blink 1s infinite' }}>
        Carregando perfil...
      </p>
    </div>
  )

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button id="btn-back" variant="secondary" size="sm" onClick={() => router.push('/dashboard')}>
          ← DASHBOARD
        </Button>
        <h2 style={{ fontFamily: 'var(--font-pixel)', fontSize: 'clamp(10px, 2vw, 16px)', color: 'var(--yellow-hot)' }}>
          MEU PERFIL
        </h2>
        <span />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        {/* Profile Card */}
        <Y2KWindow title="👤 IDENTIDADE DO CANTOR">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
            <div style={{
              width: 80, height: 80, fontSize: '40px',
              background: 'var(--gradient-holo)',
              border: '3px solid var(--cyan-electric)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              🎤
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '12px', color: 'var(--yellow-hot)' }}>
                {profile?.username}
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--cyan-electric)', marginTop: 4 }}>
                Level {profile?.level}
              </p>
            </div>
            {/* XP Bar */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)' }}>XP</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--cyan-electric)' }}>
                  {profile?.xp ?? 0}
                </span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', border: '2px solid var(--purple-mid)', height: 12 }}>
                <div style={{
                  height: '100%',
                  width: `${((profile?.xp ?? 0) % 1000) / 10}%`,
                  background: 'var(--gradient-holo)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s linear infinite',
                }} />
              </div>
            </div>
          </div>
        </Y2KWindow>

        {/* Stats */}
        <Y2KWindow title="📊 ESTATÍSTICAS">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'MÚSICAS', value: songs.length.toString() },
              { label: 'SESSÕES', value: sessions.length.toString() },
              { label: 'MELHOR SCORE', value: bestScore.toLocaleString() },
              { label: 'AFINAÇÃO MÉDIA', value: `${avgPitch}%` },
            ].map(({ label, value }) => (
              <div key={label} style={{
                border: '1px solid var(--purple-mid)',
                padding: '10px 8px',
                background: 'rgba(155,93,229,0.1)',
                textAlign: 'center',
              }}>
                <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)', marginBottom: 6 }}>
                  {label}
                </p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--cyan-electric)' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </Y2KWindow>

        {/* Session History */}
        <Y2KWindow title={`🏆 HISTÓRICO (${sessions.length} sessões)`} style={{ gridColumn: '1 / -1' }}>
          {sessions.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
              Nenhuma sessão ainda. Cante sua primeira música!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
              {sessions.map((s) => (
                <div key={s.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  border: '1px solid var(--purple-mid)',
                  background: 'rgba(155,93,229,0.1)',
                }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '7px', color: 'var(--white-pure)' }}>
                      {(s.songs as any)?.title?.substring(0, 22) ?? 'Música'}
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--purple-mid)', marginTop: 2 }}>
                      {new Date(s.completed_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <StarRating stars={s.stars ?? 1} animated={false} />
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', color: 'var(--cyan-electric)' }}>
                      {s.total_score?.toLocaleString() ?? 0}
                    </p>
                    <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '6px', color: 'var(--purple-mid)' }}>pts</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'var(--font-pixel)', fontSize: '6px',
                      color: 'var(--yellow-hot)',
                      border: '1px solid var(--yellow-hot)',
                      padding: '2px 6px',
                    }}>
                      {s.rank}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Y2KWindow>
      </div>
    </div>
  )
}
