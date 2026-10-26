// Removes the first-load splash from index.html once the app is ready.
// The splash turns over like a page, two tinted pages follow it, and the app
// shows underneath. The styles live in index.html.
export function hideSplash() {
  const loader = document.getElementById('app-loader')
  if (!loader) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loader.remove()
    return
  }

  // The pages under the splash, top one first.
  const sheets = [0, 1].map(() => {
    const sheet = document.createElement('div')
    sheet.className = 'app-flip-sheet'
    sheet.setAttribute('aria-hidden', 'true')
    return sheet
  })
  loader.after(...sheets)

  const app = document.getElementById('app')
  app.classList.add('app-reveal')
  app.addEventListener('animationend', function done(e) {
    if (e.target !== app) return
    app.classList.remove('app-reveal')
    app.removeEventListener('animationend', done)
  })

  for (const page of [loader, ...sheets]) page.classList.add('app-flip-page')
  // The last page starts 0.28s in and turns for 0.8s.
  setTimeout(() => {
    loader.remove()
    sheets.forEach((sheet) => sheet.remove())
  }, 1150)
}
