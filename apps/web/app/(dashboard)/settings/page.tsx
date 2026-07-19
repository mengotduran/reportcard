'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { Upload, Trash2, Image, Building2, Plus, Star, Palette, ArrowRight, DatabaseBackup, FileSpreadsheet, Download, Pencil, X, Check, GraduationCap, Languages, UserCircle, Type, Stamp, type LucideIcon } from 'lucide-react'
import api from '@/lib/api/client'
import { updateLanguagePreferenceApi, updateMyEmailApi } from '@/lib/api/auth'
import { saveBlob } from '@/lib/csv'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useToast } from '@/lib/useToast'
import DesktopOnly from '@/components/ui/DesktopOnly'
import ChangePasswordCard from '@/components/ui/ChangePasswordCard'
import { useT } from '@/lib/i18n'
import {
  ExcelTemplate,
  listExcelTemplatesApi, uploadExcelTemplateApi,
  updateExcelTemplateApi, deleteExcelTemplateApi,
  previewExcelTemplateApi, downloadExampleTemplateApi,
} from '@/lib/api/excelTemplates'
import { getClassLevelsApi } from '@/lib/api/classLevels'

// Images are proxied through Next.js rewrites — use relative paths directly

const CARD = 'bg-card rounded-xl border border-border p-6'
const FIELD = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50'

// Example/placeholder text for the Official header letterhead blocks — kept
// per school type so a Primary/Secondary admin never sees university wording
// (institute/ministry of higher education) and vice versa. Real Cameroon
// ministry acronyms: MINESUP (higher ed), MINESEC (secondary), MINEDUB (basic).
function officialTextExamples(schoolType: string | undefined, name: string) {
  const upperName = name ? name.toUpperCase() : 'YOUR SCHOOL'
  if (schoolType === 'UNIVERSITY') return {
    leftEn: `HIGHER INSTITUTE OF\nTECHNOLOGY AND MANAGEMENT\n${upperName}`,
    leftFr: `INSTITUT SUPERIEUR EN\nTECHNOLOGIE ET EN GESTION\n${upperName}`,
    rightEn: 'REPUBLIC OF CAMEROON\nPeace-Work-Fatherland\n\nMINISTRY OF HIGHER EDUCATION',
    rightFr: "REPUBLIQUE DU CAMEROUN\nPaix-Travail-Patrie\n\nMINISTERE DE L'ENSEIGNEMENT SUPERIEUR",
  }
  if (schoolType === 'PRIMARY') return {
    leftEn: `GOVERNMENT PRIMARY SCHOOL\n${upperName}`,
    leftFr: `ECOLE PUBLIQUE DE\n${upperName}`,
    rightEn: 'REPUBLIC OF CAMEROON\nPeace-Work-Fatherland\n\nMINISTRY OF BASIC EDUCATION',
    rightFr: "REPUBLIQUE DU CAMEROUN\nPaix-Travail-Patrie\n\nMINISTERE DE L'EDUCATION DE BASE",
  }
  // SECONDARY (also the default fallback)
  return {
    leftEn: `GOVERNMENT BILINGUAL HIGH SCHOOL\n${upperName}`,
    leftFr: `LYCEE BILINGUE DE\n${upperName}`,
    rightEn: 'REPUBLIC OF CAMEROON\nPeace-Work-Fatherland\n\nMINISTRY OF SECONDARY EDUCATION',
    rightFr: 'REPUBLIQUE DU CAMEROUN\nPaix-Travail-Patrie\n\nMINISTERE DES ENSEIGNEMENTS SECONDAIRES',
  }
}

// One consistent header for every settings card: an icon chip, a title, an
// optional description, and an optional right-aligned action (a button/link).
function CardHead({ icon: Icon, title, desc, action }: {
  icon: LucideIcon; title: string; desc?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={17} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {desc && <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { school, updateSchool, user, updateUser } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const logoRef = useRef<HTMLInputElement>(null)
  const stampRef = useRef<HTMLInputElement>(null)
  const [uploadingStamp, setUploadingStamp] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [removingIdx, setRemovingIdx] = useState<number | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const isOfflineInstall = process.env.NEXT_PUBLIC_OFFLINE_BUILD === '1'
  const isUniversity = school?.type === 'UNIVERSITY'
  const officialExamples = officialTextExamples(school?.type, school?.name ?? '')

  // ── Excel Templates state (university only) ──
  const [excelTemplates, setExcelTemplates] = useState<ExcelTemplate[]>([])
  const [excelMax, setExcelMax] = useState(10)
  const [classLevels, setClassLevels] = useState<string[]>([])
  const [uploadingExcel, setUploadingExcel] = useState(false)
  const [excelName, setExcelName] = useState('')
  const [excelLevels, setExcelLevels] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLevels, setEditLevels] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const excelFileRef = useRef<HTMLInputElement>(null)
  const [showUploadForm, setShowUploadForm] = useState(false)

  useEffect(() => {
    if (!isUniversity) return
    listExcelTemplatesApi().then(d => { setExcelTemplates(d.templates); setExcelMax(d.max) }).catch(() => {})
    getClassLevelsApi().then(d => setClassLevels(d.classLevels.map(cl => cl.name))).catch(() => {})
  }, [isUniversity])

  const handleExcelUpload = async (file: File) => {
    if (!excelName.trim()) { showToast(t('Please enter a template name'), 'error'); return }
    setUploadingExcel(true)
    try {
      const d = await uploadExcelTemplateApi(file, excelName.trim(), excelLevels)
      setExcelTemplates(prev => [...prev, d.template])
      setExcelName(''); setExcelLevels([]); setShowUploadForm(false)
      showToast(t('Template uploaded'))
    } catch (err: any) {
      showToast(err.response?.data?.message ?? t('Upload failed'), 'error')
    } finally { setUploadingExcel(false); if (excelFileRef.current) excelFileRef.current.value = '' }
  }

  const saveEdit = async (id: string) => {
    try {
      const d = await updateExcelTemplateApi(id, { name: editName.trim(), classLevels: editLevels })
      setExcelTemplates(prev => prev.map(t => t.id === id ? d.template : t))
      setEditingId(null)
      showToast(t('Template updated'))
    } catch { showToast(t('Update failed'), 'error') }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteExcelTemplateApi(id)
      setExcelTemplates(prev => prev.filter(t => t.id !== id))
      showToast(t('Template deleted'))
    } catch { showToast(t('Delete failed'), 'error') }
    finally { setDeletingId(null) }
  }

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const res = await api.get('/backup/download', { responseType: 'blob' })
      const dateStamp = new Date().toISOString().slice(0, 10)
      saveBlob(res.data, `reportcard-backup-${dateStamp}.zip`)
      showToast(t('Backup downloaded'))
    } catch {
      showToast(t('Backup failed'), 'error')
    } finally { setBackingUp(false) }
  }

  const handleUpload = async (file: File, field: 'logo' | 'cover' | 'stamp', setLoading: (v: boolean) => void) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append(field, file)
      const res = await api.post(`/school/${field}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      updateSchool(res.data.school)
      showToast(field === 'logo' ? t('Logo updated successfully')
        : field === 'stamp' ? t('Official stamp updated successfully')
        : t('Cover image updated successfully'))
    } catch {
      showToast(t('Upload failed. Make sure the file is an image under 5MB.'), 'error')
    } finally { setLoading(false) }
  }

  const handleAddCoverImage = async (file: File) => {
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await api.post('/school/cover-images', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      updateSchool(res.data.school)
      showToast(t('Cover image added'))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || t('Upload failed'), 'error')
    } finally { setUploadingCover(false) }
  }

  const handleRemoveCoverImage = async (index: number) => {
    setRemovingIdx(index)
    try {
      const res = await api.delete(`/school/cover-images/${index}`)
      updateSchool(res.data.school)
      showToast(t('Image removed'))
    } catch {
      showToast(t('Failed to remove image'), 'error')
    } finally { setRemovingIdx(null) }
  }

  const handleRemoveStamp = async () => {
    try {
      await api.delete('/school/stamp')
      updateSchool({ ...school!, stamp: null })
      showToast(t('Official stamp removed'))
    } catch { showToast(t('Failed to remove stamp'), 'error') }
  }

  const handleRemoveLogo = async () => {
    try {
      await api.delete('/school/logo')
      updateSchool({ ...school!, logo: null })
      showToast(t('Logo removed'))
    } catch { showToast(t('Failed to remove logo'), 'error') }
  }

  const [infoForm, setInfoForm] = useState({
    name: school?.name ?? '', email: school?.email ?? '', acronym: (school as any)?.acronym ?? '', batch: (school as any)?.batch ?? '',
    phone: school?.phone ?? '', address: school?.address ?? '', website: school?.website ?? '',
    authorizationNumber: school?.authorizationNumber ?? '',
  })
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [savingInfo, setSavingInfo] = useState(false)
  const [thresholdValue, setThresholdValue] = useState<string>(school?.repeatThreshold != null ? String(school.repeatThreshold) : '')
  const [savingThreshold, setSavingThreshold] = useState(false)
  // Who records marks. University only: some keep marks out of teachers' hands so the
  // person who teaches a course never enters its marks.
  const [marksMode, setMarksMode] = useState<'TEACHERS' | 'ADMIN_ONLY'>((school as any)?.marksEntryMode ?? 'TEACHERS')
  const [savingMarksMode, setSavingMarksMode] = useState(false)
  // Switching is capped at 2 per semester (then the provider does it), and every switch
  // is logged. Surfaced here so the cap is visible BEFORE the third attempt fails.
  const [marksSwitches, setMarksSwitches] = useState<{ used: number; limit: number; termId: string | null; allowed: boolean } | null>(null)
  const [marksHistory, setMarksHistory] = useState<{ id: string; mode: string; changedByName: string; changedAt: string; byProvider?: boolean }[]>([])
  // Switching to Administration only takes marks entry away from every teacher at once,
  // and it burns one of the semester's two switches — worth a confirmation so a stray
  // click doesn't cost a chance and lock out teachers by accident.
  const [confirmAdminOnly, setConfirmAdminOnly] = useState(false)

  // Official header letterhead text (the "Official" style's left/right text
  // blocks) — one English and one French variant per side, set once here so
  // it's always consistent and correctly styled everywhere it's used instead
  // of being retyped per report-card template.
  const [officialTextForm, setOfficialTextForm] = useState({
    leftEn: school?.officialLeftTextEn ?? '', leftFr: school?.officialLeftTextFr ?? '',
    rightEn: school?.officialRightTextEn ?? '', rightFr: school?.officialRightTextFr ?? '',
  })
  const [savingOfficialText, setSavingOfficialText] = useState(false)

  // The auth store's cached `school` can lag behind the database (e.g. right
  // after login, or if a field was added since this session started), and
  // this form's initial state is only ever set once from that snapshot. Pull
  // the current row straight from the API so Save never overwrites fields
  // the form never actually loaded with stale/blank values.
  useEffect(() => {
    api.get('/school/settings').then(res => {
      const s = res.data.school
      updateSchool(s)
      setInfoForm({
        name: s.name ?? '', email: s.email ?? '', acronym: s.acronym ?? '', batch: s.batch ?? '',
        phone: s.phone ?? '', address: s.address ?? '', website: s.website ?? '',
        authorizationNumber: s.authorizationNumber ?? '',
      })
      setThresholdValue(s.repeatThreshold != null ? String(s.repeatThreshold) : '')
      setMarksMode((s as any).marksEntryMode ?? 'TEACHERS')
      setMarksSwitches(res.data.marksEntrySwitches ?? null)
      setMarksHistory(res.data.marksEntryModeHistory ?? [])
      setOfficialTextForm({
        leftEn: s.officialLeftTextEn ?? '', leftFr: s.officialLeftTextFr ?? '',
        rightEn: s.officialRightTextEn ?? '', rightFr: s.officialRightTextFr ?? '',
      })
    }).catch(() => {}).finally(() => setLoadingInfo(false))
  }, [])

  const handleSaveInfo = async () => {
    setSavingInfo(true)
    try {
      const res = await api.put('/school/settings', {
        name: infoForm.name.trim(), email: infoForm.email.trim(), acronym: infoForm.acronym.trim(), batch: infoForm.batch === '' ? null : Number(infoForm.batch),
        phone: infoForm.phone.trim(), address: infoForm.address.trim(), website: infoForm.website.trim(),
        authorizationNumber: infoForm.authorizationNumber.trim(),
      })
      updateSchool(res.data.school)
      showToast(t('School info saved'))
    } catch (err: any) {
      showToast(err.response?.data?.message ?? t('Failed to save'), 'error')
    }
    finally { setSavingInfo(false) }
  }

  const handleSaveMarksMode = async (mode: 'TEACHERS' | 'ADMIN_ONLY') => {
    const previous = marksMode
    setMarksMode(mode)          // optimistic: the radio should not lag behind the click
    setSavingMarksMode(true)
    try {
      const res = await api.put('/school/settings', { marksEntryMode: mode })
      updateSchool(res.data.school)
      showToast(mode === 'ADMIN_ONLY' ? t('Only administrators can enter marks now') : t('Teachers can enter marks now'))
      // The switch used one of the semester's two: refetch so the counter and history tell
      // the truth without a reload.
      const fresh = await api.get('/school/settings')
      setMarksSwitches(fresh.data.marksEntrySwitches ?? null)
      setMarksHistory(fresh.data.marksEntryModeHistory ?? [])
    } catch (err: unknown) {
      setMarksMode(previous)    // put it back: a silent revert would misstate the policy
      // The cap's refusal explains itself ("contact your provider"); a generic "failed"
      // would send the admin hunting for a bug instead.
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || t('Failed to save'), 'error')
    } finally { setSavingMarksMode(false) }
  }

  // Switching to Administration only is the consequential direction (every teacher
  // loses write access at once) and spends a switch, so it's confirmed first. Switching
  // back to Teachers just restores their normal access, so it applies immediately.
  const handleMarksModeChange = (mode: 'TEACHERS' | 'ADMIN_ONLY') => {
    if (mode === 'ADMIN_ONLY' && marksMode !== 'ADMIN_ONLY') {
      setConfirmAdminOnly(true)
      return
    }
    handleSaveMarksMode(mode)
  }

  const handleSaveThreshold = async () => {
    setSavingThreshold(true)
    try {
      const res = await api.put('/school/settings', { repeatThreshold: thresholdValue === '' ? null : Number(thresholdValue) })
      updateSchool(res.data.school)
      showToast(t('Decision threshold saved'))
    } catch { showToast(t('Failed to save'), 'error') }
    finally { setSavingThreshold(false) }
  }

  const handleSaveOfficialText = async () => {
    setSavingOfficialText(true)
    try {
      const res = await api.put('/school/settings', {
        officialLeftTextEn: officialTextForm.leftEn.trim(), officialLeftTextFr: officialTextForm.leftFr.trim(),
        officialRightTextEn: officialTextForm.rightEn.trim(), officialRightTextFr: officialTextForm.rightFr.trim(),
      })
      updateSchool(res.data.school)
      showToast(t('Official header text saved'))
    } catch { showToast(t('Failed to save'), 'error') }
    finally { setSavingOfficialText(false) }
  }

  // My Account — the logged-in admin's own login email, distinct from the
  // school's institutional email above.
  const [myEmail, setMyEmail] = useState(user?.email ?? '')
  const [savingMyEmail, setSavingMyEmail] = useState(false)
  useEffect(() => { setMyEmail(user?.email ?? '') }, [user?.email])

  const handleSaveMyEmail = async () => {
    const trimmed = myEmail.trim()
    if (!trimmed) { showToast(t('Email is required'), 'error'); return }
    setSavingMyEmail(true)
    try {
      // Keep the "Saving…" state up for at least a beat so a fast response
      // doesn't flash past unnoticed — the change is worth confirming visually.
      const [res] = await Promise.all([
        updateMyEmailApi(trimmed),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ])
      updateUser({ email: res.email })
      showToast(t('Your email was updated'))
    } catch (err: any) {
      showToast(err.response?.data?.message ?? t('Failed to update email'), 'error')
    } finally { setSavingMyEmail(false) }
  }

  const logoUrl = school?.logo ?? null
  const stampUrl = school?.stamp ?? null
  const coverImages: string[] = (school as any)?.coverImages ?? []

  const initials = school?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? 'SC'

  // Sticky section sub-nav + scrollspy. Sections are always present except
  // "Data" (offline installs only); Excel templates live inside Report Cards.
  const sections = [
    { id: 'account', label: t('Account') },
    { id: 'profile', label: t('School Profile') },
    { id: 'branding', label: t('Branding') },
    { id: 'reportcards', label: t('Report Cards') },
    ...(isOfflineInstall ? [{ id: 'data', label: t('Data & Backup') }] : []),
  ]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState('account')
  useEffect(() => {
    const els = sections
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el != null)
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSection(visible[0].target.id)
      },
      // Root is the inner scroll column (below), not the window — only it scrolls.
      { root: scrollRef.current, rootMargin: '-10% 0px -70% 0px' },
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [isOfflineInstall])

  return (
    <DesktopOnly>
    {/* Fixed-height column: the header + nav stay put, only the content scrolls. */}
    <div className="max-w-5xl mx-auto flex flex-col h-[calc(100vh_-_4rem)]">
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('School Settings')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('Customize your school\'s appearance on the platform')}</p>
      </div>

      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[180px_1fr] lg:gap-10">
        {/* ── Section nav (stays put; only the content column scrolls) ───── */}
        <nav className="hidden lg:block self-start">
          <ul className="border-l border-border">
            {sections.map(s => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`block -ml-px border-l-2 pl-4 py-1.5 text-sm transition-colors ${
                    activeSection === s.id
                      ? 'border-primary text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Content (independently scrollable) ─────────────────────────── */}
        <div ref={scrollRef} className="min-w-0 h-full overflow-y-auto space-y-10 pr-1 pb-6 stagger-children">

          {/* ══ Account ══════════════════════════════════════════════════ */}
          <section id="account" className="scroll-mt-8 space-y-4">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Account')}</h4>

            {/* My Account */}
            <div className={CARD}>
              <CardHead icon={UserCircle} title={t('My Account')} desc={t('Used to sign in — not the same as the school email below')} />
              <div className="mt-5">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Your Login Email')} <span className="text-destructive">*</span></label>
                <input
                  type="email"
                  className={FIELD}
                  value={myEmail}
                  onChange={e => setMyEmail(e.target.value)}
                />
                <button
                  onClick={handleSaveMyEmail}
                  disabled={savingMyEmail}
                  className="mt-4 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                >
                  {savingMyEmail ? t('Saving…') : t('Save Email')}
                </button>
              </div>
            </div>

            {/* Change Password */}
            <ChangePasswordCard />

            {/* Interface Language */}
            <div className={CARD}>
              <CardHead
                icon={Languages}
                title={t('Interface Language')}
                desc={t('Choose the language you see in the dashboard. Printed report cards always use the school\'s official language.')}
              />
              <div className="mt-5 flex gap-2">
                {(['EN', 'FR'] as const).map((lang) => {
                  const active = (user?.preferredLanguage ?? school?.language ?? 'EN') === lang
                  return (
                    <button
                      key={lang}
                      onClick={async () => {
                        updateUser({ preferredLanguage: lang })
                        await updateLanguagePreferenceApi(lang).catch(() => {})
                        showToast(lang === 'FR' ? 'Langue changée en français' : 'Language changed to English')
                      }}
                      className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        active
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {lang === 'EN' ? 'English' : 'Français'}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ══ School Profile ═══════════════════════════════════════════ */}
          <section id="profile" className="scroll-mt-8 space-y-4">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{t('School Profile')}</h4>

            <div className={CARD}>
              <CardHead icon={Building2} title={t('School Information')} desc={t('Contact details and identifiers shown across the platform and on report cards.')} />
              <div className="mt-5 grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('School Name')} <span className="text-destructive">*</span></label>
                  <input
                    className={FIELD}
                    value={infoForm.name}
                    onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Email')} <span className="text-destructive">*</span></label>
                  <input
                    type="email"
                    className={FIELD}
                    value={infoForm.email}
                    onChange={e => setInfoForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Phone')}</label>
                    <input
                      className={FIELD}
                      placeholder="+237 6XX XXX XXX"
                      value={infoForm.phone}
                      onChange={e => setInfoForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Website')}</label>
                    <input
                      className={FIELD}
                      placeholder="www.yourschool.com"
                      value={infoForm.website}
                      onChange={e => setInfoForm(f => ({ ...f, website: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Address')}</label>
                  <input
                    className={FIELD}
                    placeholder="P.O. Box 000, City, Country"
                    value={infoForm.address}
                    onChange={e => setInfoForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Authorization / Registration No.')}</label>
                  <input
                    className={FIELD}
                    placeholder={isUniversity ? 'No 10/04336/L/MINESUP/DDES/ESUP/SER of 03/08/2010' : school?.type === 'PRIMARY' ? 'No .../MINEDUB/SG/DEB of DD/MM/YYYY' : 'No .../MINESEC/DESG of DD/MM/YYYY'}
                    value={infoForm.authorizationNumber}
                    onChange={e => setInfoForm(f => ({ ...f, authorizationNumber: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('Shown on the Official report card header when enabled in the Report Card Designer')}</p>
                </div>
                {isUniversity && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('School Acronym')}</label>
                      <input
                        className={`${FIELD} font-mono uppercase`}
                        placeholder="e.g. CITECHITM"
                        value={infoForm.acronym}
                        onChange={e => setInfoForm(f => ({ ...f, acronym: e.target.value.toUpperCase() }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{t('Used in student matricule numbers')}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Current Batch / Intake No.')}</label>
                      <input
                        type="number" min={1}
                        className={FIELD}
                        placeholder="e.g. 16"
                        value={infoForm.batch}
                        onChange={e => setInfoForm(f => ({ ...f, batch: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{t('Leave blank if not applicable')}</p>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleSaveInfo}
                disabled={savingInfo || loadingInfo}
                className="mt-4 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
              >
                {savingInfo ? t('Saving…') : t('Save Info')}
              </button>
            </div>
          </section>

          {/* ══ Branding ═════════════════════════════════════════════════ */}
          <section id="branding" className="scroll-mt-8 space-y-4">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Branding')}</h4>

            {/* School Logo */}
            <div className={CARD}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="School logo" className="w-20 h-20 rounded-2xl object-cover border border-border" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center">
                      <span className="text-white font-black text-2xl">{initials}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{t('School Logo')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('Displayed on the dashboard and home screens. PNG, JPG, or WebP, max 5MB.')}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => logoRef.current?.click()}
                      disabled={uploadingLogo}
                      className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                    >
                      <Upload size={14} />
                      {uploadingLogo ? t('Uploading...') : logoUrl ? t('Change Logo') : t('Upload Logo')}
                    </button>
                    {logoUrl && (
                      <button
                        onClick={handleRemoveLogo}
                        className="flex items-center gap-2 border border-destructive/20 text-destructive px-3 py-1.5 rounded-lg text-sm hover:bg-destructive/10 transition"
                      >
                        <Trash2 size={14} /> {t('Remove')}
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logo', setUploadingLogo); e.target.value = '' }}
                  />
                </div>
              </div>
            </div>

            {/* Official Stamp / Seal — prints on OFFICIAL copies only, via the stamp
                section in Report Card Design. Not the logo: the logo is the letterhead
                mark on every copy, the stamp is what makes a copy official. */}
            <div className={CARD}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {stampUrl ? (
                    <img src={stampUrl} alt="Official stamp" className="w-20 h-20 rounded-2xl object-contain border border-border bg-white p-1" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl border border-dashed border-border flex items-center justify-center">
                      <Stamp size={22} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{t('Official Stamp / Seal')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('Prints on official copies only, never on student copies. Add a Stamp section in Report Card Design to place it. Leave this empty to stamp printed pages by hand. Use a PNG with a transparent background, max 5MB.')}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => stampRef.current?.click()}
                      disabled={uploadingStamp}
                      className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                    >
                      <Upload size={14} />
                      {uploadingStamp ? t('Uploading...') : stampUrl ? t('Change Stamp') : t('Upload Stamp')}
                    </button>
                    {stampUrl && (
                      <button
                        onClick={handleRemoveStamp}
                        className="flex items-center gap-2 border border-destructive/20 text-destructive px-3 py-1.5 rounded-lg text-sm hover:bg-destructive/10 transition"
                      >
                        <Trash2 size={14} /> {t('Remove')}
                      </button>
                    )}
                  </div>
                  <input
                    ref={stampRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'stamp', setUploadingStamp); e.target.value = '' }}
                  />
                </div>
              </div>
            </div>

            {/* Cover Images (slider) */}
            <div className={CARD}>
              <CardHead
                icon={Image}
                title={t('Dashboard Background Images')}
                desc={t('These images cycle automatically on the dashboard hero. Use wide landscape photos. PNG, JPG or WebP, max 5MB each.')}
                action={<span className="text-xs text-muted-foreground whitespace-nowrap">{coverImages.length} {coverImages.length !== 1 ? t('images') : t('image')} {t('· auto-slides')}</span>}
              />

              <div className="mt-5">
              {coverImages.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {coverImages.map((url, i) => (
                    <div key={i} className="relative group rounded-xl overflow-hidden border border-border h-28">
                      <img src={url} alt={`Cover ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <button
                          onClick={() => handleRemoveCoverImage(i)}
                          disabled={removingIdx === i}
                          className="bg-destructive/100 hover:bg-red-600 text-white rounded-lg px-2.5 py-1 text-xs font-medium flex items-center gap-1"
                        >
                          <Trash2 size={11} /> {removingIdx === i ? t('Removing…') : t('Remove')}
                        </button>
                      </div>
                      <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs rounded px-1.5 py-0.5">#{i + 1}</span>
                    </div>
                  ))}
                  {/* Add more slot */}
                  <button
                    onClick={() => coverRef.current?.click()}
                    disabled={uploadingCover}
                    className="h-28 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/40 hover:text-primary transition disabled:opacity-50"
                  >
                    <Plus size={20} />
                    <span className="text-xs font-medium">{uploadingCover ? t('Uploading…') : t('Add Image')}</span>
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-xl h-36 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Image size={32} className="opacity-40" />
                  <p className="text-sm">{t('No background images yet')}</p>
                  <button
                    onClick={() => coverRef.current?.click()}
                    disabled={uploadingCover}
                    className="mt-1 bg-primary hover:bg-[#d63429] text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition"
                  >
                    {uploadingCover ? t('Uploading…') : t('Upload First Image')}
                  </button>
                </div>
              )}
              </div>

              <input
                ref={coverRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddCoverImage(f); e.target.value = '' }}
              />
            </div>
          </section>

          {/* ══ Report Cards ═════════════════════════════════════════════ */}
          <section id="reportcards" className="scroll-mt-8 space-y-4">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Report Cards')}</h4>

            {/* Academic Decisions */}
            <div className={CARD}>
              <CardHead
                icon={GraduationCap}
                title={t('Academic Decisions (PASS / REPEAT)')}
                desc={isUniversity
                  ? t('Set the minimum CGPA a student needs to continue. When you end the academic year, PASS or REPEAT is written automatically on every report card based on each student\'s cumulative GPA.')
                  : t('Set the minimum annual average a student needs to pass. When you end the academic year, PASS or REPEAT is written automatically on every report card.')}
              />
              <div className="mt-5 flex items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {isUniversity ? t('Min CGPA to continue') : t('Min average to pass (0 – 20)')}
                  </label>
                  <input
                    type="number"
                    min={0} max={isUniversity ? 4 : 20} step={isUniversity ? 0.1 : 0.5}
                    placeholder={isUniversity ? 'e.g. 2.0' : 'e.g. 10'}
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    className={FIELD}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {thresholdValue !== ''
                      ? isUniversity
                        ? `Students with CGPA below ${thresholdValue} will be marked REPEAT.`
                        : `Students averaging below ${thresholdValue} will be marked REPEAT.`
                      : t('Leave blank to disable auto-decisions.')}
                  </p>
                </div>
                <button
                  onClick={handleSaveThreshold}
                  disabled={savingThreshold}
                  className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                >
                  {savingThreshold ? t('Saving…') : t('Save')}
                </button>
              </div>
            </div>

            {/* Who enters marks. University only: some universities record marks centrally
                so the person who teaches a course never enters its marks. Saving is
                refused by the API too, not just hidden here. */}
            {isUniversity && (
              <div className={CARD}>
                <CardHead
                  icon={UserCircle}
                  title={t('Who enters marks')}
                  desc={t('Some universities record all marks centrally, so that the person who teaches a course is never the person who enters its marks. Teachers can still open the marks sheet and check their subject, they just cannot change it.')}
                />
                <div className="mt-5 space-y-3">
                  {([
                    { value: 'TEACHERS' as const, label: t('Teachers'), hint: t('Teachers enter marks for the subjects they teach. Administrators can enter marks too.') },
                    { value: 'ADMIN_ONLY' as const, label: t('Administration only'), hint: t('Only administrators enter marks (CA, Exam and Resit). Teachers see the marks sheet read-only. You can still grant one teacher access to one class when you need to.') },
                  ]).map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${marksMode === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                      <input type="radio" name="marksEntryMode" value={opt.value}
                        checked={marksMode === opt.value}
                        // Cap reached: the unselected option is disabled rather than
                        // failing on click, and the note below says who to contact. The
                        // API refuses regardless; this just stops the doomed attempt.
                        disabled={savingMarksMode || (marksSwitches?.allowed === false && marksMode !== opt.value)}
                        onChange={() => handleMarksModeChange(opt.value)}
                        className="accent-primary mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
                      </span>
                    </label>
                  ))}

                  {/* The cap, stated before it bites: 2 switches per semester, then the
                      provider. Between academic years there is no semester and no cap. */}
                  {marksSwitches && marksSwitches.termId && (
                    <p className={`text-xs ${marksSwitches.allowed ? 'text-muted-foreground' : 'text-destructive font-medium'}`}>
                      {marksSwitches.allowed
                        ? `${t('Switches used this semester:')} ${marksSwitches.used} ${t('of')} ${marksSwitches.limit}`
                        : t('You have used both switches for this semester. Contact your provider to change who enters marks.')}
                    </p>
                  )}

                  {/* Every switch, newest first, with who and when. A change here can be
                      seen but never made quietly. */}
                  {marksHistory.length > 0 && (
                    <div className="border-t border-border pt-3 mt-1 space-y-1">
                      {marksHistory.map(h => (
                        <p key={h.id} className="text-xs text-muted-foreground">
                          {t('Set to')}{' '}
                          <span className="font-medium text-foreground">{h.mode === 'ADMIN_ONLY' ? t('Administration only') : t('Teachers')}</span>{' '}
                          {t('by')} {h.changedByName}{h.byProvider ? ` (${t('provider')})` : ''}{' '}
                          · {new Date(h.changedAt).toLocaleDateString()} {new Date(h.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Grading Scale */}
            <div className={CARD}>
              <CardHead
                icon={Star}
                title={t('Grading Scale')}
                desc={t('Define your own grade ranges (A+, A, B…) with custom score thresholds, remarks, and colors. Grades are calculated automatically.')}
                action={
                  <button
                    onClick={() => router.push('/grading-scale')}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t('Configure')} <ArrowRight size={14} />
                  </button>
                }
              />
            </div>

            {/* Report Card Design */}
            <div className={CARD}>
              <CardHead
                icon={Palette}
                title={t('Report Card Design')}
                desc={t('Choose a template and customize colors, columns, signatures, and layout for your printed report cards.')}
                action={
                  <button
                    onClick={() => router.push('/report-card-design')}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t('Customize')} <ArrowRight size={14} />
                  </button>
                }
              />
            </div>

            {/* Official Header Letterhead Text */}
            <div className={CARD}>
              <CardHead
                icon={Type}
                title={t('Official Header Letterhead Text')}
                desc={t('Used by the "Official" header style in Report Card Design (left and right text blocks around the logo). Set once here in English and French — the report card automatically shows the version matching your school\'s language, always sized and aligned consistently.')}
              />
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Left Block — English')}</label>
                    <textarea
                      className={`${FIELD} font-mono`} rows={5}
                      placeholder={officialExamples.leftEn}
                      value={officialTextForm.leftEn}
                      onChange={e => setOfficialTextForm(f => ({ ...f, leftEn: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Left Block — French')}</label>
                    <textarea
                      className={`${FIELD} font-mono`} rows={5}
                      placeholder={officialExamples.leftFr}
                      value={officialTextForm.leftFr}
                      onChange={e => setOfficialTextForm(f => ({ ...f, leftFr: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Right Block — English')}</label>
                    <textarea
                      className={`${FIELD} font-mono`} rows={5}
                      placeholder={officialExamples.rightEn}
                      value={officialTextForm.rightEn}
                      onChange={e => setOfficialTextForm(f => ({ ...f, rightEn: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('Right Block — French')}</label>
                    <textarea
                      className={`${FIELD} font-mono`} rows={5}
                      placeholder={officialExamples.rightFr}
                      value={officialTextForm.rightFr}
                      onChange={e => setOfficialTextForm(f => ({ ...f, rightFr: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {t('One line per row. An ALL-CAPS line with multiple words is sized to reach the edge automatically; a short ALL-CAPS word (like an acronym) and mottos stay a fixed size; leave a blank line for a small gap between groups.')}
              </p>
              <button
                onClick={handleSaveOfficialText}
                disabled={savingOfficialText || loadingInfo}
                className="mt-4 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
              >
                {savingOfficialText ? t('Saving…') : t('Save Header Text')}
              </button>
            </div>

            {/* Excel Transcript Templates — university only */}
            {isUniversity && (
              <div className={`relative ${CARD}`}>
                <div className="absolute inset-0 rounded-xl bg-card/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                  <span className="bg-muted border border-border text-muted-foreground text-xs font-semibold px-4 py-1.5 rounded-full">Coming soon</span>
                </div>
                <div className="opacity-40 pointer-events-none">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet size={17} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('Excel Transcript Templates')}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t('Upload your school\'s existing Excel transcript design. The system fills in grades, GPA, CGPA, and remarks automatically using placeholder tags.')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadExampleTemplateApi().catch(() => showToast(t('Download failed'), 'error'))}
                    className="flex items-center gap-1.5 text-xs border border-border text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition flex-shrink-0 ml-4"
                  >
                    <Download size={13} /> {t('Example template')}
                  </button>
                </div>

                {/* Counter */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">
                    {excelTemplates.length} / {excelMax} {t('templates used')}
                  </span>
                  {excelTemplates.length < excelMax && (
                    <button
                      onClick={() => setShowUploadForm(v => !v)}
                      className="flex items-center gap-1.5 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-[#d63429] transition"
                    >
                      <Plus size={13} /> {t('Add Template')}
                    </button>
                  )}
                  {excelTemplates.length >= excelMax && (
                    <span className="text-xs text-destructive font-medium">
                      {t('Limit reached — delete a template to add another')}
                    </span>
                  )}
                </div>

                {/* Upload form */}
                {showUploadForm && (
                  <div className="border border-border rounded-xl p-4 mb-4 bg-muted/30">
                    <p className="text-xs font-medium text-foreground mb-3">{t('New template')}</p>
                    <div className="flex flex-col gap-2">
                      <input
                        type="text" value={excelName} onChange={e => setExcelName(e.target.value)}
                        placeholder={t('Template name (e.g. HND Level 1 Transcript)')}
                        className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground w-full"
                      />
                      {classLevels.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">{t('Assign to class levels (optional):')}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {classLevels.map(cl => (
                              <button key={cl} onClick={() => setExcelLevels(prev => prev.includes(cl) ? prev.filter(x => x !== cl) : [...prev, cl])}
                                className={`text-xs px-2.5 py-1 rounded-full border transition ${excelLevels.includes(cl) ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                                {cl}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => excelFileRef.current?.click()}
                          disabled={uploadingExcel}
                          className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#d63429] disabled:opacity-50 transition"
                        >
                          <Upload size={13} /> {uploadingExcel ? t('Uploading…') : t('Choose .xlsx file')}
                        </button>
                        <button onClick={() => setShowUploadForm(false)} className="text-sm text-muted-foreground px-3 py-1.5 hover:text-foreground transition">
                          {t('Cancel')}
                        </button>
                      </div>
                      <input ref={excelFileRef} type="file" accept=".xlsx" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelUpload(f) }} />
                    </div>
                  </div>
                )}

                {/* Template list */}
                {excelTemplates.length === 0 && !showUploadForm && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('No templates yet. Download the example above to get started.')}
                  </p>
                )}
                {excelTemplates.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {excelTemplates.map(tpl => (
                      <div key={tpl.id} className="border border-border rounded-xl p-3 flex items-start gap-3">
                        <FileSpreadsheet size={16} className="text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {editingId === tpl.id ? (
                            <div className="flex flex-col gap-2">
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground w-full" />
                              {classLevels.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {classLevels.map(cl => (
                                    <button key={cl} onClick={() => setEditLevels(prev => prev.includes(cl) ? prev.filter(x => x !== cl) : [...prev, cl])}
                                      className={`text-xs px-2.5 py-1 rounded-full border transition ${editLevels.includes(cl) ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                                      {cl}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => saveEdit(tpl.id)} className="flex items-center gap-1 text-xs bg-primary text-white px-2.5 py-1 rounded hover:bg-[#d63429] transition">
                                  <Check size={12} /> {t('Save')}
                                </button>
                                <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1">
                                  {t('Cancel')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                              {tpl.classLevels.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tpl.classLevels.map(cl => (
                                    <span key={cl} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{cl}</span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground mt-0.5">{t('No class levels assigned')}</p>
                              )}
                            </>
                          )}
                        </div>
                        {editingId !== tpl.id && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => previewExcelTemplateApi(tpl.id, tpl.name).catch(() => showToast(t('Preview failed'), 'error'))}
                              className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                              title={t('Download preview with sample data')}>
                              <Download size={14} />
                            </button>
                            <button onClick={() => { setEditingId(tpl.id); setEditName(tpl.name); setEditLevels(tpl.classLevels) }}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(tpl.id)} disabled={deletingId === tpl.id}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition disabled:opacity-40">
                              {deletingId === tpl.id ? <X size={14} /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </div>
            )}
          </section>

          {/* ══ Data & Backup (offline installs only) ════════════════════ */}
          {isOfflineInstall && (
            <section id="data" className="scroll-mt-8 space-y-4">
              <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Data & Backup')}</h4>

              <div className={CARD}>
                <CardHead
                  icon={DatabaseBackup}
                  title={t('Backup Your Data')}
                  desc={t('Download everything — students, marks, report cards, uploaded images — as one file. Keep it somewhere safe (a USB drive, cloud storage) in case this computer is ever lost or damaged.')}
                  action={
                    <button
                      onClick={handleBackup}
                      disabled={backingUp}
                      className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                    >
                      {backingUp ? t('Preparing…') : t('Download Backup')}
                    </button>
                  }
                />
              </div>
            </section>
          )}

        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      <ConfirmModal
        isOpen={confirmAdminOnly}
        title={t('Switch to Administration only?')}
        message={t('Teachers will lose the ability to enter marks, even for the subjects they teach. This uses one of your switches for the semester.')}
        confirmLabel={t('Switch')}
        confirmColor="red"
        onConfirm={() => { setConfirmAdminOnly(false); handleSaveMarksMode('ADMIN_ONLY') }}
        onCancel={() => setConfirmAdminOnly(false)}
      />
    </div>
    </DesktopOnly>
  )
}
