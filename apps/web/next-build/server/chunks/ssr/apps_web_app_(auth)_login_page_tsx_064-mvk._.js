module.exports=[59747,a=>{"use strict";var b=a.i(87924),c=a.i(72131),d=a.i(64080),e=a.i(12537),f=a.i(65485),g=a.i(61688);function h({className:a}){return(0,b.jsxs)("svg",{viewBox:"0 0 560 440",fill:"none",className:a,"aria-hidden":"true",children:[(0,b.jsx)("style",{children:`
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
      `}),(0,b.jsxs)("g",{className:"ai-scene",stroke:"currentColor",strokeWidth:"2.5",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,b.jsx)("path",{d:"M40 400 H545",strokeWidth:"2",opacity:"0.5"}),(0,b.jsx)("rect",{x:"70",y:"40",width:"220",height:"160",rx:"6",strokeWidth:"3",fill:"currentColor",fillOpacity:"0.06"}),(0,b.jsx)("path",{d:"M96 208 H264",strokeWidth:"4",opacity:"0.7"}),(0,b.jsxs)("g",{className:"ai-fade",children:[(0,b.jsx)("text",{className:"ai-chalkA",x:"98",y:"112",fill:"currentColor",stroke:"none",fontSize:"38",fontWeight:"700",fontFamily:"inherit",children:"A+"}),(0,b.jsx)("path",{className:"ai-draw ai-line1",pathLength:1,d:"M178 80 h84",opacity:"0.45",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-draw ai-line2",pathLength:1,d:"M178 102 h64",opacity:"0.45",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-draw ai-line3",pathLength:1,d:"M178 124 h76",opacity:"0.45",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-draw ai-tick",pathLength:1,d:"M186 158 l9 9 l16 -19",stroke:"#F03E2F",strokeWidth:"3.5"}),(0,b.jsxs)("g",{className:"ai-chip",children:[(0,b.jsx)("rect",{x:"360",y:"138",width:"58",height:"26",rx:"8",fill:"currentColor",fillOpacity:"0.05",strokeWidth:"2"}),(0,b.jsx)("text",{x:"389",y:"156",fill:"#F03E2F",stroke:"none",fontSize:"13",fontWeight:"700",fontFamily:"inherit",textAnchor:"middle",children:"18/20"})]})]}),(0,b.jsx)("rect",{x:"368",y:"90",width:"144",height:"5",rx:"2",fill:"currentColor",fillOpacity:"0.15"}),(0,b.jsx)("rect",{x:"376",y:"50",width:"14",height:"40",rx:"2"}),(0,b.jsx)("rect",{x:"394",y:"58",width:"12",height:"32",rx:"2",fill:"#F03E2F",fillOpacity:"0.85",stroke:"none"}),(0,b.jsx)("rect",{x:"410",y:"46",width:"15",height:"44",rx:"2",fill:"currentColor",fillOpacity:"0.12"}),(0,b.jsx)("rect",{x:"429",y:"56",width:"12",height:"34",rx:"2"}),(0,b.jsx)("path",{d:"M448 90 l6 -38 l13 2 l-6 38 z",fill:"currentColor",fillOpacity:"0.08"}),(0,b.jsx)("rect",{x:"472",y:"52",width:"14",height:"38",rx:"2",fill:"currentColor",fillOpacity:"0.12"}),(0,b.jsx)("g",{className:"ai-fade",children:(0,b.jsxs)("g",{className:"ai-student",children:[(0,b.jsxs)("g",{className:"ai-legs",children:[(0,b.jsx)("path",{className:"ai-legA",d:"M313 296 L304 394"}),(0,b.jsx)("path",{className:"ai-legB",d:"M329 296 L338 394"})]}),(0,b.jsxs)("g",{className:"ai-typing",children:[(0,b.jsx)("path",{d:"M268 296 Q270 242 320 240 Q370 242 372 296",fill:"currentColor",fillOpacity:"0.05"}),(0,b.jsx)("circle",{cx:"320",cy:"202",r:"24",fill:"currentColor",fillOpacity:"0.05"}),(0,b.jsx)("circle",{className:"ai-eye",cx:"312",cy:"204",r:"1.8",fill:"currentColor",stroke:"none"}),(0,b.jsx)("circle",{className:"ai-eye",cx:"328",cy:"204",r:"1.8",fill:"currentColor",stroke:"none"}),(0,b.jsx)("path",{d:"M313 212 q7 6 14 0",strokeWidth:"2"}),(0,b.jsx)("path",{d:"M286 182 L320 168 L354 182 L320 196 Z",fill:"#F03E2F",stroke:"#F03E2F",strokeWidth:"2"}),(0,b.jsx)("path",{d:"M354 184 v14",stroke:"#F03E2F",strokeWidth:"2"}),(0,b.jsx)("circle",{cx:"354",cy:"201",r:"2.5",fill:"#F03E2F",stroke:"none"})]})]})}),(0,b.jsx)("rect",{x:"150",y:"296",width:"330",height:"10",rx:"3",fill:"currentColor",fillOpacity:"0.08",strokeWidth:"3"}),(0,b.jsx)("path",{d:"M172 306 V392",strokeWidth:"3"}),(0,b.jsx)("path",{d:"M458 306 V392",strokeWidth:"3"}),(0,b.jsx)("rect",{x:"275",y:"240",width:"90",height:"58",rx:"6",fill:"currentColor",fillOpacity:"0.07",strokeWidth:"3"}),(0,b.jsx)("path",{d:"M302 269 l18 -8 l18 8 l-18 8 z",fill:"#F03E2F",stroke:"none"}),(0,b.jsxs)("g",{className:"ai-keys",children:[(0,b.jsx)("path",{className:"ai-key",d:"M296 234 v-5",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-key ai-key2",d:"M318 229 v-5",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-key ai-key3",d:"M340 234 v-5",strokeWidth:"2"})]}),(0,b.jsx)("rect",{x:"184",y:"280",width:"64",height:"7",rx:"2"}),(0,b.jsx)("rect",{x:"190",y:"271",width:"54",height:"7",rx:"2",opacity:"0.7"}),(0,b.jsx)("rect",{x:"388",y:"270",width:"24",height:"26",rx:"3"}),(0,b.jsx)("path",{d:"M394 270 l-4 -16",strokeWidth:"2"}),(0,b.jsx)("path",{d:"M401 270 v-19",strokeWidth:"2"}),(0,b.jsx)("path",{d:"M407 270 l5 -14",stroke:"#F03E2F",strokeWidth:"2"}),(0,b.jsx)("circle",{cx:"440",cy:"285",r:"11",fill:"#F03E2F",fillOpacity:"0.9",stroke:"none"}),(0,b.jsx)("path",{d:"M440 274 q0 -7 6 -9",strokeWidth:"2"}),(0,b.jsx)("path",{d:"M92 350 V302",strokeWidth:"2.5"}),(0,b.jsx)("path",{d:"M92 332 Q67 324 59 298",strokeWidth:"2.5"}),(0,b.jsx)("path",{d:"M59 298 q14 -4 16 12 q-12 4 -16 -12 z",fill:"currentColor",fillOpacity:"0.12"}),(0,b.jsx)("path",{d:"M92 320 Q117 312 125 288",strokeWidth:"2.5"}),(0,b.jsx)("path",{d:"M125 288 q-14 -4 -16 12 q12 4 16 -12 z",fill:"currentColor",fillOpacity:"0.12"}),(0,b.jsx)("path",{d:"M92 302 q-2 -14 8 -22 q6 10 -8 22 z",fill:"currentColor",fillOpacity:"0.12"}),(0,b.jsx)("rect",{x:"71",y:"350",width:"42",height:"9",rx:"3"}),(0,b.jsx)("path",{d:"M75 359 l5 32 h24 l5 -32"}),(0,b.jsx)("g",{className:"ai-fade",children:(0,b.jsx)("g",{className:"ai-cat",children:(0,b.jsxs)("g",{className:"ai-cat-body",children:[(0,b.jsxs)("g",{className:"ai-cat-legs",strokeWidth:"4",children:[(0,b.jsx)("path",{className:"ai-catLegA",d:"M504 396 V406"}),(0,b.jsx)("path",{className:"ai-catLegB",d:"M511 396 V406"}),(0,b.jsx)("path",{className:"ai-catLegA",d:"M520 396 V406"}),(0,b.jsx)("path",{className:"ai-catLegB",d:"M527 396 V406"})]}),(0,b.jsx)("path",{d:"M500 400 Q500 366 514 361 Q528 366 528 400 Z",fill:"currentColor",stroke:"none"}),(0,b.jsx)("circle",{cx:"514",cy:"352",r:"10.5",fill:"currentColor",stroke:"none"}),(0,b.jsx)("path",{className:"ai-ear",d:"M507 345 l-4 -9 l8 4 z",fill:"currentColor",stroke:"none"}),(0,b.jsx)("path",{d:"M521 345 l4 -9 l-8 4 z",fill:"currentColor",stroke:"none"}),(0,b.jsx)("g",{className:"ai-tail",children:(0,b.jsx)("path",{d:"M500 396 q-20 8 -24 -12",strokeWidth:"5"})})]})})}),(0,b.jsx)("path",{className:"ai-spark",d:"M338 56 v14 M331 63 h14",stroke:"#F03E2F",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-spark ai-spark2",d:"M56 244 v12 M50 250 h12",opacity:"0.5",strokeWidth:"2"}),(0,b.jsx)("path",{className:"ai-spark ai-spark3",d:"M524 180 v10 M519 185 h10",opacity:"0.5",strokeWidth:"2"})]})]})}var i=a.i(55681),j=a.i(77064);let k=(0,a.i(64831).default)("circle-alert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);var l=a.i(9646);let m="",n="";a.s(["default",0,function(){let[a,o]=(0,c.useState)(m),[p,q]=(0,c.useState)(n),[r,s]=(0,c.useState)(!1),[t,u]=(0,c.useState)(""),[v,w]=(0,c.useState)(0),[x,y]=(0,c.useState)(!1),z=(0,e.useAuthStore)(a=>a.setAuth),A=async()=>{if(!a.trim()||!p)return;u(""),y(!0);let b=Date.now();try{let b=await (0,d.loginApi)(a.trim(),p);z(b.user,b.school,b.token),m="",n="",window.location.href="/dashboard"}catch{let a=Date.now()-b;a<500&&await new Promise(b=>setTimeout(b,500-a)),u("Incorrect email or password. Please try again."),w(a=>a+1),y(!1)}};return(0,b.jsxs)("div",{className:"h-dvh relative overflow-hidden",children:[(0,b.jsx)(g.default,{}),(0,b.jsx)("div",{className:"absolute top-4 right-4 z-20",children:(0,b.jsx)(f.default,{})}),(0,b.jsx)("style",{children:`
        @keyframes shake {
          0%, 100% { transform: translateX(0);   }
          15%       { transform: translateX(-5px); }
          30%       { transform: translateX(5px);  }
          45%       { transform: translateX(-4px); }
          60%       { transform: translateX(4px);  }
          75%       { transform: translateX(-2px); }
          90%       { transform: translateX(2px);  }
        }
      `}),(0,b.jsxs)("div",{className:"relative z-10 h-full overflow-y-auto max-w-6xl mx-auto flex flex-col px-4 py-6 md:px-6",children:[(0,b.jsxs)("div",{className:"flex items-center gap-3",children:[(0,b.jsx)("div",{className:"w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-md",children:(0,b.jsx)(l.GraduationCap,{size:22,className:"text-white",strokeWidth:2.25})}),(0,b.jsxs)("div",{className:"leading-tight",children:[(0,b.jsx)("span",{className:"block font-extrabold text-2xl text-[#262016] dark:text-white tracking-tight",children:"Bulletin"}),(0,b.jsx)("span",{className:"block text-[10px] font-bold tracking-[0.16em] uppercase text-[#6f6553] dark:text-white/50",children:"School report cards"})]})]}),(0,b.jsxs)("div",{className:"flex-1 min-h-0 flex items-center justify-center gap-12 lg:gap-20 w-full",children:[(0,b.jsx)("div",{className:"hidden lg:flex flex-1 max-w-xl flex-col items-center justify-center",children:(0,b.jsx)(h,{className:"w-full h-auto text-[#33291b] dark:text-white/85"})}),(0,b.jsxs)("div",{className:"w-full max-w-sm",children:[(0,b.jsxs)("div",{className:"mb-7",children:[(0,b.jsx)("h1",{className:"text-2xl font-bold text-[#262016] dark:text-white tracking-tight",children:"Welcome back"}),(0,b.jsx)("p",{className:"text-[#5f5648] dark:text-white/60 mt-1.5 text-sm",children:"Sign in to your school account"})]}),(0,b.jsxs)("div",{className:"bg-card border border-border rounded-xl p-6 space-y-4",children:[(0,b.jsxs)("div",{children:[(0,b.jsx)("label",{className:"block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5",children:"Email"}),(0,b.jsx)("input",{type:"email",value:a,onChange:a=>{var b;m=b=a.target.value,o(b),t&&u("")},onKeyDown:a=>"Enter"===a.key&&document.getElementById("pw-input")?.focus(),className:"w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow",placeholder:"you@school.com",autoComplete:"username"})]}),(0,b.jsxs)("div",{children:[(0,b.jsx)("label",{className:"block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5",children:"Password"}),(0,b.jsxs)("div",{className:"relative",children:[(0,b.jsx)("input",{id:"pw-input",type:r?"text":"password",value:p,onChange:a=>{var b;n=b=a.target.value,q(b),t&&u("")},onKeyDown:a=>"Enter"===a.key&&!x&&A(),className:"w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow",placeholder:"••••••••",autoComplete:"current-password"}),(0,b.jsx)("button",{type:"button",tabIndex:-1,onClick:()=>s(a=>!a),className:"absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors",children:r?(0,b.jsx)(j.EyeOff,{size:16}):(0,b.jsx)(i.Eye,{size:16})})]})]}),t&&(0,b.jsxs)("div",{className:"flex items-start gap-2.5 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm",style:{animation:"shake 0.5s ease-out"},children:[(0,b.jsx)(k,{size:15,className:"flex-shrink-0 mt-0.5"}),t]},v),(0,b.jsx)("button",{type:"button",onClick:A,disabled:x||!a.trim()||!p,className:"w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d63429] disabled:opacity-50 transition-colors",children:x?(0,b.jsxs)("span",{className:"flex items-center justify-center gap-2",children:[(0,b.jsxs)("svg",{className:"animate-spin h-4 w-4",viewBox:"0 0 24 24",fill:"none",children:[(0,b.jsx)("circle",{className:"opacity-25",cx:"12",cy:"12",r:"10",stroke:"currentColor",strokeWidth:"4"}),(0,b.jsx)("path",{className:"opacity-75",fill:"currentColor",d:"M4 12a8 8 0 018-8v8z"})]}),"Signing in…"]}):"Sign in"})]}),(0,b.jsx)("p",{className:"mt-5 text-center text-sm text-[#6f6553] dark:text-white/50",children:"Contact your administrator to get access."})]})]})]})]})}],59747)}];

//# sourceMappingURL=apps_web_app_%28auth%29_login_page_tsx_064-mvk._.js.map