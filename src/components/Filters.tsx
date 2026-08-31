import { BriefcaseBusiness, CalendarOff, CarFront, Clock3, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { defaultFilters, type FilterState } from '../filter-config'

type Props = { filters: FilterState; onChange: (filters: FilterState) => void; resultCount: number }

export function Filters({ filters, onChange, resultCount }: Props) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) => onChange({ ...filters, [key]: value })
  return (
    <section className="filters" aria-label="Jobfilter">
      <label className="filter-field filter-field--wide">
        <Search size={19} />
        <span><b>Was suchst du?</b><input value={filters.query} onChange={e => set('query', e.target.value)} placeholder="z. B. Büro, Service" /></span>
      </label>
      <label className="filter-field filter-field--wide">
        <BriefcaseBusiness size={19} />
        <span><b>Ort oder Firma</b><input value={filters.location} onChange={e => set('location', e.target.value)} placeholder="z. B. Feldbach" /></span>
      </label>
      <label className="filter-field">
        <CarFront size={19} />
        <span><b>Max. Fahrzeit</b><select value={filters.maxDrive} onChange={e => set('maxDrive', Number(e.target.value))}><option value={20}>20 Min</option><option value={30}>30 Min</option><option value={40}>40 Min</option></select></span>
      </label>
      <button className={`filter-toggle ${filters.morningOnly ? 'selected' : ''}`} onClick={() => set('morningOnly', !filters.morningOnly)} aria-pressed={filters.morningOnly}>
        <Clock3 size={19} /><span><b>Vormittags</b><small>bis ca. 13:30</small></span>
      </button>
      <button className={`filter-toggle ${filters.partTimeOnly ? 'selected' : ''}`} onClick={() => set('partTimeOnly', !filters.partTimeOnly)} aria-pressed={filters.partTimeOnly}>
        <SlidersHorizontal size={19} /><span><b>Teilzeit</b><small>& geringfügig</small></span>
      </button>
      <button className={`filter-toggle ${filters.weekendFreeOnly ? 'selected' : ''}`} onClick={() => set('weekendFreeOnly', !filters.weekendFreeOnly)} aria-pressed={filters.weekendFreeOnly}>
        <CalendarOff size={19} /><span><b>Ohne Wochenende</b><small>bekannte Konflikte ausblenden</small></span>
      </button>
      <div className="filter-summary">
        <span><strong>{resultCount}</strong> passende {resultCount === 1 ? 'Stelle' : 'Stellen'}</span>
        <button onClick={() => onChange(defaultFilters)}><RotateCcw size={15} /> Zurücksetzen</button>
      </div>
    </section>
  )
}
