import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function isStudentEmail(email: string) {
  return /\.(edu|ac\.uk|ac\.cn|edu\.cn|edu\.au|edu\.sg|ac\.jp)$/i.test(email)
}

// POST /api/verify-email — send verification email
// GET  /api/verify-email?token=xxx — confirm token
export async function POST(req: NextRequest) {
  const { userId, email, name } = await req.json()

  if (!isStudentEmail(email)) {
    return NextResponse.json({ error: 'Not a student email' }, { status: 400 })
  }

  const token = crypto.randomUUID()

  const { error: dbError } = await supabaseAdmin
    .from('users')
    .update({ verification_token: token, email_verified: false })
    .eq('id', userId)

  if (dbError) {
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verifyUrl = `${appUrl}/verify?token=${token}`

  const resend = new Resend(resendKey)
  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: [email],
    subject: 'Verify your Maple account 🍁',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:400px;margin:0 auto;padding:40px 24px;background:#f8f7f4;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:44px;margin-bottom:8px;">🍁</div>
          <h1 style="font-size:22px;font-weight:700;color:#111;margin:0;">Welcome to Maple, ${name}</h1>
        </div>
        <div style="background:white;border-radius:16px;padding:24px;border:1px solid #e8e6e1;">
          <p style="color:#6b6760;line-height:1.7;margin:0 0 20px;">
            Tap the button below to verify your campus email and start finding people you vibe with.
          </p>
          <div style="text-align:center;">
            <a href="${verifyUrl}" style="display:inline-block;background:#111;color:white;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;">
              verify my email →
            </a>
          </div>
          <p style="color:#c5c0bb;font-size:11px;margin-top:20px;text-align:center;">
            This link expires in 24 hours.
          </p>
        </div>
        <p style="text-align:center;color:#c5c0bb;font-size:11px;margin-top:20px;">
          No photos · Mutual matches only · AI-planned dates
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('[verify-email] Resend error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ email_verified: true, verification_token: null })
    .eq('verification_token', token)
    .select('id, name')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  return NextResponse.json({ success: true, userId: data.id, name: data.name })
}
