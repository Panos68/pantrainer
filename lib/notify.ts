/**
 * Foreground Notification API helpers for timer completion.
 * Not a PWA/service-worker solution — only works while the tab/window is open.
 */
export function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
}

/**
 * Shows a notification only when the tab is hidden — the beep already covers
 * the foreground case, so we avoid a redundant/annoying alert when visible.
 */
export function notifyTimerDone(title: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState !== 'hidden') return
  new Notification(title, { body: 'Timer complete', silent: false })
}
