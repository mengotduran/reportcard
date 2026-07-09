'use client'
import { useRouter } from 'next/navigation'
import { ShieldX, GraduationCap } from 'lucide-react'
import ThemeToggle from '@/components/ui/ThemeToggle'
import AuthBackground from '@/components/ui/AuthBackground'

export default function RegisterPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-start justify-center p-4 relative overflow-hidden">
      <AuthBackground />
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center pt-[6vh] md:pt-[8vh]">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <div className="w-9 h-9 bg-primary rounded-[10px] flex items-center justify-center shadow-md">
            <GraduationCap size={20} className="text-white" strokeWidth={2.25} />
          </div>
          <div className="leading-tight text-left">
            <span className="block font-bold text-[17px] text-[#262016] dark:text-white tracking-tight">Bulletin</span>
            <span className="block text-[10px] font-semibold tracking-[0.14em] uppercase text-[#6f6553] dark:text-white/50">School report cards</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 space-y-4">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto">
            <ShieldX size={22} className="text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Registration Closed</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            School accounts are created by the system administrator.
            Contact your admin to get access.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d63429] transition-colors mt-2"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
