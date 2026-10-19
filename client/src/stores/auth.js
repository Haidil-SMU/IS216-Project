import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API_URL = '/api'

// Only allow redirects inside this site ("/path", never "//other-site").
export function safeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : ''
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const ready = ref(false)
  const loggedIn = computed(() => user.value !== null)
  let pending = null

  // GET /auth/me once per page load; the session cookie does the rest.
  async function fetchMe(force = false) {
    if (ready.value && !force) return user.value
    pending ??= axios
      .get(API_URL + '/auth/me')
      .then((response) => {
        user.value = response.data.user
      })
      .catch(() => {
        user.value = null
      })
      .finally(() => {
        ready.value = true
        pending = null
      })
    await pending
    return user.value
  }

  async function login(form) {
    const response = await axios.post(API_URL + '/auth/login', form)
    user.value = response.data.user
    ready.value = true
    return user.value
  }

  async function signup(form) {
    const response = await axios.post(API_URL + '/auth/signup', form)
    user.value = response.data.user
    ready.value = true
    return user.value
  }

  async function logout() {
    await axios.post(API_URL + '/auth/logout')
    user.value = null
  }

  function clear() {
    user.value = null
  }

  // Singpass is a full-page redirect handled by the server.
  function singpassUrl(returnTo = '', mode = 'login') {
    const params = new URLSearchParams({ mode })
    if (safeRedirect(returnTo)) params.set('returnTo', returnTo)
    return API_URL + '/auth/singpass/login?' + params
  }

  return { user, ready, loggedIn, fetchMe, login, signup, logout, clear, singpassUrl }
})

// If the session expires while a page is open, send the user to log in again.
export function installAuthInterceptor(router) {
  axios.interceptors.response.use(undefined, (error) => {
    const url = error.config?.url || ''
    if (error.response?.status === 401 && url.startsWith(API_URL) && !url.includes('/auth/')) {
      useAuthStore().clear()
      const current = router.currentRoute.value
      if (current.path !== '/login') {
        router.push({ path: '/login', query: { redirect: current.fullPath } })
      }
    }
    return Promise.reject(error)
  })
}
