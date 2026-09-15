import assert from 'node:assert/strict'
import sharp from 'sharp'
import { resizeFoodPhoto } from './image-resize'

async function run() {
  {
    // Oversized source image (3000x2000) should be downscaled to fit within
    // 1600x1600 and re-encoded as jpeg — the actual cost driver for Blob
    // storage/transfer is full-camera-resolution originals.
    const large = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer()

    const result = await resizeFoodPhoto(large)
    const meta = await sharp(result).metadata()

    assert.equal(meta.format, 'jpeg', 'output is re-encoded as jpeg')
    assert.ok(meta.width! <= 1600, `width ${meta.width} should be <= 1600`)
    assert.ok(meta.height! <= 1600, `height ${meta.height} should be <= 1600`)
    assert.ok(result.length < large.length, 'resized output is smaller than the original')
  }

  {
    // Already-small images should not be upscaled — a thumbnail-sized photo
    // stays roughly the same size, just re-encoded.
    const small = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer()

    const result = await resizeFoodPhoto(small)
    const meta = await sharp(result).metadata()

    assert.equal(meta.width, 400, 'small image is not upscaled')
    assert.equal(meta.height, 300, 'small image is not upscaled')
  }

  console.log('lib/image-resize.test.ts: all assertions passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
