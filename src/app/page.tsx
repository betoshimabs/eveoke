'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Y2KWindow, InputField, Button, Ticker } from '@/components/ui'

type AuthMode = 'login' | 'register'

function FloatingWindow({ title, style }: { title: string; style: React.CSSProperties }) {
  return (
    <div
      className="window"
      style={{
        position: 'absolute',
        opacity: 0.25,
        pointerEvents: 'none',
        width: 200,
        ...style,
      }}
    >
      <div className="window-titlebar">
        <div className="window-titlebar-dots">
          <span className="window-dot window-dot-pink" />
          <span className="window-dot window-dot-yellow" />
          <span className="window-dot window-dot-cyan" />
        </div>
        <span className="window-titlebar-title">{title}</span>
        <span />
      </div>
      <div className="window-content" style={{ height: 80 }} />
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      } else {
        if (username.length < 3) throw new Error('Username deve ter pelo menos 3 caracteres.')
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        })
        if (error) throw error
        setSuccess('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
      }
    } catch (err: any) {
      setError(err.message ?? 'Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative floating windows */}
      <FloatingWindow title="LOADING..." style={{ top: '8%', left: '5%' }} />
      <FloatingWindow title="♪ AUDIO ENGINE" style={{ top: '15%', right: '4%' }} />
      <FloatingWindow title="PITCH ANALYZER" style={{ bottom: '20%', left: '3%' }} />
      <FloatingWindow title="MIC INPUT" style={{ bottom: '30%', right: '5%' }} />

      {/* Pixel art decorations */}
      <div style={{
        position: 'absolute', top: '5%', right: '15%',
        fontSize: '60px', opacity: 0.15, pointerEvents: 'none',
        animation: 'spin 20s linear infinite'
      }}>🎵</div>
      <div style={{
        position: 'absolute', bottom: '10%', left: '12%',
        fontSize: '50px', opacity: 0.15, pointerEvents: 'none',
      }}>🎤</div>

      {/* Main content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        gap: '32px',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <h1
            className="glitch"
            data-text="EveOkê"
            style={{
              fontFamily: 'var(--font-pixel)',
              fontSize: 'clamp(28px, 6vw, 56px)',
              textShadow: 'var(--shadow-text-y2k)',
              marginBottom: '12px',
            }}
          >
            <span style={{ color: 'var(--white-pure)' }}>Eve</span>
            <span style={{ color: 'var(--yellow-hot)' }}>Okê</span>
          </h1>
          <p
            className="text-vt text-cyan"
            style={{ fontSize: 'clamp(20px, 3vw, 32px)', letterSpacing: '3px' }}
          >
            Canta. Pontua. Domina.
          </p>
        </div>

        {/* Auth Window */}
        <Y2KWindow
          title={mode === 'login' ? '🔐 LOGIN DO SISTEMA' : '📝 NOVO USUÁRIO'}
          style={{ width: '100%', maxWidth: 420 }}
        >
          {/* Mode toggle */}
          <div className="flex gap-2" style={{ marginBottom: '20px' }}>
            <button
              id="btn-mode-login"
              onClick={() => { setMode('login'); setError(''); setSuccess('') }}
              style={{
                flex: 1,
                fontFamily: 'var(--font-pixel)',
                fontSize: '7px',
                padding: '6px',
                background: mode === 'login' ? 'var(--cyan-electric)' : 'transparent',
                color: mode === 'login' ? 'var(--black-pixel)' : 'var(--cyan-electric)',
                border: '2px solid var(--cyan-electric)',
                cursor: 'pointer',
              }}
            >
              LOGIN
            </button>
            <button
              id="btn-mode-register"
              onClick={() => { setMode('register'); setError(''); setSuccess('') }}
              style={{
                flex: 1,
                fontFamily: 'var(--font-pixel)',
                fontSize: '7px',
                padding: '6px',
                background: mode === 'register' ? 'var(--cyan-electric)' : 'transparent',
                color: mode === 'register' ? 'var(--black-pixel)' : 'var(--cyan-electric)',
                border: '2px solid var(--cyan-electric)',
                cursor: 'pointer',
              }}
            >
              REGISTRAR
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'register' && (
              <InputField
                id="input-username"
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="seu_username"
                required
              />
            )}
            <InputField
              id="input-email"
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="usuario@email.com"
              required
            />
            <InputField
              id="input-password"
              label="Senha"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
            />

            {error && (
              <p style={{
                fontFamily: 'var(--font-pixel)',
                fontSize: '7px',
                color: 'var(--red-miss)',
                padding: '8px',
                border: '1px solid var(--red-miss)',
                background: 'rgba(255,51,102,0.1)',
              }}>
                ⚠ {error}
              </p>
            )}

            {success && (
              <p style={{
                fontFamily: 'var(--font-pixel)',
                fontSize: '7px',
                color: 'var(--green-pitch)',
                padding: '8px',
                border: '1px solid var(--green-pitch)',
                background: 'rgba(57,255,20,0.1)',
              }}>
                ✓ {success}
              </p>
            )}

            <Button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              variant="primary"
              size="lg"
              className="w-full"
            >
              {loading ? '⟳ PROCESSANDO...' : mode === 'login' ? '▶ ENTRAR' : '✦ CRIAR CONTA'}
            </Button>
          </form>
        </Y2KWindow>

        {/* Info chips */}
        <div className="flex gap-4" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {['🎤 Pitch em Tempo Real', '📱 Mobile como Mic', '🔒 100% Privado', '⚡ Processamento Local'].map((item) => (
            <span
              key={item}
              style={{
                fontFamily: 'var(--font-pixel)',
                fontSize: '7px',
                color: 'var(--cyan-electric)',
                border: '1px solid var(--cyan-electric)',
                padding: '4px 10px',
                background: 'rgba(0,245,255,0.05)',
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Ticker */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
        <Ticker />
      </div>
    </div>
  )
}
