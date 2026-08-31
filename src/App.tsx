import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, ChevronDown, Database, ExternalLink, Globe2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Header } from './components/Header'
import { Filters } from './components/Filters'
import { JobList } from './components/JobList'
import { JobDetail } from './components/JobDetail'
import { defaultFilters, type FilterState } from './filter-config'
import type { Job, JobsPayload } from './types'

const FAVORITES_KEY = 'nahdran-favorites-v1'
const FILTERS_KEY = 'nahdran-filters-v1'
const OWNER_REFRESH_URL = 'https://github.com/dominik13gangl/nahdran-jobs/actions/workflows/daily-jobs.yml'
const AMS_SEARCH_URL = 'https://jobs.ams.at/public/emps/'
const REVIEW_PREVIEW_COUNT = 12

type InitialLoadState = 'loading' | 'ready' | 'error'
type RefreshState = 'idle' | 'loading' | 'success' | 'error'

function storedFavorites() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function storedFilters(): FilterState {
  try {
    const value = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}') as Partial<FilterState>
    return { ...defaultFilters, ...value }
  } catch {
    return defaultFilters
  }
}

function isJobsPayload(value: unknown): value is JobsPayload {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<JobsPayload>
  return typeof candidate.generatedAt === 'string'
    && typeof candidate.origin === 'string'
    && typeof candidate.sourceCount === 'number'
    && Array.isArray(candidate.jobs)
    && candidate.jobs.every(job => Boolean(job) && typeof job.id === 'string' && typeof job.title === 'string')
}

async function fetchJobs(signal?: AbortSignal) {
  const dataUrl = `${import.meta.env.BASE_URL}jobs.json?fresh=${Date.now()}`
  const response = await fetch(dataUrl, { cache: 'no-store', signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Jobdaten konnten nicht geladen werden')

  const data: unknown = await response.json()
  if (!isJobsPayload(data)) throw new Error('Jobdaten haben ein unerwartetes Format')
  return data
}

function diversifyByCompany(jobs: Job[]) {
  const groups = new Map<string, Job[]>()
  for (const job of jobs) {
    const key = job.company.toLocaleLowerCase('de-AT').replace(/[^a-zäöüß0-9]+/gi, ' ').trim().split(' ').slice(0, 2).join(' ')
    groups.set(key, [...(groups.get(key) ?? []), job])
  }
  const diversified: Job[] = []
  while (diversified.length < jobs.length) {
    for (const group of groups.values()) {
      const next = group.shift()
      if (next) diversified.push(next)
    }
  }
  return diversified
}

function App() {
  const [payload, setPayload] = useState<JobsPayload | null>(null)
  const [initialLoadState, setInitialLoadState] = useState<InitialLoadState>('loading')
  const [refreshState, setRefreshState] = useState<RefreshState>('idle')
  const [refreshMessage, setRefreshMessage] = useState('')
  const [filters, setFilters] = useState<FilterState>(storedFilters)
  const [favorites, setFavorites] = useState<Set<string>>(storedFavorites)
  const [selected, setSelected] = useState<Job | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sort, setSort] = useState<'fit' | 'drive' | 'recent'>('fit')
  const [showAllReview, setShowAllReview] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetchJobs(controller.signal)
      .then(data => {
        setPayload(data)
        setInitialLoadState('ready')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setInitialLoadState('error')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])), [favorites])
  useEffect(() => localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)), [filters])

  const visibleJobs = useMemo(() => {
    if (!payload) return []
    const query = filters.query.toLocaleLowerCase('de')
    const location = filters.location.toLocaleLowerCase('de')
    return payload.jobs.filter(job => {
      if (favoritesOnly && !favorites.has(job.id)) return false
      if (query && !`${job.title} ${job.company} ${job.tasks.join(' ')}`.toLocaleLowerCase('de').includes(query)) return false
      if (location && !`${job.location} ${job.company}`.toLocaleLowerCase('de').includes(location)) return false
      const keepEstimateAtDefault = Boolean(job.distanceEstimated) && filters.maxDrive === defaultFilters.maxDrive
      if (job.driveMinutes > filters.maxDrive && !keepEstimateAtDefault) return false
      if (filters.morningOnly && !job.morningFriendly) return false
      if (filters.partTimeOnly && !job.employmentType.some(type => type === 'Teilzeit' || type === 'Geringfügig')) return false
      if (filters.weekendFreeOnly && job.weekendRequired) return false
      return true
    }).sort((a, b) => sort === 'fit' ? b.fitScore - a.fitScore : sort === 'drive' ? a.driveMinutes - b.driveMinutes : (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
  }, [payload, filters, favoritesOnly, favorites, sort])

  const tieredJobs = useMemo(() => {
    const groups = visibleJobs.reduce<{ top: Job[]; review: Job[] }>((result, job) => {
      const tier = job.matchTier ?? (job.fitScore >= 50 ? 'top' : 'review')
      result[tier].push(job)
      return result
    }, { top: [], review: [] })
    if (sort === 'fit') groups.review = diversifyByCompany(groups.review)
    return groups
  }, [visibleJobs, sort])

  function installPayload(nextPayload: JobsPayload) {
    setPayload(nextPayload)
    setSelected(current => current ? nextPayload.jobs.find(job => job.id === current.id) ?? null : null)
  }

  async function retryInitialLoad() {
    setInitialLoadState('loading')
    try {
      const data = await fetchJobs()
      installPayload(data)
      setInitialLoadState('ready')
    } catch {
      setInitialLoadState('error')
    }
  }

  async function refreshJobs() {
    if (refreshState === 'loading') return
    setRefreshState('loading')
    setRefreshMessage('Der neueste veröffentlichte Datenstand wird geladen …')
    try {
      const previousGeneratedAt = payload?.generatedAt
      const data = await fetchJobs()
      installPayload(data)
      setRefreshState('success')
      setRefreshMessage(previousGeneratedAt === data.generatedAt ? 'Der angezeigte Stand ist bereits aktuell.' : `${data.jobs.length} Stellen wurden neu geladen.`)
    } catch {
      setRefreshState('error')
      setRefreshMessage('Aktualisierung fehlgeschlagen. Der bisherige Datenstand bleibt sichtbar.')
    }
  }

  function toggleFavorite(id: string) {
    setFavorites(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const generatedAt = payload ? new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payload.generatedAt)) : 'noch nicht geladen'
  const providerCount = payload?.sourceProviderCount ?? payload?.sourceProviders?.length ?? 0
  const searchHealth = payload?.stats ? `${payload.stats.successfulSearches}/${payload.stats.totalSearches} Quellensuchen erfolgreich` : `${payload?.sourceCount ?? 0} Suchseiten geprüft`
  const visibleReviewJobs = showAllReview ? tieredJobs.review : tieredJobs.review.slice(0, REVIEW_PREVIEW_COUNT)

  return (
    <div id="top" className={`app-shell ${selected ? 'detail-open' : ''}`}>
      <Header favorites={favorites.size} showingFavorites={favoritesOnly} onShowFavorites={() => { setFavoritesOnly(value => !value); setSelected(null) }} />
      <main className="content" id="jobs">
        <section className="intro">
          <div><h1>{favoritesOnly ? 'Deine gemerkten Stellen.' : 'Jobs, die in dein Leben passen.'}</h1><p>Rund um St. Stefan im Rosental · täglich automatisch aktualisiert</p></div>
          <div className="freshness-panel">
            <div className="freshness"><span className="live-dot" /> Datenstand {generatedAt}</div>
            {payload ? <button className="refresh-button" type="button" onClick={() => void refreshJobs()} disabled={refreshState === 'loading'} aria-busy={refreshState === 'loading'}><RefreshCw size={15} /> {refreshState === 'loading' ? 'Wird geladen …' : 'Daten neu laden'}</button> : null}
            <a className="owner-refresh-link" href={OWNER_REFRESH_URL} target="_blank" rel="noreferrer" aria-label="Quellen jetzt neu durchsuchen – öffnet GitHub Actions in einem neuen Tab">Quellen jetzt neu durchsuchen <ExternalLink size={13} aria-hidden="true" /></a>
            <span className={`refresh-status refresh-status--${refreshState}`} role={refreshState === 'error' ? 'alert' : 'status'} aria-live="polite">{refreshMessage}</span>
          </div>
        </section>
        {initialLoadState === 'loading' ? <section className="empty-state" role="status" aria-live="polite"><h2>Jobdaten werden geladen</h2><p>Die neuesten veröffentlichten Stellen werden abgerufen …</p></section> : null}
        {initialLoadState === 'error' ? <section className="empty-state" role="alert"><h2>Jobdaten konnten nicht geladen werden</h2><p>Bitte prüfe die Verbindung und versuche es noch einmal.</p><button className="secondary-button" type="button" onClick={() => void retryInitialLoad()}><RefreshCw size={17} /> Erneut versuchen</button></section> : null}
        {payload ? <>
          <section className="coverage-card" aria-label="Abgedeckte Jobquellen">
            <div className="coverage-copy"><Globe2 /><span><strong>Breiter als ein einzelnes Jobportal</strong><small>{payload.stats?.unique ?? payload.jobs.length} eindeutige Anzeigen geprüft, {payload.jobs.length} davon regional plausibel. {providerCount} Anbieter und Direktquellen durchsucht.</small></span></div>
            <div className="provider-list" aria-label="Anbieter">{payload.sourceProviders?.map(provider => <span key={provider}>{provider}</span>)}</div>
            <a href={AMS_SEARCH_URL} target="_blank" rel="noreferrer">Zusätzlich bei AMS suchen <ExternalLink size={13} /></a>
          </section>
          <Filters filters={filters} onChange={setFilters} resultCount={visibleJobs.length} />
          <section className="results-head">
            <div><h2>{favoritesOnly ? `${visibleJobs.length} Favoriten` : `${visibleJobs.length} gefundene Jobs`}</h2><p>{tieredJobs.top.length} besonders passend · {tieredJobs.review.length} weitere zum Prüfen</p></div>
            <label className="sort-control"><ArrowDownUp size={17} /><span>Sortieren</span><select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="fit">Beste Übereinstimmung</option><option value="drive">Kürzeste Fahrt</option><option value="recent">Neueste zuerst</option></select></label>
          </section>
          {visibleJobs.length === 0 ? <JobList jobs={[]} selectedId={selected?.id} favorites={favorites} onSelect={setSelected} onFavorite={toggleFavorite} /> : null}
          {tieredJobs.top.length > 0 ? <section className="tier-section tier-section--top" aria-labelledby="top-jobs-heading"><div className="tier-heading"><h3 id="top-jobs-heading">Besonders passende Stellen</h3><p>Gute Übereinstimmung bei Fahrt, Arbeitszeit und Profil.</p></div><JobList jobs={tieredJobs.top} selectedId={selected?.id} favorites={favorites} onSelect={setSelected} onFavorite={toggleFavorite} /></section> : null}
          {tieredJobs.review.length > 0 ? <section className="tier-section tier-section--review" aria-labelledby="review-jobs-heading"><div className="tier-heading"><h3 id="review-jobs-heading">Weitere Stellen zum Prüfen <span>{tieredJobs.review.length}</span></h3><p>Mehr Auswahl aus der Region – Arbeitszeit oder Anforderungen bitte genauer abklären.</p></div><JobList jobs={visibleReviewJobs} selectedId={selected?.id} favorites={favorites} onSelect={setSelected} onFavorite={toggleFavorite} />{tieredJobs.review.length > REVIEW_PREVIEW_COUNT ? <button className="show-more-button" type="button" onClick={() => setShowAllReview(value => !value)} aria-expanded={showAllReview}>{showAllReview ? 'Weniger anzeigen' : `Alle ${tieredJobs.review.length} Stellen anzeigen`}<ChevronDown className={showAllReview ? 'rotated' : ''} size={17} /></button> : null}</section> : null}
          <footer><div><strong>Nahdran</strong><span>Ein privater Jobfinder für die Südoststeiermark.</span></div><div className="footer-trust"><span><Database /> {searchHealth} · {providerCount} Anbieter</span><span><ShieldCheck /> Direkt zur Originalanzeige</span></div></footer>
        </> : null}
      </main>
      {selected && <><button className="detail-backdrop" onClick={() => setSelected(null)} aria-label="Details schließen" /><JobDetail job={selected} isFavorite={favorites.has(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onClose={() => setSelected(null)} /></>}
    </div>
  )
}

export default App
