// Construct a private blob URL directly from the token, avoiding head() advanced requests.
// Token format: vercel_blob_rw_<STORE_ID>_<SECRET>
export function blobUrl(pathname: string): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? ''
  const storeId = token.split('_')[3]
  return `https://${storeId}.blob.vercel-storage.com/${pathname}`
}
