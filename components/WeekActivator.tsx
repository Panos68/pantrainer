'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { activatePendingWeekAction } from '@/app/actions'

export default function WeekActivator() {
  const router = useRouter()

  useEffect(() => {
    activatePendingWeekAction().then(({ activated }) => {
      if (activated) router.refresh()
    })
  }, [router])

  return null
}
