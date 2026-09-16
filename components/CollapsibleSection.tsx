'use client'

import { useState, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export default function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left group py-1"
        aria-expanded={open}
      >
        <h2 className="text-xs font-mono font-bold tracking-[0.3em] uppercase text-zinc-400 group-hover:text-zinc-200 transition-colors">
          {title}
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
        <span
          className={`text-zinc-500 group-hover:text-zinc-300 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open && <div className="mt-4 space-y-6">{children}</div>}
    </section>
  )
}
