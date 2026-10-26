// Removes the first-load splash from index.html once the app is ready.
// The splash is split into two halves that swing open like a gatefold card,
// and the app behind them unfolds into view. The styles live in index.html.
export function hideSplash() {
  const loader = document.getElementById('app-loader')
  if (!loader) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loader.remove()
    return
  }

  // Each half is a copy of the splash. Copies restart their CSS animations,
  // so freeze both on the frame the splash is showing right now.
  const times = loader.getAnimations({ subtree: true }).map((a) => a.currentTime)
  const stage = document.createElement('div')
  stage.className = 'app-loader-stage'
  stage.setAttribute('aria-hidden', 'true')
  const halves = ['app-loader-left', 'app-loader-right'].map((side) => {
    const half = loader.cloneNode(true)
    half.removeAttribute('id')
    half.classList.add(side)
    return half
  })
  stage.append(...halves)
  document.body.append(stage)
  for (const half of halves) {
    half.getAnimations({ subtree: true }).forEach((a, i) => {
      a.pause()
      a.currentTime = times[i] ?? 0
    })
  }
  loader.remove()

  const app = document.getElementById('app')
  app.classList.add('app-unfold-in')
  app.addEventListener('animationend', function done(e) {
    if (e.target !== app) return
    app.classList.remove('app-unfold-in')
    app.removeEventListener('animationend', done)
  })

  halves.forEach((half) => half.classList.add('app-loader-half'))
  // Remove after the 0.9s unfold; a timer also covers browsers that skip animationend.
  setTimeout(() => stage.remove(), 1000)
}
