export type AlertLevel = 'warn' | 'caution' | null

export interface AdaptiveAlert {
  level: AlertLevel
  message: string
  suggestion: string
}

function sessionIntensity(type: string, subtype: string | null | undefined): 'high' | 'moderate' | 'low' {
  const combined = `${type} ${subtype ?? ''}`.toLowerCase()
  if (
    combined.includes('hyrox') ||
    combined.includes('hiit') ||
    combined.includes('wod') ||
    combined.includes('interval') ||
    combined.includes('5x5') ||
    combined.includes('heavy')
  ) return 'high'
  if (type === 'Rest' || combined.includes('mobility') || combined.includes('recovery')) return 'low'
  return 'moderate'
}

export function calcAdaptiveAlert(
  recoveryScore: number,
  sessionType: string,
  sessionSubtype: string | null | undefined,
  sessionStatus: string,
): AdaptiveAlert | null {
  if (sessionStatus === 'completed' || sessionStatus === 'skipped') return null

  const intensity = sessionIntensity(sessionType, sessionSubtype)

  if (recoveryScore < 40 && intensity !== 'low') {
    return {
      level: 'warn',
      message: `Recovery score is ${recoveryScore} — your body isn't ready for ${sessionType} today.`,
      suggestion: intensity === 'high'
        ? 'Consider swapping to active recovery or rest.'
        : 'Reduce volume or intensity by ~30%.',
    }
  }

  if (recoveryScore < 55 && intensity === 'high') {
    return {
      level: 'caution',
      message: `Recovery score is ${recoveryScore} — today's session is planned as high intensity.`,
      suggestion: 'Consider dropping weight/volume by 15–20% or substituting a moderate session.',
    }
  }

  return null
}
