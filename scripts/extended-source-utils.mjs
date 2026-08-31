import {
  extractJobSections,
  matchTier,
  normalize,
  plainText,
  scoreJob,
  stableId,
  travelForLocation,
} from './job-utils.mjs'

const germanMonths = new Map([
  ['janner', 1], ['januar', 1], ['februar', 2], ['marz', 3], ['april', 4],
  ['mai', 5], ['juni', 6], ['juli', 7], ['august', 8], ['september', 9],
  ['oktober', 10], ['november', 11], ['dezember', 12],
])

/**
 * Parses the HTML-encoded Hydra result stored in steirerjobs.at's
 * `data-results` attribute. The listing endpoint is enough; no browser or
 * secondary API call is needed.
 */
export function parseSteirerJobs(html, source, checkedAt) {
  const encoded = String(html).match(/\bdata-results=(['"])([\s\S]*?)\1/i)?.[2]
  if (!encoded) return []

  let entries
  try {
    const payload = JSON.parse(decodeAttribute(encoded))
    entries = payload?.['hydra:member']
  } catch {
    return []
  }
  if (!Array.isArray(entries)) return []

  return entries.flatMap(entry => {
    const expiresAt = normalizeDeadline(
      entry.validThrough ?? entry.expiresAt ?? entry.expirationDate ?? entry.applicationDeadline,
      checkedAt,
    )
    if (entry.isExpired === true || entry.active === false || deadlinePassed(expiresAt, checkedAt)) return []

    const translation = entry.enabledTranslations?.find(item => item.locale === 'de') ?? entry.enabledTranslations?.[0]
    const detailHtml = translation?.introtext ?? translation?.introtextContent ?? ''
    const title = plainText(translation?.title ?? entry.title)
    const company = plainText(entry.companyProfile?.companyName)
    const location = plainText(entry.translatedJobLocation ?? entry.jobLocation ?? translation?.jobLocation)
    const sourceUrl = absoluteUrl(entry.url, source.url)
    if (!title || !company || !sourceUrl) return []

    return [buildJob({
      title,
      company,
      location: location || 'Region Südoststeiermark',
      employmentLabels: (entry.employmentTypes ?? []).map(item => item?.label).filter(Boolean),
      employmentText: entry.employmentTypesAsString,
      description: detailHtml,
      detailHtml,
      sourceUrl,
      applyUrl: sourceUrl,
      sourceJobId: entry.id ? String(entry.id) : undefined,
      postedAt: entry.customDatePosted ?? entry.datePosted,
      expiresAt,
    }, source, checkedAt)]
  })
}

/**
 * Parses the server-rendered Bootstrap accordion on company profile pages of
 * meinjob-suedoststeiermark.at. Entries with a labelled past application
 * deadline are deliberately omitted.
 */
export function parseMeinJobSuedoststeiermark(html, source, checkedAt) {
  const document = String(html)
  const jobsStart = document.search(/id=['"]job-div['"]/i)
  if (jobsStart < 0) return []
  const jobsEnd = document.indexOf('jobs-legende', jobsStart)
  const area = document.slice(jobsStart, jobsEnd > jobsStart ? jobsEnd : document.length)
  const starts = [...area.matchAll(/<div\s+class=['"]card mb-1['"]/gi)].map(match => match.index)
  const company = plainText(document.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || plainText(source.name)
  const fallbackLocation = source.location ?? locationFromDocument(document) ?? 'Region Südoststeiermark'

  return starts.flatMap((start, index) => {
    const card = area.slice(start, starts[index + 1] ?? area.length)
    const title = plainText(card.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1])
    const headingId = card.match(/<div\b[^>]*class=['"][^'"]*card-header[^'"]*['"][^>]*\bid=['"]([^'"]+)['"]/i)?.[1]
      ?? card.match(/\bid=['"](heading-[^'"]+)['"]/i)?.[1]
    if (!title) return []
    const location = locationFromDocument(title) ?? locationFromDocument(card) ?? fallbackLocation

    const expiresAt = extractDeadline(card, checkedAt)
    if (deadlinePassed(expiresAt, checkedAt)) return []
    const applyUrl = anchorByText(card, /für die stelle bewerben/i, source.url)
    const sourceUrl = headingId ? withFragment(source.url, headingId) : source.url

    return [buildJob({
      title,
      company,
      location,
      description: card,
      detailHtml: card,
      sourceUrl,
      applyUrl: applyUrl ?? sourceUrl,
      sourceJobId: headingId?.replace(/^heading-/, ''),
      expiresAt,
      contact: contactFromHtml(card),
    }, source, checkedAt)]
  })
}

/**
 * Parses the SSR HTML from the GO GNAS "Freie Arbeitsstellen" page. Each job
 * is a text section headed by an h2 with a stable fragment id.
 */
export function parseGoGnas(html, source, checkedAt) {
  const document = String(html)
  const pageHeading = document.search(/<h1\b[^>]*>\s*Freie Arbeitsstellen\s*<\/h1>/i)
  if (pageHeading < 0) return []
  const footer = document.indexOf('<footer', pageHeading)
  const area = document.slice(pageHeading, footer > pageHeading ? footer : document.length)
  const headings = [...area.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)]

  return headings.flatMap((heading, index) => {
    const attributes = heading[1]
    const id = attributes.match(/\bid=['"]([^'"]+)['"]/i)?.[1]
    const rawTitle = plainText(heading[2])
    const block = area.slice(heading.index, headings[index + 1]?.index ?? area.length)
    if (!id || !/class=['"][^'"]*tiptap/i.test(block) || /offene lehrstellen/i.test(rawTitle)) return []

    const contentText = plainText(block.slice(heading[0].length))
    if (contentText.length < 24) return []
    const expiresAt = extractDeadline(block, checkedAt)
    if (deadlinePassed(expiresAt, checkedAt)) return []

    const title = cleanGoGnasTitle(rawTitle)
    const company = companyFromGoGnas(block) ?? 'Betrieb laut GO GNAS'
    const location = locationFromDocument(block) ?? source.location ?? 'Gnas'
    const sourceUrl = withFragment(source.url, id)
    const contact = contactFromHtml(block)

    return [buildJob({
      title,
      company,
      location,
      description: block,
      detailHtml: block,
      sourceUrl,
      applyUrl: contact.email ? `mailto:${contact.email}` : sourceUrl,
      sourceJobId: id,
      expiresAt,
      contact,
    }, source, checkedAt)]
  })
}

function buildJob(raw, source, checkedAt) {
  const description = plainText(raw.description)
  const location = cleanLocation(raw.location)
  const employmentType = employmentTypes(raw.employmentLabels, raw.employmentText ?? `${raw.title} ${description}`)
  const hoursPerWeek = weeklyHours(`${raw.title} ${description}`)
  const salary = salaryFromText(description)
  const { driveMinutes, distanceEstimated } = travelForLocation(location)
  const details = jobSections(raw.detailHtml ?? raw.description)
  const morningFriendly = !/nachtschicht|nachtarbeit|nachtdienst/i.test(description)
    && /vormittag|bis\s*13|05[:.]?\d{2}.{0,30}(?:12|13)[:.]?\d{2}|06[:.]?\d{2}.{0,30}(?:12|13)[:.]?\d{2}/i.test(description)
  const weekendRequired = /samstag|sonntag|wochenend/i.test(description)
  const provider = source.provider ?? providerFromUrl(source.url)
  const contact = raw.contact && Object.values(raw.contact).some(Boolean) ? raw.contact : undefined

  const job = {
    title: raw.title,
    company: raw.company,
    location,
    distanceKm: Math.round(driveMinutes * .75),
    driveMinutes,
    distanceEstimated,
    employmentType,
    ...(hoursPerWeek ? { hoursPerWeek } : {}),
    schedule: hoursPerWeek
      ? `${employmentType.join(' · ')} · ${hoursPerWeek} Std./Woche`
      : `${employmentType.join(' · ')} · genaue Zeiten laut Inserat`,
    morningFriendly,
    weekendRequired,
    salary,
    fitReasons: [],
    concerns: concernsFor({ morningFriendly, weekendRequired, salary, expiresAt: raw.expiresAt }),
    requirements: details.requirements.length ? details.requirements : ['Anforderungen bitte in der Originalanzeige prüfen'],
    tasks: details.tasks.length ? details.tasks : ['Aufgaben bitte in der Originalanzeige prüfen'],
    source: source.name,
    sourceUrl: raw.sourceUrl,
    applyUrl: raw.applyUrl,
    provider,
    discoveryUrl: source.url,
    sourceJobId: raw.sourceJobId,
    postedAt: raw.postedAt,
    expiresAt: raw.expiresAt,
    checkedAt,
    status: 'active',
    description,
    ...(contact ? { contact } : {}),
  }
  job.fitScore = scoreJob(job)
  job.fitReasons = reasonsFor(job)
  job.matchTier = matchTier(job)
  job.id = stableId(job)
  return job
}

function cleanLocation(value = '') {
  const locations = plainText(value).split(/\s*[,/]\s*/).map(item => item.trim()).filter(Boolean)
  const seen = new Set()
  return locations.filter(item => {
    const key = normalize(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(' / ') || 'Region Südoststeiermark'
}

function employmentTypes(labels = [], fallback = '') {
  const values = labels.length ? labels : String(fallback).split(/[|·,/]/)
  const result = []
  for (const value of values) {
    if (/\b(?:geringfügig|geringfuegig|minijob)\b/i.test(value)) result.push('Geringfügig')
    if (/\b(?:teilzeit|part[- ]?time)\b/i.test(value)) result.push('Teilzeit')
    if (/\b(?:vollzeit|full[- ]?time)\b/i.test(value)) result.push('Vollzeit')
  }
  return [...new Set(result.length ? result : ['Unbekannt'])]
}

function weeklyHours(value = '') {
  const match = String(value).match(/(\d{1,2}(?:[,.]\d{1,2})?)(?:\s*[-–]\s*(\d{1,2}(?:[,.]\d{1,2})?))?\s*(?:wochenstunden|stunden(?:\s+pro\s+woche|\s+woche)?|std\.?)/i)
  if (!match) return undefined
  return Number(String(match[2] ?? match[1]).replace(',', '.'))
}

function salaryFromText(value = '') {
  const text = String(value)
  const match = text.match(/(?:ab\s*)?(?:€|EUR)?\s*\d{1,3}(?:[.\s]\d{3})*\s*(?:,\s*-|,\d{1,2})?\s*(?:€|EUR)(?:\s*brutto)?(?:[^.;]{0,45}(?:monat|stunde|jahr|vollzeit))?/i)
    ?? text.match(/(?:€|EUR)\s*\d+(?:[.,]\d{1,2})?(?:\s*brutto)?(?:[^.;]{0,45}(?:monat|stunde|jahr|vollzeit))?/i)
  return match ? plainText(match[0]) : 'im Inserat nicht konkret angegeben'
}

function jobSections(html = '') {
  const structured = extractJobSections(html)
  const result = { tasks: [...structured.tasks], requirements: [...structured.requirements] }
  const tokens = [...String(html).matchAll(/<(h[2-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
  let mode
  for (const token of tokens) {
    const text = plainText(token[2]).replace(/^[•·-]\s*/, '')
    if (!text) continue
    const normalized = normalize(text)
    if (/^(?:ihre|deine|dein)?\s*(?:aufgaben|aufgabenbereich|aufgabengebiet|tatigkeit)/.test(normalized)) {
      mode = 'tasks'
      addAfterLabel(result.tasks, text)
      continue
    }
    if (/^(?:(?:ihr|dein)\s+)?(?:profil|anforderungen?|voraussetzungen?|mitbringen)|^(?:das\s+)?bringst du mit|^was du mitbringst/.test(normalized)) {
      mode = 'requirements'
      addAfterLabel(result.requirements, text)
      continue
    }
    if (/^(?:wir bieten|bezahlung|entlohnung|kontakt|bewirb|bewerbung|dienstbeginn)/.test(normalized)) {
      mode = undefined
      continue
    }
    if (mode && (token[1].toLowerCase() === 'li' || /^[•·-]/.test(plainText(token[2])))) result[mode].push(text)
  }

  const flat = plainText(html)
  addInlineSection(result.tasks, flat, /(?:Aufgabengebiet|Aufgabenbereich|Ihre Aufgaben|Deine Aufgaben)\s*:/i, /(?:Dein Profil|Ihr Profil|Anforderungen?|Wir bieten)\s*:/i)
  addInlineSection(result.requirements, flat, /(?:Dein Profil|Ihr Profil|Anforderungen?|Voraussetzungen?|Das bringst du mit|Was du mitbringst)\s*:/i, /(?:Wir bieten|Bezahlung|Entlohnung|Kontakt)\s*:/i)
  if (!result.tasks.length && !result.requirements.length) {
    result.tasks.push(...[...String(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => plainText(match[1])))
  }
  result.tasks = uniqueUseful(result.tasks)
  result.requirements = uniqueUseful(result.requirements)
  return result
}

function addAfterLabel(target, value) {
  const content = value.split(':').slice(1).join(':').trim()
  if (!content) return
  for (const part of content.split(/\s*;\s*/)) {
    if (/^(?:(?:dein|ihr|das)\s+)?(?:profil|anforderungen?|voraussetzungen?|mitbringen)|^wir bieten/i.test(normalize(part))) break
    target.push(part)
  }
}

function addInlineSection(target, value, startPattern, endPattern) {
  const start = value.search(startPattern)
  if (start < 0) return
  const afterLabel = value.slice(start).replace(startPattern, '')
  const end = afterLabel.search(endPattern)
  const content = afterLabel.slice(0, end >= 0 ? end : Math.min(afterLabel.length, 900))
  target.push(...content.split(/\s*[;•]\s*/))
}

function uniqueUseful(values) {
  return [...new Set(values.map(value => plainText(value)).filter(value => value.length >= 8))].slice(0, 8)
}

function concernsFor({ morningFriendly, weekendRequired, salary, expiresAt }) {
  const concerns = []
  if (!morningFriendly) concerns.push('Vormittagszeiten müssen direkt abgeklärt werden')
  if (weekendRequired) concerns.push('Das Inserat nennt Wochenend- oder Samstagsarbeit')
  if (salary.startsWith('im Inserat')) concerns.push('Gehalt ist in der Übersicht nicht konkret ausgewiesen')
  if (expiresAt) concerns.push(`Bewerbungsfrist: ${formatDate(expiresAt)}`)
  return concerns
}

function reasonsFor(job) {
  const reasons = []
  if (job.driveMinutes <= 25) reasons.push(`Kurze Fahrt von ungefähr ${job.driveMinutes} Minuten`)
  else if (job.driveMinutes <= 40) reasons.push(`Fahrt liegt voraussichtlich innerhalb von ${job.driveMinutes} Minuten`)
  if (job.employmentType.includes('Teilzeit')) reasons.push('Teilzeit ist ausgeschrieben')
  if (job.employmentType.includes('Geringfügig')) reasons.push('Geringfügige Beschäftigung ist möglich')
  if (job.morningFriendly) reasons.push('Die genannten Zeiten liegen am Vormittag')
  return reasons.length ? reasons : ['Die Stelle liegt grundsätzlich im gewünschten Suchgebiet']
}

function companyFromGoGnas(block) {
  const strong = [...String(block).matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)]
    .map(match => plainText(match[1]))
    .find(value => companyLike(value))
  if (strong) return strong.replace(/[.,;]+$/, '')

  const paragraphs = [...String(block).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => plainText(match[1]))
  return paragraphs.find(companyLike)?.replace(/[.,;]+$/, '')
}

function companyLike(value = '') {
  return /\b(?:gmbh|gesellschaft|kg|egen|lagerhaus|gemeinde|hotel|verein|autohaus|naturstein|rotes kreuz)\b/i.test(value)
    && value.length < 120
}

function contactFromHtml(html = '') {
  const emailHref = String(html).match(/href=['"]mailto:([^'"?\s]+)[^'"]*['"]/i)?.[1]
  const visibleEmail = plainText(html).match(/[\w.+-]+\s*(?:@|\(at\))\s*[\w.-]+\.[a-z]{2,}/i)?.[0]
  const phoneHref = String(html).match(/href=['"]tel:([^'"?]+)['"]/i)?.[1]?.trim()
  const phoneText = plainText(html).match(/(?:\+43|0)\s*[\d /-]{7,}/)?.[0]?.trim()
  const email = safeDecode(emailHref ?? visibleEmail ?? '').replace(/\s*\(at\)\s*/i, '@') || undefined
  const phone = safeDecode(phoneHref ?? phoneText ?? '') || undefined
  return { email, phone }
}

function safeDecode(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

function anchorByText(html, pattern, baseUrl) {
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!pattern.test(plainText(match[2]))) continue
    const href = match[1].match(/\bhref=['"]([^'"]+)['"]/i)?.[1]
    return absoluteUrl(href, baseUrl)
  }
  return undefined
}

function extractDeadline(value, checkedAt) {
  const text = plainText(value)
  const label = text.search(/bewerbung(?:sfrist|sschluss)|bewerbungen?\b[^.!?]{0,180}\bbis\b|bewirb(?:st| dich)?\b[^.!?]{0,50}\bbis\b/i)
  if (label < 0) return undefined
  return normalizeDeadline(text.slice(label, label + 380), checkedAt)
}

function normalizeDeadline(value, checkedAt) {
  if (!value) return undefined
  const text = plainText(value)
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const numeric = text.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})?\b/)
  const named = text.match(/\b(\d{1,2})\.\s*(Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(20\d{2})?\b/i)
  const match = numeric ?? named
  if (!match) return undefined

  const day = Number(match[1])
  const month = numeric ? Number(match[2]) : germanMonths.get(normalize(match[2]))
  const reference = validReferenceDate(checkedAt)
  let year = Number(match[3] ?? reference.getUTCFullYear())
  if (!match[3]) {
    const candidate = Date.UTC(year, month - 1, day)
    if (reference.getTime() - candidate > 180 * 86400000) year += 1
  }
  if (!validDateParts(year, month, day)) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function deadlinePassed(expiresAt, checkedAt) {
  if (!expiresAt) return false
  const reference = validReferenceDate(checkedAt).toISOString().slice(0, 10)
  return expiresAt < reference
}

function validReferenceDate(value) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function formatDate(value) {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function locationFromDocument(html = '') {
  const raw = String(html).match(/\b\d{4}\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß .-]{1,35})(?=<|,|\n)/)?.[1]
  if (raw) return plainText(raw)
  const text = plainText(html)
  const known = text.match(/\b(St\.?\s*Stefan im Rosental|Sankt Stefan im Rosental|Bad Radkersburg|Bad Gleichenberg|Kirchbach(?: in der Steiermark)?|Kirchberg an der Raab|Sankt Peter am Ottersbach|Mühldorf bei Feldbach|Riegersburg|Prosdorf|Straden|Fehring|Mureck|Paldau|Gleisdorf|Feldbach|Gnas)\b/i)?.[1]
  return known ? plainText(known) : undefined
}

function cleanGoGnasTitle(value = '') {
  return plainText(value).replace(/^\d+\s+/, '').replace(/\s+gesucht!?$/i, '').trim()
}

function withFragment(value, fragment) {
  try {
    const url = new URL(value)
    url.hash = fragment
    return url.href
  } catch {
    return value
  }
}

function absoluteUrl(value, baseUrl) {
  if (!value || value === '#') return undefined
  try { return new URL(value, baseUrl).href } catch { return undefined }
}

function providerFromUrl(value = '') {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return 'Direktquelle' }
}

function decodeAttribute(value) {
  return String(value)
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}
