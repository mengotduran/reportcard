import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

/**
 * The login backdrop, matching the web's: scattered school icons at low opacity over
 * warm paper (light) or a navy chalkboard (dark) — but with the web's motion carried
 * over, so each icon drifts gently instead of sitting still.
 *
 * Built with core RN Animated only. The web's full animated illustration (the walking
 * student) is a 300-line SVG driven by CSS keyframes; porting it faithfully would need
 * react-native-svg and a rewrite of every keyframe, so the background takes the drift
 * instead — same mood, no new native dependency right before a store release.
 */

// name/top/left as fractions of the screen, mirroring the web's scatter.
const ICONS: { name: keyof typeof Ionicons.glyphMap; top: number; left: number; size: number; rotate: string }[] = [
  { name: 'school-outline',      top: 0.06, left: 0.08, size: 56, rotate: '-14deg' },
  { name: 'book-outline',        top: 0.12, left: 0.80, size: 46, rotate: '12deg' },
  { name: 'pencil-outline',      top: 0.24, left: 0.46, size: 38, rotate: '-8deg' },
  { name: 'calculator-outline',  top: 0.08, left: 0.60, size: 36, rotate: '6deg' },
  { name: 'globe-outline',       top: 0.60, left: 0.78, size: 52, rotate: '-10deg' },
  { name: 'flask-outline',       top: 0.50, left: 0.60, size: 40, rotate: '16deg' },
  { name: 'ribbon-outline',      top: 0.84, left: 0.52, size: 44, rotate: '-6deg' },
  { name: 'library-outline',     top: 0.32, left: 0.86, size: 42, rotate: '-18deg' },
  { name: 'create-outline',      top: 0.88, left: 0.82, size: 38, rotate: '14deg' },
  { name: 'reader-outline',      top: 0.46, left: 0.05, size: 36, rotate: '-12deg' },
  { name: 'telescope-outline',   top: 0.74, left: 0.10, size: 46, rotate: '8deg' },
  { name: 'musical-notes-outline', top: 0.18, left: 0.24, size: 34, rotate: '18deg' },
  { name: 'briefcase-outline',   top: 0.64, left: 0.42, size: 40, rotate: '-16deg' },
  { name: 'planet-outline',      top: 0.90, left: 0.22, size: 44, rotate: '8deg' },
]

function DriftingIcon({ name, top, left, size, rotate, dark, index }: (typeof ICONS)[number] & { dark: boolean; index: number }) {
  const drift = useRef(new Animated.Value(0)).current
  useEffect(() => {
    // Staggered periods so the field never moves in lockstep; the offset phase comes
    // free from each loop starting the moment its component mounts.
    const duration = 2800 + (index % 5) * 700
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [drift, index])

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8 - (index % 3) * 3] })
  const { width, height } = useWindowDimensions()
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: top * height,
        left: left * width,
        transform: [{ translateY }, { rotate }],
        opacity: dark ? 0.10 : 0.08,
      }}
    >
      <Ionicons name={name} size={size} color={dark ? '#cfe0f4' : '#8a7a5c'} />
    </Animated.View>
  )
}

export default function AuthBackground({ dark }: { dark: boolean }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#0f1a2b' : '#f3ecdf', overflow: 'hidden' }]}>
      {/* The web's red notebook margin line (light) / chalk rail (dark). */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 34, width: 1.5, backgroundColor: dark ? 'rgba(207,224,244,0.10)' : 'rgba(220,80,60,0.18)' }} />
      {ICONS.map((ic, i) => (
        <DriftingIcon key={ic.name + i} {...ic} dark={dark} index={i} />
      ))}
      {/* Light mode only: a faint dark wash over the whole backdrop, the web's "little
          dark transparent layer" — it takes the starkness off the paper and settles the
          icons behind the card. Dark mode is already deep enough. */}
      {!dark && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(38, 30, 18, 0.05)' }]} />}
    </View>
  )
}
