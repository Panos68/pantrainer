'use client'

import { useEffect } from 'react'

// Keep the screen on during a live workout. Browsers drop the lock whenever
// the tab is hidden, so it's re-requested when the page becomes visible again.
// Silently does nothing where the Wake Lock API isn't available.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed) void lock.release()
        else sentinel = lock
      } catch {
        // Denied (battery saver, not visible) — nothing to do.
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release()
    }
  }, [active])
}
