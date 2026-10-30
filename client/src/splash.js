// Ends the first-visit splash from index.html once the app is ready.
// When the eco scene has finished building, dusk falls and the user switches
// the lights on; the splash then fades into the home page. The styles live in index.html.

// Set once the user has switched the lights on. A session cookie, so every tab shares it
// and it clears when the browser closes. An inline script in index.html reads the same
// cookie and removes the splash.
const SEEN_COOKIE = 'ecohome.splashSeen=1; path=/; SameSite=Lax'
// How long the scene in index.html takes to build, from page load.
const SCENE_MS = 4000
// Time for every window to light up before moving on.
const LIGHTS_MS = 1600
const LEAVE_MS = 800

let markGone
const gone = new Promise((resolve) => (markGone = resolve))

// Resolves once the splash has left the screen, so popups and timers can wait for it.
export function whenSplashGone() {
  return document.getElementById('app-loader') ? gone : Promise.resolve()
}

export function hideSplash() {
  const loader = document.getElementById('app-loader')
  if (!loader) return markGone()

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const wait = reduceMotion ? 0 : Math.max(0, SCENE_MS - performance.now())
  setTimeout(() => showSwitch(loader), wait)
}

function showSwitch(loader) {
  loader.classList.add('is-ready')
  loader.querySelector('[role="status"]').textContent =
    'HDB EcoHome is ready. Switch on the lights to enter.'
  loader.querySelector('.app-loader-switch').focus({ preventScroll: true })
  // The button, or a click anywhere on the splash, switches the lights on.
  loader.addEventListener('click', () => switchOn(loader), { once: true })
}

function switchOn(loader) {
  try {
    document.cookie = SEEN_COOKIE
  } catch {
    // Cookies are blocked, so the splash shows again next time.
  }
  loader.classList.add('is-lit')
  loader.querySelector('[role="status"]').textContent = 'Welcome home'

  setTimeout(() => {
    const app = document.getElementById('app')
    app.classList.add('app-reveal')
    loader.classList.add('is-leaving')
    // The app's reveal runs as long as the splash's fade.
    setTimeout(() => {
      loader.remove()
      app.classList.remove('app-reveal')
      markGone()
    }, LEAVE_MS)
  }, LIGHTS_MS)
}
