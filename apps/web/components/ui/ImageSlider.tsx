'use client'
import { useEffect, useState } from 'react'

interface ImageSliderProps {
  images: string[]
  interval?: number
  className?: string
  style?: React.CSSProperties
}

export default function ImageSlider({ images, interval = 4500, className = '', style }: ImageSliderProps) {
  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setCurrent(i => (i + 1) % images.length)
        setFading(false)
      }, 400)
    }, interval)
    return () => clearInterval(timer)
  }, [images.length, interval])

  if (!images.length) return null

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      <img
        key={current}
        src={images[current]}
        alt=""
        className="w-full h-full object-cover"
        style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.4s ease' }}
      />
      {images.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-white w-3' : 'bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
