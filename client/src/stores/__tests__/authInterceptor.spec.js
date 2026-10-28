import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import axios, { AxiosError } from 'axios'
import { installAuthInterceptor, useAuthStore } from '../auth'

// A page that makes one API call when its button is clicked, like any real page would.
const ApiPage = {
  props: ['url'],
  data: () => ({ failed: false }),
  template: '<button @click="load">Load</button><p v-if="failed">failed</p>',
  methods: {
    async load() {
      try {
        await axios.get(this.url)
      } catch {
        this.failed = true
      }
    },
  },
}

// Every request fails with `status`, without touching the network.
function respondWith(status) {
  axios.defaults.adapter = (config) =>
    Promise.reject(
      new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
        status,
        data: {},
        headers: {},
        config,
      }),
    )
}

async function setup(path, url) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/planner', component: ApiPage, meta: { role: 'client' } },
      { path: '/dashboard', component: ApiPage, meta: { role: 'contractor' } },
      { path: '/login', component: { template: '<p>login</p>' } },
    ],
  })
  installAuthInterceptor(router)
  router.push(path)
  await router.isReady()
  const wrapper = mount(ApiPage, { props: { url }, global: { plugins: [router] } })
  await wrapper.find('button').trigger('click')
  await flushPromises()
  return { wrapper, router }
}

describe('installAuthInterceptor', () => {
  const originalAdapter = axios.defaults.adapter

  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().user = { id: '1', name: 'Amy', role: 'client' }
  })

  afterEach(() => {
    axios.interceptors.response.clear()
    axios.defaults.adapter = originalAdapter
  })

  it('logs the user out and sends them to log in, coming back to this page', async () => {
    respondWith(401)
    const { router } = await setup('/planner', '/api/planner')

    expect(useAuthStore().user).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query).toEqual({ redirect: '/planner' })
  })

  it('opens the contractor login from a contractor page', async () => {
    respondWith(401)
    const { router } = await setup('/dashboard', '/api/contractor/profile')

    expect(router.currentRoute.value.query).toEqual({ redirect: '/dashboard', as: 'contractor' })
  })

  it('leaves a failed login alone, so a wrong password does not redirect', async () => {
    respondWith(401)
    const { router } = await setup('/planner', '/api/auth/login')

    expect(useAuthStore().user).not.toBeNull()
    expect(router.currentRoute.value.path).toBe('/planner')
  })

  it('ignores errors that are not an expired session', async () => {
    respondWith(500)
    const { router } = await setup('/planner', '/api/planner')

    expect(useAuthStore().user).not.toBeNull()
    expect(router.currentRoute.value.path).toBe('/planner')
  })

  it('still passes the error on to the page that made the call', async () => {
    respondWith(401)
    const { wrapper } = await setup('/planner', '/api/planner')

    expect(wrapper.text()).toContain('failed')
  })
})
