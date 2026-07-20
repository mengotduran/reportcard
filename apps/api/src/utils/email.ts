// Transactional email — password reset/setup links. Cloud only: the offline
// SQLite build has no internet-facing mail path to speak of. Its callers
// (passwordReset.controller.ts, and the online branches of teacher.controller.ts /
// auth.controller.ts gated by IS_OFFLINE_BUILD) never actually invoke these
// functions in that build, even though the module itself is still bundled.
//
// Sent via Resend's HTTPS API against the verified usebulletin.org domain.
// Deliberately not SMTP: Railway blocks outbound SMTP ports (465/587) by
// default, so Resend's SMTP relay times out there — the API travels over
// 443 like any other outbound request. Missing credentials never break the
// request; the link is logged to the server console instead, so local dev
// works with zero setup.
const FROM_ADDRESS = 'Bulletin <noreply@usebulletin.org>'

const RESET_COPY = {
  EN: {
    subject: 'Reset your Bulletin password',
    heading: 'Hi,',
    body: 'We received a request to reset the password on your Bulletin account. Click the button below to choose a new one. This link expires in 1 hour.',
    button: 'Reset Password',
    ignore: "If you didn't request this, you can safely ignore this email — your password will stay the same.",
  },
  FR: {
    subject: 'Réinitialisez votre mot de passe Bulletin',
    heading: 'Bonjour,',
    body: 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Bulletin. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien expire dans 1 heure.',
    button: 'Réinitialiser le mot de passe',
    ignore: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité — votre mot de passe restera inchangé.",
  },
}

const SETUP_COPY = {
  EN: {
    subject: 'Set up your Bulletin account',
    heading: 'Hi,',
    body: 'An administrator has set up access to your Bulletin account. Click the button below to choose your password and get started. This link expires in 7 days.',
    button: 'Set Password',
    ignore: "If you weren't expecting this, you can ignore this email or contact your school administrator.",
  },
  FR: {
    subject: 'Configurez votre compte Bulletin',
    heading: 'Bonjour,',
    body: "Un administrateur a configuré l'accès à votre compte Bulletin. Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et commencer. Ce lien expire dans 7 jours.",
    button: 'Définir le mot de passe',
    ignore: "Si vous ne vous attendiez pas à cela, vous pouvez ignorer cet e-mail ou contacter l'administrateur de votre école.",
  },
}

type Copy = { subject: string; heading: string; body: string; button: string; ignore: string }

async function dispatchEmail(opts: { to: string; resetUrl: string; copy: Copy; logLabel: string }): Promise<void> {
  const { to, resetUrl, copy: c, logLabel } = opts
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    // No RESEND_API_KEY configured — dev-friendly fallback so the flow is
    // still testable locally without any email account.
    console.log(`[email] RESEND_API_KEY not set — ${logLabel} link for ${to}:\n  ${resetUrl}`)
    return
  }

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:#262016">
      <p style="font-size:15px">${c.heading}</p>
      <p style="font-size:14px;line-height:1.6;color:#5f5648">${c.body}</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="background:#F03E2F;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${c.button}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af;line-height:1.5">${c.ignore}</p>
    </div>
  `.trim()

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: c.subject,
        html,
        text: `${c.heading}\n\n${c.body}\n\n${resetUrl}\n\n${c.ignore}`,
      }),
    })
    if (!res.ok) {
      console.error(`[email] Resend API returned ${res.status}:`, await res.text())
    }
  } catch (error) {
    // Never throw into the caller: forgot-password always responds with the same
    // generic message regardless of delivery outcome, to avoid leaking whether an
    // email address exists. A real delivery failure is a server-side thing to fix,
    // not something the requester should learn about from the response.
    console.error(`[email] Failed to send ${logLabel} email:`, error)
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string
  resetUrl: string
  lang?: 'EN' | 'FR'
}): Promise<void> {
  const copy = RESET_COPY[opts.lang === 'FR' ? 'FR' : 'EN']
  await dispatchEmail({ to: opts.to, resetUrl: opts.resetUrl, copy, logLabel: 'password reset' })
}

// Admin-triggered: a new teacher's account creation, or an admin resetting an
// existing teacher's password. Either way the admin never sees/sets the actual
// password — the teacher picks their own via this link.
export async function sendPasswordSetupEmail(opts: {
  to: string
  resetUrl: string
  lang?: 'EN' | 'FR'
}): Promise<void> {
  const copy = SETUP_COPY[opts.lang === 'FR' ? 'FR' : 'EN']
  await dispatchEmail({ to: opts.to, resetUrl: opts.resetUrl, copy, logLabel: 'password setup' })
}
