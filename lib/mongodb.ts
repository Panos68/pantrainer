import { MongoClient } from 'mongodb'

// Reuse client across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined
}

let client: MongoClient | undefined

// Created lazily so importing a module that *can* touch the DB doesn't require
// MONGODB_URI (unit tests, build steps); the error surfaces on first real use.
function getClient(): MongoClient {
  if (client) return client
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  if (process.env.NODE_ENV === 'development') {
    global._mongoClient ??= new MongoClient(uri)
    client = global._mongoClient
  } else {
    client = new MongoClient(uri)
  }
  return client
}

export async function getDb() {
  const c = getClient()
  await c.connect()
  return c.db('pantrainer')
}
