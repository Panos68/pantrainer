import assert from 'node:assert/strict'
import { Jimp } from 'jimp'
import { resizeFoodPhoto } from './image-resize'

function noisyImage(width: number, height: number): InstanceType<typeof Jimp> {
  // Random per-pixel data defeats PNG's flat-color compression, so the
  // source buffer is actually large like a real photo — a solid color would
  // compress to near-nothing and make the size comparison meaningless.
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.floor(Math.random() * 256)
  return new Jimp({ data, width, height })
}

async function run() {
  {
    // Oversized source image (3000x2000) should be downscaled to fit within
    // 1600x1600 and re-encoded as jpeg — the actual cost driver for Blob
    // storage/transfer is full-camera-resolution originals.
    const large = noisyImage(3000, 2000)
    const largeBuffer = await large.getBuffer('image/png')

    const result = await resizeFoodPhoto(largeBuffer)
    const meta = await Jimp.read(result)

    assert.equal(meta.mime, 'image/jpeg', 'output is re-encoded as jpeg')
    assert.ok(meta.bitmap.width <= 1600, `width ${meta.bitmap.width} should be <= 1600`)
    assert.ok(meta.bitmap.height <= 1600, `height ${meta.bitmap.height} should be <= 1600`)
    assert.ok(result.length < largeBuffer.length, 'resized output is smaller than the original')
  }

  {
    // Already-small images should not be upscaled — a thumbnail-sized photo
    // stays roughly the same size, just re-encoded.
    const small = new Jimp({ width: 400, height: 300, color: 0x010203ff })
    const smallBuffer = await small.getBuffer('image/png')

    const result = await resizeFoodPhoto(smallBuffer)
    const meta = await Jimp.read(result)

    assert.equal(meta.bitmap.width, 400, 'small image is not upscaled')
    assert.equal(meta.bitmap.height, 300, 'small image is not upscaled')
  }

  console.log('lib/image-resize.test.ts: all assertions passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
