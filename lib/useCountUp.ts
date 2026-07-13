'use client'

import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

export function useCountUp(target: number, duration = 1): number {
  const [value, setValue] = useState(0)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(target)
      return
    }
    const controls = animate(0, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    })
    return () => controls.stop()
  }, [target, duration, prefersReducedMotion])

  return value
}
