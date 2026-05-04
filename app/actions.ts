'use server'

import { activatePendingWeekIfDue } from '@/lib/week-activation'

export async function activatePendingWeekAction() {
  return activatePendingWeekIfDue()
}
