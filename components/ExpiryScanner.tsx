'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [message, setMessage] = useState('Frame the printed best-before or use-by date, then tap Read date')
  const [reading, setReading] = useState(false)
  const Detector = getDetectorCtor()

  useEffect(() => {
    if (!Detector) return
    let cancelled = false
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
      })
      .catch(() => setMessage('Could not access the camera. Check the site permission.'))

    return () => { cancelled = true; stop() }
  }, [Detector])

  const readDate = useCallback(async () => {
    const video = videoRef.current
    if (!Detector || !video || video.readyState < video.HAVE_ENOUGH_DATA) return
    setReading(true)
    setMessage('Reading date locally...')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      const text = (await new Detector().detect(canvas)).map((result) => result.rawValue).join('\n')
      const date = extractExpiryDate(text)
      if (date) onDetected(date)
      else setMessage('No date found. Move closer, avoid glare, and try again.')
    } catch {
      setMessage('Could not read that frame. Try again with the date in focus.')
    } finally {
      setReading(false)
    }
  }, [Detector, onDetected])

  if (!Detector) {
    return <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"><p className="max-w-sm text-center text-zinc-300 text-sm font-mono">This browser does not support local text detection yet. Use the date field or a quick expiry option instead.</p><button onClick={onClose} className="mt-5 rounded border border-zinc-700 px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-400">Back</button></div>
  }

  return <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"><video ref={videoRef} playsInline muted className="w-full max-w-md rounded-lg border border-zinc-700" /><p className="mt-3 max-w-xs text-center text-zinc-400 text-xs font-mono">{message}</p><button onClick={() => void readDate()} disabled={reading} className="mt-4 rounded bg-lime-400 px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-950 disabled:opacity-50">{reading ? 'Reading...' : 'Read date'}</button><button onClick={onClose} className="mt-3 rounded border border-zinc-700 px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-400">Cancel</button></div>
}
