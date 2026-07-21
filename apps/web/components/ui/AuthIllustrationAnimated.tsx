import { memo } from 'react'

/** Animated version of AuthIllustration (which stays available as the static
 *  fallback — swap the import in login/page.tsx to revert).
 *
 *  One 15s master cycle, looping forever. Every scene beat is a percentage of
 *  that cycle so the whole thing restarts in sync (1% = 0.15s):
 *
 *    0.0–3.0s  cat trots in from the left on little legs, sits by the desk
 *    0.3–2.9s  student walks in from the right, sits behind the laptop
 *    3.3–5.3s  chalkboard writes itself: A+, note lines, red tick, 18/20 chip
 *    5.3–13.5s idle: typing bob, key clicks, tail swish, blinks, ear twitch
 *   13.5–14.6s the actors and chalk dissolve softly — the room itself stays
 *              put — and the loop restarts
 *
 *  Pure CSS/SVG — no video, theme-aware via currentColor. Reduced-motion
 *  users get the finished static scene.
 *
 *  Memoized: `className` is a static string literal at the login page's call
 *  site, so without this every keystroke in the email/password fields (which
 *  re-renders the whole login page) was rebuilding this ~100-node SVG plus its
 *  embedded animation stylesheet from scratch — real, visible jank on mobile
 *  while typing, for zero visual benefit since nothing here ever changes. */
function AuthIllustrationAnimated({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 440" fill="none" className={className} aria-hidden="true">
      <style>{`
        /* ── Master cycle: only the actors and chalk dissolve at the end
           of each 15s loop; the room itself never fades ─────────────── */
        .ai-fade { animation: ai-fade 15s ease-in-out infinite; }
        @keyframes ai-fade {
          0%, 90%     { opacity: 1; }
          97%, 100%   { opacity: 0; }
        }

        /* ── Student: walks in from the right, sits ────────────────── */
        .ai-student { animation: ai-walk 15s ease-in-out infinite; }
        @keyframes ai-walk {
          0%, 1.7% { transform: translate(300px, -4px); }
          3.8%     { transform: translate(258px, -9px); }
          5.9%     { transform: translate(216px, -4px); }
          8.1%     { transform: translate(168px, -9px); }
          10.2%    { transform: translate(120px, -4px); }
          12.3%    { transform: translate(66px, -9px); }
          14.4%    { transform: translate(14px, -5px); }
          15.9%    { transform: translate(0, -12px); }  /* arrives, standing */
          17.6%    { transform: translate(0, 3px); }    /* sits down */
          19.4%, 100% { transform: translate(0, 0); }
        }

        /* Walking legs — scissor while entering, fade on sit-down
           (the seated figure tucks them behind the desk, like the static art) */
        .ai-legA, .ai-legB { transform-box: fill-box; transform-origin: top center; }
        .ai-legA { animation: ai-stepA 15s ease-in-out infinite; }
        .ai-legB { animation: ai-stepB 15s ease-in-out infinite; }
        @keyframes ai-stepA {
          0%, 19%, 100% { transform: rotate(0); }
          3%  { transform: rotate(18deg); }  5%  { transform: rotate(-16deg); }
          7%  { transform: rotate(18deg); }  9%  { transform: rotate(-16deg); }
          11% { transform: rotate(18deg); }  13% { transform: rotate(-16deg); }
          15% { transform: rotate(13deg); }  17% { transform: rotate(-7deg); }
        }
        @keyframes ai-stepB {
          0%, 19%, 100% { transform: rotate(0); }
          3%  { transform: rotate(-16deg); } 5%  { transform: rotate(18deg); }
          7%  { transform: rotate(-16deg); } 9%  { transform: rotate(18deg); }
          11% { transform: rotate(-16deg); } 13% { transform: rotate(18deg); }
          15% { transform: rotate(-7deg); }  17% { transform: rotate(13deg); }
        }
        .ai-legs { animation: ai-legs-gate 15s linear infinite; }
        @keyframes ai-legs-gate { 0%, 18% { opacity: 1; } 20%, 100% { opacity: 0; } }

        /* Occasional blink */
        .ai-eye { transform-box: fill-box; transform-origin: center; animation: ai-blink 4.6s ease-in-out infinite; }
        @keyframes ai-blink { 0%, 90%, 100% { transform: scaleY(1); } 94% { transform: scaleY(.08); } }

        /* ── Cat: trots in from off-screen left on little legs ─────── */
        .ai-cat { animation: ai-cat-walk 15s ease-in-out infinite; }
        @keyframes ai-cat-walk {
          0%    { transform: translate(-560px, -6px); }
          2%    { transform: translate(-490px, -11px); }
          4%    { transform: translate(-420px, -6px); }
          6%    { transform: translate(-350px, -11px); }
          8%    { transform: translate(-280px, -6px); }
          10%   { transform: translate(-210px, -11px); }
          12%   { transform: translate(-140px, -6px); }
          14%   { transform: translate(-70px, -10px); }
          16%   { transform: translate(-20px, -6px); }
          18%   { transform: translate(0, -6px); }
          20%, 100% { transform: translate(0, 0); }  /* settles down, legs tuck */
        }
        .ai-cat-body { transform-box: fill-box; transform-origin: 50% 95%; animation: ai-waddle 15s ease-in-out infinite; }
        @keyframes ai-waddle {
          0%, 19%, 100% { transform: rotate(0); }
          3%  { transform: rotate(4deg); }  5%  { transform: rotate(-4deg); }
          7%  { transform: rotate(4deg); }  9%  { transform: rotate(-4deg); }
          11% { transform: rotate(4deg); }  13% { transform: rotate(-4deg); }
          15% { transform: rotate(4deg); }  17% { transform: rotate(-3deg); }
        }
        .ai-catLegA, .ai-catLegB { transform-box: fill-box; transform-origin: top center; }
        .ai-catLegA { animation: ai-trotA 15s ease-in-out infinite; }
        .ai-catLegB { animation: ai-trotB 15s ease-in-out infinite; }
        @keyframes ai-trotA {
          0%, 18%, 100% { transform: rotate(0); }
          2%  { transform: rotate(22deg); }  4%  { transform: rotate(-20deg); }
          6%  { transform: rotate(22deg); }  8%  { transform: rotate(-20deg); }
          10% { transform: rotate(22deg); }  12% { transform: rotate(-20deg); }
          14% { transform: rotate(16deg); }  16% { transform: rotate(-8deg); }
        }
        @keyframes ai-trotB {
          0%, 18%, 100% { transform: rotate(0); }
          2%  { transform: rotate(-20deg); } 4%  { transform: rotate(22deg); }
          6%  { transform: rotate(-20deg); } 8%  { transform: rotate(22deg); }
          10% { transform: rotate(-20deg); } 12% { transform: rotate(22deg); }
          14% { transform: rotate(-8deg); }  16% { transform: rotate(16deg); }
        }
        .ai-cat-legs { animation: ai-legs-gate 15s linear infinite; }

        /* Idle: tail swish always, ear twitch now and then */
        .ai-tail {
          transform-box: fill-box; transform-origin: 100% 85%;
          animation: ai-tail 1.6s ease-in-out infinite;
        }
        @keyframes ai-tail { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(16deg); } }
        .ai-ear { transform-box: fill-box; transform-origin: bottom center; animation: ai-ear 6s ease-in-out infinite; }
        @keyframes ai-ear { 0%, 88%, 96%, 100% { transform: rotate(0); } 92% { transform: rotate(-16deg); } }

        /* ── Typing (gated so it only shows once the student sits) ─── */
        .ai-typing { animation: ai-type .5s ease-in-out infinite; }
        @keyframes ai-type { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(1.5px); } }
        .ai-keys { animation: ai-keys-gate 15s linear infinite; }
        @keyframes ai-keys-gate { 0%, 22% { opacity: 0; } 23%, 90% { opacity: 1; } 97%, 100% { opacity: 0; } }
        .ai-key  { opacity: 0; animation: ai-key .9s linear infinite; }
        .ai-key2 { animation-delay: .3s; }
        .ai-key3 { animation-delay: .6s; }
        @keyframes ai-key { 0%, 60%, 100% { opacity: 0; } 20%, 40% { opacity: .7; } }
        .ai-spark  { animation: ai-twinkle 2.6s ease-in-out infinite; }
        .ai-spark2 { animation-delay: .9s; }
        .ai-spark3 { animation-delay: 1.7s; }
        @keyframes ai-twinkle { 0%, 100% { opacity: .25; } 50% { opacity: .9; } }

        /* ── Chalkboard writes itself once the student sits ────────── */
        .ai-line1 { animation: ai-draw1 15s linear infinite; }
        .ai-line2 { animation: ai-draw2 15s linear infinite; }
        .ai-line3 { animation: ai-draw3 15s linear infinite; }
        .ai-tick  { animation: ai-draw4 15s linear infinite; }
        @keyframes ai-draw1 {
          0%, 23%     { stroke-dashoffset: 1; opacity: 0; }
          23.4%       { opacity: 1; }
          26%, 100%   { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes ai-draw2 {
          0%, 25%     { stroke-dashoffset: 1; opacity: 0; }
          25.4%       { opacity: 1; }
          28%, 100%   { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes ai-draw3 {
          0%, 27%     { stroke-dashoffset: 1; opacity: 0; }
          27.4%       { opacity: 1; }
          30%, 100%   { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes ai-draw4 {
          0%, 31%     { stroke-dashoffset: 1; opacity: 0; }
          31.4%       { opacity: 1; }
          33.5%, 100% { stroke-dashoffset: 0; opacity: 1; }
        }
        .ai-draw { stroke-dasharray: 1; }
        .ai-chalkA { animation: ai-chalk 15s linear infinite; }
        @keyframes ai-chalk { 0%, 22% { opacity: 0; } 24.5%, 100% { opacity: 1; } }
        .ai-chip {
          transform-box: fill-box; transform-origin: center;
          animation: ai-pop 15s cubic-bezier(.34,1.56,.64,1) infinite;
        }
        @keyframes ai-pop {
          0%, 33%     { opacity: 0; transform: scale(.3); }
          35.5%, 100% { opacity: 1; transform: scale(1); }
        }

        /* Reduced motion → the finished scene, no movement */
        @media (prefers-reduced-motion: reduce) {
          .ai-scene, .ai-scene * { animation: none !important; }
          .ai-scene .ai-draw { stroke-dasharray: none !important; stroke-dashoffset: 0 !important; }
          .ai-scene .ai-key, .ai-scene .ai-legs, .ai-scene .ai-cat-legs { opacity: 0 !important; }
        }
      `}</style>

      <g className="ai-scene" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">

        {/* Floor */}
        <path d="M40 400 H545" strokeWidth="2" opacity="0.5" />

        {/* Chalkboard */}
        <rect x="70" y="40" width="220" height="160" rx="6" strokeWidth="3" fill="currentColor" fillOpacity="0.06" />
        <path d="M96 208 H264" strokeWidth="4" opacity="0.7" />
        {/* chalk writing — draws on after the student sits, dissolves at loop end */}
        <g className="ai-fade">
        <text className="ai-chalkA" x="98" y="112" fill="currentColor" stroke="none" fontSize="38" fontWeight="700" fontFamily="inherit">A+</text>
        <path className="ai-draw ai-line1" pathLength={1} d="M178 80 h84" opacity="0.45" strokeWidth="2" />
        <path className="ai-draw ai-line2" pathLength={1} d="M178 102 h64" opacity="0.45" strokeWidth="2" />
        <path className="ai-draw ai-line3" pathLength={1} d="M178 124 h76" opacity="0.45" strokeWidth="2" />
        <path className="ai-draw ai-tick" pathLength={1} d="M186 158 l9 9 l16 -19" stroke="#F03E2F" strokeWidth="3.5" />

        {/* Floating score chip — pops in last */}
        <g className="ai-chip">
          <rect x="360" y="138" width="58" height="26" rx="8" fill="currentColor" fillOpacity="0.05" strokeWidth="2" />
          <text x="389" y="156" fill="#F03E2F" stroke="none" fontSize="13" fontWeight="700" fontFamily="inherit" textAnchor="middle">18/20</text>
        </g>
        </g>

        {/* Bookshelf */}
        <rect x="368" y="90" width="144" height="5" rx="2" fill="currentColor" fillOpacity="0.15" />
        <rect x="376" y="50" width="14" height="40" rx="2" />
        <rect x="394" y="58" width="12" height="32" rx="2" fill="#F03E2F" fillOpacity="0.85" stroke="none" />
        <rect x="410" y="46" width="15" height="44" rx="2" fill="currentColor" fillOpacity="0.12" />
        <rect x="429" y="56" width="12" height="34" rx="2" />
        {/* leaning book */}
        <path d="M448 90 l6 -38 l13 2 l-6 38 z" fill="currentColor" fillOpacity="0.08" />
        <rect x="472" y="52" width="14" height="38" rx="2" fill="currentColor" fillOpacity="0.12" />

        {/* Student — walks in from the right, sits, then types.
            Drawn before the desk so the desk top covers the hips. */}
        <g className="ai-fade">
        <g className="ai-student">
          <g className="ai-legs">
            <path className="ai-legA" d="M313 296 L304 394" />
            <path className="ai-legB" d="M329 296 L338 394" />
          </g>
          <g className="ai-typing">
            <path d="M268 296 Q270 242 320 240 Q370 242 372 296" fill="currentColor" fillOpacity="0.05" />
            <circle cx="320" cy="202" r="24" fill="currentColor" fillOpacity="0.05" />
            {/* face */}
            <circle className="ai-eye" cx="312" cy="204" r="1.8" fill="currentColor" stroke="none" />
            <circle className="ai-eye" cx="328" cy="204" r="1.8" fill="currentColor" stroke="none" />
            <path d="M313 212 q7 6 14 0" strokeWidth="2" />
            {/* graduation cap */}
            <path d="M286 182 L320 168 L354 182 L320 196 Z" fill="#F03E2F" stroke="#F03E2F" strokeWidth="2" />
            <path d="M354 184 v14" stroke="#F03E2F" strokeWidth="2" />
            <circle cx="354" cy="201" r="2.5" fill="#F03E2F" stroke="none" />
          </g>
        </g>
        </g>

        {/* Desk */}
        <rect x="150" y="296" width="330" height="10" rx="3" fill="currentColor" fillOpacity="0.08" strokeWidth="3" />
        <path d="M172 306 V392" strokeWidth="3" />
        <path d="M458 306 V392" strokeWidth="3" />

        {/* Laptop (lid toward viewer, Bulletin cap on the lid) */}
        <rect x="275" y="240" width="90" height="58" rx="6" fill="currentColor" fillOpacity="0.07" strokeWidth="3" />
        <path d="M302 269 l18 -8 l18 8 l-18 8 z" fill="#F03E2F" stroke="none" />
        {/* key-click ticks while typing */}
        <g className="ai-keys">
          <path className="ai-key"  d="M296 234 v-5" strokeWidth="2" />
          <path className="ai-key ai-key2" d="M318 229 v-5" strokeWidth="2" />
          <path className="ai-key ai-key3" d="M340 234 v-5" strokeWidth="2" />
        </g>

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

        {/* Cat — trots in from off-screen left, sits by the desk.
            The whole group rides 6px high while walking so the legs show;
            it settles onto the floor as the legs tuck away. */}
        <g className="ai-fade">
        <g className="ai-cat">
          <g className="ai-cat-body">
            {/* trotting legs — drawn first so the body covers their tops */}
            <g className="ai-cat-legs" strokeWidth="4">
              <path className="ai-catLegA" d="M504 396 V406" />
              <path className="ai-catLegB" d="M511 396 V406" />
              <path className="ai-catLegA" d="M520 396 V406" />
              <path className="ai-catLegB" d="M527 396 V406" />
            </g>
            <path d="M500 400 Q500 366 514 361 Q528 366 528 400 Z" fill="currentColor" stroke="none" />
            <circle cx="514" cy="352" r="10.5" fill="currentColor" stroke="none" />
            <path className="ai-ear" d="M507 345 l-4 -9 l8 4 z" fill="currentColor" stroke="none" />
            <path d="M521 345 l4 -9 l-8 4 z" fill="currentColor" stroke="none" />
            <g className="ai-tail">
              <path d="M500 396 q-20 8 -24 -12" strokeWidth="5" />
            </g>
          </g>
        </g>
        </g>

        {/* Sparkles */}
        <path className="ai-spark" d="M338 56 v14 M331 63 h14" stroke="#F03E2F" strokeWidth="2" />
        <path className="ai-spark ai-spark2" d="M56 244 v12 M50 250 h12" opacity="0.5" strokeWidth="2" />
        <path className="ai-spark ai-spark3" d="M524 180 v10 M519 185 h10" opacity="0.5" strokeWidth="2" />
      </g>
    </svg>
  )
}

export default memo(AuthIllustrationAnimated)
