'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyChildrenApi, ParentChild } from '@/lib/api/parent'
import { FileText, ChevronRight, Loader2, AlertCircle } from 'lucide-react'

export default function ParentHome() {
  const [children, setChildren] = useState<ParentChild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getMyChildrenApi()
      .then((r) => setChildren(r.children))
      .catch(() => setError('Could not load your children. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
        {children.length === 1 ? 'Your child' : 'Your children'}
      </h1>
      <p className="text-sm text-muted-foreground mb-5">
        Report cards the school has published, and what is left to pay.
      </p>

      {children.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No children are linked to this account yet. Ask the school to send you a link.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/child/${c.id}`}
              className="flex items-center gap-4 bg-card border border-border rounded-2xl p-4 hover:bg-hover transition">
              <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
                {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.className} · {c.school.name}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText size={12} />
                  {c.publishedCards === 0
                    ? 'No report card published yet'
                    : `${c.publishedCards} report card${c.publishedCards === 1 ? '' : 's'}`}
                </p>
                {!c.active && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 text-[10px] font-semibold">
                    {c.status === 'DISMISSED' ? 'Dismissed' : 'Not active'}
                  </span>
                )}
              </div>

              <ChevronRight size={18} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
