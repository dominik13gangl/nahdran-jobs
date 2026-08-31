type Props = { score: number; compact?: boolean }

export function FitScore({ score, compact = false }: Props) {
  const tone = score >= 82 ? 'excellent' : score >= 65 ? 'good' : 'low'
  return (
    <div className={`fit-score fit-score--${tone} ${compact ? 'fit-score--compact' : ''}`} aria-label={`${score} Prozent Passung`}>
      <span className="fit-score__bar" />
      <strong>{score}%</strong>
    </div>
  )
}
