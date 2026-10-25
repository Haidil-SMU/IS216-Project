<style src="../assets/auth.css"></style>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, safeRedirect, homeFor } from '@/stores/auth'

const props = defineProps({
  mode: { type: String, default: 'login' },
})

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const isSignup = computed(() => props.mode === 'signup')
const form = ref({ name: '', email: '', password: '', confirm: '', remember: true })
const touched = ref({})
const submitted = ref(false)
const showPassword = ref(false)
const showConfirm = ref(false)
const capsLock = ref(false)
const busy = ref(false)
const success = ref(false)
const celebrate = ref(false)
// 'singpass' or 'corppass' while the browser is on its way to the login service.
const redirecting = ref('')
const ERRORS = {
  singpass: "Singpass login didn't go through. Please try again, or use your email instead.",
  corppass: "Corppass login didn't go through. Please try again.",
}
const error = ref(ERRORS[route.query.error] || '')

const redirect = computed(() => safeRedirect(route.query.redirect))
const singpassHref = computed(() => auth.singpassUrl(redirect.value, 'login'))
const corppassHref = computed(() => auth.corppassUrl(redirect.value))

// ------------------------------------------------------------
// Who are you? Homeowners use email/Singpass, contractors use Corppass.
// The choice lives in the URL (?as=contractor) and is remembered on this device.
// ------------------------------------------------------------
const ROLE_KEY = 'ecohome.authRole'
function readSavedRole() {
  try {
    return localStorage.getItem(ROLE_KEY) === 'contractor' ? 'contractor' : 'client'
  } catch {
    return 'client'
  }
}
const savedRole = readSavedRole()
const role = computed(() => {
  if (route.query.as === 'contractor') return 'contractor'
  if (route.query.as === 'homeowner') return 'client'
  if (route.query.error === 'corppass') return 'contractor'
  return savedRole
})
const isContractor = computed(() => role.value === 'contractor')

const heading = computed(() => {
  if (isContractor.value)
    return { title: 'Contractor log in', subtitle: "Use your company's Corppass to manage quotation requests." }
  if (isSignup.value) return { title: 'Create your account', subtitle: 'Free for HDB households. Takes under a minute.' }
  return { title: 'Log in to EcoHome', subtitle: 'Welcome back. Choose how you would like to log in.' }
})

// Headline above the card.
const hero = computed(() => {
  if (isContractor.value)
    return { key: 'contractor', eyebrow: 'For renovation contractors', title: 'Quotation requests from HDB homeowners.' }
  if (isSignup.value) return { key: 'signup', eyebrow: 'HDB EcoHome', title: 'Plan a home that uses less energy.' }
  return { key: 'login', eyebrow: 'HDB EcoHome', title: 'Welcome home.' }
})

const roleAnnouncement = ref('')

function setRole(next) {
  if (next === role.value) return
  try {
    localStorage.setItem(ROLE_KEY, next)
  } catch {
    // Remembering the choice is only a convenience.
  }
  error.value = ''
  submitted.value = false
  roleAnnouncement.value = next === 'contractor' ? 'Contractor log in selected' : 'Homeowner log in selected'
  router.replace({
    // Contractors only log in (a first Corppass login creates their account).
    path: next === 'contractor' ? '/login' : route.path,
    query: { ...route.query, as: next === 'contractor' ? 'contractor' : 'homeowner', error: undefined },
  })
}

// Arrow keys move between the two options, like any radio group.
function onRoleKey(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const next = isContractor.value ? 'client' : 'contractor'
  setRole(next)
  const tiles = event.currentTarget.querySelectorAll('[role="radio"]')
  tiles[next === 'contractor' ? 1 : 0]?.focus()
}

// Switching tabs keeps what the user typed, the role and the ?redirect= target.
function switchMode(mode) {
  if (mode === props.mode) return
  router.replace({ path: '/' + mode, query: { ...route.query, error: undefined } })
}
// There is no contractor sign-up page: /signup?as=contractor goes to the login.
watch(
  [isContractor, isSignup],
  ([contractor, signup]) => {
    if (contractor && signup) router.replace({ path: '/login', query: route.query })
  },
  { immediate: true },
)
watch(
  () => props.mode,
  () => {
    submitted.value = false
    error.value = ''
  },
)

// ------------------------------------------------------------
// Validation (mirrors the server rules)
// ------------------------------------------------------------
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const passwordRules = computed(() => {
  const p = form.value.password
  return [
    { label: '8+ characters', met: p.length >= 8 },
    { label: 'Upper & lower', met: /[A-Z]/.test(p) && /[a-z]/.test(p) },
    { label: 'Number', met: /\d/.test(p) },
    { label: 'Symbol', met: /[^A-Za-z0-9\s]/.test(p) },
  ]
})
const rulesMet = computed(() => passwordRules.value.filter((rule) => rule.met).length)

const errors = computed(() => {
  const f = form.value
  const result = {}
  if (isSignup.value && !f.name.trim()) result.name = 'Please enter your name.'
  if (!EMAIL_PATTERN.test(f.email.trim())) result.email = 'Please enter a valid email address.'
  if (isSignup.value) {
    if (rulesMet.value < passwordRules.value.length) {
      result.password = 'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.'
    }
    if (!f.confirm || f.confirm !== f.password) result.confirm = 'Passwords do not match.'
  } else if (!f.password) {
    result.password = 'Please enter your password.'
  }
  return result
})

function showError(field) {
  return (submitted.value || touched.value[field]) && errors.value[field]
}

// Mark a field as done (green tick) once it holds a valid value.
function isValid(field) {
  return Boolean(form.value[field]) && !errors.value[field]
}

function onPasswordKey(event) {
  capsLock.value = Boolean(event.getModifierState?.('CapsLock'))
}

// ------------------------------------------------------------
// The HDB block: windows light up as the form is completed.
// ------------------------------------------------------------
// The estate is drawn on a 1200 x 420 canvas: one cluster of blocks on each side,
// with the open space in the middle sitting behind the card.
const GROUND = 392
const BLOCKS = [
  { x: 30, top: 196, w: 124, cols: 3, rows: 7, stripe: 'left' },
  { x: 176, top: 92, w: 220, cols: 5, rows: 9, main: true, no: '128' },
  { x: 804, top: 118, w: 220, cols: 5, rows: 8, main: true, no: '130' },
  { x: 1046, top: 172, w: 130, cols: 3, rows: 7, stripe: 'right' },
]
// Each block shows the side wall that faces the middle of the estate, so it reads as solid.
function sideWall(b) {
  const depth = b.main ? 22 : 12
  return { x: b.x + b.w / 2 < 600 ? b.x + b.w : b.x - depth, w: depth }
}
const blocks = BLOCKS.map((b) => {
  const bottom = b.main ? GROUND - 40 : GROUND
  const y0 = b.top + (b.main ? 12 : 14)
  // One floor slab per storey, just under each row of windows
  const ledges = Array.from({ length: b.rows }, (_, f) => y0 + (f + 1) * 27 - 6).filter((y) => y < bottom - 3)
  return { ...b, bottom, ledges, side: sideWall(b) }
})

function blockWindows(b) {
  const [dx, w, h] = b.main ? [36, 24, 13] : [38, 22, 12]
  const x0 = b.x + (b.w - ((b.cols - 1) * dx + w)) / 2
  const y0 = b.top + (b.main ? 12 : 14)
  const cells = []
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) cells.push({ x: x0 + c * dx, y: y0 + r * 27, w, h, main: b.main })
  }
  return cells
}
// A fixed shuffle so the lights come on in a natural-looking order.
function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}
const LIT_TONES = ['#ffd27a', '#ffe2a6', '#fff0cf', '#ffc764', '#ffdba0']
const windows = (() => {
  const cells = blocks.flatMap(blockWindows)
  // Fisher-Yates shuffle of the lighting order.
  const random = seededRandom(7)
  const order = cells.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // Every home looks a little different: the colour of its lights, half-drawn
  // blinds, and an air-con unit on the ledge.
  const looks = seededRandom(13)
  return cells.map((cell, i) => ({
    ...cell,
    rank: order.indexOf(i),
    tone: LIT_TONES[Math.floor(looks() * LIT_TONES.length)],
    blind: looks() < 0.3 ? Math.round(cell.h * (0.3 + looks() * 0.4)) : 0,
    ac: cell.main && looks() < 0.4,
  }))
})()
const stars = (() => {
  const random = seededRandom(42)
  return Array.from({ length: 44 }, () => ({
    x: Math.round(random() * 1200),
    y: Math.round(random() * 170),
    r: (random() * 0.9 + 0.4).toFixed(1),
    d: (random() * 4).toFixed(1),
  }))
})()
// Two layers of distant towers; the farther one fades into the haze.
const SKYLINE_FAR = [
  [-380, 196, 90], [-260, 168, 70], [-150, 204, 80], [-40, 180, 60], [430, 188, 50], [520, 160, 44],
  [600, 196, 60], [700, 172, 48], [1120, 176, 70], [1230, 150, 60], [1340, 190, 90], [1460, 166, 70],
]
const SKYLINE = [
  [-420, 250, 160], [-240, 214, 120], [-100, 236, 110], [400, 262, 70], [480, 232, 60],
  [560, 250, 90], [670, 226, 70], [740, 258, 60], [1190, 232, 110], [1320, 206, 130], [1470, 248, 160],
]
const TREES = (() => {
  const random = seededRandom(5)
  return [12, 164, 420, 452, 512, 548, 652, 688, 748, 786, 1036, 1190].map((x) => ({
    x,
    s: (1.05 + random() * 0.45).toFixed(2),
  }))
})()
const LAMPS = [96, 470, 736, 1112]

const progress = computed(() => {
  const fields = isSignup.value ? ['name', 'email', 'password', 'confirm'] : ['email', 'password']
  let done = 0
  for (const field of fields) {
    const value = form.value[field]
    if (value && !errors.value[field]) done += 1
    else if (value) done += 0.35 // partly typed still glows a little
  }
  return done / fields.length
})
const litCount = computed(() => {
  if (celebrate.value) return windows.length
  // Contractors: the block is "under renovation", about half lit.
  if (isContractor.value) return Math.round(windows.length * 0.45)
  return Math.round(4 + progress.value * (windows.length * 0.8))
})
const sceneCaption = computed(() => {
  if (redirecting.value) return `Taking you to ${redirecting.value === 'corppass' ? 'Corppass' : 'Singpass'}…`
  if (celebrate.value) return 'Welcome home'
  if (isContractor.value) return 'Block under renovation'
  return `${litCount.value} of ${windows.length} homes lit`
})

// ------------------------------------------------------------
// Night or day, from the visitor's clock. Singapore's sunrise and sunset stay
// close to 7am and 7pm all year. ?sky=day or ?sky=night previews either one.
// ------------------------------------------------------------
const now = ref(new Date())
let clock
const isNight = computed(() => {
  if (route.query.sky === 'day') return false
  if (route.query.sky === 'night') return true
  const hour = now.value.getHours()
  return hour < 7 || hour >= 19
})

// Singpass and Corppass are full-page redirects; light up the block on the way out.
function startRedirect(service) {
  redirecting.value = service
  celebrate.value = true
}
// Coming back with the browser's Back button restores this page from cache.
function onPageShow(event) {
  if (!event.persisted) return
  redirecting.value = ''
  celebrate.value = false
}
onMounted(() => {
  window.addEventListener('pageshow', onPageShow)
  // Re-check every minute so the sky changes if the page is left open.
  clock = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('pageshow', onPageShow)
  clearInterval(clock)
})

// ------------------------------------------------------------
// Submit
// ------------------------------------------------------------
async function submit() {
  submitted.value = true
  error.value = ''
  if (Object.keys(errors.value).length) return

  busy.value = true
  try {
    const f = form.value
    let user
    if (isSignup.value) {
      user = await auth.signup({ name: f.name.trim(), email: f.email.trim(), password: f.password, remember: f.remember })
    } else {
      user = await auth.login({ email: f.email.trim(), password: f.password, remember: f.remember })
    }
    // Light up the whole block, then head inside.
    success.value = true
    celebrate.value = true
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : 900))
    // A new account sets up its household before anything else.
    if (isSignup.value) router.replace({ path: '/MyProfile', query: { setup: 'household' } })
    else router.replace(redirect.value || homeFor(user))
  } catch (err) {
    error.value = err.response?.data?.error || 'Something went wrong. Please try again.'
    busy.value = false
  }
}
</script>

<template>
  <div
    class="auth-page"
    :class="[
      isSignup ? 'is-signup' : 'is-login',
      isContractor ? 'is-contractor' : 'is-homeowner',
      isNight ? 'is-night' : 'is-day',
      { celebrate },
    ]"
  >
    <!-- Backdrop: an HDB estate whose windows light up as the form fills in -->
    <div class="auth-scene" aria-hidden="true">
      <p class="scene-caption">
        <span class="lamp"></span>
        {{ sceneCaption }}
      </p>

      <!-- Sky: moon and shooting stars at night, sun and drifting clouds by day -->
      <div class="sky-body"></div>
      <div v-if="isNight" class="shooting-stars">
        <span v-for="n in 3" :key="n" class="shooting-star"></span>
      </div>
      <div v-else class="clouds">
        <svg v-for="n in 4" :key="n" class="cloud" viewBox="0 0 140 60">
          <!-- the same puffs twice: a grey underside, then the sunlit tops -->
          <g v-for="layer in ['cloud-shade', 'cloud-lit']" :key="layer" :class="layer">
            <ellipse cx="30" cy="40" rx="20" ry="13" />
            <ellipse cx="52" cy="30" rx="20" ry="18" />
            <ellipse cx="76" cy="24" rx="22" ry="20" />
            <ellipse cx="98" cy="33" rx="18" ry="15" />
            <ellipse cx="116" cy="41" rx="14" ry="10" />
            <ellipse cx="70" cy="44" rx="52" ry="10" />
          </g>
        </svg>
      </div>

      <svg class="scene-svg" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax meet">
        <defs>
          <linearGradient id="facade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--facade-top)" />
            <stop offset="1" stop-color="var(--facade-bottom)" />
          </linearGradient>
          <!-- weathering: façades darken towards the ground -->
          <linearGradient id="grime" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stop-color="#000" stop-opacity="0" />
            <stop offset="1" stop-color="#000" stop-opacity="0.12" />
          </linearGradient>
          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.35" stop-color="var(--haze)" stop-opacity="0" />
            <stop offset="1" stop-color="var(--haze)" stop-opacity="0.75" />
          </linearGradient>
          <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
            <stop offset="0.45" stop-color="#fff" stop-opacity="0.08" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--ground)" />
            <stop offset="1" stop-color="var(--ground-dark)" />
          </linearGradient>
          <radialGradient id="lamp-glow">
            <stop offset="0" stop-color="#ffe9b0" stop-opacity="0.75" />
            <stop offset="1" stop-color="#ffe9b0" stop-opacity="0" />
          </radialGradient>
          <pattern id="skyline-windows" width="7" height="9" patternUnits="userSpaceOnUse">
            <rect x="2" y="3" width="3" height="4" />
          </pattern>
          <pattern id="solar-cells" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" />
            <path d="M6 0V6M0 6H6" />
          </pattern>
        </defs>

        <g class="stars">
          <circle
            v-for="(star, i) in stars"
            :key="i"
            :cx="star.x"
            :cy="star.y"
            :r="star.r"
            :style="{ animationDelay: star.d + 's' }"
          />
        </g>

        <!-- distant skyline, wider than the frame so it never ends at the edges -->
        <g class="skyline skyline-far">
          <rect v-for="([x, y, w], i) in SKYLINE_FAR" :key="i" :x="x" :y="y" :width="w" :height="GROUND - y" />
        </g>
        <rect class="haze" x="-1000" y="0" width="3200" :height="GROUND" fill="url(#haze)" />
        <g class="skyline">
          <template v-for="([x, y, w], i) in SKYLINE" :key="i">
            <rect :x="x" :y="y" :width="w" :height="GROUND - y" />
            <rect class="skyline-lights" :x="x + 3" :y="y + 4" :width="w - 6" :height="GROUND - y - 4" fill="url(#skyline-windows)" />
          </template>
        </g>
        <rect class="haze" x="-1000" y="0" width="3200" :height="GROUND" fill="url(#haze)" opacity="0.5" />

        <g v-for="(b, i) in blocks" :key="i">
          <!-- shadow cast on the grass -->
          <ellipse class="ground-shadow" :cx="b.x + b.w / 2" :cy="GROUND + 2" :rx="b.w * 0.62" ry="5" />
          <rect class="side-wall" :x="b.side.x" :y="b.top" :width="b.side.w" :height="b.bottom - b.top" />
          <g class="ledges side-ledges">
            <rect v-for="y in b.ledges" :key="y" :x="b.side.x" :y="y" :width="b.side.w" height="2" />
          </g>
          <rect class="block" :class="{ 'block-far': !b.main }" :x="b.x" :y="b.top" :width="b.w" :height="b.bottom - b.top" />
          <template v-if="b.main">
            <!-- roof: slab, lift motor room, solar panels on stands -->
            <rect class="tank" :x="b.x + b.w / 2 - 30" :y="b.top - 30" width="60" height="24" />
            <rect class="tank-cap" :x="b.x + b.w / 2 - 33" :y="b.top - 33" width="66" height="4" />
            <rect class="tank-door" :x="b.x + b.w / 2 - 5" :y="b.top - 20" width="10" height="14" />
            <g class="louvres">
              <rect v-for="n in 3" :key="n" :x="b.x + b.w / 2 - 24" :y="b.top - 26 + n * 4" width="14" height="1.5" />
            </g>
            <g class="solar">
              <line v-for="o in [12, 60, b.w - 60, b.w - 12]" :key="'leg' + o" class="solar-leg" :x1="b.x + o" :y1="b.top - 12" :x2="b.x + o" :y2="b.top - 6" />
              <rect :x="b.x + 6" :y="b.top - 22" width="60" height="11" />
              <rect :x="b.x + b.w - 66" :y="b.top - 22" width="60" height="11" />
            </g>
            <rect class="roof" :x="b.x - 4" :y="b.top - 7" :width="b.w + 8" height="7" />
            <rect class="roof-shadow" :x="b.x" :y="b.top" :width="b.w" height="3" />
            <rect class="stripe" :x="b.x" :y="b.top" width="14" :height="b.bottom - b.top" />
            <rect class="stripe" :x="b.x + b.w - 14" :y="b.top" width="14" :height="b.bottom - b.top" />
            <text class="blk-no" :x="b.x + 7" :y="b.top + 20" text-anchor="middle" :transform="`rotate(-90 ${b.x + 7} ${b.top + 20})`" dy="3">{{ b.no }}</text>
            <g class="ledges">
              <rect v-for="y in b.ledges" :key="y" :x="b.x + 14" :y="y" :width="b.w - 28" height="3" />
            </g>
            <g class="ledge-shadows">
              <rect v-for="y in b.ledges" :key="y" :x="b.x + 14" :y="y + 3" :width="b.w - 28" height="2" />
            </g>
            <!-- void deck: open ground floor, lit by fluorescent tubes at night -->
            <rect class="void-deck" :x="b.x" :y="b.bottom" :width="b.w" :height="GROUND - b.bottom" />
            <rect class="void-ceiling" :x="b.x" :y="b.bottom" :width="b.w" height="5" />
            <g class="void-lights">
              <rect v-for="p in 4" :key="p" :x="b.x + 30 + (p - 1) * 49" :y="b.bottom + 6" width="18" height="2" rx="1" />
            </g>
            <g class="pillars">
              <rect v-for="p in 5" :key="p" :x="b.x + 8 + (p - 1) * 49" :y="b.bottom" width="10" :height="GROUND - b.bottom" />
            </g>
          </template>
          <template v-else>
            <rect class="roof" :x="b.x - 3" :y="b.top - 5" :width="b.w + 6" height="5" />
            <g class="ledges">
              <rect v-for="y in b.ledges" :key="y" :x="b.x" :y="y" :width="b.w" height="2" />
            </g>
            <rect class="stripe" :x="b.stripe === 'left' ? b.x : b.x + b.w - 8" :y="b.top" width="8" :height="b.bottom - b.top" />
          </template>
          <rect class="grime" :x="Math.min(b.x, b.side.x)" :y="b.top" :width="b.w + b.side.w" :height="GROUND - b.top" fill="url(#grime)" />
        </g>

        <!-- windows: framed glass, some with blinds half down, AC units on the ledges -->
        <g class="windows">
          <g
            v-for="(win, i) in windows"
            :key="i"
            :class="{ lit: win.rank < litCount }"
            :style="{ '--rank': win.rank, '--lit': win.tone }"
          >
            <rect class="win" :x="win.x" :y="win.y" :width="win.w" :height="win.h" />
            <rect v-if="win.blind" class="blind" :x="win.x" :y="win.y" :width="win.w" :height="win.blind" />
            <rect class="sheen" :x="win.x" :y="win.y" :width="win.w" :height="win.h" fill="url(#sheen)" />
            <line class="mullion" :x1="win.x + win.w / 2" :y1="win.y" :x2="win.x + win.w / 2" :y2="win.y + win.h" />
            <rect class="sill" :x="win.x - 1" :y="win.y + win.h" :width="win.w + 2" height="1.5" />
            <rect v-if="win.ac" class="ac" :x="win.x + win.w - 9" :y="win.y + win.h + 2" width="8" height="5" />
          </g>
        </g>

        <!-- Contractor mode: scaffolding and a tower crane appear -->
        <g class="scaffold">
          <rect class="pole" x="400" y="110" width="3" height="282" />
          <rect class="pole" x="416" y="110" width="3" height="282" />
          <rect class="pole" x="782" y="136" width="3" height="256" />
          <rect class="pole" x="798" y="136" width="3" height="256" />
          <g class="planks">
            <rect v-for="n in 8" :key="'l' + n" x="396" :y="104 + n * 34" width="27" height="4" />
            <rect v-for="n in 7" :key="'r' + n" x="778" :y="130 + n * 34" width="27" height="4" />
          </g>
          <g class="braces">
            <line v-for="n in 7" :key="'b' + n" x1="403" :y1="108 + n * 34" x2="416" :y2="108 + (n + 1) * 34" />
          </g>
        </g>
        <g class="crane">
          <rect class="crane-mast" x="1030" y="40" width="11" height="352" />
          <line
            v-for="n in 17"
            :key="'m' + n"
            class="crane-lattice"
            x1="1030"
            :y1="40 + (n - 1) * 21"
            x2="1041"
            :y2="40 + n * 21"
          />
          <rect class="crane-jib" x="826" y="32" width="262" height="8" />
          <rect class="crane-cab" x="1023" y="18" width="25" height="14" rx="2" />
          <rect class="crane-weight" x="1062" y="40" width="24" height="16" />
          <g class="crane-load">
            <line class="crane-cable" x1="900" y1="40" x2="900" y2="48" />
            <rect class="crane-box" x="884" y="48" width="32" height="10" rx="1.5" />
          </g>
        </g>

        <!-- ground: grass verge, kerb and an estate road -->
        <rect class="ground" x="-1000" :y="GROUND" width="3200" height="12" fill="url(#grass)" />
        <rect class="kerb" x="-1000" :y="GROUND + 12" width="3200" height="2" />
        <rect class="road" x="-1000" :y="GROUND + 14" width="3200" height="400" />
        <line class="lane" x1="-1000" :y1="GROUND + 21" x2="2200" :y2="GROUND + 21" />

        <!-- street lamps -->
        <g class="lamps">
          <g v-for="x in LAMPS" :key="x" :transform="`translate(${x} ${GROUND})`">
            <circle class="lamp-glow" cx="7" cy="-44" r="22" fill="url(#lamp-glow)" />
            <rect class="lamp-pole" x="-1" y="-46" width="2" height="46" />
            <path class="lamp-arm" d="M0 -46q0 -3 4 -3h6" />
            <rect class="lamp-head" x="4" y="-47" width="8" height="3" rx="1" />
          </g>
        </g>

        <!-- rain trees: clustered canopies lit from above -->
        <g class="trees">
          <g v-for="(t, i) in TREES" :key="i" :transform="`translate(${t.x} ${GROUND}) scale(${t.s})`">
            <ellipse class="tree-shadow" cx="4" cy="1" rx="22" ry="3" />
            <path class="trunk" d="M-2.5 0L-1.6 -17L1.6 -17L2.5 0Z" />
            <path class="branch" d="M0 -15L-7 -25M0 -16L7 -27" />
            <g class="leaf leaf-dark">
              <circle cx="-13" cy="-27" r="10" />
              <circle cx="13" cy="-27" r="10" />
              <circle cx="0" cy="-30" r="13" />
              <circle cx="-5" cy="-22" r="8" />
              <circle cx="6" cy="-22" r="8" />
            </g>
            <g class="leaf">
              <circle cx="-8" cy="-32" r="9" />
              <circle cx="8" cy="-33" r="9" />
              <circle cx="0" cy="-37" r="9" />
            </g>
            <g class="leaf leaf-light">
              <circle cx="-9" cy="-36" r="5" />
              <circle cx="-1" cy="-41" r="5" />
              <circle cx="7" cy="-38" r="4" />
            </g>
          </g>
        </g>
      </svg>
    </div>

    <p class="eyebrow">
      <span class="eyebrow-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 10.5 12 3l9 7.5V21H3z" />
          <path d="M12 21v-5c0-2.5 2-4.5 4.5-4.5" />
        </svg>
      </span>
      {{ hero.eyebrow }}
    </p>

    <Transition name="fade-up" mode="out-in">
      <div :key="hero.key" class="auth-hero">
        <h2 class="hero-title">{{ hero.title }}</h2>
      </div>
    </Transition>

    <!-- Form card -->
    <section class="auth-card">
        <header class="auth-head">
          <h1 class="auth-title">{{ heading.title }}</h1>
          <p class="auth-subtitle">{{ heading.subtitle }}</p>
        </header>

        <!-- Who are you? -->
        <div class="role-switch" role="radiogroup" aria-label="I am a" @keydown="onRoleKey">
          <span class="role-pill" aria-hidden="true"></span>
          <button
            type="button"
            role="radio"
            class="role-tile"
            :class="{ active: !isContractor }"
            :aria-checked="!isContractor"
            :tabindex="isContractor ? -1 : 0"
            @click="setRole('client')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V21h14V9.5" />
              <path d="M10 21v-6h4v6" />
            </svg>
            Homeowner
          </button>
          <button
            type="button"
            role="radio"
            class="role-tile"
            :class="{ active: isContractor }"
            :aria-checked="isContractor"
            :tabindex="isContractor ? 0 : -1"
            @click="setRole('contractor')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              <path d="M3 13h18" />
            </svg>
            Contractor
          </button>
        </div>
        <p class="visually-hidden" aria-live="polite">{{ roleAnnouncement }}</p>

        <div aria-live="assertive">
          <div v-if="error" class="notice-error" role="alert">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.01" />
            </svg>
            <span>{{ error }}</span>
          </div>
        </div>

        <Transition name="role-swap" mode="out-in">
          <!-- Contractors: Corppass only (it verifies the company's UEN) -->
          <div v-if="isContractor" key="contractor" class="contractor-panel">
            <a
              class="btn-corppass w-100"
              :class="{ 'is-redirecting': redirecting === 'corppass' }"
              :href="corppassHref"
              :aria-busy="redirecting === 'corppass'"
              @click="startRedirect('corppass')"
            >
              <span v-if="redirecting === 'corppass'" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <svg v-else class="cp-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="4" y="3" width="16" height="18" rx="1" />
                <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
              </svg>
              <template v-if="redirecting === 'corppass'">Opening Corppass…</template>
              <template v-else>
                <span>Log in with</span>
                <span class="cp-wordmark">Corppass</span>
              </template>
            </a>

            <ol class="steps">
              <li>
                <strong>Log in with your company's Corppass</strong>
                <span>Use the account your business already has.</span>
              </li>
              <li>
                <strong>We check your company's UEN</strong>
                <span>Homeowners see that you are a registered business.</span>
              </li>
              <li>
                <strong>Open your dashboard</strong>
                <span>Your first login creates your business account.</span>
              </li>
            </ol>
          </div>

          <!-- Homeowners: email + password, or Singpass -->
          <div v-else key="homeowner">
            <!-- Singpass is offered for logging in only; sign-up uses email -->
            <template v-if="!isSignup">
              <a
                class="btn-singpass w-100"
                :class="{ 'is-redirecting': redirecting === 'singpass' }"
                :href="singpassHref"
                :aria-busy="redirecting === 'singpass'"
                @click="startRedirect('singpass')"
              >
                <span v-if="redirecting === 'singpass'" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                <template v-if="redirecting === 'singpass'">Opening Singpass…</template>
                <template v-else>
                  <span>Log in with</span>
                  <span class="sp-wordmark">singpass</span>
                </template>
              </a>
              <p class="sso-note">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                We'll fill in your household details from Myinfo.
              </p>

              <div class="divider"><span>or log in with email</span></div>
            </template>

            <form novalidate @submit.prevent="submit">
              <fieldset :disabled="busy">
                <legend class="visually-hidden">{{ isSignup ? 'Sign up' : 'Log in' }} with email</legend>

                <div :class="{ 'field-row': isSignup }">
                  <Transition name="field">
                    <div v-if="isSignup" class="field">
                      <label class="field-label" for="auth-name">Full name</label>
                      <div class="input-wrap" :class="{ valid: isValid('name') }">
                        <input
                          id="auth-name"
                          v-model="form.name"
                          class="input"
                          :class="{ 'is-invalid': showError('name') }"
                          type="text"
                          placeholder="Tan Wei Ming"
                          autocomplete="name"
                          maxlength="60"
                          :aria-invalid="Boolean(showError('name'))"
                          :aria-describedby="showError('name') ? 'auth-name-error' : undefined"
                          @blur="touched.name = true"
                        />
                        <svg class="input-tick" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                      </div>
                      <p v-if="showError('name')" id="auth-name-error" class="field-error">{{ errors.name }}</p>
                    </div>
                  </Transition>

                  <div class="field">
                    <label class="field-label" for="auth-email">Email address</label>
                    <div class="input-wrap" :class="{ valid: isValid('email') }">
                      <input
                        id="auth-email"
                        v-model="form.email"
                        class="input"
                        :class="{ 'is-invalid': showError('email') }"
                        type="email"
                        placeholder="you@email.com"
                        autocomplete="email"
                        inputmode="email"
                        :aria-invalid="Boolean(showError('email'))"
                        :aria-describedby="showError('email') ? 'auth-email-error' : undefined"
                        @blur="touched.email = true"
                      />
                      <svg class="input-tick" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    </div>
                    <p v-if="showError('email')" id="auth-email-error" class="field-error">{{ errors.email }}</p>
                  </div>
                </div>

                <div :class="{ 'field-row': isSignup }">
                  <div class="field">
                    <label class="field-label" for="auth-password">Password</label>
                    <div class="input-wrap has-peek">
                      <input
                        id="auth-password"
                        v-model="form.password"
                        class="input"
                        :class="{ 'is-invalid': showError('password') }"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="isSignup ? 'New password' : 'Enter your password'"
                        :autocomplete="isSignup ? 'new-password' : 'current-password'"
                        maxlength="128"
                        :aria-invalid="Boolean(showError('password'))"
                        :aria-describedby="
                          [isSignup ? 'auth-password-rules' : '', showError('password') && !isSignup ? 'auth-password-error' : '']
                            .filter(Boolean)
                            .join(' ') || undefined
                        "
                        @blur="touched.password = true; capsLock = false"
                        @keydown="onPasswordKey"
                        @keyup="onPasswordKey"
                      />
                      <button
                        type="button"
                        class="peek"
                        :aria-pressed="showPassword"
                        :aria-label="showPassword ? 'Hide password' : 'Show password'"
                        @click="showPassword = !showPassword"
                      >
                        <svg v-if="showPassword" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                    <p v-if="capsLock" class="field-hint caps" role="status">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 4 13h4v7h8v-7h4z" /></svg>
                      Caps Lock is on
                    </p>
                    <p v-if="showError('password') && !isSignup" id="auth-password-error" class="field-error">
                      {{ errors.password }}
                    </p>

                  </div>

                  <Transition name="field">
                    <div v-if="isSignup" class="field">
                      <label class="field-label" for="auth-confirm">Confirm password</label>
                      <div class="input-wrap has-peek" :class="{ valid: isValid('confirm') }">
                        <input
                          id="auth-confirm"
                          v-model="form.confirm"
                          class="input"
                          :class="{ 'is-invalid': showError('confirm') }"
                          :type="showConfirm ? 'text' : 'password'"
                          placeholder="Repeat password"
                          autocomplete="new-password"
                          maxlength="128"
                          :aria-invalid="Boolean(showError('confirm'))"
                          :aria-describedby="showError('confirm') ? 'auth-confirm-error' : undefined"
                          @blur="touched.confirm = true"
                        />
                        <svg class="input-tick" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                        <button
                          type="button"
                          class="peek"
                          :aria-pressed="showConfirm"
                          :aria-label="showConfirm ? 'Hide confirm password' : 'Show confirm password'"
                          @click="showConfirm = !showConfirm"
                        >
                          <svg v-if="showConfirm" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </div>
                      <p v-if="showError('confirm')" id="auth-confirm-error" class="field-error">
                        {{ errors.confirm }}
                      </p>
                    </div>
                  </Transition>
                </div>

                <!-- Sign up: the server's password rules, ticked off live -->
                <ul
                  v-if="isSignup"
                  id="auth-password-rules"
                  class="rules"
                  :class="{ 'show-missing': showError('password') }"
                  :data-met="rulesMet"
                  aria-label="Password requirements"
                >
                  <li v-for="rule in passwordRules" :key="rule.label" :class="{ met: rule.met }">
                    <span class="rule-dot" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    </span>
                    {{ rule.label }}
                    <span class="visually-hidden">{{ rule.met ? '(done)' : '(not yet)' }}</span>
                  </li>
                </ul>

                <div class="form-check remember mb-4">
                  <input id="auth-remember" v-model="form.remember" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="auth-remember">Keep me logged in on this device</label>
                </div>

                <button class="btn-submit w-100" :class="{ 'is-success': success }" type="submit">
                  <template v-if="success">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    {{ isSignup ? 'Account created' : 'Logged in' }}
                  </template>
                  <template v-else-if="busy">
                    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                    {{ isSignup ? 'Creating account…' : 'Logging in…' }}
                  </template>
                  <template v-else>
                    {{ isSignup ? 'Create account' : 'Log in' }}
                    <svg class="submit-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </template>
                </button>
              </fieldset>
            </form>
          </div>
        </Transition>

        <p v-if="!isContractor" class="switch-text">
          <template v-if="isSignup">
            Already have an account?
            <button type="button" class="link-button" @click="switchMode('login')">Log in</button>
          </template>
          <template v-else>
            New to EcoHome?
            <button type="button" class="link-button" @click="switchMode('signup')">Create an account</button>
          </template>
        </p>
        <p v-else class="switch-text">
          Not a contractor?
          <button type="button" class="link-button" @click="setRole('client')">Log in as a homeowner</button>
        </p>
    </section>
  </div>
</template>
