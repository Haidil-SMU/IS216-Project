<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'

const open = ref(false)
const view = ref({ mode: 'notify', title: '', message: '', okText: 'Got it', cancelText: 'Cancel', danger: false })
const primary = ref(null)
const cancelButton = ref(null)
let settle = null
let queue = Promise.resolve()
let opener = null

const uid = Math.random().toString(36).slice(2, 8)
const titleId = `app-dialog-title-${uid}`
const messageId = `app-dialog-message-${uid}`

function show(options) {
  const next = queue.then(
    () =>
      new Promise((resolve) => {
        view.value = {
          mode: 'notify', title: 'A quick heads-up', message: '', okText: 'Got it', cancelText: 'Cancel', danger: false,
          ...options,
        }
        settle = resolve
        opener = document.activeElement
        open.value = true
        window.addEventListener('keydown', onKey, true)
        nextTick(() => (view.value.danger ? cancelButton.value : primary.value)?.focus())
      }),
  )
  queue = next.catch(() => {})
  return next
}

function close(answer) {
  if (!open.value) return
  open.value = false
  window.removeEventListener('keydown', onKey, true)
  const done = settle
  settle = null
  done?.(answer)
  opener?.focus?.({ preventScroll: true })
  opener = null
}

const isConfirm = () => view.value.mode === 'confirm'

function onKey(e) {
  if (!open.value) return
  e.stopPropagation()
  if (e.key === 'Escape') {
    e.preventDefault()
    close(isConfirm() ? false : undefined)
  } else if (e.key === 'Tab') {
    const buttons = [cancelButton.value, primary.value].filter(Boolean)
    const at = buttons.indexOf(document.activeElement)
    if (!buttons.length) return
    e.preventDefault()
    buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus()
  }
}

const confirm = (options) => show({ ...options, mode: 'confirm', okText: options.okText ?? 'Yes', title: options.title ?? 'Are you sure?' })
const notify = (options) => show({ ...options, mode: 'notify' })

defineExpose({ confirm, notify })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  close(isConfirm() ? false : undefined)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ad" appear>
      <div
        v-if="open"
        class="app-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
        @click.self="close(isConfirm() ? false : undefined)"
      >
        <div class="ad-card">
          <svg class="ad-mascot" viewBox="10 4 82 82" aria-hidden="true">
            <circle class="ad-puff" cx="62.5" cy="17" r="3" />
            <circle class="ad-puff" cx="62.5" cy="17" r="3" />
            <rect class="ad-line" x="58" y="22" width="9" height="16" rx="2" fill="#fff" />
            <path class="ad-line" d="M22 46 L48 24 L74 46 V72 a6 6 0 0 1 -6 6 H28 a6 6 0 0 1 -6 -6 Z" fill="#fff" />
            <g class="ad-eyes" fill="#0f3d27">
              <ellipse cx="40" cy="55" rx="3" ry="3.6" />
              <ellipse cx="56" cy="55" rx="3" ry="3.6" />
            </g>
            <ellipse cx="34" cy="62" rx="4" ry="2.6" fill="#ff9fb2" opacity="0.7" />
            <ellipse cx="62" cy="62" rx="4" ry="2.6" fill="#ff9fb2" opacity="0.7" />
            <path d="M44.5 62 q3.5 3.5 7 0" fill="none" stroke="#0f3d27" stroke-width="2.2" stroke-linecap="round" />
            <g class="ad-badge">
              <circle cx="74" cy="68" r="8" fill="#ffc94d" stroke="#0f3d27" stroke-width="2" />
              <text x="74" y="72.6" text-anchor="middle" font-size="12" font-weight="800" fill="#0f3d27">{{ isConfirm() ? '?' : '!' }}</text>
            </g>
          </svg>

          <button type="button" class="ad-close" aria-label="Close" @click="close(isConfirm() ? false : undefined)">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>

          <h2 :id="titleId" class="ad-title">{{ view.title }}</h2>
          <p :id="messageId" class="ad-message">{{ view.message }}</p>

          <div class="ad-actions">
            <button v-if="isConfirm()" ref="cancelButton" type="button" class="ad-btn ad-btn-quiet" @click="close(false)">
              {{ view.cancelText }}
            </button>
            <button
              ref="primary"
              type="button"
              class="ad-btn"
              :class="view.danger ? 'ad-btn-danger' : 'ad-btn-primary'"
              @click="close(isConfirm() ? true : undefined)"
            >
              {{ view.okText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-dialog {
  --ad-green: #198754;
  --ad-green-deep: #146c43;
  --ad-ink: #1d2b23;
  --ad-muted: #56665d;
  --ad-mint: #e3f5ea;
  --ad-red: #c0392b;
  --ad-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  position: fixed;
  inset: 0;
  z-index: 1060;
  display: grid;
  place-items: center;
  padding: 72px 16px 16px;
  background: rgba(18, 38, 27, 0.45);
  backdrop-filter: blur(2px);
}

.ad-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 64px 28px 24px;
  border-radius: 24px;
  background: #fff;
  box-shadow:
    0 2px 6px rgba(16, 40, 28, 0.08),
    0 24px 48px -12px rgba(16, 40, 28, 0.35);
  text-align: center;
  color: var(--ad-ink);
}

.ad-mascot {
  position: absolute;
  top: -52px;
  left: 50%;
  width: 104px;
  height: 104px;
  margin-left: -52px;
  padding: 4px;
  border-radius: 50%;
  background: var(--ad-mint);
  box-shadow: 0 0 0 6px #fff;
  overflow: visible;
  transform-origin: 50% 100%;
  animation: ad-hop 700ms 120ms var(--ad-spring) both;
}

.ad-line { stroke: var(--ad-green); stroke-width: 3; stroke-linejoin: round; }
.ad-eyes { transform-box: fill-box; transform-origin: center; animation: ad-blink 1.8s 0.6s infinite; }
.ad-badge { transform-box: fill-box; transform-origin: center; animation: ad-pop 500ms 450ms var(--ad-spring) both; }
.ad-puff { fill: #cfe3d7; opacity: 0; transform-box: fill-box; transform-origin: center; animation: ad-puff 2.4s 900ms ease-out infinite; }
.ad-puff + .ad-puff { animation-delay: 2.1s; }

.ad-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ad-muted);
  transition: background-color 150ms ease, color 150ms ease, transform 250ms var(--ad-spring);
}
.ad-close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.ad-close:hover { background: var(--ad-mint); color: var(--ad-green-deep); transform: rotate(90deg); }

.ad-title { margin: 0 0 8px; font-size: 1.375rem; font-weight: 700; letter-spacing: -0.01em; }
.ad-message { margin: 0 0 22px; font-size: 0.9375rem; line-height: 1.55; color: var(--ad-muted); white-space: pre-line; }

.ad-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }

.ad-btn {
  min-height: 46px;
  min-width: 130px;
  padding: 10px 18px;
  border: 0;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
  transition: transform 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
}
.ad-btn:active { transform: scale(0.97); }
.ad-btn:focus-visible,
.ad-close:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }

.ad-btn-primary { background: var(--ad-green); color: #fff; box-shadow: 0 6px 14px -6px rgba(25, 135, 84, 0.7); }
.ad-btn-primary:hover { background: var(--ad-green-deep); transform: translateY(-1px); }
.ad-btn-danger { background: var(--ad-red); color: #fff; box-shadow: 0 6px 14px -6px rgba(192, 57, 43, 0.7); }
.ad-btn-danger:hover { background: #a93226; transform: translateY(-1px); }
.ad-btn-quiet { background: var(--ad-mint); color: var(--ad-green-deep); }
.ad-btn-quiet:hover { background: #d3eddc; }

.ad-enter-active { transition: opacity 220ms ease; }
.ad-enter-active .ad-card { transition: transform 480ms var(--ad-spring), opacity 220ms ease; }
.ad-leave-active { transition: opacity 180ms ease-in; }
.ad-leave-active .ad-card { transition: transform 180ms ease-in, opacity 180ms ease-in; }
.ad-enter-from, .ad-leave-to { opacity: 0; }
.ad-enter-from .ad-card { opacity: 0; transform: translateY(24px) scale(0.92); }
.ad-leave-to .ad-card { opacity: 0; transform: translateY(8px) scale(0.96); }

@keyframes ad-hop {
  0% { transform: translateY(18px) scale(0.6); opacity: 0; }
  45% { transform: translateY(-10px) scale(1.04, 0.96); opacity: 1; }
  70% { transform: translateY(0) scale(0.97, 1.03); }
  100% { transform: none; }
}
@keyframes ad-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
@keyframes ad-pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
@keyframes ad-puff {
  0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(4px, -14px) scale(1.6); }
}

@media (max-width: 360px) { .ad-card { padding-inline: 20px; } .ad-btn { min-width: 0; flex: 1 1 100%; } }

@media (prefers-reduced-motion: reduce) {
  .ad-mascot, .ad-eyes, .ad-badge, .ad-puff { animation: none; }
  .ad-enter-from .ad-card, .ad-leave-to .ad-card, .ad-close:hover, .ad-btn:hover { transform: none; }
}
</style>