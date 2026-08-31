import { createHash } from 'node:crypto'

export const placeTravelMinutes = {
  'st stefan im rosental': 3,
  'st. stefan im rosental': 3,
  'feldbach': 18,
  'muhldorf bei feldbach': 23,
  'mureck': 29,
  'gnas': 14,
  'bad gleichenberg': 24,
  'kirchberg an der raab': 15,
  'sankt peter am ottersbach': 17,
  'fehring': 29,
  'leibnitz': 38,
  'gleisdorf': 37,
  'sinabelkirchen': 34,
  'ludersdorf': 36,
  'bad radkersburg': 38,
  'loipersdorf bei furstenfeld': 39,
  'hartberg': 48,
  'weiz': 43,
  'bad blumau': 55,
}

export function plainText(value = '') {
  return decodeEntities(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
}

export function normalize(value = '') {
  return plainText(value).toLocaleLowerCase('de-AT').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(m|w|d|x)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function canonicalKey(job) {
  const location = normalize(job.location)
  const title = normalize(job.title)
    .replace(/\b(mitarbeiter|mitarbeiterin|mitarbeiterinnen|in|innen|teilzeit|vollzeit|geringfugig|all genders|alle geschlechter)\b/g, ' ')
    .replace(/\b\d+(?: \d+)? (?:std|stunden|wochenstunden|h)\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(new RegExp(`\\b${escapeRegex(location)}\\b`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const company = normalize(job.company).replace(/\b(gmbh|ag|kg|mbh|gesellschaft m b h)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return [title, company, location].join('|')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stableId(job) {
  return createHash('sha1').update(canonicalKey(job)).digest('hex').slice(0, 14)
}

export function dedupeJobs(jobs) {
  const chosen = new Map()
  for (const job of jobs) {
    const key = canonicalKey(job)
    const current = chosen.get(key)
    if (!current) {
      chosen.set(key, { ...job, id: job.id ?? stableId(job) })
      continue
    }
    const preferred = completeness(job) >= completeness(current) ? job : current
    const fallback = preferred === job ? current : job
    const merged = { ...fallback, ...preferred, id: current.id ?? job.id ?? stableId(job) }
    if (isDetailUrl(job.sourceUrl) && !isDetailUrl(current.sourceUrl)) {
      merged.sourceUrl = job.sourceUrl
      merged.applyUrl = job.applyUrl
      merged.source = job.source
    }
    if (isConcrete(job.salary) && !isConcrete(current.salary)) merged.salary = job.salary
    merged.checkedAt = job.checkedAt ?? current.checkedAt
    merged.status = job.status ?? current.status
    chosen.set(key, merged)
  }
  return [...chosen.values()]
}

function completeness(job) {
  return ['schedule', 'requirements', 'tasks', 'contact', 'expiresAt'].reduce((sum, field) => sum + (job[field] && (!Array.isArray(job[field]) || job[field].length) ? 1 : 0), isConcrete(job.salary) ? 1 : 0)
}

function isConcrete(value) {
  return Boolean(value && !String(value).startsWith('im Inserat'))
}

function isDetailUrl(value = '') {
  return /karriere\.at\/jobs\/\d+|jobs\.at\/i\/\d+|legenstein\.at\/(?:jobs|offene-stellen)\//.test(value)
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

export function karriereDetailState(html) {
  const start = String(html).indexOf('"jobDetail":')
  if (start < 0) return 'unknown'
  const match = String(html).slice(start, start + 120000).match(/"isInactive":(true|false)/)
  if (!match) return 'unknown'
  return match[1] === 'true' ? 'inactive' : 'active'
}

export function extractJobSections(html) {
  const headings = [...String(html).matchAll(/<(h[2-6]|strong)[^>]*>([\s\S]*?)<\/\1>/gi)]
  const result = { tasks: [], requirements: [] }
  for (let index = 0; index < headings.length; index++) {
    const heading = normalize(headings[index][2])
    const kind = /aufgaben|dich.*erwartet|tatigkeit|dein.*job/.test(heading)
      ? 'tasks'
      : /profil|mitbringen|qualifikation|anforderung|voraussetzung/.test(heading)
        ? 'requirements'
        : null
    if (!kind) continue
    const start = headings[index].index + headings[index][0].length
    const end = headings[index + 1]?.index ?? Math.min(String(html).length, start + 6000)
    const section = String(html).slice(start, end)
    const list = section.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i)?.[1]
    if (!list) continue
    const items = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match => plainText(match[1])).filter(Boolean)
    result[kind].push(...items)
  }
  result.tasks = [...new Set(result.tasks)].slice(0, 8)
  result.requirements = [...new Set(result.requirements)].slice(0, 8)
  return result
}

export function enrichPortalJob(job, html, checkedAt) {
  const postings = jsonLdObjects(html)
  const posting = postings.find(item => normalize(item.title) === normalize(job.title)) ?? postings[0]
  const descriptionHtml = posting?.description ?? html
  const sections = extractJobSections(descriptionHtml)
  const detailText = plainText(descriptionHtml)
  const email = descriptionHtml.match(/mailto:([^"'?#\s<]+)/i)?.[1]
  const phone = descriptionHtml.match(/tel:([^"'?\s<]+)/i)?.[1]
  const escapedApplyUrl = String(html).match(/"applyUrl":"((?:\\.|[^"\\])*)"/)?.[1]
  let applyUrl = job.applyUrl
  if (escapedApplyUrl) {
    try { applyUrl = JSON.parse(`"${escapedApplyUrl}"`) } catch { /* Keep the public detail URL if embedded state is malformed. */ }
  }
  const salaryValue = posting?.baseSalary?.value?.value ?? posting?.baseSalary?.value?.minValue
  const enriched = {
    ...job,
    tasks: sections.tasks.length ? sections.tasks : job.tasks,
    requirements: sections.requirements.length ? sections.requirements : job.requirements,
    description: detailText || job.description,
    contact: email || phone ? { email: email ? decodeURIComponent(email) : undefined, phone: phone ? decodeURIComponent(phone) : undefined } : job.contact,
    applyUrl,
    salary: salaryValue && !isConcrete(job.salary) ? `ab € ${Number(salaryValue).toLocaleString('de-AT')} brutto` : job.salary,
    morningFriendly: job.morningFriendly || /vormittag|bis\s*13|05[:.]?\d{2}|06[:.]?\d{2}/i.test(detailText),
    weekendRequired: job.weekendRequired || /samstag|sonntag|wochenend/i.test(detailText),
    checkedAt,
  }
  enriched.concerns = buildConcerns(enriched)
  enriched.fitScore = scoreJob(enriched)
  enriched.fitReasons = buildReasons(enriched)
  return enriched
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

export function parseKarriereAt(html, source, checkedAt) {
  const cards = [...html.matchAll(/<li class="m-jobsList__item">([\s\S]*?)<\/li>/g)].map(match => match[1])
  return cards.map(card => {
    const titleMatch = card.match(/m-jobsListItem__titleLink[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    const company = captureText(card, /m-jobsListItem__companyName[^>]*>([\s\S]*?)<\/a>/)
    const location = captureText(card, /m-jobsListItem__location[^>]*>([\s\S]*?)<span/)
    if (!titleMatch || !company || !location) return null
    const description = captureText(card, /m-jobListSummary__text[^>]*>([\s\S]*?)<\/span>/)
    return fromPortalCard({
      title: plainText(titleMatch[2]), company, location, url: titleMatch[1], description,
      cardText: plainText(card),
    }, source, checkedAt)
  }).filter(Boolean)
}

export function parseJobsAt(html, source, checkedAt) {
  const starts = [...html.matchAll(/<li\s+data-job="[^"]+"/g)].map(match => match.index)
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length)).map(card => {
    const titleMatch = card.match(/<h2[^>]+data-job-title[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    const company = captureText(card, /<(?:a|span)[^>]*data-job-company[^>]*>([\s\S]*?)<\/(?:a|span)>/)
    const location = captureText(card, /data-job-location[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
    const pills = [...card.matchAll(/<span class="j-c-pill-text">([\s\S]*?)<\/span>/g)].map(match => plainText(match[1]))
    if (!titleMatch || !company || !location || !/^https:\/\/www\.jobs\.at\/i\/\d+/.test(titleMatch[1])) return null
    return fromPortalCard({
      title: plainText(titleMatch[2]), company, location, url: titleMatch[1], description: '',
      cardText: plainText(`${titleMatch[2]} ${pills.join(' ')}`),
    }, source, checkedAt)
  }).filter(Boolean)
}

function captureText(html, pattern) {
  return plainText(html.match(pattern)?.[1] ?? '')
}

function fromPortalCard(raw, source, checkedAt) {
  const cardText = raw.cardText
  const employmentType = []
  if (/geringfügig|minijob/i.test(raw.title) || (/geringfügig/i.test(cardText) && !/teilzeit\s*\/\s*geringfügig/i.test(cardText))) employmentType.push('Geringfügig')
  if (/teilzeit/i.test(cardText)) employmentType.push('Teilzeit')
  if (/vollzeit/i.test(cardText)) employmentType.push('Vollzeit')
  if (!employmentType.length) employmentType.push('Vollzeit')
  const hours = raw.title.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:Std\.?|Stunden|Wochenstunden)/i)
  const hoursPerWeek = hours ? Number(hours[2] ?? hours[1]) : undefined
  const salaryMatch = cardText.match(/(?:ab\s+)?[€]?\s*[\d.]+(?:,\d+)?\s*€?\s*(?:brutto\s*)?(?:pro\s+(?:Monat|Stunde|Jahr)|monatlich|jährlich)/i)
  const salary = salaryMatch ? salaryMatch[0].replace(/^\s+|\s+$/g, '') : 'im Inserat nicht konkret angegeben'
  const driveMinutes = placeTravelMinutes[normalize(raw.location)] ?? 45
  const description = raw.description || raw.title
  const morningFriendly = /vormittag|bis\s*13|05[:.]?\d{2}|06[:.]?\d{2}/i.test(`${raw.title} ${description}`)
  const weekendRequired = /samstag|sonntag|wochenend/i.test(`${raw.title} ${description}`)
  const requirements = sentences(raw.description).filter(sentence => /erforderlich|voraus|kenntnis|erfahrung|ausbildung|abschluss|von vorteil/i.test(sentence))
  const tasks = sentences(raw.description).filter(sentence => !requirements.includes(sentence)).slice(0, 3)
  const job = {
    title: raw.title, company: raw.company, location: raw.location,
    distanceKm: Math.round(driveMinutes * .75), driveMinutes,
    employmentType: [...new Set(employmentType)], hoursPerWeek,
    schedule: hoursPerWeek ? `${employmentType.join(' · ')} · bis ${hoursPerWeek} Std./Woche` : `${employmentType.join(' · ')} · genaue Zeiten laut Inserat`,
    morningFriendly, weekendRequired, salary, description,
    fitReasons: [], concerns: buildConcerns({ morningFriendly, weekendRequired, salary }),
    requirements: requirements.length ? requirements : ['Anforderungen bitte in der Originalanzeige prüfen'],
    tasks: tasks.length ? tasks : ['Aufgaben bitte in der Originalanzeige prüfen'],
    source: source.name, sourceUrl: new URL(raw.url, source.url).href, applyUrl: new URL(raw.url, source.url).href,
    checkedAt, status: 'active',
  }
  job.fitScore = scoreJob(job)
  job.fitReasons = buildReasons(job)
  job.id = stableId(job)
  return job
}

function sentences(value) {
  return plainText(value).split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(sentence => sentence.length > 12)
}

function buildConcerns({ morningFriendly, weekendRequired, salary }) {
  const concerns = []
  if (!morningFriendly) concerns.push('Vormittagszeiten müssen direkt abgeklärt werden')
  if (weekendRequired) concerns.push('Das Inserat nennt Wochenend- oder Samstagsarbeit')
  if (salary.startsWith('im Inserat')) concerns.push('Gehalt ist in der Übersicht nicht konkret ausgewiesen')
  return concerns
}

function buildReasons(job) {
  const reasons = []
  if (job.driveMinutes <= 25) reasons.push(`Kurze Fahrt von ungefähr ${job.driveMinutes} Minuten`)
  if (job.employmentType.includes('Teilzeit')) reasons.push('Teilzeit ist ausgeschrieben')
  if (job.morningFriendly) reasons.push('Die genannten Zeiten liegen am Vormittag')
  if (/service|verkauf|kassa|empfang|rezeption/i.test(job.title)) reasons.push('Die bisherige Gastro-Erfahrung ist gut übertragbar')
  return reasons.length ? reasons : ['Die Stelle liegt grundsätzlich im gewünschten Suchgebiet']
}
