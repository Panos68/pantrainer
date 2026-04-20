import { readAppState, writeAppState } from './data'
import type { AppState } from './schema'

export async function getGymWeek(): Promise<'week_a' | 'week_b' | 'legs_week'> {
  const state = await readAppState()
  return state.gymWeek
}

export async function advanceGymWeek(): Promise<void> {
  const state = await readAppState()
  if (state.gymWeek === 'week_a') {
    state.gymWeek = 'week_b'
  } else if (state.gymWeek === 'week_b') {
    state.gymWeek = 'week_a'
  } else if (state.gymWeek === 'legs_week') {
    state.gymWeek = 'week_b'
  }
  await writeAppState(state)
}

export async function getDeloadCounter(): Promise<number> {
  const state = await readAppState()
  return state.deloadCounter
}

export async function incrementDeloadCounter(): Promise<void> {
  const state = await readAppState()
  if (state.deloadCounter < 5) {
    state.deloadCounter += 1
  }
  await writeAppState(state)
}

export async function resetDeloadCounter(): Promise<void> {
  const state = await readAppState()
  state.deloadCounter = 1
  await writeAppState(state)
}

export async function flagDeloadWeek(): Promise<void> {
  const state = await readAppState()
  state.isDeloadWeek = true
  await writeAppState(state)
}

export async function unflagDeloadWeek(): Promise<void> {
  const state = await readAppState()
  state.isDeloadWeek = false
  await writeAppState(state)
}

export async function getAppState(): Promise<AppState> {
  return readAppState()
}

export async function updateAppState(updates: Partial<AppState>): Promise<void> {
  const state = await readAppState()
  const updated = { ...state, ...updates }
  await writeAppState(updated)
}
