import { createHash } from 'node:crypto'

export const placeTravelMinutes = {
  'st stefan im rosental': 3,
  'st. stefan im rosental': 3,
  'feldbach': 18,
  'mühldorf bei feldbach': 23,
  'mureck': 29,
  'gnas': 14,
  'bad gleichenberg': 24,
  'kirchberg an der raab': 15,
  'sankt peter am ottersbach': 17,
  'fehring': 29,
  'leibnitz': 38,
}

export function plainText(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

export function normalize(value = '') {
  return plainText(value).toLocaleLowerCase('de-AT').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(m|w|d|x)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function canonicalKey(job) {
  const title = normalize(job.title).replace(/\b(mitarbeiter|mitarbeiterin|mitarbeiterinnen)\b/g, '').trim()
  return [title, normalize(job.company), normalize(job.location)].join('|')
}

export function stableId(job) {
  return createHash('sha1').update(canonicalKey(job)).digest('hex').slice(0, 14)
}

export function dedupeJobs(jobs) {
  const chosen = new Map()
  for (const job of jobs) {
    const key = canonicalKey(job)
    const current = chosen.get(key)
    if (!current || completeness(job) > completeness(current)) chosen.set(key, { ...current, ...job, id: current?.id ?? job.id ?? stableId(job) })
  }
  return [...chosen.values()]
}

function completeness(job) {
  return ['salary', 'schedule', 'requirements', 'tasks', 'contact', 'expiresAt'].reduce((sum, field) => sum + (job[field] && (!Array.isArray(job[field]) || job[field].length) ? 1 : 0), 0)
}

export function scoreJob(job) {
  let score = 35
  const type = (job.employmentType ?? []).join(' ').toLowerCase()
  const text = normalize(`${job.title} ${job.description ?? ''} ${job.schedule ?? ''}`)
  if (type.includes('gering')) score += 22
  else if (type.includes('teilzeit')) score += 18
  else if (type.includes('vollzeit')) score -= 20
  if (job.morningFriendly || /vormittag|bis 13|05 30 13 30|06 00 12/.test(text)) score += 24
  if (job.weekendRequired) score -= 15
  if (job.driveMinutes <= 15) score += 14
  else if (job.driveMinutes <= 25) score += 9
  else if (job.driveMinutes <= 40) score += 3
  else score -= 25
  if (/buro|assistenz|verwaltung|rezeption|empfang|kassa|service|verkauf|reinigung/.test(text)) score += 8
  if (/elektro|ingenieur|arzt|pflegefach|leiter/.test(text)) score -= 12
  return Math.max(1, Math.min(99, score))
}

export function jsonLdObjects(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const objects = []
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1])
      walk(parsed, value => {
        const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']]
        if (types.includes('JobPosting')) objects.push(value)
      })
    } catch { /* A malformed third-party block should not abort the whole source. */ }
  }
  return objects
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return
  visit(value)
  if (Array.isArray(value)) value.forEach(item => walk(item, visit))
  else Object.values(value).forEach(item => walk(item, visit))
}

export function fromJsonLd(raw, source, checkedAt) {
  const location = raw.jobLocation?.[0]?.address?.addressLocality ?? raw.jobLocation?.address?.addressLocality ?? raw.applicantLocationRequirements?.name ?? 'Region Südoststeiermark'
  const company = raw.hiringOrganization?.name ?? 'Unternehmen laut Quelle'
  const employment = Array.isArray(raw.employmentType) ? raw.employmentType : [raw.employmentType].filter(Boolean)
  const employmentType = employment.map(type => /part|teil/i.test(type) ? 'Teilzeit' : /gering|mini/i.test(type) ? 'Geringfügig' : 'Vollzeit')
  const description = plainText(raw.description)
  const driveMinutes = placeTravelMinutes[normalize(location)] ?? 45
  const salaryValue = raw.baseSalary?.value?.value ?? raw.baseSalary?.value?.minValue
  const salary = salaryValue ? `ab € ${Number(salaryValue).toLocaleString('de-AT')} brutto` : 'im Inserat nicht konkret angegeben'
  const job = {
    title: plainText(raw.title), company, location, distanceKm: Math.round(driveMinutes * .75), driveMinutes,
    employmentType: employmentType.length ? [...new Set(employmentType)] : ['Vollzeit'], schedule: 'Arbeitszeit laut Inserat',
    morningFriendly: /vormittag|bis 13|06[:.]?00.{0,20}13[:.]?30/i.test(description), weekendRequired: /wochenend|samstag|sonntag/i.test(description),
    salary, fitReasons: [], concerns: ['Arbeitszeit vor der Bewerbung persönlich abklären'], requirements: [], tasks: [],
    source: source.name, sourceUrl: raw.url ?? source.url, applyUrl: raw.url ?? source.url,
    postedAt: raw.datePosted, expiresAt: raw.validThrough, checkedAt, status: 'active', description,
  }
  job.fitScore = scoreJob(job)
  job.fitReasons = buildReasons(job)
  job.id = stableId(job)
  return job
}

function buildReasons(job) {
  const reasons = []
  if (job.driveMinutes <= 25) reasons.push(`Kurze Fahrt von ungefähr ${job.driveMinutes} Minuten`)
  if (job.employmentType.includes('Teilzeit')) reasons.push('Teilzeit ist ausgeschrieben')
  if (job.morningFriendly) reasons.push('Die genannten Zeiten liegen am Vormittag')
  if (/service|verkauf|kassa|empfang|rezeption/i.test(job.title)) reasons.push('Die bisherige Gastro-Erfahrung ist gut übertragbar')
  return reasons.length ? reasons : ['Die Stelle liegt grundsätzlich im gewünschten Suchgebiet']
}
