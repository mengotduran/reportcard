// Transactional email — currently just the password-reset link. Cloud only: the
// offline SQLite build has no internet-facing SMTP relay to speak of, and its
// callers (passwordReset.controller.ts) are excluded from that build entirely
// (see scripts/offline-build/stubs/passwordReset.routes.stub.ts).
//
// Free-tier friendly like the AI remarks provider (see utils/aiRemarks.ts): a
// Gmail account + an app password, via nodemailer's built-in 'gmail' service —
// no paid email API, no domain to verify. Missing credentials never break the
// request; the reset link is logged to the server console instead, so local
// dev works with zero setup.
import nodemailer from 'nodemailer'

let cachedTransporter: nodemailer.Transporter | null | undefined

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter !== undefined) return cachedTransporter
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    cachedTransporter = null
    return null
  }
  cachedTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
  return cachedTransporter
}

const COPY = {
  EN: {
    subject: 'Reset your Bulletin password',
    heading: (name: string) => `Hi ${name},`,
    body: 'We received a request to reset the password on your Bulletin account. Click the button below to choose a new one. This link expires in 1 hour.',
    button: 'Reset Password',
    ignore: "If you didn't request this, you can safely ignore this email — your password will stay the same.",
  },
  FR: {
    subject: 'Réinitialisez votre mot de passe Bulletin',
    heading: (name: string) => `Bonjour ${name},`,
    body: 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Bulletin. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien expire dans 1 heure.',
    button: 'Réinitialiser le mot de passe',
    ignore: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité — votre mot de passe restera inchangé.",
  },
}

export async function sendPasswordResetEmail(opts: {
  to: string
  name: string
  resetUrl: string
  lang?: 'EN' | 'FR'
}): Promise<void> {
  const c = COPY[opts.lang === 'FR' ? 'FR' : 'EN']
  const transporter = getTransporter()

  if (!transporter) {
    // No GMAIL_USER/GMAIL_APP_PASSWORD configured — dev-friendly fallback so the
    // flow is still testable locally without any email account.
    console.log(`[email] GMAIL_USER/GMAIL_APP_PASSWORD not set — password reset link for ${opts.to}:\n  ${opts.resetUrl}`)
    return
  }

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:#262016">
      <p style="font-size:15px">${c.heading(opts.name)}</p>
      <p style="font-size:14px;line-height:1.6;color:#5f5648">${c.body}</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${opts.resetUrl}" style="background:#F03E2F;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${c.button}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af;line-height:1.5">${c.ignore}</p>
    </div>
  `.trim()

  try {
    await transporter.sendMail({
      from: `Bulletin <${process.env.GMAIL_USER}>`,
      to: opts.to,
      subject: c.subject,
      html,
      text: `${c.heading(opts.name)}\n\n${c.body}\n\n${opts.resetUrl}\n\n${c.ignore}`,
    })
  } catch (error) {
    // Never throw into the caller: forgot-password always responds with the same
    // generic message regardless of delivery outcome, to avoid leaking whether an
    // email address exists. A real delivery failure is a server-side thing to fix,
    // not something the requester should learn about from the response.
    console.error('[email] Failed to send password reset email:', error)
  }
}
