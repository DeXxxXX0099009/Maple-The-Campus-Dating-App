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

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// POST /api/verify-email — send OTP code
export async function POST(req: NextRequest) {
  const { userId, email, name } = await req.json()

  if (!isStudentEmail(email)) {
    return NextResponse.json({ error: 'Not a student email' }, { status: 400 })
  }

  const otp = generateOTP()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error: dbError } = await supabaseAdmin
    .from('users')
    .update({ verification_token: otp, email_verified: false })
    .eq('id', userId)

  if (dbError) {
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
  }

  const resend = new Resend(resendKey)
  const { error } = await resend.emails.send({
    from: 'noreply@maplemeet.ai',
    to: [email],
    subject: `${otp} is your Maple verification code`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:400px;margin:0 auto;padding:40px 24px;background:#f8f7f4;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:44px;margin-bottom:8px;">🍁</div>
          <h1 style="font-size:22px;font-weight:700;color:#111;margin:0;">Hey ${name} 👋</h1>
        </div>
        <div style="background:white;border-radius:16px;padding:24px;border:1px solid #e8e6e1;">
          <p style="color:#6b6760;line-height:1.7;margin:0 0 20px;">
            Your Maple verification code is:
          </p>
          <div style="text-align:center;margin:24px 0;">
            <div style="display:inline-block;background:#111;color:white;padding:16px 40px;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;">
              ${otp}
            </div>
          </div>
          <p style="color:#c5c0bb;font-size:11px;margin-top:20px;text-align:center;">
            Enter this code on the Maple signup page. Expires in 24 hours.
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

// POST /api/verify-email/confirm — verify OTP code
export async function PUT(req: NextRequest) {
  const { userId, code } = await req.json()
  if (!userId || !code) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ email_verified: true, verification_token: null })
    .eq('id', userId)
    .eq('verification_token', code)
    .select('id, name')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }

  return NextResponse.json({ success: true, name: data.name })
}
