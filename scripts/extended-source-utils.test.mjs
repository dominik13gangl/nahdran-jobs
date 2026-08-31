import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseGoGnas,
  parseMeinJobSuedoststeiermark,
  parseSteirerJobs,
} from './extended-source-utils.mjs'

const checkedAt = '2026-08-31T12:00:00+02:00'

test('liest aktive Steirerjobs aus dem eingebetteten Hydra-Datensatz', () => {
  const fixture = steirerJobsFixture([
    {
      id: 138001,
      title: 'Mitarbeiter:in Empfang',
      companyProfile: { companyName: 'Testhotel GmbH' },
      customDatePosted: '2026-08-29T00:00:00+02:00',
      validThrough: '2026-09-15',
      employmentTypes: [{ label: 'Teilzeit' }],
      employmentTypesAsString: 'Teilzeit',
      jobLocation: 'Gnas',
      enabledTranslations: [{
        locale: 'de',
        title: 'Mitarbeiter:in Empfang',
        introtext: '<h3>Ihre Aufgaben</h3><ul><li>Gäste begrüßen</li></ul><h3>Ihr Profil</h3><ul><li>Freude am Kontakt</li></ul>',
      }],
      url: 'https://www.steirerjobs.at/jobs/mitarbeiter-in-empfang,138001?ref=gnas',
    },
    {
      id: 138002,
      title: 'Abgelaufene Stelle',
      companyProfile: { companyName: 'Alt GmbH' },
      applicationDeadline: '30. August 2026',
      jobLocation: 'Gnas',
      url: 'https://www.steirerjobs.at/jobs/abgelaufen,138002',
    },
  ])

  const [job] = parseSteirerJobs(fixture, {
    name: 'Steirerjobs Gnas',
    provider: 'steirerjobs.at',
    url: 'https://www.steirerjobs.at/jobs/gnas',
  }, checkedAt)

  assert.equal(parseSteirerJobs(fixture, { name: 'Steirerjobs', url: 'https://www.steirerjobs.at/jobs/gnas' }, checkedAt).length, 1)
  assert.equal(job.title, 'Mitarbeiter:in Empfang')
  assert.equal(job.sourceUrl, 'https://www.steirerjobs.at/jobs/mitarbeiter-in-empfang,138001?ref=gnas')
  assert.equal(job.applyUrl, job.sourceUrl)
  assert.equal(job.sourceJobId, '138001')
  assert.equal(job.expiresAt, '2026-09-15')
  assert.deepEqual(job.employmentType, ['Teilzeit'])
  assert.deepEqual(job.tasks, ['Gäste begrüßen'])
  assert.deepEqual(job.requirements, ['Freude am Kontakt'])
})

test('filtert bei MeinJob abgelaufene Akkordeon-Einträge und behält offizielle Links', () => {
  const fixture = `
    <h1>Marktgemeinde St. Stefan im Rosental</h1>
    <p>8083 St. Stefan im Rosental</p>
    <div id="job-div">
      <div class="card mb-1">
        <div class="card-header" id="heading-100"><a href="#collapse-100"><h4>Reinigungskraft</h4></a></div>
        <div id="collapse-100"><div class="card-body">
          <p><strong>Bewerbungsfrist: 15. September 2026</strong></p>
          <p>Teilzeit mit 20 Wochenstunden, Montag bis Freitag vormittags. Lohn/Gehalt ab € 1.500,00 brutto pro Monat.</p>
          <h3>Aufgabenbereich</h3><ul><li>Gemeinderäume reinigen</li></ul>
          <h3>Allgemeine Aufnahmevoraussetzungen</h3><ul><li>Verlässlichkeit und Sorgfalt</li></ul>
          <p>E-Mail: jobs(at)st.stefan.at</p>
          <a class="btn" href="https://st.stefan.at/bewerbung?id=100">Für die Stelle bewerben</a>
        </div></div>
      </div>
      <div class="card mb-1">
        <div class="card-header" id="heading-101"><a href="#collapse-101"><h4>Alte Stelle</h4></a></div>
        <div class="card-body"><p>Bewerbungsschluss: Freitag, 28. August 2026</p></div>
      </div>
      <div class="jobs-legende"></div>
    </div>`

  const jobs = parseMeinJobSuedoststeiermark(fixture, {
    name: 'MeinJob Südoststeiermark',
    provider: 'meinjob-suedoststeiermark.at',
    url: 'https://www.meinjob-suedoststeiermark.at/firmen/gemeinde-st-stefan?ref=nahdran',
  }, checkedAt)

  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].title, 'Reinigungskraft')
  assert.equal(jobs[0].company, 'Marktgemeinde St. Stefan im Rosental')
  assert.equal(jobs[0].location, 'St. Stefan im Rosental')
  assert.equal(jobs[0].sourceUrl, 'https://www.meinjob-suedoststeiermark.at/firmen/gemeinde-st-stefan?ref=nahdran#heading-100')
  assert.equal(jobs[0].applyUrl, 'https://st.stefan.at/bewerbung?id=100')
  assert.equal(jobs[0].contact.email, 'jobs@st.stefan.at')
  assert.equal(jobs[0].expiresAt, '2026-09-15')
  assert.deepEqual(jobs[0].employmentType, ['Teilzeit'])
  assert.equal(jobs[0].hoursPerWeek, 20)
})

test('liest GO-GNAS-Abschnitte aus SSR-HTML und lässt abgelaufene Stellen weg', () => {
  const fixture = `
    <main>
      <h1>Freie Arbeitsstellen</h1>
      <div class="text block-site-section"><div><h2 id="1-bueroassistenz">1 Büroassistenz gesucht!</h2>
        <div class="tiptap"><div class="tiptap-content">
          <p><strong>Beispielbetrieb GmbH</strong></p><p>Hauptplatz 1, 8342 Gnas</p>
          <p>Teilzeit 18,5 Wochenstunden, Montag bis Freitag vormittags.</p>
          <p>Aufgabengebiet: Telefon und Empfang; Ablage und Terminpflege; Dein Profil: MS Office; Freude am Kontakt; Wir bieten: € 1.250,00 brutto pro Monat.</p>
          <p>Bewerbungsfrist: 15. September 2026</p>
          <p>E-Mail: <a href="mailto:jobs@example.at">jobs@example.at</a></p>
        </div></div>
      </div></div>
      <div class="text block-site-section"><div><h2 id="1-alte-stelle">1 Alte Stelle</h2>
        <div class="tiptap"><div class="tiptap-content"><p><strong>Alt GmbH</strong></p><p>8342 Gnas</p><p>Bewerbungsschluss: 30.08.2026</p></div></div>
      </div></div>
    </main><footer></footer>`

  const jobs = parseGoGnas(fixture, {
    name: 'GO GNAS – Freie Arbeitsstellen',
    provider: 'Marktgemeinde Gnas',
    url: 'https://www.gnas.gv.at/sites/freie-arbeitsstellen?source=nahdran',
  }, checkedAt)

  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].title, 'Büroassistenz')
  assert.equal(jobs[0].company, 'Beispielbetrieb GmbH')
  assert.equal(jobs[0].location, 'Gnas')
  assert.equal(jobs[0].sourceUrl, 'https://www.gnas.gv.at/sites/freie-arbeitsstellen?source=nahdran#1-bueroassistenz')
  assert.equal(jobs[0].applyUrl, 'mailto:jobs@example.at')
  assert.equal(jobs[0].expiresAt, '2026-09-15')
  assert.equal(jobs[0].hoursPerWeek, 18.5)
  assert.deepEqual(jobs[0].tasks, ['Telefon und Empfang', 'Ablage und Terminpflege'])
  assert.deepEqual(jobs[0].requirements, ['MS Office', 'Freude am Kontakt'])
  assert.match(jobs[0].salary, /1\.250,00/)
})

test('liefert bei fehlenden Quellstrukturen leere Ergebnisse statt Fehlern', () => {
  const source = { name: 'Quelle', url: 'https://example.test/jobs' }
  assert.deepEqual(parseSteirerJobs('<html></html>', source, checkedAt), [])
  assert.deepEqual(parseMeinJobSuedoststeiermark('<html></html>', source, checkedAt), [])
  assert.deepEqual(parseGoGnas('<html></html>', source, checkedAt), [])
})

function steirerJobsFixture(entries) {
  const payload = JSON.stringify({
    '@context': '/contexts/JobOffer',
    '@type': 'hydra:Collection',
    'hydra:totalItems': entries.length,
    'hydra:member': entries,
  })
  const encoded = payload
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<section data-results="${encoded}"></section>`
}
