import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalKey, dedupeJobs, enrichPortalJob, extractJobSections, fromJsonLd, jsonLdObjects, karriereDetailState, matchTier, parseJobsAt, parseKarriereAt, parseWillhaben, scoreJob, travelForLocation } from './job-utils.mjs'

test('normalisiert geschlechtsneutrale Titel für Dubletten', () => {
  const a = { title: 'Verkäufer:in (m/w/d)', company: 'BILLA AG', location: 'Feldbach' }
  const b = { title: 'Verkäufer/in', company: 'Billa AG', location: 'Feldbach' }
  assert.equal(canonicalKey(a), canonicalKey(b))
})

test('behält bei Dubletten den vollständigeren Datensatz', () => {
  const base = { title: 'Büroassistenz', company: 'Test GmbH', location: 'Gnas' }
  const result = dedupeJobs([{ ...base, source: 'Portal' }, { ...base, source: 'Firma', salary: '€ 1.200', requirements: ['MS Office'] }])
  assert.equal(result.length, 1)
  assert.equal(result[0].source, 'Firma')
})

test('übernimmt bei Dubletten frische Detail-URL und konkretes Gehalt', () => {
  const base = { id: 'alt', title: 'Verkäufer:in', company: 'Billa AG', location: 'Feldbach', requirements: ['Erfahrung'], tasks: ['Kassa'], salary: 'im Inserat nicht konkret angegeben', sourceUrl: 'https://www.karriere.at/jobs/teilzeit/feldbach', applyUrl: 'https://www.karriere.at/jobs/teilzeit/feldbach' }
  const fresh = { title: 'Verkäufer/in', company: 'Billa AG', location: 'Feldbach', salary: 'ab 2.251 € monatlich', sourceUrl: 'https://www.karriere.at/jobs/123456', applyUrl: 'https://www.karriere.at/jobs/123456', checkedAt: '2026-08-31T12:00:00Z' }
  const [result] = dedupeJobs([base, fresh])
  assert.equal(result.id, 'alt')
  assert.equal(result.salary, 'ab 2.251 € monatlich')
  assert.equal(result.sourceUrl, 'https://www.karriere.at/jobs/123456')
  assert.deepEqual(result.requirements, ['Erfahrung'])
})

test('bevorzugt kurze Teilzeit am Vormittag', () => {
  const ideal = scoreJob({ title: 'Büroassistenz', employmentType: ['Teilzeit'], schedule: 'Mo-Fr vormittags bis 13:00', morningFriendly: true, weekendRequired: false, driveMinutes: 12 })
  const poor = scoreJob({ title: 'Elektro-Leitung', employmentType: ['Vollzeit'], schedule: 'Wochenenddienst', morningFriendly: false, weekendRequired: true, driveMinutes: 45 })
  assert.ok(ideal > poor)
})

test('liest JobPosting aus verschachteltem JSON-LD', () => {
  const html = '<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"Test"}]}</script>'
  assert.equal(jsonLdObjects(html).length, 1)
})

test('verwendet bei Karriere.at den strukturierten Detailstatus statt Template-Text', () => {
  const html = '<script>window.__data={"jobDetail":{"isInactive":false},"inactiveJobCupcake":{"text":"leider nicht mehr verfügbar"}}</script>'
  assert.equal(karriereDetailState(html), 'active')
  assert.equal(karriereDetailState(html.replace('"isInactive":false', '"isInactive":true')), 'inactive')
})

test('ordnet Ortsnamen mit Umlaut der regionalen Fahrzeit zu', () => {
  const job = fromJsonLd({
    '@type': 'JobPosting', title: 'Mitarbeiter:in Verkauf', employmentType: 'PART_TIME',
    hiringOrganization: { name: 'BIPA' }, jobLocation: { address: { addressLocality: 'Mühldorf Bei Feldbach' } },
  }, { name: 'Direktanzeige', url: 'https://example.test/job' }, '2026-08-31T12:00:00Z')
  assert.equal(job.driveMinutes, 23)
  assert.ok(job.fitScore >= 50)
})

test('liest eine karriere.at-Karte mit Gehalt und Kurzbeschreibung', () => {
  const html = `<li class="m-jobsList__item"><h2><a class="m-jobsListItem__titleLink" href="https://www.karriere.at/jobs/1">Verkäufer:in Fokus Kassa</a></h2><a class="m-jobsListItem__companyName" href="/f/billa">Billa AG</a><a class="m-jobsListItem__location" data-location="feldbach">Feldbach<span>, </span></a><span>Teilzeit ab 2.251 € monatlich</span><span class="m-jobListSummary__text">Kundenbetreuung ist Hauptaufgabe. Gastro-Erfahrung ist von Vorteil.</span></li>`
  const [job] = parseKarriereAt(html, { name: 'karriere.at', url: 'https://www.karriere.at/jobs' }, '2026-08-31T12:00:00Z')
  assert.equal(job.title, 'Verkäufer:in Fokus Kassa')
  assert.equal(job.location, 'Feldbach')
  assert.deepEqual(job.employmentType, ['Teilzeit'])
  assert.match(job.salary, /2\.251/)
  assert.equal(job.driveMinutes, 18)
  assert.ok(job.fitScore >= 50)
})

test('liest eine jobs.at-Karte und Stunden aus dem Titel', () => {
  const html = `<li data-job="123"><h2 data-job-title><a href="https://www.jobs.at/i/123">Verkäufer:In (m/w/d) Teilzeit (20 Std) – 8200 Gleisdorf</a></h2><a data-job-company>JYSK Österreich</a><ul data-job-location><li><a>Gleisdorf</a></li></ul><span class="j-c-pill-text">Teilzeit/geringfügig</span><span class="j-c-pill-text">ab 2.251€ pro Monat</span></li>`
  const [job] = parseJobsAt(html, { name: 'jobs.at', url: 'https://www.jobs.at/j/teilzeit/feldbach' }, '2026-08-31T12:00:00Z')
  assert.equal(job.company, 'JYSK Österreich')
  assert.equal(job.location, 'Gleisdorf')
  assert.equal(job.hoursPerWeek, 20)
  assert.deepEqual(job.employmentType, ['Teilzeit'])
  assert.equal(job.driveMinutes, 37)
  assert.match(job.salary, /2\.251/)
})

test('vereinheitlicht Portal-Titel mit Stunden und Rechtsformen', () => {
  const a = { title: 'Verkäufer:In (m/w/d) Teilzeit (20 Std) – 8200 Gleisdorf', company: 'JYSK Österreich GmbH', location: 'Gleisdorf' }
  const b = { title: 'Verkäufer/in', company: 'JYSK Österreich', location: 'Gleisdorf' }
  assert.equal(canonicalKey(a), canonicalKey(b))
})

test('ignoriert doppelt ausgegebene Ortsnamen bei Dubletten', () => {
  const a = { title: 'Mitarbeiter:in Verkauf', company: 'Test GmbH', location: 'Feldbach, Feldbach' }
  const b = { title: 'Mitarbeiter:in Verkauf', company: 'Test GmbH', location: 'Feldbach' }
  assert.equal(canonicalKey(a), canonicalKey(b))
})

test('erkennt unterschiedliche Schreibweisen derselben Firmenrechtsform', () => {
  const a = { title: 'Mitarbeiter:in Verkauf', company: 'BIPA Parfumerien Gesellschaft m.b.H.', location: 'Mühldorf bei Feldbach' }
  const b = { title: 'Mitarbeiter/in Verkauf', company: 'BIPA Parfümerien GmbH', location: 'Mühldorf bei Feldbach' }
  assert.equal(canonicalKey(a), canonicalKey(b))
})

test('behält eine Quellen-ID auch bei korrigiertem Arbeitsort als denselben Job', () => {
  const base = { title: 'Lagerarbeiter/in Kirchbach', company: 'Agrarunion Südost', provider: 'meinjob-suedoststeiermark.at', sourceJobId: '697', sourceUrl: 'https://example.test/firma#heading-697' }
  const jobs = dedupeJobs([{ ...base, location: 'Feldbach' }, { ...base, location: 'Kirchbach', checkedAt: '2026-08-31T12:00:00Z' }])
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].location, 'Kirchbach')
})

test('extrahiert Aufgaben und Anforderungen aus semantischen Abschnitten', () => {
  const html = `<h4>IHRE AUFGABEN</h4><ul><li>Kundinnen beraten</li><li>Waren präsentieren</li></ul><h4>IHR PROFIL</h4><ul><li>Freude am Umgang mit Menschen</li><li>Gastro-Erfahrung von Vorteil</li></ul>`
  assert.deepEqual(extractJobSections(html), {
    tasks: ['Kundinnen beraten', 'Waren präsentieren'],
    requirements: ['Freude am Umgang mit Menschen', 'Gastro-Erfahrung von Vorteil'],
  })
})

test('reichert einen Portaltreffer mit JSON-LD-Details an', () => {
  const base = { title: 'Verkäufer:in', company: 'JYSK', location: 'Gleisdorf', driveMinutes: 37, employmentType: ['Teilzeit'], schedule: 'Teilzeit', salary: 'im Inserat nicht konkret angegeben', morningFriendly: false, weekendRequired: false, tasks: ['Aufgaben bitte in der Originalanzeige prüfen'], requirements: ['Anforderungen bitte in der Originalanzeige prüfen'], concerns: [], fitReasons: [], sourceUrl: 'https://www.jobs.at/i/1' }
  const description = `<strong>WAS DICH IN DEINEM NÄCHSTEN JOB ERWARTET</strong><ul><li>Kund:innen beraten</li></ul><strong>WAS DU MITBRINGEN SOLLST</strong><ul><li>Freude am Kontakt</li></ul>`
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Verkäufer:in', description, baseSalary: { value: { value: 2251 } } })}</script><script>window.__data={"applyUrl":"https:\\/\\/bewerbung.example\\/job-1"}</script>`
  const result = enrichPortalJob(base, html, '2026-08-31T12:00:00Z')
  assert.deepEqual(result.tasks, ['Kund:innen beraten'])
  assert.deepEqual(result.requirements, ['Freude am Kontakt'])
  assert.match(result.salary, /2\D*251/)
  assert.equal(result.applyUrl, 'https://bewerbung.example/job-1')
})

test('entfernt undefined aus JSON-LD-Kontaktnamen und behält vorhandene Kontaktdaten', () => {
  const base = { title: 'Servicekraft', company: 'Test', location: 'Mureck', driveMinutes: 29, employmentType: ['Teilzeit'], schedule: 'Teilzeit', salary: 'im Inserat nicht konkret angegeben', morningFriendly: false, weekendRequired: false, tasks: ['Aufgaben prüfen'], requirements: ['Anforderungen prüfen'], concerns: [], fitReasons: [], sourceUrl: 'https://www.willhaben.at/jobs/job/servicekraft/123', applyUrl: 'https://www.willhaben.at/jobs/job/servicekraft/123', contact: { email: 'alt@example.at' } }
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Servicekraft', hiringOrganization: { contactPoint: { name: 'UNDEFINED Lena H.' } } })}</script>`
  const result = enrichPortalJob(base, html, '2026-08-31T12:00:00Z')
  assert.deepEqual(result.contact, { name: 'Lena H.', email: 'alt@example.at', phone: undefined })
})

test('unterdrückt leere oder ausschließlich undefined lautende Kontaktnamen', () => {
  const base = { title: 'Servicekraft', company: 'Test', location: 'Mureck', driveMinutes: 29, employmentType: ['Teilzeit'], schedule: 'Teilzeit', salary: 'im Inserat nicht konkret angegeben', morningFriendly: false, weekendRequired: false, tasks: ['Aufgaben prüfen'], requirements: ['Anforderungen prüfen'], concerns: [], fitReasons: [], sourceUrl: 'https://www.willhaben.at/jobs/job/servicekraft/123', applyUrl: 'https://www.willhaben.at/jobs/job/servicekraft/123' }
  for (const name of ['undefined', '   ']) {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Servicekraft', hiringOrganization: { contactPoint: { name } } })}</script>`
    assert.equal(enrichPortalJob(base, html, '2026-08-31T12:00:00Z').contact, undefined)
  }
})

test('übernimmt bei Willhaben keine fremde eingebettete Werbe-URL als Bewerbung', () => {
  const base = { title: 'Servicekraft', company: 'Test', location: 'Mureck', driveMinutes: 29, employmentType: ['Teilzeit'], schedule: 'Teilzeit', salary: 'im Inserat nicht konkret angegeben', morningFriendly: false, weekendRequired: false, tasks: ['Aufgaben prüfen'], requirements: ['Anforderungen prüfen'], concerns: [], fitReasons: [], sourceUrl: 'https://www.willhaben.at/jobs/job/servicekraft/123', applyUrl: 'https://www.willhaben.at/jobs/job/servicekraft/123' }
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Servicekraft', description: 'Ihre Aufgaben: Gäste begrüßen. Ihr Profil: Freude am Kontakt. Wir bieten ein gutes Team.' })}</script><script>window.__ad={"applyUrl":"https://werbung.example/bild"}</script>`
  const result = enrichPortalJob(base, html, '2026-08-31T12:00:00Z')
  assert.equal(result.applyUrl, base.applyUrl)
  assert.deepEqual(result.tasks, ['Gäste begrüßen.'])
  assert.deepEqual(result.requirements, ['Freude am Kontakt.'])
})

test('liest Willhaben-Treffer aus dem eingebetteten Next-Datenblock', () => {
  const data = {
    props: { pageProps: { jobsSearchResultRoot: { data: { entries: [{
      id: 13253194,
      title: 'Kellner (w/m/d)',
      slugTitle: 'kellner-w-m-d',
      firstPublishDate: '2026-08-31T08:00:00',
      isExpired: false,
      position: 'Mitarbeiter:in',
      jobLocations: [{ name: 'Österreich' }, { name: 'Feldbach' }, { name: 'Gnas' }],
      company: { title: 'DACH Gastro GmbH' },
      salary: 2026,
      salaryTimeFrame: 'monatlich',
      employmentModes: ['Geringfügig', 'Teilzeit'],
    }] } } } },
  }
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`
  const [job] = parseWillhaben(html, { name: 'willhaben Teilzeit', provider: 'willhaben.at', kind: 'discovery', url: 'https://www.willhaben.at/jobs/suche/teilzeit/suedoststeiermark' }, '2026-08-31T12:00:00Z')
  assert.equal(job.location, 'Feldbach / Gnas')
  assert.equal(job.driveMinutes, 14)
  assert.equal(job.distanceEstimated, true)
  assert.deepEqual(job.employmentType, ['Geringfügig', 'Teilzeit'])
  assert.equal(job.provider, 'willhaben.at')
  assert.equal(job.discoveryUrl, 'https://www.willhaben.at/jobs/suche/teilzeit/suedoststeiermark')
  assert.equal(job.sourceUrl, 'https://www.willhaben.at/jobs/job/kellner-w-m-d/13253194')
})

test('bildet Willhaben-Gehaltseinheiten korrekt ab und erfindet für unbekannte Einheiten keinen Monat', () => {
  const entries = [
    { id: 1, salary: 17.51, salaryTimeFrame: 'stündlich', expected: 'ab € 17,51 brutto/Stunde' },
    { id: 2, salary: 2251, salaryTimeFrame: 'monatlich', expected: `ab € ${Number(2251).toLocaleString('de-AT')} brutto/Monat` },
    { id: 3, salary: { value: 42000, type: 'yearly' }, expected: `ab € ${Number(42000).toLocaleString('de-AT')} brutto/Jahr` },
    { id: 4, salary: { amount: 600, timeframe: 'wöchentlich' }, expected: 'ab € 600 brutto/Woche' },
    { id: 5, salary: 33, salaryTimeFrame: 'nach Vereinbarung', expected: 'ab € 33 brutto' },
  ]
  const data = {
    props: { pageProps: { jobsSearchResultRoot: { data: { entries: entries.map(entry => ({
      ...entry,
      title: `Testjob ${entry.id}`,
      slugTitle: `testjob-${entry.id}`,
      isExpired: false,
      jobLocations: [{ name: 'Gnas' }],
      company: { title: 'Test GmbH' },
      employmentModes: ['Teilzeit'],
    })) } } } },
  }
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`
  const jobs = parseWillhaben(html, { name: 'willhaben', provider: 'willhaben.at', kind: 'discovery', url: 'https://www.willhaben.at/jobs/suche/suedoststeiermark' }, '2026-08-31T12:00:00Z')
  assert.deepEqual(jobs.map(job => job.salary), entries.map(entry => entry.expected))
})

test('behandelt fehlende Beschäftigungsart und unbekannte Orte nicht als Vollzeit oder erfundene 45 Minuten', () => {
  const job = fromJsonLd({ '@type': 'JobPosting', title: 'Aushilfe', hiringOrganization: { name: 'Test' }, jobLocation: { address: { addressLocality: 'Unbekannter Ort' } } }, { name: 'Direkt', url: 'https://example.test/jobs', kind: 'discovery' }, '2026-08-31T12:00:00Z')
  assert.deepEqual(job.employmentType, ['Unbekannt'])
  assert.equal(job.driveMinutes, 60)
  assert.equal(job.distanceEstimated, true)
  assert.deepEqual(travelForLocation('Region Südoststeiermark'), { driveMinutes: 40, distanceEstimated: true })
})

test('setzt Nachtschicht und explizites Wochenende nicht in die besten Treffer', () => {
  const night = { title: 'Produktionshelfer Nachtschicht', employmentType: ['Teilzeit'], schedule: '18:00–05:00', morningFriendly: false, weekendRequired: false, driveMinutes: 3, salary: '€ 2.400 brutto' }
  const weekend = { title: 'Reinigung', employmentType: ['Teilzeit'], schedule: 'vormittags', morningFriendly: true, weekendRequired: true, driveMinutes: 15, salary: '€ 2.100 brutto' }
  night.fitScore = scoreJob(night)
  weekend.fitScore = scoreJob(weekend)
  assert.equal(matchTier(night), 'review')
  assert.equal(matchTier(weekend), 'review')
})
