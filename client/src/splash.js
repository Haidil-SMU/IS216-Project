// Removes the first-load splash from index.html once the app is ready.
// The splash turns over like a page and the app shows underneath.
// The styles live in index.html.
export function hideSplash() {
  const loader = document.getElementById('app-loader')
  if (!loader) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loader.remove()
    return
  }

  const app = document.getElementById('app')
  app.classList.add('app-reveal')
  app.addEventListener('animationend', function done(e) {
    if (e.target !== app) return
    app.classList.remove('app-reveal')
    app.removeEventListener('animationend', done)
  })

  loader.classList.add('app-flip-page')
  // The page turns for 1.6s; a timer also covers browsers that skip animationend.
  setTimeout(() => loader.remove(), 1700)
}
