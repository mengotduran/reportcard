import { useEffect, useRef, useState } from 'react'
import { View, Image, StyleSheet, Animated, Dimensions } from 'react-native'

const { width } = Dimensions.get('window')

export default function AutoSlider({ images, style, interval = 6500 }: { images: string[]; style?: any; interval?: number }) {
  const [current, setCurrent] = useState(0)
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => {
        setCurrent(i => (i + 1) % images.length)
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }).start()
      })
    }, interval)
    return () => clearInterval(timer)
  }, [images.length, interval])

  if (!images.length) return null

  return (
    <Animated.View style={[style, { opacity }]}>
      <Image source={{ uri: images[current] }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      {images.length > 1 && (
        <View style={s.dots}>
          {images.map((_, i) => (
            <View key={i} style={[s.dot, i === current && s.dotActive]} />
          ))}
        </View>
      )}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  dots: { position: 'absolute', bottom: 6, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 12, backgroundColor: '#ffffff' },
})
