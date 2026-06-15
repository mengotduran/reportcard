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

/** Branded, school-themed auth backdrop: dark gradient → faint school icons → black wash. */
export default function AuthBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#241019] via-[#141416] to-[#0a0a0b]" />

      {/* Scattered school icons */}
      <div className="absolute inset-0">
        {ICONS.map(({ Icon, top, left, size, rotate }, i) => (
          <Icon
            key={i}
            size={size}
            className="absolute text-white/[0.07]"
            style={{ top, left, transform: `rotate(${rotate}deg)` }}
          />
        ))}
      </div>

      {/* Black transparent layer */}
      <div className="absolute inset-0 bg-black/45" />
    </div>
  )
}
