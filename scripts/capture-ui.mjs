// Screenshot capture of every app screen (change 011, FR-14 / AC-15).
//
// A review tool, not a gate (011 spec A1): it saves PNGs for a person to look
// at, and asserts nothing. It logs in against a RUNNING server, visits each
// FR-11 screen plus the shell with the mobile sidebar open, in light and dark,
// at 1440 px and 375 px wide.
//
// Usage (with `npm run test:e2e:serve` running on :3001):
//   node scripts/capture-ui.mjs                  → ui-captures/<YYYY-MM-DD>/
//   node scripts/capture-ui.mjs --out ui-captures/before
//
// Environment:
//   TEST_BASE_URL     server to capture (default http://localhost:3001)
//   CAPTURE_USERNAME  account to sign in as (default: the seeded E2E admin)
//   CAPTURE_PASSWORD  its password (default: the seeded E2E fixture password)
//   CAPTURE_TEAM      team to make active when a chooser appears (default Bistec)
//
// If the account can see no draft, one is generated through the mock seams
// (brand kit → brief → assemble-b), so run it against a MOCK_AI +
// MOCK_PUPPETEER server. Without the mocks the draft screen is skipped.
//
// After the screens, a `states` pass (change 033 T2) shoots the wizard steps, a
// kit's script font picker, both assistant drawers, the rule review panel,
// /admin/insights and the three draft notices. It needs the mock seams too. A
// state it cannot reach is logged as `skipped: <reason>` and listed in
// index.md; the run exits non-zero only on a crash. Locators are copied from
// the E2E suites (post-styles, surfaces, kit-upgrade, post-fonts, analytics,
// hero-image, headline-badge).
//
// Output goes to the gitignored ui-captures/ folder. Files are named
// <screen>-<theme>-<width>.png.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
// The seeded E2E fixture account (scripts/seed-admin.mjs), the same one the
// Playwright suite signs in with. Override for any other server.
const USERNAME = process.env.CAPTURE_USERNAME ?? 'admin@bisteccare.lk'
const PASSWORD = process.env.CAPTURE_PASSWORD ?? 'BistecStudio2026!'
const TEAM = process.env.CAPTURE_TEAM ?? 'Bistec'

const outArg = process.argv.indexOf('--out')
const OUT = resolve(
  outArg > -1 && process.argv[outArg + 1]
    ? process.argv[outArg + 1]
    : join('ui-captures', new Date().toISOString().slice(0, 10)),
)

const THEMES = ['light', 'dark']
const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
]

function log(msg) {
  console.log(`[capture-ui] ${msg}`)
}

// A fresh context per theme. The theme is set both ways the app reads it:
// the stored manual choice (themeInitScript reads `bistec-theme`) and the OS
// preference it falls back to.
async function newThemedContext(browser, theme) {
  const context = await browser.newContext({ baseURL: BASE, colorScheme: theme })
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('bistec-theme', t)
    } catch {
      // storage blocked: the colorScheme emulation still applies
    }
  }, theme)
  return context
}

async function signIn(page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(USERNAME)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  // A full navigation, so team resolution runs server-side against the fresh
  // session (same dance as the E2E suite's pageLogin).
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: TEAM }).click()
    await page.waitForURL((url) => url.pathname === '/')
  }
}

async function getJson(page, path) {
  const res = await page.request.get(path)
  if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}`)
  return res.json()
}

async function postJson(page, path, data) {
  const res = await page.request.post(path, { data })
  if (!res.ok()) throw new Error(`POST ${path} → ${res.status()}`)
  return res.json()
}

// The sample post the screens use, found by its own topic (never "the newest
// draft", so the states' notice drafts cannot leak in), or freshly generated.
const SAMPLE_TOPIC = 'UI capture sample post'
async function findOrCreateDraft(page) {
  const library = await getJson(
    page,
    `/api/library?pageSize=20&search=${encodeURIComponent(SAMPLE_TOPIC)}`,
  )
  const hit = library.drafts?.find((d) => d.brief?.topic === SAMPLE_TOPIC)
  if (hit) return hit.id

  log('no draft visible — generating one through the mock seams')
  try {
    const stamp = Date.now()
    const kit = await postJson(page, '/api/admin/brandkits', {
      name: `Capture kit ${stamp}`,
      colors: ['#211c18', '#f6f3ed'],
    })
    const brief = await postJson(page, '/api/briefs', {
      topic: SAMPLE_TOPIC,
      goal: 'Show the draft review screen',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      // The seeded keyless COPY row (scripts/seed-cli-provider.mjs).
      copyProviderKey: 'cli',
      brandKitId: kit.id,
    })
    const { draftId } = await postJson(page, '/api/generate/assemble-b', { briefId: brief.id })
    const deadline = Date.now() + 60_000
    for (;;) {
      const draft = await getJson(page, `/api/drafts/${draftId}`)
      if (draft.status && draft.status !== 'IN_PROGRESS') return draftId
      if (Date.now() > deadline) return draftId
      await page.waitForTimeout(500)
    }
  } catch (err) {
    log(`could not generate a draft (${err.message}) — the draft screen is skipped`)
    return null
  }
}

async function firstId(page, path) {
  try {
    const rows = await getJson(page, path)
    const list = Array.isArray(rows) ? rows : (rows.projects ?? [])
    return list[0]?.id ?? null
  } catch {
    return null
  }
}

// Let client data load and fonts settle before the shot.
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(300)
}

// Every PNG written, for index.md.
const written = []
// Every state the run could not reach: { state, reason }.
const skipped = []

async function shoot(page, file) {
  written.push(file)
  await settle(page)
  // `next dev` floats its own indicator over the page (bottom-left, over the
  // sidebar's Sign out); it is never in a production build, so keep it out of
  // the captures.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {})
  await page.screenshot({ path: join(OUT, file), fullPage: true, animations: 'disabled' })
  log(`saved ${file}`)
}

// ── The states pass (033 T2) ────────────────────────────────────────────────

const KIT_NAME = 'Capture states kit'
const PROJECT_NAME = 'Capture states project'
// kit-upgrade.test.ts HEARTS_TEXT: four vague phrases the rule panel flags.
const HEARTS_TEXT = [
  'Hearts Academy posts use a teal-to-green gradient.',
  'Place the Hearts Academy and BISTEC Global logos in a compact pill with similar visual heights.',
  'Keep generous clear space around the lockup.',
  'The teal-to-green gradient is the primary canvas, with navy for accent bands.',
  'The photo sits in its own panel, with a soft edge where the photo meets the type.',
  'IRP is fine on-image.',
].join(' ')
const WIZARD_PROMPT = 'Announce the new post styles with a short call to action for the team.'
const WIZARD_TOPIC = 'Capture wizard sample post'

// The three notice drafts: topic (the reuse key) and brief extras.
const NOTICE_DRAFTS = {
  // hero-image.test.ts TC-HERO-04: a busy hero image falls back to classic.
  'image-style-fallback': {
    topic: 'Capture image style fallback __MOCK_BG__ __MOCK_HERO_BUSY__',
    extra: { imageStyle: 'product-showcase' },
  },
  // post-styles.test.ts TC-PS-39: a figure that is not in the brief.
  'facts-flagged': {
    topic: 'Capture facts flagged __MOCK_FACT_PRICE__ __MOCK_FACT_DATE__',
    extra: { postStyle: 'promotion' },
  },
  // headline-badge.test.ts TC-HL-01: the headline is edited after the render.
  'headline-stale': {
    topic: 'Capture stale headline',
    extra: {},
    headline: 'A brand new headline',
  },
  // headline-badge.test.ts TC-HL-04: the headline is hidden in the design.
  'headline-unconfirmed': { topic: 'Capture hidden headline __MOCK_HEADLINE_HIDDEN__', extra: {} },
}

async function waitForSettled(page, draftId) {
  const deadline = Date.now() + 60_000
  for (;;) {
    const draft = await getJson(page, `/api/drafts/${draftId}`)
    if (draft.status && draft.status !== 'IN_PROGRESS') return draft
    if (Date.now() > deadline) throw new Error(`draft ${draftId} did not settle`)
    await page.waitForTimeout(500)
  }
}

async function findOrCreateNoticeDraft(page, kitId, spec) {
  const found = await getJson(
    page,
    `/api/library?pageSize=20&search=${encodeURIComponent(spec.topic)}`,
  )
  const hit = found.drafts?.find((d) => d.brief?.topic === spec.topic)
  if (hit) return hit.id
  const brief = await postJson(page, '/api/briefs', {
    topic: spec.topic,
    goal: 'awareness',
    tone: 'professional',
    channels: ['INSTAGRAM', 'LINKEDIN'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    brandKitId: kitId,
    ...spec.extra,
  })
  const { draftId } = await postJson(page, '/api/generate/assemble-b', { briefId: brief.id })
  const draft = await waitForSettled(page, draftId)
  if (spec.headline) {
    const res = await page.request.patch(`/api/drafts/${draftId}`, {
      data: { headline: spec.headline },
    })
    if (!res.ok()) throw new Error(`PATCH headline → ${res.status()}`)
  }
  if (draft.status !== 'EXPORTED') throw new Error(`draft settled as ${draft.status}`)
  return draftId
}

// The kit, the project and the notice drafts the states need, reused by name
// or topic so reruns do not pile up data. Failures are recorded per item.
async function prepareStateData(page) {
  const data = { kit: null, projectId: null, notices: {} }
  try {
    const kits = await getJson(page, '/api/admin/brandkits')
    data.kit = kits.find((k) => k.name === KIT_NAME) ?? null
    if (!data.kit) {
      data.kit = await postJson(page, '/api/admin/brandkits', {
        name: KIT_NAME,
        colors: ['#211c18', '#f6f3ed'],
        fonts: [{ name: 'DM Sans', url: 'https://fonts.googleapis.com/css2?family=DM+Sans' }],
      })
      await postJson(page, `/api/admin/brandkits/${data.kit.id}/prompts`, { content: HEARTS_TEXT })
    }
  } catch (err) {
    skipped.push({ state: 'kit data', reason: err.message })
    return data
  }
  try {
    const projects = await getJson(page, '/api/projects')
    let project = projects.find((p) => p.name === PROJECT_NAME)
    if (!project) {
      project = await postJson(page, '/api/projects', {
        name: PROJECT_NAME,
        defaultBrandKitId: data.kit.id,
      })
      await postJson(page, `/api/projects/${project.id}/briefing`, {
        content: 'A capture project for final-year students.',
      })
    }
    data.projectId = project.id
  } catch (err) {
    skipped.push({ state: 'project data', reason: err.message })
  }
  for (const [key, spec] of Object.entries(NOTICE_DRAFTS)) {
    try {
      data.notices[key] = await findOrCreateNoticeDraft(page, data.kit.id, spec)
    } catch (err) {
      skipped.push({ state: `draft ${key}`, reason: `could not be created: ${err.message}` })
    }
  }
  return data
}

const kitPanel = (page) => page.getByRole('region', { name: KIT_NAME, exact: true })

// surfaces.test.ts openKit (the kit list's row button, then the kit's heading).
async function openStatesKit(page) {
  await page.goto('/admin/brandkits')
  await page.getByRole('heading', { name: 'Brand kits', level: 1 }).waitFor()
  await page.getByRole('button', { name: new RegExp(`^${KIT_NAME}`) }).click()
  await page.getByRole('heading', { name: KIT_NAME, level: 2 }).waitFor()
}

// post-styles.test.ts openStepOne: step 0 -> Size & Design with the kit chosen.
async function openWizardStepOne(page, data) {
  await page.goto('/brief')
  await page.getByRole('heading', { name: 'Select a project' }).waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByRole('heading', { name: 'Size & Design' }).waitFor()
  const kit = page.getByRole('combobox', { name: 'Brand kit' })
  await kit.locator(`option[value="${data.kit.id}"]`).waitFor({ state: 'attached' })
  await kit.selectOption(data.kit.id)
}

// Each state: a name and a function that drives the page and calls snap(label)
// for every shot. snap writes <label>-<theme>-<width>.png.
const STATES = [
  {
    name: 'brief-steps',
    ready: (d) => d.kit,
    run: async (page, data, snap) => {
      await openWizardStepOne(page, data)
      // post-styles.test.ts TC-PS-31: Freeform, then a style that pre-fills a look.
      await page.getByRole('button', { name: /^Freeform/ }).click()
      await page.getByTestId('post-style-launch').click()
      await page.getByTestId('image-style-product-showcase').waitFor()
      await snap('brief-step1-size-design')
      await page.getByRole('button', { name: /continue/i }).click()
      await page.getByRole('heading', { name: 'Description & caption direction' }).waitFor()
      await page.getByPlaceholder('e.g. Q3 product launch').fill(WIZARD_TOPIC)
      await page.locator('textarea').fill(WIZARD_PROMPT)
      await snap('brief-step2-content')
      await page.getByRole('button', { name: /continue/i }).click()
      await page.getByRole('heading', { name: /Images/ }).waitFor()
      await snap('brief-step3-images')
      await page.getByRole('button', { name: /continue/i }).click()
      await page.getByRole('heading', { name: 'Review & Generate' }).waitFor()
      await snap('brief-step4-review')
    },
  },
  {
    name: 'kit-detail-script-fonts',
    ready: (d) => d.kit,
    run: async (page, data, snap) => {
      await openStatesKit(page)
      await snap('kit-detail')
      // post-fonts.test.ts TC-PF-02: Edit shows the Sinhala font picker.
      await kitPanel(page).getByRole('button', { name: 'Edit', exact: true }).click()
      await kitPanel(page).getByLabel('Sinhala font').waitFor()
      await snap('kit-detail-script-fonts')
    },
  },
  {
    name: 'kit-assistant-drawer',
    ready: (d) => d.kit,
    run: async (page, data, snap) => {
      await openStatesKit(page)
      // surfaces.test.ts (Brand kits T11): Extract from references opens the drawer.
      await page.getByRole('button', { name: 'Extract from references' }).click()
      const drawer = page.getByRole('dialog', { name: 'Extract brand from references' })
      await drawer.getByRole('button', { name: 'Add document' }).waitFor()
      await snap('kit-assistant-drawer')
      const ask = drawer.getByPlaceholder(
        'e.g. Extract the brand voice and style from these references',
      )
      await ask.fill('Extract the brand voice and style from these references')
      await ask.press('Enter')
      await drawer.getByRole('region', { name: 'Proposed brand' }).waitFor({ timeout: 30_000 })
      await snap('kit-assistant-drawer-proposal')
    },
  },
  {
    name: 'briefing-drawer',
    ready: (d) => d.projectId,
    run: async (page, data, snap) => {
      await page.goto(`/projects/${data.projectId}`)
      await page.getByRole('heading', { name: PROJECT_NAME, level: 1 }).waitFor()
      // surfaces.test.ts (project detail): Draft with AI opens the drawer.
      await page.getByRole('button', { name: 'Draft with AI' }).click()
      const drawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
      await drawer.getByRole('button', { name: 'Add document' }).waitFor()
      await snap('briefing-drawer')
      const ask = drawer.getByPlaceholder('Tell the assistant about this project…')
      await ask.fill('A capture project for final-year students.')
      await ask.press('Enter')
      await drawer
        .getByRole('button', { name: 'Apply this draft to the editor' })
        .waitFor({ timeout: 30_000 })
      await snap('briefing-drawer-reply')
    },
  },
  {
    name: 'rule-review-panel',
    ready: (d) => d.kit,
    run: async (page, data, snap) => {
      await openStatesKit(page)
      // kit-upgrade.test.ts TC-KU-07: Improve this version, then Upgrade.
      await page.getByRole('button', { name: 'Improve this version' }).click()
      const panel = page.getByRole('region', { name: 'Design rules' })
      await panel.getByRole('button', { name: 'Upgrade' }).click()
      await panel
        .getByRole('list', { name: 'Proposed edits' })
        .getByRole('listitem')
        .first()
        .waitFor({ timeout: 30_000 })
      await snap('rule-review-panel')
    },
  },
  {
    name: 'insights',
    run: async (page, data, snap) => {
      await page.goto('/admin/insights')
      await page.getByTestId('insights-body').waitFor({ timeout: 20_000 })
      await snap('insights')
    },
  },
  ...[
    // The notice locators: hero-image.test.ts TC-HERO-16 (composition-notice),
    // post-styles.test.ts TC-PS-39 (facts-check-notice), headline-badge.test.ts
    // TC-HL-01 and TC-HL-04 (headline-image-notice).
    ['image-style-fallback', 'composition-notice'],
    ['facts-flagged', 'facts-check-notice'],
    ['headline-stale', 'headline-image-notice'],
    ['headline-unconfirmed', 'headline-image-notice'],
  ].map(([key, testId]) => ({
    name: `notice-${key}`,
    ready: (d) => d.notices[key],
    run: async (page, data, snap) => {
      await page.goto(`/drafts/${data.notices[key]}`)
      await page.getByTestId(testId).waitFor({ timeout: 20_000 })
      await snap(`draft-notice-${key}`)
    },
  })),
  // 039 T3: the curated caption cards (curate Instagram on the facts-flagged post, so
  // the flagged-general line and the card's facts line show), then the deleted
  // card with its Undo. The delete is undone afterwards, so a rerun starts alike.
  // Mirrors curated-captions.test.ts TC-CUR-07 and TC-CUR-12.
  {
    name: 'curated-captions',
    ready: (d) => d.notices['facts-flagged'],
    run: async (page, data, snap) => {
      const id = data.notices['facts-flagged']
      await page.goto(`/drafts/${id}`)
      await page.getByRole('heading', { name: 'General caption', level: 3 }).waitFor({ timeout: 20_000 })
      const field = page.getByRole('textbox', { name: 'Instagram caption', exact: true })
      if ((await field.count()) === 0) {
        await page.getByRole('button', { name: 'Curate for Instagram' }).click()
        await field.waitFor({ timeout: 20_000 })
      }
      await snap('draft-captions-curated')
      await page.getByRole('button', { name: 'Delete Instagram caption' }).click()
      await page.getByRole('button', { name: 'Undo Instagram caption' }).waitFor({ timeout: 20_000 })
      await snap('draft-captions-deleted')
      await page.getByRole('button', { name: 'Undo Instagram caption' }).click()
      await field.waitFor({ timeout: 20_000 })
    },
  },
]

async function runStates(browser, data) {
  for (const theme of THEMES) {
    const context = await newThemedContext(browser, theme)
    const page = await context.newPage()
    await signIn(page)
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w.width, height: w.height })
      for (const state of STATES) {
        if (state.ready && !state.ready(data)) {
          if (!skipped.some((s) => s.state === state.name))
            skipped.push({ state: state.name, reason: 'its setup data could not be created' })
          continue
        }
        try {
          await state.run(page, data, async (label) => {
            await shoot(page, `${label}-${theme}-${w.name}.png`)
          })
        } catch (err) {
          const reason = String(err.message ?? err).split('\n')[0]
          log(`skipped: ${state.name} (${theme} ${w.name}): ${reason}`)
          skipped.push({ state: `${state.name} (${theme} ${w.name})`, reason })
        }
      }
    }
    await context.close()
  }
}

// The wizard autosaves an unfinished brief; delete the ones this run left.
async function discardWizardDrafts(page, before) {
  try {
    const body = await getJson(page, '/api/brief-drafts')
    for (const d of body.drafts ?? []) {
      if (!before.has(d.id)) await page.request.delete(`/api/brief-drafts/${d.id}`)
    }
  } catch {
    // best effort: a leftover brief draft only shows on the next wizard visit
  }
}

function writeIndex() {
  const lines = ['# UI capture index', '', `Base: ${BASE}`, '', `## Files (${written.length})`, '']
  for (const f of written) lines.push(`- ${f}`)
  lines.push('', `## Skipped states (${skipped.length})`, '')
  if (!skipped.length) lines.push('None.')
  for (const s of skipped) lines.push(`- skipped: ${s.state}: ${s.reason}`)
  writeFileSync(join(OUT, 'index.md'), `${lines.join('\n')}\n`)
  log(`wrote index.md (${written.length} files, ${skipped.length} skipped)`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  log(`capturing ${BASE} → ${OUT}`)
  const browser = await chromium.launch()

  try {
    // One setup context: the sample draft the screens use, then the data the
    // states need. Done once, so light and dark shoot the same draft.
    const prep = await newThemedContext(browser, 'light')
    const prepPage = await prep.newPage()
    await signIn(prepPage)
    const sampleDraftId = await findOrCreateDraft(prepPage)
    const stateData = await prepareStateData(prepPage)
    // null when the listing fails: the cleanup is then skipped, never run against an empty set.
    let draftsBefore = null
    try {
      draftsBefore = new Set(
        ((await getJson(prepPage, '/api/brief-drafts')).drafts ?? []).map((d) => d.id),
      )
    } catch (err) {
      log(`brief-drafts listing failed (${err.message}) — wizard cleanup skipped`)
    }
    await prep.close()

    for (const theme of THEMES) {
      // Logged out: the login page.
      const anon = await newThemedContext(browser, theme)
      const anonPage = await anon.newPage()
      for (const w of WIDTHS) {
        await anonPage.setViewportSize({ width: w.width, height: w.height })
        await anonPage.goto('/login')
        await shoot(anonPage, `login-${theme}-${w.name}.png`)
      }
      await anon.close()

      // Signed in: every app screen.
      const context = await newThemedContext(browser, theme)
      const page = await context.newPage()
      await page.setViewportSize({ width: 1440, height: 900 })
      await signIn(page)

      const draftId = sampleDraftId
      const projectId = await firstId(page, '/api/projects')

      const screens = [
        ['dashboard', '/'],
        ['library', '/library'],
        ['brief', '/brief'],
        draftId && ['draft', `/drafts/${draftId}`],
        ['projects', '/projects'],
        projectId && ['project-detail', `/projects/${projectId}`],
        ['brandkits', '/admin/brandkits'],
        ['team', '/team'],
        ['settings', '/settings'],
        ['admin-users', '/admin/users'],
        ['admin-teams', '/admin/teams'],
        ['choose-team', '/choose-team'],
      ].filter(Boolean)

      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w.width, height: w.height })
        for (const [name, path] of screens) {
          await page.goto(path)
          await shoot(page, `${name}-${theme}-${w.name}.png`)
        }
        if (w.width < 768) {
          // The shell with the mobile sidebar open.
          await page.goto('/')
          await settle(page)
          await page.getByRole('button', { name: 'Open sidebar' }).click()
          await page.getByRole('button', { name: 'Close sidebar' }).waitFor()
          await page.waitForTimeout(300)
          await page.screenshot({
            path: join(OUT, `shell-sidebar-open-${theme}-${w.name}.png`),
            animations: 'disabled',
          })
          written.push(`shell-sidebar-open-${theme}-${w.name}.png`)
          log(`saved shell-sidebar-open-${theme}-${w.name}.png`)
        }
      }
      await context.close()
    }

    await runStates(browser, stateData)
    if (draftsBefore) {
      const cleanup = await newThemedContext(browser, 'light')
      const cleanupPage = await cleanup.newPage()
      await signIn(cleanupPage)
      await discardWizardDrafts(cleanupPage, draftsBefore)
      await cleanup.close()
    }
  } finally {
    await browser.close()
  }
  writeIndex()
  log(`done: ${written.length} screenshots in ${OUT}`)
}

main().catch((err) => {
  console.error(`[capture-ui] failed: ${err.stack ?? err}`)
  process.exit(1)
})
