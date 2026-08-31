import { useEffect, useId, useRef } from 'react'
import {
  AlertCircle,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  CarFront,
  Check,
  Clock3,
  ExternalLink,
  Heart,
  Mail,
  MapPin,
  Phone,
  X,
} from 'lucide-react'
import type { Job } from '../types'
import { FitScore } from './FitScore'

type Props = { job: Job; isFavorite: boolean; onFavorite: () => void; onClose: () => void }

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function describedHours(job: Job) {
  const hoursPattern = /(?:(bis|ab)\s*)?(\d{1,2}(?:[,.]\d)?)\s*(?:std(?:unden?)?\.?|h)\s*(?:\/\s*woche|pro\s+woche)?/i
  const match = `${job.title} · ${job.schedule}`.match(hoursPattern)

  if (match) {
    const qualifier = match[1] ? `${match[1].toLocaleLowerCase('de-AT')} ` : ''
    return `${qualifier}${match[2].replace('.', ',')} Std./Woche`
  }

  return job.hoursPerWeek ? `${job.hoursPerWeek} Std./Woche` : 'Nicht eindeutig angegeben'
}

function isScheduleUncertain(job: Job) {
  return !job.hoursPerWeek || /unbekannt|laut inserat|genaue zeiten|nach vereinbarung/i.test(job.schedule)
}

export function JobDetail({ job, isFavorite, onFavorite, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const distanceIsEstimated = job.distanceEstimated ?? true
  const scheduleIsUncertain = isScheduleUncertain(job)
  const salaryIsUncertain = !job.salary || /nicht (?:konkret )?angegeben|keine angabe/i.test(job.salary)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const appShell = dialogRef.current?.closest('.app-shell')
    const backgroundElements = [appShell?.querySelector<HTMLElement>('.topbar'), appShell?.querySelector<HTMLElement>('main')].filter((element): element is HTMLElement => Boolean(element))
    const backgroundState = backgroundElements.map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }))
    for (const element of backgroundElements) {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    }

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusableElements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)

      if (!firstElement || !lastElement) {
        event.preventDefault()
        dialogRef.current.focus()
      } else if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        if (event.shiftKey) lastElement.focus()
        else firstElement.focus()
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
      previouslyFocusedRef.current?.focus()
    }
  }, [])

  return (
    <aside
      ref={dialogRef}
      className="detail-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className="detail-head">
        <div>
          <p className="detail-company">{job.company}</p>
          <h2 id={titleId}>{job.title}</h2>
        </div>
        <button ref={closeButtonRef} className="icon-button" onClick={onClose} aria-label="Details schließen">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="detail-body">
        <dl className="detail-facts">
          <div className="detail-fact">
            <MapPin className="detail-fact-icon" aria-hidden="true" />
            <div className="detail-fact-copy">
              <dt className="detail-fact-label">Arbeitsort</dt>
              <dd className="detail-fact-value">{job.location}</dd>
            </div>
          </div>
          <div className="detail-fact">
            <CarFront className="detail-fact-icon" aria-hidden="true" />
            <div className="detail-fact-copy">
              <dt className="detail-fact-label">Fahrt von St. Stefan</dt>
              <dd className="detail-fact-value">
                {distanceIsEstimated ? 'ca. ' : ''}{job.driveMinutes} Min{job.distanceKm > 0 ? ` · ${job.distanceKm} km` : ''}
                {distanceIsEstimated && <small className="detail-estimate">Geschätzt – Verkehr und genauer Arbeitsort können abweichen</small>}
              </dd>
            </div>
          </div>
          <div className="detail-fact">
            <Clock3 className="detail-fact-icon" aria-hidden="true" />
            <div className="detail-fact-copy">
              <dt className="detail-fact-label">Stundenumfang</dt>
              <dd className="detail-fact-value">
                {describedHours(job)}
                {scheduleIsUncertain && <small className="detail-estimate">Wochenstunden oder Dienstzeiten bitte im Inserat prüfen</small>}
              </dd>
            </div>
          </div>
          <div className="detail-fact">
            <CalendarClock className="detail-fact-icon" aria-hidden="true" />
            <div className="detail-fact-copy">
              <dt className="detail-fact-label">Arbeitszeit</dt>
              <dd className="detail-fact-value">{job.schedule}</dd>
            </div>
          </div>
          <div className="detail-fact">
            <BriefcaseBusiness className="detail-fact-icon" aria-hidden="true" />
            <div className="detail-fact-copy">
              <dt className="detail-fact-label">Anstellung</dt>
              <dd className="detail-fact-value">{job.employmentType.join(' · ')}</dd>
            </div>
          </div>
          <div className="detail-fact">
            <Banknote className="detail-fact-icon" aria-hidden="true" />
            <div className="detail-fact-copy">
              <dt className="detail-fact-label">Gehalt laut Inserat</dt>
              <dd className="detail-fact-value">
                {job.salary || 'Nicht angegeben'}
                {salaryIsUncertain && <small className="detail-estimate">Vor der Bewerbung direkt beim Arbeitgeber klären</small>}
              </dd>
            </div>
          </div>
        </dl>

        <div className="detail-score">
          <FitScore score={job.fitScore} />
          <div><b>Passung für dein Profil</b><small>Arbeitszeit, Fahrt, Erfahrung und Gehalt</small></div>
        </div>
        <section><h3>Warum der Job gut passen könnte</h3><ul className="check-list">{job.fitReasons.map(reason => <li key={reason}><Check aria-hidden="true" />{reason}</li>)}</ul></section>
        {job.concerns.length > 0 && <section className="concerns"><h3>Vor der Bewerbung klären</h3><ul>{job.concerns.map(concern => <li key={concern}><AlertCircle aria-hidden="true" />{concern}</li>)}</ul></section>}
        <section><h3>Aufgaben</h3><ul>{job.tasks.map(task => <li key={task}>{task}</li>)}</ul></section>
        <section><h3>Anforderungen</h3><ul>{job.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul></section>
        {job.contact && <section><h3>Kontakt</h3><div className="contact-list">{job.contact.name && <span>{job.contact.name}</span>}{job.contact.phone && <a href={`tel:${job.contact.phone}`}><Phone aria-hidden="true" />{job.contact.phone}</a>}{job.contact.email && <a href={`mailto:${job.contact.email}`}><Mail aria-hidden="true" />{job.contact.email}</a>}</div></section>}
        <section className="source-note"><span>Quelle: <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source} <ExternalLink aria-hidden="true" /></a>{job.status === 'uncertain' && <em>Quelle aktuell nicht bestätigt – erneute Prüfung läuft</em>}</span><small>Geprüft: {new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' }).format(new Date(job.checkedAt))}</small></section>
      </div>

      <footer className="detail-actions">
        <button className={`secondary-button ${isFavorite ? 'active' : ''}`} onClick={onFavorite} aria-pressed={isFavorite}>
          <Heart aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
          {isFavorite ? 'Gemerkt' : 'Merken'}
        </button>
        <a className="primary-button" href={job.applyUrl} target="_blank" rel="noreferrer">Zur Bewerbung <ExternalLink aria-hidden="true" /></a>
      </footer>
    </aside>
  )
}
