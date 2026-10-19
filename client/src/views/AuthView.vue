<style src="../assets/auth.css"></style>
<script setup>
import { computed, ref, watch } from 'vue'
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
const busy = ref(false)
const celebrate = ref(false)
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

const strength = computed(() => {
  const p = form.value.password
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++
  if (/\d/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  return p ? Math.max(score, 1) : 0
})
const STRENGTH_LABELS = ['', 'Very weak', 'Weak', 'Fair', 'Strong', 'Excellent']

const errors = computed(() => {
  const f = form.value
  const result = {}
  if (isSignup.value && !f.name.trim()) result.name = 'Please enter your name.'
  if (!EMAIL_PATTERN.test(f.email.trim())) result.email = 'Please enter a valid email address.'
  if (isSignup.value) {
    const p = f.password
    if (p.length < 8 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9\s]/.test(p)) {
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

// ------------------------------------------------------------
// The HDB block: windows light up as the form is completed.
// ------------------------------------------------------------
function grid(x0, y0, cols, rows, dx, dy, w, h) {
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ x: x0 + c * dx, y: y0 + r * dy, w, h })
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
const windows = (() => {
  const cells = [
    ...grid(218, 150, 5, 9, 36, 28, 24, 14), // main block
    ...grid(52, 238, 3, 7, 38, 28, 22, 13), // left block
    ...grid(446, 208, 3, 8, 40, 28, 22, 13), // right block
  ]
  // Fisher-Yates shuffle of the lighting order.
  const random = seededRandom(7)
  const order = cells.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return cells.map((cell, i) => ({ ...cell, rank: order.indexOf(i) }))
})()
const stars = (() => {
  const random = seededRandom(42)
  return Array.from({ length: 28 }, () => ({
    x: Math.round(random() * 600),
    y: Math.round(random() * 150),
    r: (random() * 1.2 + 0.4).toFixed(1),
    d: (random() * 4).toFixed(1),
  }))
})()

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

// Corppass is a full-page redirect; light up the block on the way out.
function startCorppass() {
  celebrate.value = true
}

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
    celebrate.value = true
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : 900))
    router.replace(redirect.value || (isSignup.value ? '/EnergyPlanner/' : homeFor(user)))
  } catch (err) {
    error.value = err.response?.data?.error || 'Something went wrong. Please try again.'
    busy.value = false
  }
}
</script>

<template>
  <div
    class="auth-page"
    :class="[isSignup ? 'is-signup' : 'is-login', isContractor ? 'is-contractor' : 'is-homeowner', { celebrate }]"
  >
    <!-- Illustration: an HDB estate whose windows light up as the form fills in -->
    <section class="auth-scene" aria-hidden="true">
      <div class="sky sky-night"></div>
      <div class="sky sky-dawn"></div>

      <svg class="scene-svg" viewBox="0 0 600 500" preserveAspectRatio="xMidYMax slice">
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
        <defs>
          <mask id="moon-cut">
            <rect width="600" height="500" fill="white" />
            <circle cx="512" cy="70" r="24" fill="black" />
          </mask>
        </defs>
        <g class="moon"><circle cx="500" cy="78" r="26" mask="url(#moon-cut)" /></g>
        <g class="sun"><circle class="sun-glow" cx="120" cy="120" r="70" /><circle cx="120" cy="120" r="34" /></g>

        <!-- side blocks -->
        <rect class="block block-far" x="36" y="222" width="138" height="218" rx="3" />
        <rect class="block block-far" x="430" y="192" width="142" height="248" rx="3" />
        <rect class="stripe" x="36" y="222" width="10" height="218" />
        <rect class="stripe" x="562" y="192" width="10" height="248" />

        <!-- main block -->
        <rect class="block" x="200" y="132" width="200" height="268" rx="4" />
        <rect class="roof" x="194" y="124" width="212" height="12" rx="3" />
        <rect class="tank" x="270" y="98" width="60" height="26" rx="3" />
        <g class="solar">
          <rect x="214" y="110" width="40" height="12" rx="2" />
          <rect x="346" y="110" width="40" height="12" rx="2" />
        </g>
        <rect class="stripe" x="200" y="132" width="12" height="268" />
        <rect class="stripe" x="388" y="132" width="12" height="268" />
        <g class="ledges">
          <rect v-for="f in 9" :key="f" x="200" :y="140 + f * 28" width="200" height="3" />
        </g>
        <!-- void deck -->
        <rect class="void-deck" x="200" y="400" width="200" height="40" />
        <g class="pillars">
          <rect v-for="p in 5" :key="p" :x="206 + (p - 1) * 46" y="400" width="10" height="40" />
        </g>

        <!-- windows -->
        <g class="windows">
          <rect
            v-for="(win, i) in windows"
            :key="i"
            class="win"
            :class="{ lit: win.rank < litCount }"
            :x="win.x"
            :y="win.y"
            :width="win.w"
            :height="win.h"
            rx="2"
            :style="{ '--rank': win.rank }"
          />
        </g>

        <!-- Contractor mode: scaffolding and a tower crane appear -->
        <g class="scaffold">
          <rect class="pole" x="404" y="150" width="4" height="290" />
          <rect class="pole" x="424" y="150" width="4" height="290" />
          <rect class="pole" x="176" y="200" width="4" height="240" />
          <rect class="pole" x="194" y="200" width="4" height="240" />
          <g class="planks">
            <rect v-for="n in 8" :key="'r' + n" x="400" :y="146 + n * 36" width="32" height="5" />
            <rect v-for="n in 6" :key="'l' + n" x="172" :y="196 + n * 40" width="30" height="5" />
          </g>
          <g class="braces">
            <line v-for="n in 7" :key="'b' + n" x1="408" :y1="151 + n * 36" x2="424" :y2="151 + (n + 1) * 36" />
          </g>
        </g>
        <!-- kept within x 250-505 so it stays visible when the scene is cropped -->
        <g class="crane">
          <rect class="crane-mast" x="452" y="62" width="12" height="378" />
          <line
            v-for="n in 18"
            :key="'m' + n"
            class="crane-lattice"
            x1="452"
            :y1="62 + (n - 1) * 21"
            x2="464"
            :y2="62 + n * 21"
          />
          <rect class="crane-jib" x="250" y="54" width="254" height="9" />
          <rect class="crane-cab" x="445" y="40" width="26" height="22" rx="3" />
          <rect class="crane-weight" x="478" y="63" width="24" height="18" />
          <g class="crane-load">
            <line class="crane-cable" x1="360" y1="63" x2="360" y2="98" />
            <rect class="crane-box" x="344" y="98" width="32" height="18" rx="2" />
          </g>
        </g>

        <!-- ground and trees -->
        <rect class="ground" x="0" y="440" width="600" height="60" />
        <rect class="path" x="268" y="440" width="64" height="60" />
        <g class="trees">
          <g v-for="(x, i) in [24, 150, 186, 420, 456, 586]" :key="i" :transform="`translate(${x} 0)`">
            <rect class="trunk" x="-3" y="420" width="6" height="22" />
            <circle class="leaf" cx="0" cy="410" r="20" />
            <circle class="leaf leaf-light" cx="-7" cy="402" r="10" />
          </g>
        </g>
      </svg>

      <div class="scene-copy">
        <Transition name="fade-up" mode="out-in">
          <div v-if="isContractor" key="contractor">
            <p class="eyebrow"><span class="hard-hat" aria-hidden="true">⛑️</span> For renovation contractors</p>
            <h2>Grow your renovation business.</h2>
            <p>Get quotation requests from HDB homeowners and reply with AI-assisted quotes.</p>
          </div>
          <div v-else-if="isSignup" key="signup">
            <p class="eyebrow">Join HDB EcoHome</p>
            <h2>Light up a greener home.</h2>
            <p>Save your household, compare energy plans and see where every kWh goes.</p>
          </div>
          <div v-else key="login">
            <p class="eyebrow">Welcome back</p>
            <h2>The lights are on. You're home.</h2>
            <p>Your households, plans and saved contractors are right where you left them.</p>
          </div>
        </Transition>
        <ul v-if="isContractor" class="perks">
          <li>📥 Quotation requests from homeowners</li>
          <li>🤖 AI quotation drafts from your price list</li>
          <li>✓ UEN verified by Corppass</li>
        </ul>
        <ul v-else class="perks">
          <li>⚡ Monthly kWh estimates</li>
          <li>🪪 Myinfo household autofill</li>
          <li>💾 Saved to your account</li>
        </ul>
      </div>
      <p class="scene-hint">
        {{
          celebrate
            ? isContractor ? 'On our way to Corppass…' : 'Welcome home ✨'
            : isContractor ? 'Your next project is one login away' : 'Fill in the form to light up the block'
        }}
      </p>
    </section>

    <!-- Form -->
    <section class="auth-panel">
      <div class="auth-card">
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
            <span class="role-icon" aria-hidden="true">🏠</span>
            <span class="role-text">
              <strong>Homeowner</strong>
              <small>Plan &amp; save energy at home</small>
            </span>
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
            <span class="role-icon" aria-hidden="true">🛠️</span>
            <span class="role-text">
              <strong>Contractor</strong>
              <small>Get renovation requests</small>
            </span>
          </button>
        </div>
        <p class="visually-hidden" aria-live="polite">{{ roleAnnouncement }}</p>

        <div v-if="!isContractor" class="mode-switch" role="tablist" aria-label="Log in or sign up">
          <span class="mode-pill" aria-hidden="true"></span>
          <button
            type="button"
            role="tab"
            :aria-selected="!isSignup"
            :class="{ active: !isSignup }"
            @click="switchMode('login')"
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="isSignup"
            :class="{ active: isSignup }"
            @click="switchMode('signup')"
          >
            Sign up
          </button>
        </div>

        <h1 class="auth-title">
          <template v-if="isContractor">Contractor log in</template>
          <template v-else>{{ isSignup ? 'Create your account' : 'Log in to EcoHome' }}</template>
        </h1>
        <p class="auth-subtitle">
          <template v-if="isContractor">Your quotation requests are waiting.</template>
          <template v-else>{{ isSignup ? 'It takes less than a minute.' : 'Good to see you again.' }}</template>
        </p>

        <div aria-live="assertive">
          <div v-if="error" class="alert alert-danger py-2 small" role="alert">{{ error }}</div>
        </div>

        <Transition name="role-swap" mode="out-in">
        <!-- Contractors: Corppass only (it verifies the company's UEN) -->
        <div v-if="isContractor" key="contractor" class="contractor-panel">
          <a class="btn-corppass w-100" :href="corppassHref" @click="startCorppass">
            <span class="cp-icon" aria-hidden="true">🏢</span>
            <span>Log in with</span>
            <span class="cp-wordmark">Corppass</span>
          </a>
          <p class="singpass-note">First time here? Logging in with Corppass creates your business account.</p>
        </div>

        <!-- Homeowners: email + password, or Singpass -->
        <div v-else key="homeowner">
        <!-- Singpass is offered for logging in only; sign-up uses email -->
        <template v-if="!isSignup">
          <a class="btn-singpass w-100" :href="singpassHref">
            <span>Log in with</span>
            <span class="sp-wordmark">singpass</span>
          </a>
          <p class="singpass-note">We'll fill in your household details from Myinfo.</p>

          <div class="divider"><span>or use email</span></div>
        </template>

        <form novalidate @submit.prevent="submit">
          <fieldset :disabled="busy">
            <legend class="visually-hidden">{{ isSignup ? 'Sign up' : 'Log in' }} with email</legend>

            <Transition name="field">
              <div v-if="isSignup" class="field">
                <div class="form-floating">
                  <input
                    id="auth-name"
                    v-model="form.name"
                    class="form-control"
                    :class="{ 'is-invalid': showError('name') }"
                    type="text"
                    placeholder="Your name"
                    autocomplete="name"
                    maxlength="60"
                    :aria-describedby="showError('name') ? 'auth-name-error' : undefined"
                    @blur="touched.name = true"
                  />
                  <label for="auth-name">Your name</label>
                </div>
                <div v-if="showError('name')" id="auth-name-error" class="field-error">{{ errors.name }}</div>
              </div>
            </Transition>

            <div class="field">
              <div class="form-floating">
                <input
                  id="auth-email"
                  v-model="form.email"
                  class="form-control"
                  :class="{ 'is-invalid': showError('email') }"
                  type="email"
                  placeholder="name@example.com"
                  autocomplete="email"
                  inputmode="email"
                  :aria-describedby="showError('email') ? 'auth-email-error' : undefined"
                  @blur="touched.email = true"
                />
                <label for="auth-email">Email address</label>
              </div>
              <div v-if="showError('email')" id="auth-email-error" class="field-error">{{ errors.email }}</div>
            </div>

            <div class="field">
              <div class="form-floating password-wrap">
                <input
                  id="auth-password"
                  v-model="form.password"
                  class="form-control"
                  :class="{ 'is-invalid': showError('password') }"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Password"
                  :autocomplete="isSignup ? 'new-password' : 'current-password'"
                  maxlength="128"
                  :aria-describedby="showError('password') ? 'auth-password-error' : undefined"
                  @blur="touched.password = true"
                />
                <label for="auth-password">Password</label>
                <button
                  type="button"
                  class="peek"
                  :aria-pressed="showPassword"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
              <div v-if="showError('password')" id="auth-password-error" class="field-error">
                {{ errors.password }}
              </div>
            </div>

            <Transition name="field">
              <div v-if="isSignup" class="field">
                <!-- Password strength, styled like Singapore's energy label ticks.
                     Only shown once the user starts typing a password. -->
                <Transition name="field">
                  <div v-if="form.password" class="rating-wrap">
                    <div class="energy-label" :data-score="strength">
                      <span class="energy-label-title">Password rating</span>
                      <span class="ticks" aria-hidden="true">
                        <span v-for="n in 5" :key="n" class="tick" :class="{ on: n <= strength }">✓</span>
                      </span>
                      <span class="energy-label-text">{{ STRENGTH_LABELS[strength] }}</span>
                    </div>
                  </div>
                </Transition>
                <span class="visually-hidden" aria-live="polite">
                  {{ form.password ? 'Password strength: ' + STRENGTH_LABELS[strength] : '' }}
                </span>

                <div class="form-floating">
                  <input
                    id="auth-confirm"
                    v-model="form.confirm"
                    class="form-control"
                    :class="{ 'is-invalid': showError('confirm') }"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="Confirm password"
                    autocomplete="new-password"
                    maxlength="128"
                    :aria-describedby="showError('confirm') ? 'auth-confirm-error' : undefined"
                    @blur="touched.confirm = true"
                  />
                  <label for="auth-confirm">Confirm password</label>
                </div>
                <div v-if="showError('confirm')" id="auth-confirm-error" class="field-error">
                  {{ errors.confirm }}
                </div>
              </div>
            </Transition>

            <div class="form-check remember">
              <input id="auth-remember" v-model="form.remember" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="auth-remember">Keep me logged in for 30 days</label>
            </div>

            <button class="btn btn-success btn-submit w-100" type="submit">
              <span v-if="busy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ busy ? (isSignup ? 'Creating account…' : 'Logging in…') : isSignup ? 'Create account' : 'Log in' }}
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
      </div>
    </section>
  </div>
</template>
