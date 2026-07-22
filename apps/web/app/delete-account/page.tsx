import { GraduationCap } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Delete Your Account - Bulletin',
  description: 'How to request deletion of your Bulletin account and associated data.',
}

const CONTACT_EMAIL = 'bulletin996@gmail.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function DeleteAccountPage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16 space-y-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-md shrink-0">
            <GraduationCap size={22} className="text-white" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <span className="block font-extrabold text-xl text-foreground tracking-tight">Bulletin</span>
            <span className="block text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground">
              School report cards
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Delete Your Account</h1>
          <p className="text-sm text-muted-foreground mt-2">
            How to request deletion of your Bulletin account and the data tied to it.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-8">
          <Section title="Who this applies to">
            <p>
              Bulletin accounts (school administrators, teachers/lecturers, students, and parents/guardians) are
              created and managed by a school, not signed up independently. Because of that, account deletion is
              handled as a request rather than a self-service in-app button, so the school can confirm the request
              and we can verify it&apos;s really you before removing anything.
            </p>
          </Section>

          <Section title="How to request deletion">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Email{' '}
                <a href={`mailto:${CONTACT_EMAIL}?subject=Account%20deletion%20request`} className="text-primary font-medium hover:underline">
                  {CONTACT_EMAIL}
                </a>{' '}
                from the address associated with your account, with the subject line &quot;Account deletion
                request&quot;.
              </li>
              <li>Include your full name, the school your account belongs to, and your role (admin, teacher, student, or parent).</li>
              <li>
                We will verify the request, and where the account belongs to a school (student, teacher, or parent
                accounts), notify that school&apos;s administrator, since school records are ultimately controlled
                by the school.
              </li>
              <li>Once confirmed, your account and the personal data listed below are deleted within 30 days.</li>
            </ol>
          </Section>

          <Section title="What gets deleted">
            <p><strong className="text-foreground">Deleted:</strong> your login credentials (email and password hash), profile details, and session data.</p>
            <p>
              <strong className="text-foreground">May be retained:</strong> academic records that are part of a
              school&apos;s official records — such as marks, report cards, and transcripts already issued to a
              student — are controlled by the school, not by the individual account holder. A school may keep these
              as part of its own academic recordkeeping obligations even after a linked account is deleted. If you
              want a specific record removed, we&apos;ll route that part of the request to the school.
            </p>
            <p>
              Fee and payment records tied to a student may also be retained by the school for its own financial
              recordkeeping, for the same reason.
            </p>
          </Section>

          <Section title="Questions">
            <p>
              See our{' '}
              <Link href="/privacy" className="text-primary font-medium hover:underline">Privacy Policy</Link>{' '}
              for more on what data we collect and how it&apos;s used, or contact{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary font-medium hover:underline">
                {CONTACT_EMAIL}
              </a>{' '}
              with any questions.
            </p>
          </Section>
        </div>

        <div className="text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
