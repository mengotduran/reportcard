import { Text, TextInput } from 'react-native'
import { font } from './tokens'

// Apply the UI sans (IBM Plex Sans) as the app-wide default font, so every screen
// that hasn't yet been rebuilt to the design system still renders in the new
// typeface instead of the platform system font. Layout is untouched.
//
// Screens rebuilt to spec (home, login, nav) set their own font keys explicitly
// (serif for display, mono for data) and those win over this default. Existing
// `fontWeight` props are left in place — on iOS the weight is synthesized over the
// custom font, preserving the current bold hierarchy; per-screen font-role work
// (serif titles, mono labels) lands when each screen's mockup arrives.
function patch(Component: any) {
  const base = Component.defaultProps?.style
  Component.defaultProps = {
    ...(Component.defaultProps ?? {}),
    style: [{ fontFamily: font.sansRegular }, base].filter(Boolean),
  }
}

let applied = false
export function applyGlobalFont() {
  if (applied) return
  applied = true
  patch(Text)
  patch(TextInput)
}
