import { getDb } from './mongodb'

// Registered passkeys (WebAuthn credentials) for the owner. The public key is
// not secret; the private key never leaves the device.
export interface PasskeyDoc {
  _id: string // credential ID, base64url
  publicKey: string // base64url COSE public key
  counter: number
  transports: string[]
  name: string
  createdAt: string
  lastUsedAt: string | null
}

async function passkeys() {
  return (await getDb()).collection<PasskeyDoc>('passkeys')
}

export async function listPasskeys(): Promise<PasskeyDoc[]> {
  return (await passkeys()).find({}).sort({ createdAt: -1 }).toArray()
}

export async function countPasskeys(): Promise<number> {
  return (await passkeys()).countDocuments()
}

export async function getPasskey(id: string): Promise<PasskeyDoc | null> {
  return (await passkeys()).findOne({ _id: id })
}

export async function addPasskey(doc: PasskeyDoc): Promise<void> {
  await (await passkeys()).insertOne(doc)
}

export async function markPasskeyUsed(id: string, counter: number): Promise<void> {
  await (await passkeys()).updateOne({ _id: id }, { $set: { counter, lastUsedAt: new Date().toISOString() } })
}

export async function deletePasskey(id: string): Promise<boolean> {
  const res = await (await passkeys()).deleteOne({ _id: id })
  return res.deletedCount === 1
}
