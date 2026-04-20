'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function AutoAuth() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/login') return
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: token }),
    }).then((res) => {
      if (res.ok) {
        router.refresh()
      } else {
        localStorage.removeItem('auth_token')
      }
    })
  }, [pathname, router])

  return null
}
