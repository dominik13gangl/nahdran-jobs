import { AlertCircle, BriefcaseBusiness, CalendarClock, CarFront, Check, ExternalLink, Heart, Mail, MapPin, Phone, X } from 'lucide-react'
import type { Job } from '../types'
import { FitScore } from './FitScore'

type Props = { job: Job; isFavorite: boolean; onFavorite: () => void; onClose: () => void }

export function JobDetail({ job, isFavorite, onFavorite, onClose }: Props) {
  return (
    <aside className="detail-panel" aria-label={`Details zu ${job.title}`}>
      <div className="detail-head">
        <div><p className="detail-company">{job.company}</p><h2>{job.title}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Details schließen"><X /></button>
      </div>
      <div className="detail-facts">
        <span><MapPin /> {job.location}</span><span><CarFront /> {job.driveMinutes} Min · {job.distanceKm} km</span>
        <span><CalendarClock /> {job.schedule}</span><span><BriefcaseBusiness /> {job.employmentType.join(' · ')}</span>
      </div>
      <div className="detail-score"><FitScore score={job.fitScore} /><div><b>Passung für ihr Profil</b><small>Arbeitszeit, Fahrt, Erfahrung und Gehalt</small></div></div>
      <section><h3>Warum der Job gut passen könnte</h3><ul className="check-list">{job.fitReasons.map(reason => <li key={reason}><Check />{reason}</li>)}</ul></section>
      {job.concerns.length > 0 && <section className="concerns"><h3>Vor der Bewerbung klären</h3><ul>{job.concerns.map(concern => <li key={concern}><AlertCircle />{concern}</li>)}</ul></section>}
      <section><h3>Aufgaben</h3><ul>{job.tasks.map(task => <li key={task}>{task}</li>)}</ul></section>
      <section><h3>Anforderungen</h3><ul>{job.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul></section>
      {job.contact && <section><h3>Kontakt</h3><div className="contact-list">{job.contact.name && <span>{job.contact.name}</span>}{job.contact.phone && <a href={`tel:${job.contact.phone}`}><Phone />{job.contact.phone}</a>}{job.contact.email && <a href={`mailto:${job.contact.email}`}><Mail />{job.contact.email}</a>}</div></section>}
      <section className="source-note"><span>Quelle: <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source} <ExternalLink /></a>{job.status === 'uncertain' && <em>Quelle aktuell nicht bestätigt – erneute Prüfung läuft</em>}</span><small>Geprüft: {new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' }).format(new Date(job.checkedAt))}</small></section>
      <div className="detail-actions"><button className={`secondary-button ${isFavorite ? 'active' : ''}`} onClick={onFavorite}><Heart fill={isFavorite ? 'currentColor' : 'none'} />{isFavorite ? 'Gemerkt' : 'Merken'}</button><a className="primary-button" href={job.applyUrl} target="_blank" rel="noreferrer">Zur Bewerbung <ExternalLink /></a></div>
    </aside>
  )
}
