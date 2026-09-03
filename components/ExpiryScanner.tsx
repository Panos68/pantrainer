'use client'

import { useEffect, useRef, useState } from 'react'
import { extractExpiryDate } from '@/lib/expiry-date'

interface TextDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

type TextDetectorCtor = new () => TextDetectorLike

function getDetectorCtor(): TextDetectorCtor | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { TextDetector?: TextDetectorCtor }).TextDetector ?? null
}

export function isTextDetectorAvailable(): boolean {
  return getDetectorCtor() !== null
}

export default function ExpiryScanner({ onDetected, onClose }: { onDetected: (date: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [message, setMessage] = useState('Point the camera at the printed best-before or use-by date')
  const Detector = getDetectorCtor()

  useEffect(() => {
    if (!Detector) return
    let cancelled = false
    let frame = 0
    const detector = new Detector()
    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const scan = async () => {
          if (cancelled) return
          if (video.readyState >= video.HAVE_ENOUGH_DATA) {
            try {
              const date = extractExpiryDate((await detector.detect(video)).map((result) => result.rawValue).join('\n'))
              if (date) {
                cancelled = true
                stop()
                onDetected(date)
                return
              }
            } catch {
              // A failed frame should not close a camera scan.
            }
          }
          frame = requestAnimationFrame(() => void scan())
        }
        void scan()
      })
      .catch(() => setMessage('Could not access the camera. Check the site permission.'))

    return () => { cancelled = true; cancelAnimationFrame(frame); stop() }
  }, [Detector, onDetected])

  return <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"><video ref={videoRef} playsInline muted className="w-full max-w-md rounded-lg border border-zinc-700" /><p className="mt-3 max-w-xs text-center text-zinc-400 text-xs font-mono">{message}</p><button onClick={onClose} className="mt-5 rounded border border-zinc-700 px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-400">Cancel</button></div>
}
