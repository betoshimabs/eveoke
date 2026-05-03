'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface WindowDotProps { color: string }
function WindowDot({ color }: WindowDotProps) {
  return <span className={`window-dot window-dot-${color}`} />
}

interface Y2KWindowProps {
  title: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Y2KWindow({ title, children, className = '', style }: Y2KWindowProps) {
  return (
    <div className={`window animate-slideIn ${className}`} style={style}>
      <div className="window-titlebar">
        <div className="window-titlebar-dots">
          <WindowDot color="pink" />
          <WindowDot color="yellow" />
          <WindowDot color="cyan" />
        </div>
        <span className="window-titlebar-title">{title}</span>
        <span style={{ width: 30 }} />
      </div>
      <div className="window-content">{children}</div>
    </div>
  )
}

interface ProgressBarProps {
  progress: number  // 0-100
  label?: string
}

export function ProgressBar({ progress, label }: ProgressBarProps) {
  return (
    <div>
      <div className="progress-container">
        <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      {label && <p className="progress-label">{label}</p>}
    </div>
  )
}

interface InputFieldProps {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id: string
  required?: boolean
}

export function InputField({
  label, type = 'text', value, onChange, placeholder, id, required
}: InputFieldProps) {
  return (
    <div className="input-group">
      <label htmlFor={id} className="input-label">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="input"
        autoComplete={type === 'password' ? 'current-password' : 'off'}
      />
    </div>
  )
}

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  id?: string
}

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled, type = 'button', className = '', id
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  )
}

interface TickerProps {
  messages?: string[]
}

export function Ticker({ messages }: TickerProps) {
  const defaultMsgs = [
    'EVEOKÊ v1.0 CARREGANDO...',
    'BEM-VINDO AO FUTURO DO KARAOKÊ',
    'FAÇA UPLOAD DA SUA MÚSICA',
    'AVALIAÇÃO DE PITCH EM TEMPO REAL',
    'CONECTE SEU CELULAR COMO MICROFONE',
    'CANTA. PONTUA. DOMINA.',
    'SISTEMA DE KARAOKÊ ONLINE',
    'PROCESSAMENTO LOCAL — SUA PRIVACIDADE PROTEGIDA',
  ]
  const msgs = messages ?? defaultMsgs
  const text = msgs.join('   ✦   ') + '   ✦   '

  return (
    <div className="ticker-wrapper">
      <span className="ticker-content">{text}{text}</span>
    </div>
  )
}

interface StarRatingProps {
  stars: number  // 1-5
  animated?: boolean
}

export function StarRating({ stars, animated = true }: StarRatingProps) {
  return (
    <div className="stars-display">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={`star ${s <= stars ? 'filled' : ''}`}
          style={animated ? { animationDelay: `${s * 0.15}s` } : {}}
        >
          ★
        </span>
      ))}
    </div>
  )
}
