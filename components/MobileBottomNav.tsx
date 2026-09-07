'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { AuthRole } from '@/lib/auth'

const ITEMS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/export', label: 'Plan', icon: '🧠' },
  { href: '/progress', label: 'Progress', icon: '📈' },
  { href: '/food', label: 'Food', icon: '🧺' },
]

interface MobileBottomNavProps {
  role: AuthRole | null
}

export default function MobileBottomNav({ role }: MobileBottomNavProps) {
  const pathname = usePathname()

  if (pathname === '/login' || pathname === '/setup') return null
  // The food-only role is deliberately locked to /food with no way to
  // navigate elsewhere. The owner role should always see the full nav,
  // including on /food, so they can get back to the rest of the app.
  const isFoodPath = pathname === '/food' || pathname.startsWith('/food/')
  if (isFoodPath && role !== 'owner') return null

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="grid grid-cols-4 gap-1 px-2 py-2">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'h-12 rounded-lg flex flex-col items-center justify-center transition-colors',
                active ? 'bg-zinc-800 text-lime-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900',
              )}
            >
              <span className="text-xs" aria-hidden="true">{item.icon}</span>
              <span className="text-[10px] font-mono tracking-widest uppercase">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
