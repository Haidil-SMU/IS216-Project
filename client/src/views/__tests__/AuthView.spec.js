import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import axios from 'axios'
import AuthView from '../AuthView.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('axios')

const Stub = { template: '<div />' }

async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/login', component: Stub },
      { path: '/MyProfile', component: Stub },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(AuthView, {
    props: { mode: 'login' },
    global: { plugins: [router] },
  })
  return { wrapper, router }
}

async function fillLogin(wrapper, email, password) {
  await wrapper.find('#auth-email').setValue(email)
  await wrapper.find('#auth-password').setValue(password)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('AuthView login form', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
    vi.mocked(axios.post).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows field errors and does not call the server when the form is empty', async () => {
    const { wrapper } = await mountAt('/login')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('#auth-email-error').text()).toBe('Please enter a valid email address.')
    expect(wrapper.find('#auth-password-error').text()).toContain('Please enter your password.')
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('shows the server message and stays on the login page when the password is wrong', async () => {
    vi.mocked(axios.post).mockRejectedValue({
      response: { status: 401, data: { error: 'Incorrect email or password.' } },
    })
    const { wrapper, router } = await mountAt('/login')

    await fillLogin(wrapper, 'amy@example.com', 'wrong-password')

    expect(wrapper.find('[role="alert"]').text()).toContain('Incorrect email or password.')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(useAuthStore().user).toBeNull()
  })

  it('logs in and goes to the ?redirect= page', async () => {
    const user = { id: '1', name: 'Amy', role: 'client', hasHousehold: true }
    vi.mocked(axios.post).mockResolvedValue({ data: { user } })
    const { wrapper, router } = await mountAt('/login?redirect=/MyProfile')

    await fillLogin(wrapper, '  amy@example.com  ', 'Str0ng!Pass')
    await vi.advanceTimersByTimeAsync(900)
    await flushPromises()

    expect(axios.post).toHaveBeenCalledWith('/api/auth/login', {
      email: 'amy@example.com',
      password: 'Str0ng!Pass',
      remember: true,
    })
    expect(useAuthStore().user).toEqual(user)
    expect(router.currentRoute.value.path).toBe('/MyProfile')
  })
})
