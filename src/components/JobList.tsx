import { ChevronRight, Clock3, Heart, MapPin } from 'lucide-react'
import type { Job } from '../types'
import { FitScore } from './FitScore'

type Props = {
  jobs: Job[]
  selectedId?: string
  favorites: Set<string>
  onSelect: (job: Job) => void
  onFavorite: (id: string) => void
}

export function JobList({ jobs, selectedId, favorites, onSelect, onFavorite }: Props) {
  if (!jobs.length) return <div className="empty-state"><h2>Gerade kein Treffer</h2><p>Lockere einen Filter – neue Stellen werden täglich ergänzt.</p></div>
  return (
    <div className="job-list" role="list">
      <div className="job-columns" aria-hidden="true"><span>Position</span><span>Ort</span><span>Arbeitszeit / Plan</span><span>Gehalt (brutto)</span><span>Passung</span></div>
      {jobs.map(job => (
        <article key={job.id} role="listitem" className={`job-row ${selectedId === job.id ? 'selected' : ''}`} onClick={() => onSelect(job)}>
          <button className={`favorite ${favorites.has(job.id) ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onFavorite(job.id) }} aria-label={favorites.has(job.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}><Heart size={19} fill={favorites.has(job.id) ? 'currentColor' : 'none'} /></button>
          <div className="job-main"><h3>{job.title}</h3><p>{job.company}</p></div>
          <div className="job-meta"><MapPin size={16} /><span>{job.location}<small>{job.driveMinutes} Min Fahrt</small></span></div>
          <div className="job-schedule"><Clock3 size={16} /><span>{job.schedule}<small>{job.hoursPerWeek ? `${job.hoursPerWeek} Std./Woche` : job.employmentType.join(' · ')}</small></span></div>
          <div className="job-salary">{job.salary}</div>
          <FitScore score={job.fitScore} compact />
          <ChevronRight className="row-chevron" size={20} />
        </article>
      ))}
    </div>
  )
}
