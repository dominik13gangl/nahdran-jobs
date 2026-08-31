import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Database, ShieldCheck } from 'lucide-react'
import { Header } from './components/Header'
import { Filters, defaultFilters, type FilterState } from './components/Filters'
import { JobList } from './components/JobList'
import { JobDetail } from './components/JobDetail'
import type { Job, JobsPayload } from './types'

const FAVORITES_KEY = 'nahdran-favorites-v1'

function App() {
  const [payload, setPayload] = useState<JobsPayload | null>(null)
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')))
  const [selected, setSelected] = useState<Job | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sort, setSort] = useState<'fit' | 'drive' | 'recent'>('fit')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}jobs.json`).then(response => {
      if (!response.ok) throw new Error('Jobdaten konnten nicht geladen werden')
      return response.json()
    }).then((data: JobsPayload) => setPayload(data)).catch(console.error)
  }, [])

  useEffect(() => localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])), [favorites])

  const visibleJobs = useMemo(() => {
    if (!payload) return []
    const query = filters.query.toLocaleLowerCase('de')
    const location = filters.location.toLocaleLowerCase('de')
    return payload.jobs.filter(job => {
      if (favoritesOnly && !favorites.has(job.id)) return false
      if (query && !`${job.title} ${job.company} ${job.tasks.join(' ')}`.toLocaleLowerCase('de').includes(query)) return false
      if (location && !`${job.location} ${job.company}`.toLocaleLowerCase('de').includes(location)) return false
      if (job.driveMinutes > filters.maxDrive) return false
      if (filters.morningOnly && !job.morningFriendly) return false
      if (filters.partTimeOnly && !job.employmentType.some(type => type === 'Teilzeit' || type === 'Geringfügig')) return false
      return true
    }).sort((a, b) => sort === 'fit' ? b.fitScore - a.fitScore : sort === 'drive' ? a.driveMinutes - b.driveMinutes : (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
  }, [payload, filters, favoritesOnly, favorites, sort])

  function toggleFavorite(id: string) {
    setFavorites(current => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const generatedAt = payload ? new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payload.generatedAt)) : 'wird geladen …'

  return (
    <div id="top" className={`app-shell ${selected ? 'detail-open' : ''}`}>
      <Header favorites={favorites.size} showingFavorites={favoritesOnly} onShowFavorites={() => { setFavoritesOnly(value => !value); setSelected(null) }} />
      <main className="content" id="jobs">
        <section className="intro">
          <div><h1>{favoritesOnly ? 'Deine gemerkten Stellen.' : 'Jobs, die in dein Leben passen.'}</h1><p>Rund um St. Stefan im Rosental · täglich automatisch aktualisiert</p></div>
          <div className="freshness"><span className="live-dot" /> Datenstand {generatedAt}</div>
        </section>
        <Filters filters={filters} onChange={setFilters} resultCount={visibleJobs.length} />
        <section className="results-head">
          <div><h2>{favoritesOnly ? `${visibleJobs.length} Favoriten` : `${visibleJobs.length} passende Jobs`}</h2><p>Nach deiner persönlichen Passung bewertet</p></div>
          <label className="sort-control"><ArrowDownUp size={17} /><span>Sortieren</span><select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="fit">Beste Übereinstimmung</option><option value="drive">Kürzeste Fahrt</option><option value="recent">Neueste zuerst</option></select></label>
        </section>
        <JobList jobs={visibleJobs} selectedId={selected?.id} favorites={favorites} onSelect={setSelected} onFavorite={toggleFavorite} />
        <footer><div><strong>Nahdran</strong><span>Ein privater Jobfinder für die Südoststeiermark.</span></div><div className="footer-trust"><span><Database /> {payload?.sourceCount ?? 0} Quellen</span><span><ShieldCheck /> Direkt zur Originalanzeige</span></div></footer>
      </main>
      {selected && <><button className="detail-backdrop" onClick={() => setSelected(null)} aria-label="Details schließen" /><JobDetail job={selected} isFavorite={favorites.has(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onClose={() => setSelected(null)} /></>}
    </div>
  )
}

export default App
