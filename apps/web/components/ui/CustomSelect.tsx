'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  sub?: string
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

export default function CustomSelect({
  options, value, onChange, placeholder = 'Select…',
  searchable = true, className = '', disabled = false, compact = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)
  const filtered = search
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.sub?.toLowerCase().includes(search.toLowerCase())
      )
    : options

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-1.5 bg-card border transition focus:outline-none
          ${compact ? 'rounded-md px-2 py-1 text-xs' : 'rounded-xl px-3 py-2.5 text-sm'}
          ${disabled ? 'opacity-50 cursor-not-allowed border-border' : 'border-border hover:border-muted-foreground/40 focus:ring-2 focus:ring-ring cursor-pointer'}
          ${open ? 'border-primary/40 ring-2 ring-primary/10' : ''}`}
      >
        <span className={selected ? 'text-foreground font-medium' : 'text-muted-foreground'}>
          {selected ? (
            <span className="flex items-center gap-2">
              <span>{selected.label}</span>
              {selected.sub && <span className="text-xs text-muted-foreground font-normal">{selected.sub}</span>}
            </span>
          ) : placeholder}
        </span>
        <ChevronDown size={15} className={`text-muted-foreground flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1.5 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {searchable && options.length > 4 && (
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                <Search size={13} className="text-muted-foreground flex-shrink-0" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder-gray-400"
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
                  onClick={() => { onChange(opt.value); setOpen(false); setSearch('') }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition
                    ${opt.value === value ? 'bg-primary/10' : 'hover:bg-muted'}`}
                >
                  <div>
                    <p className={`text-sm font-medium leading-tight ${opt.value === value ? 'text-primary' : 'text-foreground'}`}>
                      {opt.label}
                    </p>
                    {opt.sub && <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>}
                  </div>
                  {opt.value === value && <Check size={14} className="text-primary flex-shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
