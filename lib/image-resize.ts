import sharp from 'sharp'

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 80

export async function resizeFoodPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
}
