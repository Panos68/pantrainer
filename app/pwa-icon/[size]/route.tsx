import { ImageResponse } from 'next/og'

const SIZES = new Set([192, 512])

// Home-screen icons for the web app manifest. `maskable` purpose needs the
// mark inside the central safe zone, hence the generous padding.
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size)
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 })
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          color: '#a3e635',
          fontSize: size * 0.34,
          fontWeight: 900,
          letterSpacing: -size * 0.01,
        }}
      >
        PT
      </div>
    ),
    { width: size, height: size },
  )
}
