import { GraduationCap } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy - Bulletin',
  description: 'How Bulletin collects, uses, and protects data.',
}

const LAST_UPDATED = 'July 18, 2026'
const CONTACT_EMAIL = 'bulletin996@gmail.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
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
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-8">
          <Section title="Overview">
            <p>
              Bulletin is a school management platform used by schools to record student information, academic
              marks, report cards, and fee payments. This policy explains what data the app and web platform
              collect, how it is used, and who it is shared with.
            </p>
            <p>
              Bulletin is provided to schools as a tool. The school that creates an account and enters student,
              staff, and family data is the one responsible for that data and for having the right to collect it.
              Bulletin stores and processes that data on the school&apos;s behalf, to make the platform work.
            </p>
          </Section>

          <Section title="Who uses Bulletin">
            <p>
              Accounts exist for school administrators, teachers/lecturers, and, where a school enables it,
              students and parents/guardians. Some student accounts belong to children. Student and parent accounts
              are created and managed by the school, not signed up independently, so the school is responsible for
              any parental consent required under its local rules before creating an account for a student.
            </p>
          </Section>

          <Section title="Information we collect">
            <p><strong className="text-foreground">Account information</strong> — name, email address, password (stored encrypted, never in plain text), role (e.g. admin, teacher, student, parent), and the school the account belongs to.</p>
            <p><strong className="text-foreground">Student information</strong> — full name, student/matricule ID, class or programme, gender, date of birth, place of birth, enrollment status, and guardian name/phone/email where provided by the school.</p>
            <p><strong className="text-foreground">Academic records</strong> — subject marks, grades, class positions, teacher remarks, AI-generated remarks (see below), pass/fail decisions, and report card/transcript documents.</p>
            <p><strong className="text-foreground">Fee and payment records</strong> — installment amounts, payment dates, and notes tied to a student&apos;s fee ledger. Bulletin records that a payment was made; it does not process card or mobile-money transactions itself.</p>
            <p><strong className="text-foreground">School information</strong> — school name, contact details, logo, and official stamp images used on printed documents.</p>
            <p><strong className="text-foreground">Technical information</strong> — a login session token stored on your device to keep you signed in, and standard server logs (such as IP address and request timestamps) used for security and troubleshooting.</p>
          </Section>

          <Section title="AI-generated remarks">
            <p>
              If a school enables AI-assisted remarks, a student&apos;s name and term average are sent to a
              third-party AI provider (Google&apos;s Gemini API) to generate a short written comment. No other
              student data — marks per subject, guardian details, fee records, or birth details — is sent as part
              of this feature. Staff can review and edit any AI-generated remark before it is published.
            </p>
          </Section>

          <Section title="How we use this information">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To operate the platform: authenticate accounts, generate report cards and transcripts, and track fee payments.</li>
              <li>To let schools communicate academic results to students and guardians.</li>
              <li>To maintain security, prevent abuse, and troubleshoot technical issues.</li>
            </ul>
            <p>We do not sell any data, and we do not use it for advertising. Bulletin has no ads and no third-party analytics or tracking SDKs.</p>
          </Section>

          <Section title="Who we share data with">
            <p>Data is only shared with the infrastructure providers that host and run Bulletin, strictly to operate the service:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-foreground">Neon</strong> — database hosting.</li>
              <li><strong className="text-foreground">Railway</strong> — API server hosting.</li>
              <li><strong className="text-foreground">Vercel</strong> — web application hosting.</li>
              <li><strong className="text-foreground">Google (Gemini API)</strong> — only when a school enables AI remarks, and only the student&apos;s name and average as described above.</li>
            </ul>
            <p>These providers process data on our behalf under their own security and confidentiality terms. We do not share data with advertisers or data brokers.</p>
          </Section>

          <Section title="Data retention and deletion">
            <p>
              Data is retained for as long as the school&apos;s account is active, so that historical academic
              records remain available. A school administrator can deactivate or remove a student or staff record
              at any time. To request deletion of a specific account or dataset, contact us at the email below —
              we will act on the request or route it to the responsible school if the school controls that data.
            </p>
          </Section>

          <Section title="Data security">
            <p>
              Passwords are stored using industry-standard one-way hashing (bcrypt) and are never visible to
              Bulletin staff. Access to student and academic data is restricted by role — for example, a subject
              teacher can only see the classes and subjects assigned to them.
            </p>
          </Section>

          <Section title="Children's data">
            <p>
              Some users of Bulletin are school-age children. Student accounts are created and managed by schools,
              not by children signing up on their own, and Bulletin does not knowingly collect data directly from
              children outside of that school-managed context. Parents or guardians with questions about a
              specific student&apos;s data should contact their school, or reach us directly at the email below.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              If this policy changes, the &quot;Last updated&quot; date at the top of this page will change
              accordingly. Continued use of Bulletin after an update means you accept the revised policy.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              For any question about this policy or your data, contact{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary font-medium hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
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
