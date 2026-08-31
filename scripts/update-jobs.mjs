import { readFile, writeFile } from 'node:fs/promises'
import {
  canonicalKey,
  dedupeJobs,
  enrichPortalJob,
  fromJsonLd,
  jsonLdObjects,
  karriereDetailState,
  matchTier,
  normalize,
  parseJobsAt,
  parseKarriereAt,
  parseWillhaben,
  scoreJob,
} from './job-utils.mjs'
import { parseGoGnas, parseMeinJobSuedoststeiermark, parseSteirerJobs } from './extended-source-utils.mjs'
import { isRecentListing, wasJobSourceChecked } from './job-lifecycle.mjs'

const root = new URL('../', import.meta.url)
const sources = JSON.parse(await readFile(new URL('config/sources.json', root), 'utf8')).filter(source => source.enabled)
const existing = JSON.parse(await readFile(new URL('public/jobs.json', root), 'utf8'))
const checkedAt = new Date().toISOString()
const discovered = []
const successfulUrls = new Set()
const pageTexts = new Map()
const permanentlyGoneUrls = new Set()
const errors = []
const sourceStats = []

for (const source of sources) {
  const provider = source.provider ?? providerFromUrl(source.url)
  try {
    if (source.adapter === 'meinjob-feed') {
      const jobs = await fetchMeinJobSource(source)
      discovered.push(...jobs.map(job => withSourceIdentity(job, source)))
      successfulUrls.add(source.url)
      sourceStats.push(sourceResult(source, provider, 'ok', jobs.length))
      continue
    }

    const response = await fetch(source.url, {
      headers: { 'user-agent': 'NahdranJobMonitor/0.2 (+private family job search)', accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 404 || response.status === 410) {
      successfulUrls.add(source.url)
      if (response.status === 410) permanentlyGoneUrls.add(source.url)
      sourceStats.push(sourceResult(source, provider, 'ok', 0, `HTTP ${response.status}`))
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const html = await response.text()
    successfulUrls.add(source.url)
    pageTexts.set(source.url, normalize(html))
    if (source.adapter === 'karriere-detail' && karriereDetailState(html) === 'inactive') {
      permanentlyGoneUrls.add(source.url)
      sourceStats.push(sourceResult(source, provider, 'ok', 0, 'Anzeige beendet'))
      continue
    }

    const before = discovered.length
    for (const object of jsonLdObjects(html)) {
      const job = fromJsonLd(object, source, checkedAt)
      if (job.title) discovered.push(job)
    }
    if (source.adapter === 'karriere-at') discovered.push(...parseKarriereAt(html, source, checkedAt))
    if (source.adapter === 'jobs-at') discovered.push(...parseJobsAt(html, source, checkedAt))
    if (source.adapter === 'willhaben') discovered.push(...parseWillhaben(html, source, checkedAt))
    if (source.adapter === 'steirerjobs') discovered.push(...parseSteirerJobs(html, source, checkedAt))
    if (source.adapter === 'go-gnas') discovered.push(...parseGoGnas(html, source, checkedAt))
    for (let index = before; index < discovered.length; index++) {
      discovered[index] = withSourceIdentity(discovered[index], source)
    }
    sourceStats.push(sourceResult(source, provider, 'ok', discovered.length - before))
  } catch (error) {
    errors.push(`${source.name}: ${error.message}`)
    sourceStats.push(sourceResult(source, provider, 'failed', 0, error.message))
  }
}

const rawCount = discovered.length
const uniqueDiscovery = dedupeJobs(discovered)
const detailCandidates = uniqueDiscovery
  .filter(job => job.driveMinutes <= 40 && job.fitScore >= 20)
  .filter(job => /karriere\.at\/jobs\/\d+|jobs\.at\/i\/\d+|willhaben\.at\/jobs\/job\/[^/]+\/\d+/.test(job.sourceUrl))
  .sort((a, b) => b.fitScore - a.fitScore)
  .slice(0, 40)

await mapConcurrent(detailCandidates, 6, async job => {
  try {
    const response = await fetch(job.sourceUrl, {
      headers: { 'user-agent': 'NahdranJobMonitor/0.2 (+private family job search)', accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 404 || response.status === 410) {
      permanentlyGoneUrls.add(job.sourceUrl)
      return
    }
    if (!response.ok) return
    discovered.push(enrichPortalJob(job, await response.text(), checkedAt))
  } catch (error) {
    errors.push(`Detail ${job.sourceUrl}: ${error.message}`)
  }
})

const discoveredFinal = dedupeJobs(discovered)
const sourceByUrl = new Map(sources.map(source => [source.url, source]))
const sourceById = new Map(sources.filter(source => source.id).map(source => [source.id, source]))

const retained = existing.jobs.flatMap(job => {
  if (permanentlyGoneUrls.has(job.sourceUrl)) return []
  const present = discoveredFinal.some(candidate => candidate.id === job.id || canonicalKey(candidate) === canonicalKey(job))
  const exactSource = sourceById.get(job.sourceId) ?? sourceByUrl.get(job.discoveryUrl) ?? sourceByUrl.get(job.sourceUrl)
  const directPageText = exactSource ? pageTexts.get(exactSource.url) ?? '' : ''
  const stillOnDirectPage = Boolean(exactSource && !exactSource.adapter && directPageText.includes(normalize(job.title)) && directPageText.includes(normalize(job.company)))
  if (present || stillOnDirectPage) return [{ ...job, checkedAt, status: 'active', missingChecks: 0 }]

  if (!wasJobSourceChecked(job, sources, successfulUrls)) return [job]
  const missingChecks = (job.missingChecks ?? 0) + 1
  return missingChecks >= 3 ? [] : [{ ...job, checkedAt, status: 'uncertain', missingChecks }]
})

const combined = dedupeJobs([...retained, ...discoveredFinal])
const eligible = combined
  .filter(job => job.driveMinutes <= 40 && job.fitScore >= 25)
  .filter(job => /^https?:\/\//.test(job.sourceUrl) || /^mailto:/.test(job.sourceUrl))
  .filter(job => !job.expiresAt || new Date(job.expiresAt).getTime() > Date.now() - 2 * 86400000)
  .filter(job => isRecentListing(job, checkedAt))

const rankedJobs = eligible
  .map(job => {
    const normalizedJob = {
      ...job,
      provider: configuredProviderForUrl(job.sourceUrl, job.provider),
      distanceEstimated: job.distanceEstimated ?? false,
      fitScore: scoreJob(job),
    }
    return { ...normalizedJob, matchTier: matchTier(normalizedJob) }
  })
  .sort((a, b) => b.fitScore - a.fitScore)

const topCompanyCounts = new Map()
const jobs = rankedJobs.map(job => {
  if (job.matchTier !== 'top') return job
  const companyKey = normalize(job.company).replace(/\b(gmbh|ag|kg|mbh|gesellschaft)\b/g, '').replace(/\s+/g, ' ').trim()
  const count = topCompanyCounts.get(companyKey) ?? 0
  topCompanyCounts.set(companyKey, count + 1)
  return count >= 2 ? { ...job, matchTier: 'review' } : job
})

const providers = [...new Set(sourceStats.filter(item => item.status === 'ok').map(item => item.provider))].sort()
const providersWithJobs = [...new Set(jobs.map(job => job.provider))].sort()
const successfulSearchCount = sourceStats.filter(item => item.status === 'ok').length
const topCount = jobs.filter(job => job.matchTier === 'top').length
const reviewCount = jobs.length - topCount
const output = {
  generatedAt: checkedAt,
  origin: existing.origin,
  sourceCount: successfulSearchCount,
  sourceProviderCount: providers.length,
  sourceJobProviderCount: providersWithJobs.length,
  sourceProviders: providers,
  stats: {
    raw: rawCount,
    unique: uniqueDiscovery.length,
    recommended: topCount,
    review: reviewCount,
    excluded: Math.max(0, combined.length - jobs.length),
    successfulSearches: successfulSearchCount,
    totalSearches: sources.length,
    providerCount: providers.length,
    providersWithJobs: providersWithJobs.length,
  },
  sourceStats,
  jobs,
}

await writeFile(new URL('public/jobs.json', root), `${JSON.stringify(output, null, 2)}\n`)
console.log(`Nahdran: ${topCount} beste Treffer + ${reviewCount} weitere aus ${providers.length} Anbietern (${successfulSearchCount}/${sources.length} Suchläufe erfolgreich).`)
if (errors.length) console.warn(`Nicht erreichbar (bestehende Daten bleiben erhalten):\n- ${errors.join('\n- ')}`)

function providerFromUrl(value = '') {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return 'Direktquelle' }
}

function configuredProviderForUrl(value = '', fallback) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '')
    return sources.find(source => new URL(source.url).hostname.replace(/^www\./, '') === hostname)?.provider ?? fallback ?? hostname
  } catch {
    return fallback ?? 'Direktquelle'
  }
}

function sourceResult(source, provider, status, found, note) {
  return { id: source.id ?? normalize(source.name).replace(/ /g, '-'), name: source.name, provider, kind: source.kind, status, found, checkedAt, ...(note ? { note } : {}) }
}

function withSourceIdentity(job, source) {
  return {
    ...job,
    sourceId: job.sourceId ?? source.id ?? normalize(source.name).replace(/ /g, '-'),
    discoveryUrl: job.discoveryUrl ?? source.url,
  }
}

async function fetchMeinJobSource(source) {
  const feedEntries = []
  for (let offset = 0; offset < 5; offset++) {
    const body = new URLSearchParams({
      'tx_wkojobsfrjobs_search[offset]': String(offset),
      'tx_wkojobsfrjobs_search[name]': '',
      'tx_wkojobsfrjobs_search[category]': '0',
      'tx_wkojobsfrjobs_search[location]': '',
      'tx_wkojobsfrjobs_search[placeLat]': '',
      'tx_wkojobsfrjobs_search[placeLng]': '',
      'tx_wkojobsfrjobs_search[radius]': '',
      'tx_wkojobsfrjobs_search[preview]': '1',
    })
    const response = await fetch(source.url, {
      method: 'POST',
      headers: {
        'user-agent': 'NahdranJobMonitor/0.2 (+private family job search)',
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
      },
      body,
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`MeinJob Feed HTTP ${response.status}`)
    const payload = await response.json()
    const pageEntries = Object.values(payload.jobs ?? {}).flat().filter(item => item?.url)
    if (!pageEntries.length) break
    feedEntries.push(...pageEntries)
    if (pageEntries.length < 30) break
  }

  if (!feedEntries.length) throw new Error('MeinJob Feed enthielt keine auswertbaren Stellen')
  const profiles = new Map()
  for (const entry of feedEntries) {
    const url = new URL(entry.url, 'https://www.meinjob-suedoststeiermark.at')
    const heading = url.hash.replace(/^#heading-/, '')
    url.hash = ''
    const profile = profiles.get(url.href) ?? { ids: new Set(), location: entry.city }
    if (heading) profile.ids.add(heading)
    profiles.set(url.href, profile)
  }

  const jobs = []
  await mapConcurrent([...profiles.entries()], 5, async ([profileUrl, profile]) => {
    try {
      const response = await fetch(profileUrl, {
        headers: { 'user-agent': 'NahdranJobMonitor/0.2 (+private family job search)', accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      if (!/id=["']job-div["']/i.test(html)) throw new Error('Jobbereich im Profil nicht gefunden')
      const parsed = parseMeinJobSuedoststeiermark(html, { ...source, url: profileUrl, location: profile.location }, checkedAt)
      successfulUrls.add(profileUrl)
      jobs.push(...parsed.filter(job => !profile.ids.size || profile.ids.has(job.sourceJobId)))
    } catch (error) {
      errors.push(`MeinJob Detail ${profileUrl}: ${error.message}`)
    }
  })
  return jobs
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  }))
}
