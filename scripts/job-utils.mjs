import { createHash } from 'node:crypto'

export const placeTravelMinutes = {
  'st stefan im rosental': 3,
  'st. stefan im rosental': 3,
  'sankt stefan im rosental': 3,
  'kirchbach in der steiermark': 11,
  'kirchbach': 11,
  'paldau': 14,
  'feldbach': 18,
  'muhldorf bei feldbach': 23,
  'mureck': 29,
  'gnas': 14,
  'mettersdorf am sassbach': 20,
  'prosdorf': 18,
  'jagerberg': 14,
  'sankt georgen an der stiefing': 25,
  'wolfsberg im schwarzautal': 18,
  'bad gleichenberg': 24,
  'kirchberg an der raab': 15,
  'sankt peter am ottersbach': 17,
  'sankt anna am aigen': 31,
  'straden': 24,
  'deutsch goritz': 28,
  'halbenrain': 34,
  'riegersburg': 27,
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

const broadRegionalLocations = new Set([
  'sudoststeiermark',
  'region sudoststeiermark',
  'bezirk sudoststeiermark',
])

export function travelForLocation(value = '') {
  const normalized = normalize(value)
  if (placeTravelMinutes[normalized] !== undefined) {
    return { driveMinutes: placeTravelMinutes[normalized], distanceEstimated: false }
  }

  const matches = Object.entries(placeTravelMinutes)
    .filter(([place]) => new RegExp(`(?:^| )${escapeRegex(place)}(?: |$)`).test(normalized))
    .map(([, minutes]) => minutes)
  if (matches.length) return { driveMinutes: Math.min(...matches), distanceEstimated: true }

  if (broadRegionalLocations.has(normalized) || /sudoststeiermark/.test(normalized)) {
    return { driveMinutes: 40, distanceEstimated: true }
  }

  return { driveMinutes: 60, distanceEstimated: true }
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
  const location = [...new Set(String(job.location ?? '').split(/\s*[,/]\s*/).map(part => normalize(part)).filter(Boolean))].sort().join(' ')
  const title = normalize(job.title)
    .replace(/\b(mitarbeiter|mitarbeiterin|mitarbeiterinnen|in|innen|teilzeit|vollzeit|geringfugig|all genders|alle geschlechter)\b/g, ' ')
    .replace(/\b\d+(?: \d+)? (?:std|stunden|wochenstunden|h)\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(new RegExp(`\\b${escapeRegex(location)}\\b`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const company = normalize(job.company).replace(/\b(gmbh|ag|kg|mbh|gesellschaft m b h|gesellschaft b h)\b/g, ' ').replace(/\s+/g, ' ').trim()
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
  const aliases = new Map()
  for (const job of jobs) {
    const canonicalAlias = `canonical:${canonicalKey(job)}`
    const sourceAlias = sourceIdentity(job)
    const key = (sourceAlias && aliases.get(sourceAlias)) ?? aliases.get(canonicalAlias) ?? sourceAlias ?? canonicalAlias
    const current = chosen.get(key)
    if (!current) {
      chosen.set(key, { ...job, id: job.id ?? stableId(job) })
      aliases.set(canonicalAlias, key)
      if (sourceAlias) aliases.set(sourceAlias, key)
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
    aliases.set(canonicalAlias, key)
    if (sourceAlias) aliases.set(sourceAlias, key)
  }
  return [...chosen.values()]
}

function sourceIdentity(job) {
  if (!job.sourceJobId) return undefined
  let provider = job.provider
  if (!provider) {
    try { provider = new URL(job.sourceUrl).hostname } catch { provider = job.source }
  }
  return `source:${normalize(provider)}:${String(job.sourceJobId)}`
}

function completeness(job) {
  return ['schedule', 'requirements', 'tasks', 'contact', 'expiresAt'].reduce((sum, field) => sum + (job[field] && (!Array.isArray(job[field]) || job[field].length) ? 1 : 0), isConcrete(job.salary) ? 1 : 0)
}

function isConcrete(value) {
  return Boolean(value && !String(value).startsWith('im Inserat'))
}

function isDetailUrl(value = '') {
  return /karriere\.at\/jobs\/\d+|jobs\.at\/i\/\d+|willhaben\.at\/jobs\/job\/[^/]+\/\d+|legenstein\.at\/(?:jobs|offene-stellen)\//.test(value)
}

export function scoreJob(job) {
  let score = 35
  const type = (job.employmentType ?? []).join(' ').toLowerCase()
  const text = normalize(`${job.title} ${job.description ?? ''} ${job.schedule ?? ''}`)
  const nightConflict = /nachtschicht|nachtarbeit|nachtdienst|nachtschicht/.test(text)
  if (type.includes('gering')) score += 22
  else if (type.includes('teilzeit')) score += 18
  else if (type.includes('vollzeit')) score -= 20
  if (!nightConflict && (job.morningFriendly || /vormittag|bis 13|05 30 13 30|06 00 12/.test(text))) score += 24
  if (nightConflict) score -= 35
  if (job.weekendRequired) score -= 24
  if (job.driveMinutes <= 15) score += 14
  else if (job.driveMinutes <= 25) score += 9
  else if (job.driveMinutes <= 40) score += 3
  else score -= 25
  if (/buro|assistenz|verwaltung|rezeption|empfang|kassa|service|verkauf|reinigung/.test(text)) score += 8
  if (/elektro|ingenieur|arzt|tierarzt|pflegefach|leiter|programmierer|techniker|sozialpadagog|fachassistenz|ki enabler|fachkraft fur/.test(text)) score -= 24
  if (isConcrete(job.salary)) score += 2
  return Math.max(1, Math.min(99, score))
}

export function matchTier(job) {
  const type = (job.employmentType ?? []).join(' ').toLowerCase()
  const title = normalize(job.title)
  const text = normalize(`${job.title} ${job.description ?? ''}`)
  const hasUsefulHours = type.includes('teilzeit') || type.includes('gering') || job.morningFriendly
  const nightConflict = /nachtschicht|nachtarbeit|nachtdienst|nachtschicht/.test(normalize(`${text} ${job.schedule ?? ''}`))
  const profileRelevant = /aushilfe|buro|assistenz|verwaltung|rezeption|empfang|portier|kassa|service|verkauf|reinigung|kellner|gastronomie|tankstell|modeberater|einrichtungsberater/.test(title)
  const specialistRole = /radiologie|pflege|sozialpadagog|psycholog|arzt|tierarzt|tischler|monteur|techniker|ingenieur|fachassistenz|familienentlast/.test(title)
  return job.fitScore >= 65 && hasUsefulHours && profileRelevant && !specialistRole && !job.weekendRequired && !nightConflict ? 'top' : 'review'
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
  const plainSections = extractPlainJobSections(posting?.description ?? '')
  const detailText = plainText(descriptionHtml)
  const email = descriptionHtml.match(/mailto:([^"'?#\s<]+)/i)?.[1] ?? posting?.hiringOrganization?.contactPoint?.email
  const phone = descriptionHtml.match(/tel:([^"'?\s<]+)/i)?.[1] ?? posting?.hiringOrganization?.contactPoint?.telephone
  const contactName = cleanContactName(posting?.hiringOrganization?.contactPoint?.name)
  const existingContactName = cleanContactName(job.contact?.name)
  const escapedApplyUrl = String(html).match(/"applyUrl":"((?:\\.|[^"\\])*)"/)?.[1]
  let applyUrl = job.applyUrl
  if (escapedApplyUrl && /karriere\.at|jobs\.at/.test(job.sourceUrl)) {
    try { applyUrl = JSON.parse(`"${escapedApplyUrl}"`) } catch { /* Keep the public detail URL if embedded state is malformed. */ }
  }
  const salaryValue = posting?.baseSalary?.value?.value ?? posting?.baseSalary?.value?.minValue
  const rawEmployment = Array.isArray(posting?.employmentType) ? posting.employmentType : [posting?.employmentType].filter(Boolean)
  const detailEmployment = [...new Set(rawEmployment.map(type => /gering|mini/i.test(type) ? 'Geringfügig' : /part|teil/i.test(type) ? 'Teilzeit' : /full|voll/i.test(type) ? 'Vollzeit' : 'Unbekannt'))]
  const nightConflict = /nachtschicht|nachtarbeit|nachtdienst|nachtschicht/i.test(detailText)
  const contact = {
    name: contactName ?? existingContactName,
    email: email ? decodeURIComponent(email) : job.contact?.email,
    phone: phone ? decodeURIComponent(phone) : job.contact?.phone,
  }
  const enriched = {
    ...job,
    tasks: sections.tasks.length ? sections.tasks : plainSections.tasks.length ? plainSections.tasks : job.tasks,
    requirements: sections.requirements.length ? sections.requirements : plainSections.requirements.length ? plainSections.requirements : job.requirements,
    description: detailText || job.description,
    contact: Object.values(contact).some(Boolean) ? contact : undefined,
    applyUrl,
    employmentType: detailEmployment.length ? detailEmployment : job.employmentType,
    salary: salaryValue && !isConcrete(job.salary) ? `ab € ${Number(salaryValue).toLocaleString('de-AT')} brutto` : job.salary,
    morningFriendly: !nightConflict && (job.morningFriendly || /vormittag|bis\s*13|05[:.]?\d{2}.{0,30}(?:12|13)[:.]?\d{2}|06[:.]?\d{2}.{0,30}(?:12|13)[:.]?\d{2}/i.test(detailText)),
    weekendRequired: job.weekendRequired || /samstag|sonntag|wochenend/i.test(detailText),
    postedAt: posting?.datePosted ?? job.postedAt,
    expiresAt: posting?.validThrough ?? job.expiresAt,
    checkedAt,
  }
  enriched.concerns = buildConcerns(enriched)
  enriched.fitScore = scoreJob(enriched)
  enriched.fitReasons = buildReasons(enriched)
  enriched.matchTier = matchTier(enriched)
  return enriched
}

function extractPlainJobSections(value = '') {
  const text = String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')
  const tasks = plainSection(text, /(?:ihre|deine|dein)?\s*(?:aufgaben|aufgabenbereich|aufgabengebiet)|was dich[^\n:.]{0,45}erwartet/i, /(?:ihr|dein|das)?\s*(?:profil|anforderungen?|voraussetzungen?)|was du[^\n:.]{0,45}mitbring/i)
  const requirements = plainSection(text, /(?:ihr|dein|das)?\s*(?:profil|anforderungen?|voraussetzungen?)|was du[^\n:.]{0,45}mitbring/i, /(?:wir bieten|unser angebot|bezahlung|entlohnung|benefits?|interesse|bewerbung)/i)
  return { tasks, requirements }
}

function plainSection(value, startPattern, endPattern) {
  const start = value.search(startPattern)
  if (start < 0) return []
  const afterHeading = value.slice(start).replace(startPattern, '').replace(/^\s*[-:]+\s*/, '')
  const end = afterHeading.search(endPattern)
  const section = afterHeading.slice(0, end >= 0 ? end : Math.min(afterHeading.length, 2200))
  return [...new Set(section.split(/\n|•|\s*\*\s+|\s+[–-]\s+/).map(item => plainText(item).replace(/^[*\-:]+\s*/, '')).filter(item => item.length >= 10 && item.length <= 260 && !/^(?:der stelle|vielseitig wie der handel)$/i.test(item)))].slice(0, 8)
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
  const employmentType = employment.map(type => /gering|mini/i.test(type) ? 'Geringfügig' : /part|teil/i.test(type) ? 'Teilzeit' : /full|voll/i.test(type) ? 'Vollzeit' : 'Unbekannt')
  const description = plainText(raw.description)
  const { driveMinutes, distanceEstimated } = travelForLocation(location)
  const salaryValue = raw.baseSalary?.value?.value ?? raw.baseSalary?.value?.minValue
  const salary = salaryValue ? `ab € ${Number(salaryValue).toLocaleString('de-AT')} brutto` : 'im Inserat nicht konkret angegeben'
  const job = {
    title: plainText(raw.title), company, location, distanceKm: Math.round(driveMinutes * .75), driveMinutes,
    distanceEstimated, employmentType: employmentType.length ? [...new Set(employmentType)] : ['Unbekannt'], schedule: 'Arbeitszeit laut Inserat',
    morningFriendly: !/nachtschicht|nachtarbeit|nachtdienst/i.test(description) && /vormittag|bis 13|06[:.]?00.{0,20}13[:.]?30/i.test(description), weekendRequired: /wochenend|samstag|sonntag/i.test(description),
    salary, fitReasons: [], concerns: [], requirements: [], tasks: [],
    source: source.name, sourceUrl: raw.url ?? source.url, applyUrl: raw.url ?? source.url,
    provider: source.provider ?? providerFromUrl(source.url), discoveryUrl: source.kind === 'discovery' ? source.url : undefined,
    postedAt: raw.datePosted, expiresAt: raw.validThrough, checkedAt, status: 'active', description,
  }
  job.fitScore = scoreJob(job)
  job.concerns = buildConcerns(job)
  job.fitReasons = buildReasons(job)
  job.matchTier = matchTier(job)
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
    if (!titleMatch || !company || !location || /jobalarm/i.test(location) || !/^https:\/\/www\.jobs\.at\/i\/\d+/.test(titleMatch[1])) return null
    return fromPortalCard({
      title: plainText(titleMatch[2]), company, location, url: titleMatch[1], description: '',
      cardText: plainText(`${titleMatch[2]} ${pills.join(' ')}`),
    }, source, checkedAt)
  }).filter(Boolean)
}

export function parseWillhaben(html, source, checkedAt) {
  const block = String(html).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!block) return []
  let entries = []
  try {
    entries = JSON.parse(block)?.props?.pageProps?.jobsSearchResultRoot?.data?.entries ?? []
  } catch {
    return []
  }

  return entries.filter(entry => !entry.isExpired && entry.id && entry.title && entry.company?.title).map(entry => {
    const locations = (entry.jobLocations ?? []).map(item => plainText(item.name)).filter(name => name && !/^österreich$/i.test(name))
    const location = locations.length ? locations.join(' / ') : 'Region Südoststeiermark'
    const url = `https://www.willhaben.at/jobs/job/${entry.slugTitle}/${entry.id}`
    const modes = entry.employmentModes?.join(' · ') || 'Arbeitszeit laut Inserat'
    const salary = willhabenSalary(entry)
    return fromPortalCard({
      title: plainText(entry.title), company: plainText(entry.company.title), location, url,
      description: plainText(`${entry.position ?? ''} ${entry.employmentTime ?? ''}`),
      cardText: plainText(`${entry.title} ${modes}`), salary, employmentModes: entry.employmentModes,
      sourceJobId: String(entry.id), postedAt: entry.firstPublishDate ?? entry.creationDate,
    }, source, checkedAt)
  })
}

function captureText(html, pattern) {
  return plainText(html.match(pattern)?.[1] ?? '')
}

function fromPortalCard(raw, source, checkedAt) {
  const cardText = raw.cardText
  const employmentType = (raw.employmentModes ?? []).map(type => /gering|mini/i.test(type) ? 'Geringfügig' : /teil|part/i.test(type) ? 'Teilzeit' : /voll|full/i.test(type) ? 'Vollzeit' : 'Unbekannt')
  if (!employmentType.length && (/geringfügig|minijob/i.test(raw.title) || (/geringfügig/i.test(cardText) && !/teilzeit\s*\/\s*geringfügig/i.test(cardText)))) employmentType.push('Geringfügig')
  if (!employmentType.includes('Teilzeit') && /teilzeit/i.test(cardText)) employmentType.push('Teilzeit')
  if (!employmentType.includes('Vollzeit') && /vollzeit/i.test(cardText)) employmentType.push('Vollzeit')
  if (!employmentType.length) employmentType.push('Unbekannt')
  const hours = raw.title.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:Std\.?|Stunden|Wochenstunden)/i)
  const hoursPerWeek = hours ? Number(hours[2] ?? hours[1]) : undefined
  const salaryMatch = cardText.match(/(?:ab\s+)?[€]?\s*[\d.]+(?:,\d+)?\s*€?\s*(?:brutto\s*)?(?:pro\s+(?:Monat|Stunde|Jahr)|monatlich|jährlich)/i)
  const salary = raw.salary ?? (salaryMatch ? salaryMatch[0].replace(/^\s+|\s+$/g, '') : 'im Inserat nicht konkret angegeben')
  const { driveMinutes, distanceEstimated } = travelForLocation(raw.location)
  const description = raw.description || raw.title
  const morningFriendly = !/nachtschicht|nachtarbeit|nachtdienst/i.test(`${raw.title} ${description}`) && /vormittag|bis\s*13|05[:.]?\d{2}.{0,30}(?:12|13)[:.]?\d{2}|06[:.]?\d{2}.{0,30}(?:12|13)[:.]?\d{2}/i.test(`${raw.title} ${description}`)
  const weekendRequired = /samstag|sonntag|wochenend/i.test(`${raw.title} ${description}`)
  const requirements = sentences(raw.description).filter(sentence => /erforderlich|voraus|kenntnis|erfahrung|ausbildung|abschluss|von vorteil/i.test(sentence))
  const tasks = sentences(raw.description).filter(sentence => !requirements.includes(sentence)).slice(0, 3)
  const job = {
    title: raw.title, company: raw.company, location: raw.location,
    distanceKm: Math.round(driveMinutes * .75), driveMinutes, distanceEstimated,
    employmentType: [...new Set(employmentType)], hoursPerWeek,
    schedule: hoursPerWeek ? `${employmentType.join(' · ')} · bis ${hoursPerWeek} Std./Woche` : `${employmentType.join(' · ')} · genaue Zeiten laut Inserat`,
    morningFriendly, weekendRequired, salary, description,
    fitReasons: [], concerns: buildConcerns({ morningFriendly, weekendRequired, salary, distanceEstimated, employmentType }),
    requirements: requirements.length ? requirements : ['Anforderungen bitte in der Originalanzeige prüfen'],
    tasks: tasks.length ? tasks : ['Aufgaben bitte in der Originalanzeige prüfen'],
    source: source.name, sourceUrl: new URL(raw.url, source.url).href, applyUrl: new URL(raw.url, source.url).href,
    provider: source.provider ?? providerFromUrl(source.url), discoveryUrl: source.url, sourceJobId: raw.sourceJobId,
    postedAt: raw.postedAt, checkedAt, status: 'active',
  }
  job.fitScore = scoreJob(job)
  job.fitReasons = buildReasons(job)
  job.matchTier = matchTier(job)
  job.id = stableId(job)
  return job
}

function providerFromUrl(value = '') {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return 'Direktquelle' }
}

function willhabenSalary(entry) {
  const salary = entry.salary
  const amount = salary && typeof salary === 'object'
    ? salary.value ?? salary.amount ?? salary.minValue
    : salary
  if (amount === undefined || amount === null || amount === '') return 'im Inserat nicht konkret angegeben'

  const rawAmount = plainText(amount)
  const normalizedAmount = /^\d{1,3}(?:\.\d{3})+$/.test(rawAmount)
    ? rawAmount.replace(/\./g, '')
    : rawAmount.includes(',')
      ? rawAmount.replace(/\./g, '').replace(',', '.')
      : rawAmount
  const numericAmount = Number(normalizedAmount)
  const displayAmount = Number.isFinite(numericAmount) ? numericAmount.toLocaleString('de-AT') : rawAmount
  if (!displayAmount) return 'im Inserat nicht konkret angegeben'

  const rawTimeFrame = [
    entry.salaryTimeFrame,
    entry.salaryTimeframe,
    entry.salary?.timeFrame,
    entry.salary?.timeframe,
    entry.salary?.type,
    entry.salaryType,
  ].find(value => plainText(value))
  const unit = willhabenSalaryUnit(rawTimeFrame)
  return `ab € ${displayAmount} brutto${unit ? `/${unit}` : ''}`
}

function willhabenSalaryUnit(value) {
  const timeFrame = normalize(value)
  if (/stund|hour/.test(timeFrame)) return 'Stunde'
  if (/monat|month/.test(timeFrame)) return 'Monat'
  if (/jahr|year|annual/.test(timeFrame)) return 'Jahr'
  if (/woch|week/.test(timeFrame)) return 'Woche'
  if (/tag|day/.test(timeFrame)) return 'Tag'
  return undefined
}

function cleanContactName(value) {
  const name = plainText(value).replace(/\b(?:undefined|null)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  return name || undefined
}

function sentences(value) {
  return plainText(value).split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(sentence => sentence.length > 12)
}

function buildConcerns({ morningFriendly, weekendRequired, salary, distanceEstimated, employmentType = [] }) {
  const concerns = []
  if (!morningFriendly) concerns.push('Vormittagszeiten müssen direkt abgeklärt werden')
  if (weekendRequired) concerns.push('Das Inserat nennt Wochenend- oder Samstagsarbeit')
  if (salary.startsWith('im Inserat')) concerns.push('Gehalt ist in der Übersicht nicht konkret ausgewiesen')
  if (distanceEstimated) concerns.push('Die Fahrzeit ist aus dem genannten Ort nur näherungsweise geschätzt')
  if (employmentType.includes('Unbekannt')) concerns.push('Beschäftigungsausmaß ist in der Übersicht nicht eindeutig angegeben')
  return concerns
}

function buildReasons(job) {
  const reasons = []
  if (job.driveMinutes <= 25) reasons.push(`Kurze Fahrt von ungefähr ${job.driveMinutes} Minuten`)
  else if (job.driveMinutes <= 40) reasons.push(`Fahrt liegt voraussichtlich innerhalb von ${job.driveMinutes} Minuten`)
  if (job.employmentType.includes('Teilzeit')) reasons.push('Teilzeit ist ausgeschrieben')
  if (job.employmentType.includes('Geringfügig')) reasons.push('Geringfügige Beschäftigung ist möglich')
  if (job.morningFriendly) reasons.push('Die genannten Zeiten liegen am Vormittag')
  if (/service|verkauf|kassa|empfang|rezeption/i.test(job.title)) reasons.push('Die bisherige Gastro-Erfahrung ist gut übertragbar')
  return reasons.length ? reasons : ['Die Stelle liegt grundsätzlich im gewünschten Suchgebiet']
}
