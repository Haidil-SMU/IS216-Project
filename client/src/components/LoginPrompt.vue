<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const SECONDS = 5

const auth = useAuthStore()
const router = useRouter()
const secondsLeft = ref(SECONDS)
const loginButton = ref(null)
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
  () => auth.loginPrompt,
  async (location) => {
    stopTimer()
    if (!location) return
    secondsLeft.value = SECONDS
    timer = setInterval(() => {
      secondsLeft.value -= 1
      if (secondsLeft.value <= 0) go()
    }, 1000)
    await nextTick()
    loginButton.value?.focus()
  },
)

onBeforeUnmount(stopTimer)
</script>

<template>
  <template v-if="auth.loginPrompt">
    <div
      class="modal d-block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
      @keydown.esc="auth.closeLoginPrompt()"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="login-prompt-title" class="modal-title">Please log in first</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="auth.closeLoginPrompt()"></button>
          </div>
          <div class="modal-body">
            <p class="mb-2">You need an account to view this page.</p>
            <p class="mb-0 text-secondary" aria-live="polite">
              Taking you to the login page in <strong>{{ secondsLeft }}</strong>s…
            </p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="auth.closeLoginPrompt()">
              Cancel
            </button>
            <button ref="loginButton" type="button" class="btn btn-success" @click="go">
              Log in now
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show"></div>
  </template>
</template>
