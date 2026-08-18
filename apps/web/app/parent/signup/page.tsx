'use client'
import { useEffect, useState } from 'react'
import {
  listSignupSchoolsApi, listSignupClassesApi, requestGuardianAccessApi, SignupSchool,
} from '@/lib/api/parent'
import AuthBackground from '@/components/ui/AuthBackground'
import CustomSelect from '@/components/ui/CustomSelect'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { GraduationCap, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

/**
 * A parent asking for access to their own child, without waiting to be sent a link.
 *
 * Public, and outside the portal layout's guard: whoever fills this in has no account yet.
 * Deliberately plain about what happens next, because the server answers identically
 * whether or not anything matched (it must, or the form would tell strangers whose phone
 * number belongs to whose child) and a parent left guessing would just fill it in again.
 */
export default function ParentSignupPage() {
  const [schools, setSchools] = useState<SignupSchool[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [loadingSchools, setLoadingSchools] = useState(true)

  const [schoolId, setSchoolId] = useState('')
  const [studentName, setStudentName] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [parentName, setParentName] = useState('')
  const [contact, setContact] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    listSignupSchoolsApi()
      .then((r) => setSchools(r.schools))
      .catch(() => setError('Could not load the list of schools. Please try again.'))
      .finally(() => setLoadingSchools(false))
  }, [])

  useEffect(() => {
    if (!schoolId) { setClasses([]); setClassLevel(''); return }
    setClassLevel('')
    listSignupClassesApi(schoolId).then((r) => setClasses(r.classes)).catch(() => setClasses([]))
  }, [schoolId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!schoolId || !studentName.trim() || !classLevel || !contact.trim()) {
      setError('Fill in every field marked with a star.')
      return
    }
    setSaving(true)
    try {
      const res = await requestGuardianAccessApi({
        schoolId, studentName: studentName.trim(), classLevel,
        contact: contact.trim(), parentName: parentName.trim() || undefined,
      })
      setDone(res.message)
    } catch (err: unknown) {
      // Only the requester's own mistakes come back as errors: a malformed contact, or too
      // many attempts. Everything about the school's records answers the same way.
      const e2 = err as { response?: { data?: { message?: string } } }
      setError(e2.response?.data?.message || 'Could not send that request. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 bg-background overflow-hidden">
      <AuthBackground />
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <GraduationCap className="text-primary" size={26} />
          <span className="text-xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>Bulletin</span>
        </div>

        {done ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={28} />
            <h1 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              Request received
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{done}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account? <a href="/login" className="text-primary font-medium hover:underline">Sign in</a>
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6">
            <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>
              See your child&apos;s results
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Tell us which child is yours. If the contact you give is the one the school already has for them,
              we send you a link straight away. Otherwise the school checks it first.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  School <span className="text-destructive">*</span>
                </label>
                {/* Searchable: a parent should be able to type two letters of their school
                    rather than scroll a national list. The school type rides underneath the
                    name, because one group commonly runs a primary and a secondary whose
                    names differ by one word. */}
                <CustomSelect
                  value={schoolId}
                  onChange={setSchoolId}
                  placeholder={loadingSchools ? 'Loading...' : 'Search for your school'}
                  // Always show the search box here, however short today's list is: a parent
                  // does not know this list the way a school admin knows their own classes.
                  searchThreshold={0}
                  options={schools.map((s) => ({
                    value: s.id,
                    label: s.name,
                    sub: s.type === 'UNIVERSITY' ? 'University' : s.type === 'SECONDARY' ? 'Secondary' : 'Primary',
                  }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Your child&apos;s full name <span className="text-destructive">*</span>
                </label>
                <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Achu Ako" className={field} required />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Exactly as the school writes it on their report card.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Their class <span className="text-destructive">*</span>
                </label>
                <CustomSelect
                  value={classLevel}
                  onChange={setClassLevel}
                  disabled={!schoolId}
                  placeholder={schoolId ? 'Choose the class' : 'Choose the school first'}
                  options={classes.map((c) => ({ value: c, label: c }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Your name</label>
                <input type="text" value={parentName} onChange={(e) => setParentName(e.target.value)}
                  placeholder="e.g. Mrs. Nguemo Jane" className={field} />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Your email or phone number <span className="text-destructive">*</span>
                </label>
                <input type="text" value={contact} onChange={(e) => { setContact(e.target.value); if (error) setError('') }}
                  placeholder="parent@email.com or 677000000" className={field} required />
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  An email gets you a link within minutes. A phone number has to be sent by the school over
                  WhatsApp, so it takes a little longer.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={saving}
                className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition flex items-center justify-center gap-2">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Sending...' : 'Ask for access'}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account? <a href="/login" className="text-primary font-medium hover:underline">Sign in</a>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
