'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  sub?: string
  /** Shown greyed out and unclickable — e.g. a course already taken by
   *  another teacher at the currently picked time — so picking it is caught
   *  right here instead of only after a submit attempt. */
  disabled?: boolean
}

interface CustomSelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  className?: string
  disabled?: boolean
  compact?: boolean
}

// Rough height of the panel (search bar + a few rows) used to decide whether
// it should drop down or flip upward — doesn't need to be exact, just enough
// to tell whether the space below the trigger can actually fit it.
const PANEL_ESTIMATE = 280

export default function CustomSelect({
  options, value, onChange, placeholder = 'Select…',
  searchable = true, className = '', disabled = false, compact = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; direction: 'down' | 'up' } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)
  const filtered = search
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.sub?.toLowerCase().includes(search.toLowerCase())
      )
    : options

  // Rendered through a portal into <body> with fixed coordinates computed
  // from the trigger's own position — this is what lets the panel escape a
  // scrollable modal instead of being clipped by its overflow, and lets it
  // flip above the trigger when there isn't room below.
  const openDropdown = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const direction: 'down' | 'up' = spaceBelow < PANEL_ESTIMATE && spaceAbove > spaceBelow ? 'up' : 'down'
      setPos({
        left: rect.left,
        width: rect.width,
        top: direction === 'down' ? rect.bottom + 6 : rect.top - 6,
        direction,
      })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
      setSearch('')
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSearch('') }
    }
    // Any scroll behind the panel (e.g. a scrollable modal) invalidates the
    // computed position — closing is simpler and safer than tracking it live.
    const handleScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && (open ? setOpen(false) : openDropdown())}
        className={`w-full flex items-center justify-between gap-1.5 bg-card border transition focus:outline-none
          ${compact ? 'rounded-md px-2 py-1 text-xs' : 'rounded-xl px-3 py-2.5 text-sm'}
          ${disabled ? 'opacity-50 cursor-not-allowed border-border' : 'border-border hover:border-muted-foreground/40 focus:ring-2 focus:ring-ring cursor-pointer'}
          ${open ? 'border-primary/40 ring-2 ring-primary/10' : ''}`}
      >
        <span className={selected ? 'text-foreground font-medium truncate' : 'text-muted-foreground truncate'}>
          {selected ? (
            <span className="flex items-center gap-2">
              <span>{selected.label}</span>
              {selected.sub && <span className="text-xs text-muted-foreground font-normal">{selected.sub}</span>}
            </span>
          ) : placeholder}
        </span>
        <ChevronDown size={15} className={`text-muted-foreground flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            ...(pos.direction === 'down' ? { top: pos.top } : { bottom: window.innerHeight - pos.top }),
          }}
          className="z-[100] bg-card border border-border rounded-xl shadow-xl overflow-hidden"
        >
          {searchable && options.length > 4 && (
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                <Search size={13} className="text-muted-foreground flex-shrink-0" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-5">No results found</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => { if (opt.disabled) return; onChange(opt.value); setOpen(false); setSearch('') }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition
                    ${opt.disabled ? 'opacity-50 cursor-not-allowed' : opt.value === value ? 'bg-primary/10' : 'hover:bg-muted'}`}
                >
                  <div>
                    <p className={`text-sm font-medium leading-tight ${opt.disabled ? 'text-muted-foreground' : opt.value === value ? 'text-primary' : 'text-foreground'}`}>
                      {opt.label}
                    </p>
                    {opt.sub && <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>}
                  </div>
                  {opt.value === value && !opt.disabled && <Check size={14} className="text-primary flex-shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
