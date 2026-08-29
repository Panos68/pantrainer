'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Uses the native BarcodeDetector API, which is available in Chrome on Android
// but not in Safari on iOS. The button is hidden entirely where it is missing
// rather than failing on tap — see isBarcodeDetectorAvailable below.

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}

export function isBarcodeDetectorAvailable(): boolean {
  return getDetectorCtor() !== null
}

// EAN-13 covers Swedish supermarket products; EAN-8 covers small packages.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Safe to read at render time: this overlay only ever mounts from a click, so
  // it is never server-rendered.
  const Detector = getDetectorCtor()
  const error = Detector === null
    ? 'Barcode scanning is not supported in this browser'
    : cameraError

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!Detector) return

    let cancelled = false
    let frame = 0
    const detector = new Detector({ formats: FORMATS })

    navigator.mediaDevices
      // Rear camera — a barcode is never scanned with the selfie cam.
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        return video.play()
      })
      .then(() => {
        const scan = async () => {
          if (cancelled) return
          const video = videoRef.current
          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
              const codes = await detector.detect(video)
              if (codes.length > 0 && !cancelled) {
                cancelled = true
                stop()
                onDetected(codes[0].rawValue)
                return
              }
            } catch {
              // A single failed frame is not fatal — keep scanning.
            }
          }
          frame = requestAnimationFrame(() => void scan())
        }
        void scan()
      })
      .catch(() => {
        if (!cancelled) setCameraError('Could not access the camera. Check the site permission.')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stop()
    }
  }, [onDetected, stop, Detector])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
      {error ? (
        <p className="text-red-400 text-xs font-mono text-center max-w-xs">{error}</p>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full max-w-md rounded-lg border border-zinc-700"
          />
          <p className="text-zinc-400 text-[10px] font-mono tracking-widest uppercase mt-3">
            Point at the barcode
          </p>
        </>
      )}
      <button
        onClick={() => {
          stop()
          onClose()
        }}
        className="mt-5 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-400 border border-zinc-700 rounded px-4 py-2 hover:text-zinc-200 transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}
