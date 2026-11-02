<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const API_URL = '/api'
const flatTypes = ref([])
const users = ref([])
const userId = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
// Set only when saving changed the flat type and the server rebuilt the 3D rooms.
const floorChange = ref(null)
const householdSection = ref(null)
const profile = ref(newProfile())
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const myinfoUrl = auth.singpassUrl('/MyProfile', 'myinfo')
const myinfoBanner = ref(false)
const myinfoFlatMissing = ref(false)
const myinfoMismatch = ref(false)
const mismatchButton = ref(null)
const setupPopup = ref(false)
const setupButton = ref(null)
// Set while the "change flat type?" warning is open: which rooms will go and which will be added.
const flatChange = ref(null)
const flatChangeCancel = ref(null)

const rooms = computed(() => 3 + Math.min(profile.value.bedrooms, 5))
// "24 Oct 2026", when this household was last filled from Myinfo.
const myinfoDate = computed(() => {
  const filledAt = profile.value.myinfo?.filledAt
  return filledAt
    ? new Date(filledAt).toLocaleDateString('en-SG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
})

function newProfile() {
  return {
    name: 'My household',
    flatType: '4-room',
    occupants: 4,
    bedrooms: 3,
    budget: 150,
    pattern: 'Mostly home in the evenings',
  }
}

// GET: read the flat types and this account's households from the server.
async function getData() {
  const response = await axios.get(API_URL + '/planner')
  flatTypes.value = response.data.flatTypes
  users.value = response.data.users
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    await getData()
    // Open the household asked for in the URL (from the planner), else the first one.
    // Myinfo details, if any, replace it below.
    const household =
      users.value.find((user) => user.id === route.query.household) || users.value[0]
    if (household) selectHousehold(household.id)
    else changeFlat()
    await loadMyinfoDraft()
  } catch (err) {
    console.log(err.message)
    error.value = 'Unable to load your household. Check that the server is running.'
  }
  if (route.query.error === 'myinfo') {
    error.value =
      'Unable to retrieve your Myinfo details. Please try again or fill in the form yourself.'
  }
  loading.value = false
  if (route.query.error === 'myinfo-mismatch') {
    myinfoMismatch.value = true
    await nextTick()
    mismatchButton.value?.focus()
  } else {
    await showSetupPopup()
  }
}
// The router sends homeowners without a household here with ?setup=household.
async function showSetupPopup() {
  if (!route.query.setup || loading.value || userId.value) return
  setupPopup.value = true
  await nextTick()
  setupButton.value?.focus()
}
// Drop ?setup so the next redirect here changes the URL and shows the popup again.
function closeSetupPopup() {
  setupPopup.value = false
  const query = { ...route.query }
  delete query.setup
  router.replace({ query })
}
watch(() => route.query.setup, showSetupPopup)
// Drop ?error from the URL so a refresh does not show the popup again.
function closeMyinfoMismatch() {
  myinfoMismatch.value = false
  const query = { ...route.query }
  delete query.error
  router.replace({ query })
}
onMounted(load)

// Myinfo: after a Singpass login, the server holds household details for review.
async function loadMyinfoDraft() {
  const response = await axios.get(API_URL + '/myinfo/draft')
  if (response.status !== 200 || !response.data) return
  const draft = response.data
  // Singpass worked, but this account returned no Myinfo details to fill in.
  if (!draft.myinfo?.fields?.length) {
    await axios.delete(API_URL + '/myinfo/draft')
    error.value =
      'Singpass did not return any Myinfo details for this account, so please fill in your household yourself.'
    return
  }
  // One household per account: Myinfo updates it, or starts it if there is none yet.
  profile.value = {
    ...profile.value,
    name: draft.name,
    occupants: draft.occupants,
    address: draft.address,
    myinfo: draft.myinfo,
  }
  if (draft.flatType) profile.value.flatType = draft.flatType
  changeFlat()
  myinfoFlatMissing.value = !draft.flatType
  myinfoBanner.value = true
}
async function dismissMyinfo() {
  myinfoBanner.value = false
  try {
    await axios.delete(API_URL + '/myinfo/draft')
  } catch (err) {
    console.log(err.message)
  }
}
// Fields filled from Myinfo are locked until the user chooses to edit them.
function fromMyinfo(field) {
  return Boolean(profile.value.myinfo?.fields?.includes(field))
}
function editManually(field) {
  profile.value.myinfo.fields = profile.value.myinfo.fields.filter((name) => name !== field)
}

// Use the required/min/max settings already on the HTML inputs.
function checkInputs(section) {
  const inputs = section.querySelectorAll('input, select, textarea')
  for (const input of inputs) {
    if (!input.reportValidity()) return false
  }
  return true
}

const flatName = (id) => flatTypes.value.find((flat) => flat.id === id)?.name ?? id
const roomsOf = (id) => flatTypes.value.find((flat) => flat.id === id)?.rooms ?? []

function floorSummary(changes) {
  if (!changes?.updated) return null
  return { added: changes.added || [], removed: changes.removed || [] }
}

// Changing the flat type of a saved household rebuilds its 3D rooms, so ask first.
async function saveProfile() {
  if (!checkInputs(householdSection.value)) return
  const saved = users.value.find((user) => user.id === userId.value)
  const from = saved && (saved.flatTypeId || saved.flatType)
  const to = profile.value.flatType
  if (from && from !== to) {
    const before = roomsOf(from)
    const after = roomsOf(to)
    flatChange.value = {
      from,
      fromName: flatName(from),
      toName: flatName(to),
      removed: before.filter((name) => !after.includes(name)),
      added: after.filter((name) => !before.includes(name)),
    }
    await nextTick()
    flatChangeCancel.value?.focus()
    return
  }
  await persistProfile()
}
async function confirmFlatChange() {
  flatChange.value = null
  await persistProfile()
}
// Cancelling puts the flat type back to what is saved.
function cancelFlatChange() {
  if (flatChange.value) profile.value.flatType = flatChange.value.from
  flatChange.value = null
  changeFlat()
}

// POST creates a household; PUT updates the selected household.
async function persistProfile() {
  busy.value = true
  error.value = ''
  notice.value = ''
  floorChange.value = null
  try {
    let response
    if (userId.value === '') {
      response = await axios.post(API_URL + '/users', profile.value)
    } else {
      response = await axios.put(API_URL + '/users/' + userId.value, profile.value)
    }
    userId.value = response.data.id
    if (auth.user) auth.user.hasHousehold = true
    await getData()
    myinfoBanner.value = false
    notice.value = 'Household saved.'
    floorChange.value = floorSummary(response.data.roomChanges)
  } catch (err) {
    console.log(err.message)
    error.value = err.response?.data?.error || 'Unable to save the household.'
  }
  busy.value = false
}

function selectHousehold(id) {
  userId.value = id
  myinfoBanner.value = false
  profile.value = newProfile()
  for (const user of users.value) {
    if (user.id === id) {
      // Copy the saved data so editing the form does not change the saved list.
      profile.value = JSON.parse(JSON.stringify(user))
      break
    }
  }
  changeFlat()
  notice.value = ''
}
function changeFlat() {
  for (const flat of flatTypes.value) {
    if (flat.id === profile.value.flatType) profile.value.bedrooms = flat.bedrooms
  }
}
</script>
<template>
  <div>
    <div v-if="error" class="text-center mb-3">
      <div class="error-banner" role="alert">
        <span aria-hidden="true">!</span> {{ error }}
        <button v-if="!flatTypes.length" type="button" :disabled="busy" @click="load">Retry</button>
      </div>
    </div>
    <p v-if="loading" role="status">Loading your household…</p>
    <div v-else-if="flatTypes.length" class="row justify-content-center">
      <section
        ref="householdSection"
        class="col-md-10 col-lg-7 col-xl-6"
        aria-labelledby="household-title"
      >
        <fieldset :disabled="busy" class="card border-0 shadow-sm">
          <div class="card-body p-4">
            <div v-if="myinfoBanner" class="alert alert-success small py-2" role="status">
              <strong>Filled from Myinfo.</strong> Please check the details, add your budget and
              save the household.
              <span v-if="myinfoFlatMissing" class="d-block mt-1">
                Myinfo has no HDB flat on record, so please choose your flat type.
              </span>
              <button type="button" class="btn btn-link btn-sm p-0 mt-1" @click="dismissMyinfo">
                Not now
              </button>
            </div>
            <!-- Myinfo can be retrieved again at any time to pick up changed records. -->
            <div v-else class="text-center mb-1">
              <a class="btn-singpass" :href="myinfoUrl">
                <span>{{
                  profile.myinfo ? 'Retrieve Myinfo again with' : 'Retrieve Myinfo with'
                }}</span
                ><span class="sp-wordmark">singpass</span>
              </a>
              <p v-if="myinfoDate" class="small text-secondary mt-1 mb-0">
                Last retrieved from Myinfo on {{ myinfoDate }}.
              </p>
            </div>
            <!-- Only accounts saved before the one-household rule can have several. -->
            <template v-if="users.length > 1">
              <label for="household" class="form-label mt-2">Saved household</label
              ><select
                id="household"
                class="form-select mb-3"
                :value="userId"
                @change="selectHousehold($event.target.value)"
              >
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.name }}
                </option>
              </select>
            </template>
            <label for="household-name" class="form-label mt-2">
              Household name
              <span v-if="fromMyinfo('name')" class="badge badge-singpass ms-1">Myinfo</span></label
            ><input
              id="household-name"
              v-model="profile.name"
              class="form-control mb-3"
              maxlength="100"
              required
            />
            <p v-if="profile.address" class="small text-secondary mb-3">
              📍 {{ profile.address }}
              <span v-if="fromMyinfo('address')" class="badge badge-singpass ms-1">Myinfo</span>
            </p>
            <label for="flat-type" class="form-label">
              HDB flat type
              <span v-if="fromMyinfo('flatType')" class="badge badge-singpass ms-1"
                >Myinfo</span
              ></label
            ><select
              id="flat-type"
              v-model="profile.flatType"
              class="form-select"
              :class="fromMyinfo('flatType') ? 'mb-1' : 'mb-3'"
              :disabled="fromMyinfo('flatType')"
              @change="changeFlat"
            >
              <option v-for="flat in flatTypes" :key="flat.id" :value="flat.id">
                {{ flat.name }}
              </option>
            </select>
            <button
              v-if="fromMyinfo('flatType')"
              type="button"
              class="btn btn-link btn-sm p-0 mb-3"
              @click="editManually('flatType')"
            >
              Edit manually
            </button>
            <div class="row g-3 mb-3">
              <div class="col-6">
                <label for="occupants" class="form-label">
                  Occupants
                  <span v-if="fromMyinfo('occupants')" class="text-secondary small"
                    >(estimated)</span
                  ></label
                ><input
                  id="occupants"
                  v-model.number="profile.occupants"
                  class="form-control"
                  type="number"
                  min="1"
                  max="20"
                  required
                />
              </div>
              <div class="col-6">
                <label for="bedrooms" class="form-label">Bedrooms</label
                ><input
                  id="bedrooms"
                  :value="profile.bedrooms"
                  class="form-control"
                  type="number"
                  readonly
                  aria-describedby="room-info"
                />
              </div>
            </div>
            <p id="room-info" class="small text-secondary">
              Bedrooms are set by the selected HDB flat type.
              {{ rooms }} planning spaces: bedrooms plus living room, kitchen and bathroom. Bathroom
              usage is grouped.
            </p>
            <label for="budget" class="form-label">Monthly electricity budget (S$)</label
            ><input
              id="budget"
              v-model.number="profile.budget"
              class="form-control mb-3"
              type="number"
              min="0"
              max="10000"
              step="0.01"
              required
            />
            <label for="pattern" class="form-label">Household usage pattern</label
            ><textarea
              id="pattern"
              v-model="profile.pattern"
              class="form-control mb-3"
              rows="2"
              maxlength="300"
            ></textarea>
            <p class="small text-secondary">
              Occupants and usage patterns describe your household. Set appliance hours in the
              Energy Planner to reflect their actual use.
            </p>
            <div v-if="notice" class="floor-card mb-3" role="status">
              <div class="floor-card-head">
                <span class="floor-card-tick" aria-hidden="true">✓</span>
                <div>
                  <p class="floor-card-title">{{ notice }}</p>
                  <p v-if="floorChange" class="floor-card-sub">
                    Your 3D floor plan was rebuilt for the new flat type.
                  </p>
                </div>
              </div>
              <div v-if="floorChange" class="floor-card-rows">
                <div v-if="floorChange.removed.length" class="floor-row">
                  <span class="floor-row-label">Removed</span>
                  <span class="floor-chips">
                    <span v-for="room in floorChange.removed" :key="room" class="floor-chip floor-chip-removed">{{ room }}</span>
                  </span>
                </div>
                <div v-if="floorChange.added.length" class="floor-row">
                  <span class="floor-row-label">Added</span>
                  <span class="floor-chips">
                    <span v-for="room in floorChange.added" :key="room" class="floor-chip floor-chip-added">{{ room }}</span>
                  </span>
                </div>
                <p v-if="!floorChange.removed.length && !floorChange.added.length" class="floor-row-note">
                  Reset to the standard layout for this flat type.
                </p>
              </div>
              <RouterLink to="/3d" class="floor-card-btn">Visualize 3D floorplan →</RouterLink>
            </div>
            <button class="btn btn-outline-success w-100" @click="saveProfile">
              Save household
            </button>
          </div>
        </fieldset>
      </section>
    </div>

    <Transition name="popup">
      <div
        v-if="setupPopup"
        class="popup-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        aria-describedby="setup-desc"
        @click.self="closeSetupPopup"
        @keydown.esc="closeSetupPopup"
      >
        <div class="popup-card">
          <h2 id="setup-title" class="h5 fw-bold text-success">🏠 Set up your household first</h2>
          <p id="setup-desc" class="text-secondary mb-3">
            Save your household details to start using the Energy Planner, Simulator, Find Contractors
            and 3D Spatial.
          </p>
          <button
            ref="setupButton"
            type="button"
            class="btn btn-success w-100"
            @click="closeSetupPopup"
          >
            Set up household
          </button>
        </div>
      </div>
    </Transition>

    <Transition name="popup">
      <div
        v-if="flatChange"
        class="popup-backdrop"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="flat-change-title"
        aria-describedby="flat-change-desc"
        @click.self="cancelFlatChange"
        @keydown.esc="cancelFlatChange"
      >
        <div class="popup-card">
          <h2 id="flat-change-title" class="h5 fw-bold text-danger">Change your flat type?</h2>
          <div id="flat-change-desc" class="text-secondary mb-3">
            <p class="mb-2">
              Going from <strong>{{ flatChange.fromName }}</strong> to
              <strong>{{ flatChange.toName }}</strong> rebuilds your 3D floor plan with the standard
              {{ flatChange.toName }} layout.
            </p>
            <p v-if="flatChange.removed.length" class="mb-2 text-danger">
              <strong>{{ flatChange.removed.join(', ') }}</strong>
              will be deleted permanently, along with everything placed in
              {{ flatChange.removed.length > 1 ? 'them' : 'it' }}.
            </p>
            <p v-if="flatChange.added.length" class="mb-2">
              New: <strong>{{ flatChange.added.join(', ') }}</strong
              >.
            </p>
            <p class="mb-0">
              Room sizes and positions go back to the default, and appliances in the other rooms are
              kept where they fit. This cannot be undone.
            </p>
          </div>
          <div class="d-flex gap-2">
            <button
              ref="flatChangeCancel"
              type="button"
              class="btn btn-outline-secondary flex-fill"
              @click="cancelFlatChange"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn flex-fill"
              :class="flatChange.removed.length ? 'btn-danger' : 'btn-success'"
              @click="confirmFlatChange"
            >
              {{ flatChange.removed.length ? 'Delete rooms and save' : 'Change and save' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="popup">
      <div
        v-if="myinfoMismatch"
        class="popup-backdrop"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mismatch-title"
        aria-describedby="mismatch-desc"
        @click.self="closeMyinfoMismatch"
        @keydown.esc="closeMyinfoMismatch"
      >
        <div class="popup-card">
          <h2 id="mismatch-title" class="h5 fw-bold text-danger">Singpass account mismatch</h2>
          <p id="mismatch-desc" class="text-secondary mb-3">
            That Singpass account does not match this EcoHome account. Myinfo can only be retrieved
            with the Singpass account linked to it.
          </p>
          <button
            ref="mismatchButton"
            type="button"
            class="btn btn-success w-100"
            @click="closeMyinfoMismatch"
          >
            OK
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>