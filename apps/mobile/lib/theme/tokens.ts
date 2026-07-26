// ─────────────────────────────────────────────────────────────────────────────
// Bulletin design tokens — original brand red, restored after a brass/brown trial
// didn't land well. Structure kept (same key names) so the rebuilt screens
// (login, teacher home, tab bar) that read colors.brassFill/brassInk/onBrass etc
// don't need to change — only the values they point at do.
//
// Every colour, size and radius in the app reads from here. No inline hex
// anywhere else. Both themes share the same key names, so no component ever
// branches on the current mode — it reads `colors.*` from useTheme().
// ─────────────────────────────────────────────────────────────────────────────

export type Theme = {
  bg: string
  surface: string
  line: string
  hairline: string
  brassFill: string
  brassInk: string
  brassLift: string
  brassEdge: string
  onBrass: string
  text: string
  textDim: string
  textFaint: string
  textOff: string
  danger: string
}

const dark: Theme = {
  bg: '#101112',
  surface: '#161618',
  line: '#27272a',
  hairline: '#1f1f22',
  brassFill: '#F03E2F',
  brassInk: '#F03E2F',
  brassLift: '#ff6b5c',
  brassEdge: '#3a2320',
  onBrass: '#ffffff',
  text: '#ffffff',
  textDim: '#a1a1aa',
  textFaint: '#71717a',
  textOff: '#52525b',
  danger: '#ef4444',
}

const light: Theme = {
  bg: '#e2e2e2',
  surface: '#e8e8e8',
  line: '#bebebe',
  hairline: '#d5d5d5',
  brassFill: '#F03E2F',
  brassInk: '#F03E2F',
  brassLift: '#ff6b5c',
  brassEdge: '#d5d5d5',
  onBrass: '#ffffff',
  text: '#09090b',
  textDim: '#71717a',
  textFaint: '#a1a1aa',
  textOff: '#a1a1aa',
  danger: '#ef4444',
}

export const themes = { dark, light } as const

// ── Fonts ────────────────────────────────────────────────────────────────────
// Three families, three jobs. Do not use a family outside its job.
//   Blinker         display        → names, section headings, course/session titles
//   IBM Plex Sans   UI sans        → body copy, button labels, conversational text
//   IBM Plex Mono   data + labels  → dates, times, codes, lowercase letterspaced micro labels
//
// On React Native you set weight by picking the font key, NOT by fontWeight.
// Setting fontWeight on a custom font does nothing or triggers a fake bold.
// Always pick the right key and leave fontWeight unset.
// Blinker has no 500-weight cut, so displayMedium uses 600SemiBold instead.
export const font = {
  displayRegular: 'Blinker_400Regular',
  displayMedium: 'Blinker_600SemiBold',
  sansRegular: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const

// ── Type scale ───────────────────────────────────────────────────────────────
// Typography only (family / size / line-height / letter-spacing). Colour is NOT
// baked in here — it comes from the active theme, so a style survives both modes:
//   <Text style={[type.greetingName, { color: colors.text }]}>
export const type = {
  greetingName: { fontFamily: font.displayRegular, fontSize: 27, lineHeight: 34 },
  sectionTitle: { fontFamily: font.displayRegular, fontSize: 18 },
  schoolName: { fontFamily: font.displayRegular, fontSize: 17, lineHeight: 21 },
  itemTitle: { fontFamily: font.displayRegular, fontSize: 15 },
  body: { fontFamily: font.sansRegular, fontSize: 14 },
  bodySmall: { fontFamily: font.sansRegular, fontSize: 13 },
  buttonLabel: { fontFamily: font.sansMedium, fontSize: 15 },
  dataLarge: { fontFamily: font.monoRegular, fontSize: 15 },
  dataMedium: { fontFamily: font.monoRegular, fontSize: 13 },
  microLabel: { fontFamily: font.monoRegular, fontSize: 11, letterSpacing: 0.9 },
  microAccent: { fontFamily: font.monoRegular, fontSize: 11, letterSpacing: 1.2 },
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24 } as const
export const radius = { control: 8, card: 12, chip: 6, phone: 28 } as const
export const hairlineWidth = 0.5 as const
