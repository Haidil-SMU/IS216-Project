import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppDialog from '../AppDialog.vue'

// The dialog is teleported to <body>, so it is found on document, not inside the wrapper.
const dialogEl = () => document.body.querySelector('[role="alertdialog"]')
const button = (selector) => document.body.querySelector(selector)

describe('AppDialog', () => {
  let wrapper

  function mountDialog() {
    wrapper = mount(AppDialog, { attachTo: document.body })
    return wrapper.vm
  }

  afterEach(() => {
    wrapper.unmount()
  })

  it('confirm() shows the question and resolves true when the user agrees', async () => {
    const dialog = mountDialog()
    const answer = dialog.confirm({ title: 'Clear the Kitchen?', message: 'This removes every item.', okText: 'Clear room' })
    await flushPromises()

    expect(dialogEl().querySelector('.ad-title').textContent).toBe('Clear the Kitchen?')
    expect(dialogEl().querySelector('.ad-message').textContent).toBe('This removes every item.')
    expect(button('.ad-btn-primary').textContent.trim()).toBe('Clear room')

    button('.ad-btn-primary').click()

    expect(await answer).toBe(true)
    await flushPromises()
    expect(dialogEl()).toBeNull()
  })

  it('confirm() resolves false when the user presses Cancel', async () => {
    const dialog = mountDialog()
    const answer = dialog.confirm({ message: 'Remove this?' })
    await flushPromises()

    expect(dialogEl().querySelector('.ad-title').textContent).toBe('Are you sure?')
    button('.ad-btn-quiet').click()

    expect(await answer).toBe(false)
  })

  it('confirm() resolves false when the user presses Escape', async () => {
    const dialog = mountDialog()
    const answer = dialog.confirm({ message: 'Remove this?' })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(await answer).toBe(false)
    await flushPromises()
    expect(dialogEl()).toBeNull()
  })

  it('notify() has a single "Got it" button and no Cancel button', async () => {
    const dialog = mountDialog()
    const answer = dialog.notify({ title: 'Heads-up', message: 'Saved.' })
    await flushPromises()

    expect(button('.ad-btn-quiet')).toBeNull()
    expect(button('.ad-btn-primary').textContent.trim()).toBe('Got it')

    button('.ad-btn-primary').click()

    expect(await answer).toBeUndefined()
  })

  it('puts the focus on Cancel for a dangerous question, so Enter does not delete by accident', async () => {
    const dialog = mountDialog()
    dialog.confirm({ message: 'Delete everything?', danger: true })
    await flushPromises()

    expect(button('.ad-btn-danger')).not.toBeNull()
    expect(document.activeElement).toBe(button('.ad-btn-quiet'))
  })

  it('shows a second question only after the first one has been answered', async () => {
    const dialog = mountDialog()
    const first = dialog.confirm({ message: 'First question' })
    const second = dialog.confirm({ message: 'Second question' })
    await flushPromises()

    expect(dialogEl().querySelector('.ad-message').textContent).toBe('First question')

    button('.ad-btn-primary').click()
    expect(await first).toBe(true)
    await flushPromises()

    expect(dialogEl().querySelector('.ad-message').textContent).toBe('Second question')
    button('.ad-btn-quiet').click()
    expect(await second).toBe(false)
  })
})
