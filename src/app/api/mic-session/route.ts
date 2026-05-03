import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateSessionToken } from '@/lib/utils/qr-session'

export async function POST(request: NextRequest) {
  try {
    // Get user from auth header (service role can verify)
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createAdminClient()

    // Verify the user JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return Response.json({ error: 'Invalid token' }, { status: 401 })
    }

    const sessionToken = generateSessionToken()

    const { data, error } = await supabase
      .from('mic_sessions')
      .insert({
        user_id: user.id,
        token: sessionToken,
        status: 'waiting',
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({
      sessionId: data.id,
      token: sessionToken,
      expiresAt: data.expires_at,
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })

  const supabase = createAdminClient()
  await supabase.from('mic_sessions').update({ status: 'expired' }).eq('id', sessionId)
  return Response.json({ success: true })
}
