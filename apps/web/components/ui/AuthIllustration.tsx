/** Hand-drawn school scene for the auth pages — a teacher at a desk in front of
 *  a chalkboard, bookshelf, plant and cat. Pure line-art in currentColor so it
 *  follows the theme (dark ink on paper / chalk on board), with a few
 *  brand-red accents. */
export default function AuthIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 440" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">

        {/* Floor */}
        <path d="M40 400 H545" strokeWidth="2" opacity="0.5" />

        {/* Chalkboard */}
        <rect x="70" y="40" width="220" height="160" rx="6" strokeWidth="3" fill="currentColor" fillOpacity="0.06" />
        <path d="M96 208 H264" strokeWidth="4" opacity="0.7" />
        {/* chalk writing */}
        <text x="98" y="112" fill="currentColor" stroke="none" fontSize="38" fontWeight="700" fontFamily="inherit">A+</text>
        <path d="M178 80 h84" opacity="0.45" strokeWidth="2" />
        <path d="M178 102 h64" opacity="0.45" strokeWidth="2" />
        <path d="M178 124 h76" opacity="0.45" strokeWidth="2" />
        {/* red chalk tick */}
        <path d="M186 158 l9 9 l16 -19" stroke="#F03E2F" strokeWidth="3.5" />

        {/* Floating score chip */}
        <rect x="360" y="138" width="58" height="26" rx="8" fill="currentColor" fillOpacity="0.05" strokeWidth="2" />
        <text x="389" y="156" fill="#F03E2F" stroke="none" fontSize="13" fontWeight="700" fontFamily="inherit" textAnchor="middle">18/20</text>

        {/* Bookshelf */}
        <rect x="368" y="90" width="144" height="5" rx="2" fill="currentColor" fillOpacity="0.15" />
        <rect x="376" y="50" width="14" height="40" rx="2" />
        <rect x="394" y="58" width="12" height="32" rx="2" fill="#F03E2F" fillOpacity="0.85" stroke="none" />
        <rect x="410" y="46" width="15" height="44" rx="2" fill="currentColor" fillOpacity="0.12" />
        <rect x="429" y="56" width="12" height="34" rx="2" />
        {/* leaning book */}
        <path d="M448 90 l6 -38 l13 2 l-6 38 z" fill="currentColor" fillOpacity="0.08" />
        <rect x="472" y="52" width="14" height="38" rx="2" fill="currentColor" fillOpacity="0.12" />

        {/* Desk */}
        <rect x="150" y="296" width="330" height="10" rx="3" fill="currentColor" fillOpacity="0.08" strokeWidth="3" />
        <path d="M172 306 V392" strokeWidth="3" />
        <path d="M458 306 V392" strokeWidth="3" />

        {/* Person — head, cap, body behind the laptop */}
        <path d="M268 296 Q270 242 320 240 Q370 242 372 296" fill="currentColor" fillOpacity="0.05" />
        <circle cx="320" cy="202" r="24" fill="currentColor" fillOpacity="0.05" />
        {/* face */}
        <circle cx="312" cy="204" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="328" cy="204" r="1.8" fill="currentColor" stroke="none" />
        <path d="M313 212 q7 6 14 0" strokeWidth="2" />
        {/* graduation cap */}
        <path d="M286 182 L320 168 L354 182 L320 196 Z" fill="#F03E2F" stroke="#F03E2F" strokeWidth="2" />
        <path d="M354 184 v14" stroke="#F03E2F" strokeWidth="2" />
        <circle cx="354" cy="201" r="2.5" fill="#F03E2F" stroke="none" />

        {/* Laptop (lid toward viewer, Bulletin cap on the lid) */}
        <rect x="275" y="240" width="90" height="58" rx="6" fill="currentColor" fillOpacity="0.07" strokeWidth="3" />
        <path d="M302 269 l18 -8 l18 8 l-18 8 z" fill="#F03E2F" stroke="none" />

        {/* Papers on the desk */}
        <rect x="184" y="280" width="64" height="7" rx="2" />
        <rect x="190" y="271" width="54" height="7" rx="2" opacity="0.7" />

        {/* Pencil cup */}
        <rect x="388" y="270" width="24" height="26" rx="3" />
        <path d="M394 270 l-4 -16" strokeWidth="2" />
        <path d="M401 270 v-19" strokeWidth="2" />
        <path d="M407 270 l5 -14" stroke="#F03E2F" strokeWidth="2" />

        {/* Apple */}
        <circle cx="440" cy="285" r="11" fill="#F03E2F" fillOpacity="0.9" stroke="none" />
        <path d="M440 274 q0 -7 6 -9" strokeWidth="2" />

        {/* Plant */}
        <path d="M92 350 V302" strokeWidth="2.5" />
        <path d="M92 332 Q67 324 59 298" strokeWidth="2.5" />
        <path d="M59 298 q14 -4 16 12 q-12 4 -16 -12 z" fill="currentColor" fillOpacity="0.12" />
        <path d="M92 320 Q117 312 125 288" strokeWidth="2.5" />
        <path d="M125 288 q-14 -4 -16 12 q12 4 16 -12 z" fill="currentColor" fillOpacity="0.12" />
        <path d="M92 302 q-2 -14 8 -22 q6 10 -8 22 z" fill="currentColor" fillOpacity="0.12" />
        <rect x="71" y="350" width="42" height="9" rx="3" />
        <path d="M75 359 l5 32 h24 l5 -32" />

        {/* Cat */}
        <path d="M500 400 Q500 366 514 361 Q528 366 528 400 Z" fill="currentColor" stroke="none" />
        <circle cx="514" cy="352" r="10.5" fill="currentColor" stroke="none" />
        <path d="M507 345 l-4 -9 l8 4 z" fill="currentColor" stroke="none" />
        <path d="M521 345 l4 -9 l-8 4 z" fill="currentColor" stroke="none" />
        <path d="M500 396 q-20 8 -24 -12" strokeWidth="5" />

        {/* Sparkles */}
        <path d="M338 56 v14 M331 63 h14" stroke="#F03E2F" strokeWidth="2" />
        <path d="M56 244 v12 M50 250 h12" opacity="0.5" strokeWidth="2" />
        <path d="M524 180 v10 M519 185 h10" opacity="0.5" strokeWidth="2" />
      </g>
    </svg>
  )
}
