import { redirect } from 'next/navigation'
import { activatePendingWeekIfDue } from '@/lib/week-activation'

export async function GET() {
  await activatePendingWeekIfDue()
  redirect('/')
}
