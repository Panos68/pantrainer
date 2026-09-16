import { Jimp } from 'jimp'

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 80

// Pure-JS decode/resize/encode — no native binary, unlike sharp/libvips. That
// binary was tracing ~16MB into the food-photos function's deployed bundle
// for a resize step that runs a handful of times a day; Jimp applies EXIF
// orientation on read the same way sharp's .rotate() did, so no behavior loss.
export async function resizeFoodPhoto(input: Buffer): Promise<Buffer> {
  const image = await Jimp.read(input)
  const { width, height } = image.bitmap
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  if (scale < 1) {
    image.resize({ w: Math.round(width * scale), h: Math.round(height * scale) })
  }
  return image.getBuffer('image/jpeg', { quality: JPEG_QUALITY })
}
