'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { Upload, Trash2, Image, Building2, Plus, Star, Palette, ArrowRight, DatabaseBackup, FileSpreadsheet, Download, Pencil, X, Check } from 'lucide-react'
import api from '@/lib/api/client'
import { saveBlob } from '@/lib/csv'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import DesktopOnly from '@/components/ui/DesktopOnly'
import { useT } from '@/lib/i18n'
import {
  ExcelTemplate,
  listExcelTemplatesApi, uploadExcelTemplateApi,
  updateExcelTemplateApi, deleteExcelTemplateApi,
  previewExcelTemplateApi, downloadExampleTemplateApi,
} from '@/lib/api/excelTemplates'
import { getClassLevelsApi } from '@/lib/api/classLevels'

// Images are proxied through Next.js rewrites — use relative paths directly

export default function SettingsPage() {
  const router = useRouter()
  const { school, updateSchool } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const logoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [removingIdx, setRemovingIdx] = useState<number | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const isOfflineInstall = process.env.NEXT_PUBLIC_OFFLINE_BUILD === '1'
  const isUniversity = school?.type === 'UNIVERSITY'

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

  const handleUpload = async (file: File, field: 'logo' | 'cover', setLoading: (v: boolean) => void) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append(field, file)
      const res = await api.post(`/school/${field}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      updateSchool(res.data.school)
      showToast(field === 'logo' ? t('Logo updated successfully') : t('Cover image updated successfully'))
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

  const handleRemoveLogo = async () => {
    try {
      await api.delete('/school/logo')
      updateSchool({ ...school!, logo: null })
      showToast(t('Logo removed'))
    } catch { showToast(t('Failed to remove logo'), 'error') }
  }

  const [infoForm, setInfoForm] = useState({ name: school?.name ?? '', acronym: (school as any)?.acronym ?? '', batch: (school as any)?.batch ?? '' })
  const [savingInfo, setSavingInfo] = useState(false)

  const handleSaveInfo = async () => {
    setSavingInfo(true)
    try {
      const res = await api.put('/school/settings', { name: infoForm.name.trim(), acronym: infoForm.acronym.trim(), batch: infoForm.batch === '' ? null : Number(infoForm.batch) })
      updateSchool(res.data.school)
      showToast(t('School info saved'))
    } catch { showToast(t('Failed to save'), 'error') }
    finally { setSavingInfo(false) }
  }

  const logoUrl = school?.logo ?? null
  const coverImages: string[] = (school as any)?.coverImages ?? []

  const initials = school?.name?.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() ?? 'SC'

  return (
    <DesktopOnly>
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('School Settings')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('Customize your school\'s appearance on the platform')}</p>
      </div>

      {/* School Info */}
      <div className="bg-card rounded-xl border border-border p-6 mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
          <Building2 size={16} /> {t('School Information')}
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('School Name')}</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={infoForm.name}
              onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          {isUniversity && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('School Acronym')}</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono uppercase"
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
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
          disabled={savingInfo}
          className="mt-4 bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
        >
          {savingInfo ? t('Saving…') : t('Save Info')}
        </button>
      </div>

      {/* School Logo */}
      <div className="bg-card rounded-xl border border-border p-6 mb-4">
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
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Building2 size={16} /> {t('School Logo')}
            </h3>
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

      {/* Cover Images (slider) */}
      <div className="bg-card rounded-xl border border-border p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Image size={16} /> {t('Dashboard Background Images')}
          </h3>
          <span className="text-xs text-muted-foreground">{coverImages.length} {coverImages.length !== 1 ? t('images') : t('image')} {t('· auto-slides')}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t('These images cycle automatically on the dashboard hero. Use wide landscape photos. PNG, JPG or WebP, max 5MB each.')}
        </p>

        {coverImages.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
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
          <div className="border-2 border-dashed border-border rounded-xl h-36 flex flex-col items-center justify-center gap-2 mb-4 text-muted-foreground">
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

        <input
          ref={coverRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddCoverImage(f); e.target.value = '' }}
        />
      </div>

      {/* Grading Scale */}
      <div className="bg-card rounded-xl border border-border p-6 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Star size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{t('Grading Scale')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('Define your own grade ranges (A+, A, B…) with custom score thresholds, remarks, and colors. Grades are calculated automatically.')}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/grading-scale')}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ml-4"
          >
            {t('Configure')} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Report Card Design */}
      <div className="bg-card rounded-xl border border-border p-6 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Palette size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{t('Report Card Design')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('Choose a template and customize colors, columns, signatures, and layout for your printed report cards.')}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/report-card-design')}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ml-4"
          >
            {t('Customize')} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Excel Transcript Templates — university only */}
      {isUniversity && (
        <div className="bg-card rounded-xl border border-border p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{t('Excel Transcript Templates')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
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
      )}

      {/* Backup (offline installs only — a full database dump only makes
          sense when this machine holds just one school's data) */}
      {isOfflineInstall && (
        <div className="bg-card rounded-xl border border-border p-6 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <DatabaseBackup size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{t('Backup Your Data')}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('Download everything — students, marks, report cards, uploaded images — as one file. Keep it somewhere safe (a USB drive, cloud storage) in case this computer is ever lost or damaged.')}
                </p>
              </div>
            </div>
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition flex-shrink-0 ml-4"
            >
              {backingUp ? t('Preparing…') : t('Download Backup')}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
    </DesktopOnly>
  )
}
