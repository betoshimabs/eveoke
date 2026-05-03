import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EveOkê — Canta. Pontua. Domina.',
  description: 'Karaoke inteligente com avaliação de pitch em tempo real. Faça upload da sua música e mostre seu talento!',
  keywords: 'karaoke, karaoke online, cantar, pitch, afinação, música',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-animated">
        {children}
      </body>
    </html>
  )
}
