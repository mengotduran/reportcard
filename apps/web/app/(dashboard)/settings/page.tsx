'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { Upload, Trash2, Image, Building2, Plus, Star, Palette, ArrowRight } from 'lucide-react'
import api from '@/lib/api/client'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import DesktopOnly from '@/components/ui/DesktopOnly'
import { useT } from '@/lib/i18n'

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

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
    </DesktopOnly>
  )
}
