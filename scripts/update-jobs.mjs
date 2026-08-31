import { readFile, writeFile } from 'node:fs/promises'
import { dedupeJobs, fromJsonLd, jsonLdObjects, normalize } from './job-utils.mjs'

const root = new URL('../', import.meta.url)
const sources = JSON.parse(await readFile(new URL('config/sources.json', root), 'utf8')).filter(source => source.enabled)
const existing = JSON.parse(await readFile(new URL('public/jobs.json', root), 'utf8'))
const checkedAt = new Date().toISOString()
const discovered = []
const successfulUrls = new Set()
const pageTexts = new Map()
const permanentlyGoneUrls = new Set()
const errors = []

for (const source of sources) {
  try {
    const response = await fetch(source.url, { headers: { 'user-agent': 'NahdranJobMonitor/0.1 (+private family job search)', accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(20000) })
    if (response.status === 404 || response.status === 410) {
      successfulUrls.add(source.url)
      if (response.status === 410) permanentlyGoneUrls.add(source.url)
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    successfulUrls.add(source.url)
    pageTexts.set(source.url, normalize(html))
    for (const object of jsonLdObjects(html)) discovered.push(fromJsonLd(object, source, checkedAt))
  } catch (error) {
    errors.push(`${source.name}: ${error.message}`)
  }
}

const retained = existing.jobs.flatMap(job => {
  if (permanentlyGoneUrls.has(job.sourceUrl)) return []
  const sourceChecked = successfulUrls.has(job.sourceUrl)
  if (!sourceChecked) return [job]
  const pageText = pageTexts.get(job.sourceUrl) ?? ''
  const stillPresent = discovered.some(candidate => candidate.id === job.id || candidate.sourceUrl === job.sourceUrl)
    || (pageText.includes(normalize(job.title)) && pageText.includes(normalize(job.company)))
  if (stillPresent) return [{ ...job, checkedAt, status: 'active', missingChecks: 0 }]
  const missingChecks = (job.missingChecks ?? 0) + 1
  return missingChecks >= 3 ? [] : [{ ...job, checkedAt, status: 'uncertain', missingChecks }]
})

const jobs = dedupeJobs([...retained, ...discovered]).filter(job => !job.expiresAt || new Date(job.expiresAt).getTime() > Date.now() - 2 * 86400000).sort((a, b) => b.fitScore - a.fitScore)
const output = { generatedAt: checkedAt, origin: existing.origin, sourceCount: successfulUrls.size, jobs }
await writeFile(new URL('public/jobs.json', root), `${JSON.stringify(output, null, 2)}\n`)
console.log(`Nahdran: ${jobs.length} aktive/prüfbare Jobs aus ${successfulUrls.size}/${sources.length} erreichbaren Quellen.`)
if (errors.length) console.warn(`Nicht erreichbar (bestehende Daten bleiben erhalten):\n- ${errors.join('\n- ')}`)
