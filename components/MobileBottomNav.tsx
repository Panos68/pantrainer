'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/export', label: 'Plan', icon: '🧠' },
  { href: '/progress', label: 'Progress', icon: '📈' },
]

export default function MobileBottomNav() {
  const pathname = usePathname()

  if (pathname === '/login' || pathname === '/setup') return null

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="grid grid-cols-3 gap-1 px-2 py-2">
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
