import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalKey, dedupeJobs, jsonLdObjects, parseJobsAt, parseKarriereAt, scoreJob } from './job-utils.mjs'

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
