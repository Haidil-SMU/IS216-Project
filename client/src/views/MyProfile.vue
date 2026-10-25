<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import HouseholdDetails from '@/components/HouseholdDetails.vue'
import PictureCropper from '@/components/PictureCropper.vue'
import MyQuotations from '@/views/MyQuotations.vue'
import RewardsWallet from '@/components/RewardsWallet.vue'

const TABS = [
  { id: 'household', label: '🏠 My Household' },
  { id: 'quotations', label: '📋 My Quotations' },
  { id: 'rewards', label: '🎁 Rewards Wallet' },
]

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// First letter or digit of the name, shown until the user has a profile picture.
const initial = computed(() => (auth.user?.name.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase())

const fileInput = ref(null)
const editButton = ref(null)
const pictureBusy = ref(false)
const pictureError = ref('')

// A chosen photo opens the cropper; saving it there uploads the framed part.
const cropFile = ref(null)

function choosePicture(event) {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  pictureError.value = ''
  if (!file.type.startsWith('image/')) {
    pictureError.value = 'Please choose an image file.'
    return
  }
  if (file.size > 15 * 1024 * 1024) {
    pictureError.value = 'Please choose an image smaller than 15 MB.'
    return
  }
  cropFile.value = file
}
// Closing the cropper puts keyboard focus back on the camera button.
function closeCropper() {
  cropFile.value = null
  nextTick(() => editButton.value?.focus())
}

// PUT /profile/picture replaces the picture; the new version changes its URL everywhere.
async function uploadPicture(blob) {
  closeCropper()
  pictureBusy.value = true
  try {
    const form = new FormData()
    form.append('picture', blob, 'picture.jpg')
    const response = await axios.put('/api/profile/picture', form)
    auth.user.pictureVersion = response.data.pictureVersion
  } catch (err) {
    console.log(err.message)
    pictureError.value =
      err.response?.data?.error || 'Unable to use that image. Please try a JPEG or PNG photo.'
  }
  pictureBusy.value = false
}
// The remove button asks first in a popup; Cancel is focused, as the safer choice.
const confirmRemove = ref(false)
const cancelRemoveButton = ref(null)

async function askRemovePicture() {
  confirmRemove.value = true
  await nextTick()
  cancelRemoveButton.value?.focus()
}
function cancelRemovePicture() {
  confirmRemove.value = false
  nextTick(() => editButton.value?.focus())
}
async function removePicture() {
  confirmRemove.value = false
  nextTick(() => editButton.value?.focus())
  pictureBusy.value = true
  pictureError.value = ''
  try {
    await axios.delete('/api/profile/picture')
    auth.user.pictureVersion = null
  } catch (err) {
    console.log(err.message)
    pictureError.value = 'Unable to remove your picture. Please try again.'
  }
  pictureBusy.value = false
}

// The open tab lives in the URL (?tab=quotations, ?tab=rewards) so links and refreshes keep it.
const tab = computed(() =>
  TABS.some((item) => item.id === route.query.tab) ? route.query.tab : 'household',
)
const tabIndex = computed(() => TABS.findIndex((item) => item.id === tab.value))

function openTab(id) {
  if (id === tab.value) return
  const query = { ...route.query, tab: id }
  if (id === 'household') delete query.tab
  router.replace({ query })
}
// Arrow keys move between tabs, as in a standard tab list.
async function moveTab(step) {
  const next = TABS[(tabIndex.value + step + TABS.length) % TABS.length]
  openTab(next.id)
  await nextTick()
  document.getElementById(`tab-${next.id}`)?.focus()
}
</script>
<template>
  <div class="planner-page">
    <main class="container py-4 py-lg-5">
      <section class="profile-header mb-5" aria-labelledby="profile-name">
        <div class="profile-body">
          <div class="profile-picture-wrap">
            <div class="profile-picture" :class="{ busy: pictureBusy }">
              <img v-if="auth.pictureUrl" :src="auth.pictureUrl" alt="" />
              <span v-else aria-hidden="true">{{ initial }}</span>
            </div>
            <button
              type="button"
              ref="editButton"
              class="profile-picture-edit"
              :disabled="pictureBusy"
              aria-label="Change profile picture"
              title="Change profile picture"
              @click="fileInput.click()"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"
                />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </button>
            <!-- Shown when the picture is hovered or focused (always on touch screens). -->
            <button
              v-if="auth.pictureUrl"
              type="button"
              class="profile-picture-remove"
              :disabled="pictureBusy"
              aria-label="Remove profile picture"
              title="Remove profile picture"
              @click="askRemovePicture"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/png, image/jpeg, image/webp"
              class="visually-hidden"
              tabindex="-1"
              aria-hidden="true"
              @change="choosePicture"
            />
          </div>
          <div class="profile-meta">
            <h1 id="profile-name" class="profile-name">{{ auth.user?.name }}</h1>
            <p v-if="auth.user?.email" class="profile-email">{{ auth.user.email }}</p>
            <div class="profile-badges">
              <span class="profile-badge">Homeowner</span>
              <span v-if="auth.user?.singpass" class="profile-badge profile-badge-singpass">
                ✓ Singpass verified
              </span>
            </div>
            <span v-if="pictureBusy" class="visually-hidden" role="status"
              >Updating your picture…</span
            >
            <p v-if="pictureError" class="text-danger small mt-2 mb-0" role="alert">
              {{ pictureError }}
            </p>
          </div>
        </div>
      </section>
      <div class="text-center mb-4">
        <div
          class="profile-tabs"
          :style="{ '--tabs': TABS.length, '--tab': tabIndex }"
          role="tablist"
          aria-label="My Profile sections"
          @keydown.right.prevent="moveTab(1)"
          @keydown.left.prevent="moveTab(-1)"
        >
          <span class="profile-tabs-thumb" aria-hidden="true"></span>
          <button
            v-for="item in TABS"
            :id="`tab-${item.id}`"
            :key="item.id"
            type="button"
            class="profile-tab"
            :class="{ active: tab === item.id }"
            role="tab"
            :aria-selected="tab === item.id"
            :aria-controls="`panel-${item.id}`"
            :tabindex="tab === item.id ? 0 : -1"
            @click="openTab(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <!-- v-show keeps both tabs mounted, so unsaved household edits survive a tab switch. -->
      <section
        v-show="tab === 'household'"
        id="panel-household"
        role="tabpanel"
        aria-labelledby="tab-household"
      >
        <HouseholdDetails />
      </section>
      <section
        v-show="tab === 'quotations'"
        id="panel-quotations"
        role="tabpanel"
        aria-labelledby="tab-quotations"
      >
        <MyQuotations />
      </section>
      <section
        v-show="tab === 'rewards'"
        id="panel-rewards"
        role="tabpanel"
        aria-labelledby="tab-rewards"
      >
        <RewardsWallet />
      </section>
    </main>
    <Transition name="popup">
      <div
        v-if="confirmRemove"
        class="popup-backdrop"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-title"
        aria-describedby="remove-desc"
        @click.self="cancelRemovePicture"
        @keydown.esc="cancelRemovePicture"
      >
        <div class="popup-card text-center">
          <img v-if="auth.pictureUrl" :src="auth.pictureUrl" alt="" class="remove-preview" />
          <h2 id="remove-title" class="h5 fw-bold">Remove profile picture?</h2>
          <p id="remove-desc" class="text-secondary mb-3">
            Your initial will be shown instead. You can upload a new photo at any time.
          </p>
          <div class="d-flex gap-2">
            <button
              ref="cancelRemoveButton"
              type="button"
              class="btn btn-outline-secondary flex-fill"
              @click="cancelRemovePicture"
            >
              Cancel
            </button>
            <button type="button" class="btn btn-danger flex-fill" @click="removePicture">
              Remove
            </button>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="popup">
      <PictureCropper
        v-if="cropFile"
        :file="cropFile"
        @cancel="closeCropper"
        @save="uploadPicture"
      />
    </Transition>
    <footer class="border-top py-4 text-center text-secondary">HDB EcoHome · My Profile</footer>
  </div>
</template>
