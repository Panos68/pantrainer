/**
 * Minimal Web Audio beep helper for timer cues. No external audio files.
 */
export function playBeep(freq: number, durationMs: number): void {
  if (typeof window === 'undefined') return
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextCtor) return

  const ctx = new AudioContextCtor()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.value = freq
  oscillator.connect(gain)
  gain.connect(ctx.destination)

  oscillator.start()
  oscillator.stop(ctx.currentTime + durationMs / 1000)

  oscillator.onended = () => {
    ctx.close().catch(() => {})
  }
}
