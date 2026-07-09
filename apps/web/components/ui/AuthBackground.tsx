import {
  GraduationCap, BookOpen, Pencil, Ruler, Calculator, Globe, School,
  FlaskConical, Award, Library, PenTool, Notebook, Microscope, Music,
  Backpack, Atom,
} from 'lucide-react'

// Scattered school icons — positioned across the screen, low opacity.
const ICONS = [
  { Icon: GraduationCap, top: '6%',  left: '8%',  size: 60, rotate: -14 },
  { Icon: BookOpen,      top: '12%', left: '82%', size: 50, rotate: 12 },
  { Icon: Pencil,        top: '24%', left: '46%', size: 40, rotate: -8 },
  { Icon: Ruler,         top: '38%', left: '14%', size: 52, rotate: 24 },
  { Icon: Calculator,    top: '8%',  left: '60%', size: 38, rotate: 6 },
  { Icon: Globe,         top: '60%', left: '80%', size: 56, rotate: -10 },
  { Icon: School,        top: '72%', left: '10%', size: 58, rotate: 8 },
  { Icon: FlaskConical,  top: '50%', left: '60%', size: 42, rotate: 16 },
  { Icon: Award,         top: '84%', left: '52%', size: 46, rotate: -6 },
  { Icon: Library,       top: '32%', left: '88%', size: 44, rotate: -18 },
  { Icon: PenTool,       top: '88%', left: '84%', size: 40, rotate: 14 },
  { Icon: Notebook,      top: '46%', left: '4%',  size: 38, rotate: -12 },
  { Icon: Microscope,    top: '76%', left: '36%', size: 44, rotate: 10 },
  { Icon: Music,         top: '18%', left: '24%', size: 36, rotate: 18 },
  { Icon: Backpack,      top: '62%', left: '44%', size: 42, rotate: -16 },
  { Icon: Atom,          top: '90%', left: '20%', size: 48, rotate: 8 },
]

// Both theme variants are always rendered and crossfaded with opacity, so
// toggling light/dark melts smoothly instead of snapping (display can't
// animate, opacity can). Layer order matters: washes sit above the icons.
const FADE_IN  = 'transition-opacity duration-500 ease-out opacity-100 dark:opacity-0'   // light-only layer
const FADE_OUT = 'transition-opacity duration-500 ease-out opacity-0 dark:opacity-100'   // dark-only layer

/** School-themed auth backdrop, theme-aware:
 *  light = warm ruled-notebook paper with a red margin line,
 *  dark  = deep-navy chalkboard with faint chalk lines. */
export default function AuthBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base — warm paper (light) / navy chalkboard (dark) */}
      <div className={`absolute inset-0 bg-gradient-to-br from-[#f8f3e9] via-[#f3ecdf] to-[#eae1cf] ${FADE_IN}`} />
      <div className={`absolute inset-0 bg-gradient-to-br from-[#14243a] via-[#0f1a2b] to-[#0a111d] ${FADE_OUT}`} />

      {/* Ruled notebook lines + red margin line — light */}
      <div
        className={`absolute inset-0 ${FADE_IN}`}
        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, rgba(96,140,190,0.18) 31px, rgba(96,140,190,0.18) 32px)' }}
      />
      <div className={`absolute inset-y-0 left-10 md:left-16 w-px bg-[#f03e2f]/30 ${FADE_IN}`} />

      {/* Faint chalk rules — dark */}
      <div
        className={`absolute inset-0 ${FADE_OUT}`}
        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, rgba(255,255,255,0.05) 31px, rgba(255,255,255,0.05) 32px)' }}
      />

      {/* Scattered school icons */}
      <div className="absolute inset-0">
        {ICONS.map(({ Icon, top, left, size, rotate }, i) => (
          <Icon
            key={i}
            size={size}
            className="absolute text-[#5a4a30]/[0.10] dark:text-white/[0.07] transition-colors duration-500"
            style={{ top, left, transform: `rotate(${rotate}deg)` }}
          />
        ))}
      </div>

      {/* Wash — a warm dark vignette dims the paper toward the edges (light);
          plain deep wash on the chalkboard (dark). Keeps the card readable. */}
      <div
        className={`absolute inset-0 ${FADE_IN}`}
        style={{ background: 'radial-gradient(120% 90% at 50% 38%, rgba(35,28,15,0.10) 0%, rgba(35,28,15,0.20) 55%, rgba(35,28,15,0.38) 100%)' }}
      />
      <div className={`absolute inset-0 bg-black/40 ${FADE_OUT}`} />
    </div>
  )
}
