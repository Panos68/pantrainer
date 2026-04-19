import { readAppState, writeAppState } from './data'
import type { AppState } from './schema'

// Get current gym week
export function getGymWeek(): 'week_a' | 'week_b' | 'legs_week' {
  const state = readAppState()
  return state.gymWeek
}

// Advance gym week: week_a → week_b → week_a (legs_week reverts to previous after 1 week)
export function advanceGymWeek(): void {
  const state = readAppState()

  if (state.gymWeek === 'week_a') {
    state.gymWeek = 'week_b'
  } else if (state.gymWeek === 'week_b') {
    state.gymWeek = 'week_a'
  } else if (state.gymWeek === 'legs_week') {
    // legs_week is a one-off override — revert to week_b as safe default
    state.gymWeek = 'week_b'
  }

  writeAppState(state)
}

// Get deload counter (1–5)
export function getDeloadCounter(): number {
  const state = readAppState()
  return state.deloadCounter
}

// Increment deload counter (max 5)
export function incrementDeloadCounter(): void {
  const state = readAppState()

  if (state.deloadCounter < 5) {
    state.deloadCounter += 1
  }

  writeAppState(state)
}

// Reset deload counter to 1 (called after deload week is archived)
export function resetDeloadCounter(): void {
  const state = readAppState()
  state.deloadCounter = 1
  writeAppState(state)
}

// Flag current week as deload (sets isDeloadWeek = true)
export function flagDeloadWeek(): void {
  const state = readAppState()
  state.isDeloadWeek = true
  writeAppState(state)
}

// Unflag deload (called after archiving deload week)
export function unflagDeloadWeek(): void {
  const state = readAppState()
  state.isDeloadWeek = false
  writeAppState(state)
}

// Update Notion last sync timestamp
export function updateNotionSync(): void {
  const state = readAppState()
  state.notionLastSync = new Date().toISOString()
  writeAppState(state)
}

// Get full state (for reading in components)
export function getAppState(): AppState {
  return readAppState()
}

// Update state partially
export function updateAppState(updates: Partial<AppState>): void {
  const state = readAppState()
  const updated = { ...state, ...updates }
  writeAppState(updated)
}
