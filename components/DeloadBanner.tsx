'use client'

interface DeloadBannerProps {
  counter: number
}

export default function DeloadBanner({ counter }: DeloadBannerProps) {
  if (counter < 4) return null

  async function handleFlag() {
    await fetch('/api/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDeloadWeek: true }),
    })
    // Reload page to reflect updated state
    window.location.reload()
  }

  if (counter === 4) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-400/10 border border-amber-400/30">
        <span className="text-amber-400 text-sm font-mono font-bold tracking-widest uppercase">
          ⚠ DELOAD DUE NEXT WEEK
        </span>
        <span className="text-amber-300/70 text-xs font-mono tracking-wide">
          — consider dropping to 2 HYROX classes
        </span>
      </div>
    )
  }

  // counter >= 5
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-400/10 border border-red-400/30">
      <div className="flex items-center gap-3">
        <span className="text-red-400 text-sm font-mono font-bold tracking-widest uppercase">
          ⚡ DELOAD REQUIRED NOW
        </span>
        <span className="text-red-300/70 text-xs font-mono tracking-wide">
          — {counter} weeks of high output
        </span>
      </div>
      <button
        onClick={handleFlag}
        className="shrink-0 px-4 py-1.5 bg-red-400 hover:bg-red-300 active:bg-red-500 text-zinc-950 text-xs font-black tracking-widest uppercase rounded-lg transition-colors"
      >
        Flag as Deload
      </button>
    </div>
  )
}
