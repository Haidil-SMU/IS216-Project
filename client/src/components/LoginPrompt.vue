<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { whenSplashGone } from '@/splash'

const SECONDS = 5

const auth = useAuthStore()
const router = useRouter()
const secondsLeft = ref(SECONDS)
const loginButton = ref(null)
// Bumped on every open so the button's countdown fill restarts from empty.
const openId = ref(0)
// A protected address opened from the address bar asks for login behind the first-load
// splash; wait until the splash is gone so the popup and its countdown are actually seen.
const splashGone = ref(false)
whenSplashGone().then(() => (splashGone.value = true))
let timer = null

function stopTimer() {
  clearInterval(timer)
  timer = null
}

function go() {
  const location = auth.loginPrompt
  auth.closeLoginPrompt()
  if (location) router.push(location)
}

// Restart the countdown each time the popup opens; stop it when it closes.
watch(
  [() => auth.loginPrompt, splashGone],
  async ([location, ready]) => {
    stopTimer()
    if (!location || !ready) return
    openId.value += 1
    secondsLeft.value = SECONDS
    timer = setInterval(() => {
      secondsLeft.value -= 1
      if (secondsLeft.value <= 0) go()
    }, 1000)
    await nextTick()
    loginButton.value?.focus()
  },
  { immediate: true },
)

onBeforeUnmount(stopTimer)
</script>

<template>
  <Transition name="lp" appear>
    <div
      v-if="auth.loginPrompt && splashGone"
      class="login-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
      aria-describedby="login-prompt-desc"
      :style="{ '--lp-duration': `${SECONDS}s` }"
      @keydown.esc="auth.closeLoginPrompt()"
      @click.self="auth.closeLoginPrompt()"
    >
      <div class="lp-card">
        <svg class="lp-mascot" viewBox="10 4 82 82" aria-hidden="true">
          <circle class="lp-puff" cx="62.5" cy="17" r="3" />
          <circle class="lp-puff" cx="62.5" cy="17" r="3" />
          <rect class="lp-line" x="58" y="22" width="9" height="16" rx="2" fill="#fff" />
          <path
            class="lp-line"
            d="M22 46 L48 24 L74 46 V72 a6 6 0 0 1 -6 6 H28 a6 6 0 0 1 -6 -6 Z"
            fill="#fff"
          />
          <g class="lp-eyes" fill="#0f3d27">
            <ellipse cx="40" cy="55" rx="3" ry="3.6" />
            <ellipse cx="56" cy="55" rx="3" ry="3.6" />
          </g>
          <ellipse cx="34" cy="62" rx="4" ry="2.6" fill="#ff9fb2" opacity="0.7" />
          <ellipse cx="62" cy="62" rx="4" ry="2.6" fill="#ff9fb2" opacity="0.7" />
          <path
            d="M44.5 62 q3.5 3.5 7 0"
            fill="none"
            stroke="#0f3d27"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <g class="lp-lock">
            <path
              d="M70.5 64 v-3.5 a4 4 0 0 1 8 0 V64"
              fill="none"
              stroke="#0f3d27"
              stroke-width="2.2"
            />
            <rect x="67" y="64" width="15" height="12" rx="3" fill="#ffc94d" stroke="#0f3d27" stroke-width="2" />
            <circle cx="74.5" cy="69" r="1.4" fill="#0f3d27" />
            <rect x="73.9" y="69" width="1.2" height="3.4" rx="0.6" fill="#0f3d27" />
          </g>
        </svg>

        <button type="button" class="lp-close" aria-label="Close" @click="auth.closeLoginPrompt()">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <h2 id="login-prompt-title" class="lp-title">Please log in first</h2>
        <p id="login-prompt-desc" class="lp-countdown" aria-live="polite">
          Taking you to the login page in
          <strong :key="secondsLeft" class="lp-count">{{ secondsLeft }}</strong>s…
        </p>

        <div class="lp-actions">
          <button ref="loginButton" type="button" class="lp-btn lp-btn-primary" @click="go">
            <span :key="openId" class="lp-fill" aria-hidden="true"></span>
            <span class="lp-btn-label">Log in now</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.login-prompt {
  --lp-green: #198754;
  --lp-green-deep: #146c43;
  --lp-ink: #1d2b23;
  --lp-muted: #56665d;
  --lp-mint: #e3f5ea;
  --lp-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  position: fixed;
  inset: 0;
  z-index: 1055;
  display: grid;
  place-items: center;
  padding: 72px 16px 16px;
  background: rgba(18, 38, 27, 0.45);
  backdrop-filter: blur(2px);
}

.lp-card {
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
  color: var(--lp-ink);
}

/* Mascot: a little house peeking over the top edge of the card */
.lp-mascot {
  position: absolute;
  top: -52px;
  left: 50%;
  width: 104px;
  height: 104px;
  margin-left: -52px;
  padding: 4px;
  border-radius: 50%;
  background: var(--lp-mint);
  box-shadow: 0 0 0 6px #fff;
  overflow: visible;
  transform-origin: 50% 100%;
  animation: lp-hop 700ms 120ms var(--lp-spring) both;
}

.lp-line {
  stroke: var(--lp-green);
  stroke-width: 3;
  stroke-linejoin: round;
}

.lp-eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: lp-blink 1.8s 0.6s infinite;
}

.lp-lock {
  transform-box: view-box;
  transform-origin: 74.5px 56.5px;
  animation: lp-swing 1.4s 450ms ease-out both;
}

.lp-puff {
  fill: #cfe3d7;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: lp-puff 2.4s 900ms ease-out infinite;
}

.lp-puff + .lp-puff {
  animation-delay: 2.1s;
}

.lp-close {
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
  color: var(--lp-muted);
  transition:
    background-color 150ms ease,
    color 150ms ease,
    transform 250ms var(--lp-spring);
}

.lp-close svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.lp-close:hover {
  background: var(--lp-mint);
  color: var(--lp-green-deep);
  transform: rotate(90deg);
}

.lp-title {
  margin: 0 0 6px;
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.lp-countdown {
  margin: 0 0 22px;
  font-size: 0.9375rem;
  color: var(--lp-muted);
}

.lp-count {
  display: inline-block;
  min-width: 0.7em;
  font-size: 1.5em;
  line-height: 1;
  color: var(--lp-green-deep);
  font-variant-numeric: tabular-nums;
  animation: lp-tick 350ms var(--lp-spring);
}

.lp-actions {
  display: flex;
  justify-content: center;
}

.lp-btn {
  position: relative;
  min-height: 46px;
  padding: 10px 16px;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
  overflow: hidden;
  transition:
    transform 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.lp-btn:active {
  transform: scale(0.97);
}

.lp-btn:focus-visible,
.lp-close:focus-visible {
  outline: 3px solid rgba(25, 135, 84, 0.45);
  outline-offset: 2px;
}

.lp-btn-primary {
  min-width: 220px;
  border: 0;
  background: var(--lp-green);
  color: #fff;
  box-shadow: 0 6px 14px -6px rgba(25, 135, 84, 0.7);
}

.lp-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px -8px rgba(25, 135, 84, 0.75);
}

/* Countdown: a darker band sweeps across the button until the redirect */
.lp-fill {
  position: absolute;
  inset: 0;
  background: var(--lp-green-deep);
  transform: scaleX(0);
  transform-origin: left;
  animation: lp-countdown var(--lp-duration) linear forwards;
}

.lp-btn-label {
  position: relative;
}

/* Enter / leave */
.lp-enter-active {
  transition: opacity 220ms ease;
}

.lp-enter-active .lp-card {
  transition:
    transform 480ms var(--lp-spring),
    opacity 220ms ease;
}

.lp-leave-active {
  transition: opacity 180ms ease-in;
}

.lp-leave-active .lp-card {
  transition:
    transform 180ms ease-in,
    opacity 180ms ease-in;
}

.lp-enter-from,
.lp-leave-to {
  opacity: 0;
}

.lp-enter-from .lp-card {
  opacity: 0;
  transform: translateY(24px) scale(0.92);
}

.lp-leave-to .lp-card {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

@keyframes lp-hop {
  0% {
    transform: translateY(18px) scale(0.6);
    opacity: 0;
  }
  45% {
    transform: translateY(-10px) scale(1.04, 0.96);
    opacity: 1;
  }
  70% {
    transform: translateY(0) scale(0.97, 1.03);
  }
  100% {
    transform: none;
  }
}

@keyframes lp-swing {
  0% {
    transform: rotate(-24deg);
  }
  30% {
    transform: rotate(16deg);
  }
  55% {
    transform: rotate(-9deg);
  }
  78% {
    transform: rotate(4deg);
  }
  100% {
    transform: rotate(0);
  }
}

@keyframes lp-blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}

@keyframes lp-puff {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.6);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(4px, -14px) scale(1.6);
  }
}

@keyframes lp-tick {
  0% {
    transform: translateY(-4px) scale(1.5);
  }
  100% {
    transform: none;
  }
}

@keyframes lp-countdown {
  to {
    transform: scaleX(1);
  }
}

@media (max-width: 360px) {
  .lp-card {
    padding-inline: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lp-mascot,
  .lp-eyes,
  .lp-lock,
  .lp-puff,
  .lp-count {
    animation: none;
  }

  .lp-enter-from .lp-card,
  .lp-leave-to .lp-card,
  .lp-close:hover,
  .lp-btn-primary:hover {
    transform: none;
  }
}
</style>
