export const dynamic = 'force-static'

// Shown by the service worker when a page can't be reached at all.
export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-3">
        <p className="text-lime-400 text-xs font-mono font-bold tracking-[0.3em] uppercase">PanTrainer</p>
        <h1 className="text-2xl font-black uppercase">You&apos;re offline</h1>
        <p className="text-sm text-zinc-400">
          No connection right now. Sets you log in a live workout are kept on this device and sync automatically when
          you&apos;re back online.
        </p>
      </div>
    </main>
  )
}
