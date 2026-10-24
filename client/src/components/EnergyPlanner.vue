<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const API_URL = '/api'
const appliances = ref([])
const flatTypes = ref([])
const users = ref([])
const plans = ref([])
const userId = ref('')
const selectedAppliance = ref(1)
const compareIds = ref([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const plannerForm = ref(null)
const householdSection = ref(null)
const profile = ref({
  name: 'My household',
  flatType: '4-room',
  occupants: 4,
  bedrooms: 3,
  budget: 150,
  pattern: 'Mostly home in the evenings',
})
const plan = ref({ id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items: [] })
const auth = useAuthStore()
const route = useRoute()
const myinfoUrl = auth.singpassUrl('/EnergyPlanner/', 'myinfo')
const myinfoBanner = ref(false)
const myinfoFlatMissing = ref(false)

// Computed properties update when the form values change (Week 5).
const rooms = computed(() => {
  const result = ['Living Room', 'Kitchen', 'Bathroom']
  for (let i = 1; i <= Math.min(profile.value.bedrooms, 5); i++) {
    result.push('Bedroom ' + i)
  }
  return result
})
const householdPlans = computed(() => {
  const result = []
  for (const saved of plans.value) {
    if (saved.householdId === userId.value) result.push(saved)
  }
  return result
})
const comparison = computed(() => {
  const result = []
  for (const saved of householdPlans.value) {
    if (compareIds.value.includes(saved.id)) result.push(saved)
  }
  return result
})
const totals = computed(() => estimate(plan.value, appliances.value))
const remaining = computed(() => profile.value.budget - totals.value.cost)

function money(value) {
  return 'S$' + value.toFixed(2)
}
function catalogue(id) {
  for (const appliance of appliances.value) {
    if (appliance.id === id) return appliance
  }
  return null
}

// GET: read the catalogue, households and saved plans from the server.
async function getData() {
  const response = await axios.get(API_URL + '/planner')
  appliances.value = response.data.appliances
  flatTypes.value = response.data.flatTypes
  changeFlat()
  users.value = response.data.users
  plans.value = response.data.plans
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    await getData()
    await loadMyinfoDraft()
  } catch (err) {
    console.log(err.message)
    error.value = 'Unable to load the planner. Check that the server is running.'
  }
  if (route.query.error === 'myinfo') {
    error.value = 'Unable to retrieve your Myinfo details. Please try again or fill in the form yourself.'
  }
  loading.value = false
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
  userId.value = ''
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

// POST creates a household; PUT updates the selected household.
// The calling save function handles request errors.
async function saveHousehold() {
  let response
  if (userId.value === '') {
    response = await axios.post(API_URL + '/users', profile.value)
  } else {
    response = await axios.put(API_URL + '/users/' + userId.value, profile.value)
  }
  userId.value = response.data.id
}
async function saveProfile() {
  if (!checkInputs(householdSection.value)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveHousehold()
    await getData()
    myinfoBanner.value = false
    notice.value = 'Household saved.'
  } catch (err) {
    console.log(err.message)
    error.value = 'Unable to save the household.'
  }
  busy.value = false
}

// POST /plans creates a new plan. PUT /plans/:id updates an existing plan.
async function savePlan(copy = false) {
  if (!checkInputs(plannerForm.value)) return
  for (const item of plan.value.items) {
    if (!rooms.value.includes(item.room)) {
      error.value = 'Please assign every appliance to an available room.'
      return
    }
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveHousehold()
    const data = {
      name: plan.value.name,
      householdId: userId.value,
      profile: profile.value,
      days: plan.value.days,
      tariff: plan.value.tariff,
      items: plan.value.items,
      estimate: totals.value,
    }
    let response
    if (plan.value.id === '' || copy) {
      response = await axios.post(API_URL + '/plans', data)
    } else {
      response = await axios.put(API_URL + '/plans/' + plan.value.id, data)
    }
    plan.value.id = response.data.id
    if (!compareIds.value.includes(plan.value.id)) compareIds.value.push(plan.value.id)
    await getData()
    notice.value = 'Your plan has been saved.'
  } catch (err) {
    console.log(err.message)
    error.value = 'Unable to save the plan.'
  }
  busy.value = false
}

// DELETE removes a saved plan; GET refreshes the displayed list afterwards.
async function deletePlan(saved) {
  if (!window.confirm('Delete ' + saved.name + '?')) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await axios.delete(API_URL + '/plans/' + saved.id)
    if (plan.value.id === saved.id) plan.value.id = ''
    const index = compareIds.value.indexOf(saved.id)
    if (index !== -1) compareIds.value.splice(index, 1)
    await getData()
    notice.value = 'Plan deleted.'
  } catch (err) {
    console.log(err.message)
    error.value = 'Unable to delete the plan.'
  }
  busy.value = false
}

function newPlan() {
  plan.value = { id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items: [] }
  error.value = ''
  notice.value = ''
}
function changeHousehold(event) {
  userId.value = event.target.value
  myinfoBanner.value = false
  profile.value = {
    name: 'My household',
    flatType: '4-room',
    occupants: 4,
    bedrooms: 3,
    budget: 150,
    pattern: 'Mostly home in the evenings',
  }
  for (const user of users.value) {
    if (user.id === userId.value) {
      // Copy the saved data so editing the form does not change the saved list.
      profile.value = JSON.parse(JSON.stringify(user))
      break
    }
  }
  changeFlat()
  newPlan()
  compareIds.value = []
}
function changeFlat() {
  for (const flat of flatTypes.value) {
    if (flat.id === profile.value.flatType) profile.value.bedrooms = flat.bedrooms
  }
}
function addAppliance() {
  const appliance = catalogue(selectedAppliance.value)
  if (!appliance || plan.value.items.length >= 100) return
  plan.value.items.push({
    applianceId: appliance.id,
    room: appliance.room === 'Bedroom' ? 'Bedroom 1' : appliance.room,
    location: appliance.location || 'Not specified',
    quantity: 1,
    hours: appliance.name === 'Refrigerator' ? 24 : 4,
    daysPerWeek: 7,
    loadPercent: 100,
  })
}
function loadPlan(saved) {
  plan.value = JSON.parse(JSON.stringify(saved))
  profile.value = JSON.parse(JSON.stringify(saved.profile))
  changeFlat()
  error.value = ''
  notice.value = 'Viewing saved plan: ' + saved.name
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function estimate(plan, appliances) {
  const byAppliance = []
  const byRoom = []
  let totalKwh = 0

  for (const item of plan.items) {
    // Look up the selected appliance in the catalogue.
    let power = 0
    let name = 'Unknown appliance'

    for (const appliance of appliances) {
      if (appliance.id === item.applianceId) {
        power = appliance.power || 0
        name = appliance.name || 'Unknown appliance'
        break
      }
    }

    // Calculate this appliance entry's monthly energy and cost.
    const kwh =
      (((power * item.quantity * item.hours * plan.days * item.daysPerWeek) / 7) *
        item.loadPercent) /
      100
    const cost = kwh * plan.tariff

    byAppliance.push({ ...item, name, kwh, cost })
    totalKwh += kwh

    // Look for this room in the breakdown, or add it if it is new.
    let roomTotal = null

    for (const room of byRoom) {
      if (room.room === item.room) {
        roomTotal = room
        break
      }
    }

    if (roomTotal === null) {
      roomTotal = { room: item.room, kwh: 0, cost: 0 }
      byRoom.push(roomTotal)
    }

    roomTotal.kwh += kwh
    roomTotal.cost += cost
  }

  return {
    kwh: totalKwh,
    cost: totalKwh * plan.tariff,
    byAppliance,
    byRoom,
  }
}
</script>
<template>
  <div class="planner-page">
    <main class="container py-4 py-lg-5">
      <div class="mb-4">
        <span class="badge bg-success mb-2">Personalised household energy planner</span>
        <h1 class="fw-bold">A smarter plan for your HDB.</h1>
        <p class="text-secondary mb-0">
          Build your household, explore everyday choices, and compare your monthly electricity use.
        </p>
      </div>
      <div v-if="error" class="alert alert-danger" role="alert">
        {{ error }}
        <button
          v-if="!appliances.length"
          class="btn btn-sm btn-outline-danger ms-2"
          :disabled="busy"
          @click="load"
        >
          Retry
        </button>
      </div>
      <div v-if="notice" class="alert alert-success" role="status">{{ notice }}</div>
      <p v-if="loading" role="status">Loading your planner…</p>
      <template v-else-if="appliances.length">
        <fieldset ref="plannerForm" :disabled="busy">
          <legend class="visually-hidden">Energy planner</legend>
          <div class="row g-4">
            <section ref="householdSection" class="col-lg-4" aria-labelledby="household-title">
              <div class="card border-0 shadow-sm">
                <div class="card-body p-4">
                  <h2 id="household-title" class="h4">🏠 Your household</h2>
                  <div v-if="myinfoBanner" class="alert alert-success small py-2" role="status">
                    <strong>Filled from Myinfo.</strong> Please check the details, add your budget
                    and save the household.
                    <span v-if="myinfoFlatMissing" class="d-block mt-1">
                      Myinfo has no HDB flat on record, so please choose your flat type.
                    </span>
                    <button type="button" class="btn btn-link btn-sm p-0 mt-1" @click="dismissMyinfo">
                      Not now
                    </button>
                  </div>
                  <template v-else-if="!profile.myinfo">
                    <a class="btn-singpass w-100 mb-1" :href="myinfoUrl">
                      <span>Retrieve Myinfo with</span><span class="sp-wordmark">singpass</span>
                    </a>
                    <p class="small text-secondary text-center mb-2">
                      Fill in your household from your government records.
                    </p>
                  </template>
                  <label for="household" class="form-label mt-2">Saved household</label
                  ><select
                    id="household"
                    class="form-select mb-3"
                    :value="userId"
                    @change="changeHousehold"
                  >
                    <option value="">Create new household</option>
                    <option v-for="user in users" :key="user.id" :value="user.id">
                      {{ user.name }}
                    </option>
                  </select>
                  <label for="household-name" class="form-label">
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
                    <span v-if="fromMyinfo('flatType')" class="badge badge-singpass ms-1">Myinfo</span></label
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
                        <span v-if="fromMyinfo('occupants')" class="text-secondary small">(estimated)</span></label
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
                    {{ rooms.length }} planning spaces: bedrooms plus living room, kitchen and
                    bathroom. Bathroom usage is grouped.
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
                    Occupants and usage patterns describe your household. Set appliance hours below
                    to reflect their actual use.
                  </p>
                  <button class="btn btn-outline-success w-100" @click="saveProfile">
                    Save household
                  </button>
                </div>
              </div>
            </section>
            <section class="col-lg-8" aria-labelledby="plan-title">
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-body p-4">
                  <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                    <h2 id="plan-title" class="h4 mb-0">⚡ Your energy plan</h2>
                    <button class="btn btn-sm btn-outline-success" @click="newPlan">
                      New plan
                    </button>
                  </div>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label for="plan-name" class="form-label">Plan name</label
                      ><input
                        id="plan-name"
                        v-model="plan.name"
                        class="form-control"
                        maxlength="100"
                        required
                      />
                    </div>
                    <div class="col-6 col-md-3">
                      <label for="days" class="form-label">Days in month</label
                      ><input
                        id="days"
                        v-model.number="plan.days"
                        class="form-control"
                        type="number"
                        min="28"
                        max="31"
                        required
                      />
                    </div>
                    <div class="col-6 col-md-3">
                      <label for="tariff" class="form-label">S$ per kWh</label
                      ><input
                        id="tariff"
                        v-model.number="plan.tariff"
                        class="form-control"
                        type="number"
                        min="0"
                        max="10"
                        step="0.0001"
                        required
                      />
                    </div>
                  </div>
                  <p class="small text-secondary mt-3 mb-0">
                    S$0.32/kWh is an illustrative starting rate. Enter the rate from your bill,
                    including tax if applicable. Estimates exclude fixed charges.
                  </p>
                </div>
              </div>
              <div class="row g-3 mb-4" aria-live="polite">
                <div class="col-sm-4">
                  <div class="card h-100 border-success">
                    <div class="card-body">
                      <div class="text-secondary small">Monthly electricity</div>
                      <strong class="fs-4" data-testid="total-kwh"
                        >{{ totals.kwh.toFixed(1) }} <small class="fs-6">kWh</small></strong
                      >
                    </div>
                  </div>
                </div>
                <div class="col-sm-4">
                  <div class="card h-100 border-success">
                    <div class="card-body">
                      <div class="text-secondary small">Estimated monthly cost</div>
                      <strong class="fs-4" data-testid="total-cost">{{
                        money(totals.cost)
                      }}</strong>
                    </div>
                  </div>
                </div>
                <div class="col-sm-4">
                  <div class="card h-100">
                    <div class="card-body">
                      <div class="text-secondary small">
                        {{ remaining < 0 ? 'Over budget' : 'Budget remaining' }}
                      </div>
                      <strong
                        class="fs-4"
                        :class="remaining < 0 ? 'text-danger' : 'text-success'"
                        >{{ money(Math.abs(remaining)) }}</strong
                      >
                    </div>
                  </div>
                </div>
              </div>
              <div class="card border-0 shadow-sm">
                <div class="card-body p-4">
                  <h3 class="h5">Appliances & usage</h3>
                  <div class="d-flex flex-wrap flex-sm-nowrap gap-2 mb-3">
                    <label for="appliance" class="visually-hidden">Choose appliance</label
                    ><select id="appliance" v-model="selectedAppliance" class="form-select">
                      <option v-for="a in appliances" :key="a.id" :value="a.id">
                        {{ a.name }} · {{ a.power }} kW
                      </option></select
                    ><button
                      class="btn btn-success text-nowrap"
                      :disabled="plan.items.length >= 100"
                      @click="addAppliance"
                    >
                      Add appliance
                    </button>
                  </div>
                  <p v-if="!plan.items.length" class="text-secondary py-3 text-center">
                    Start with an appliance. Add the same type again to configure another room.
                  </p>
                  <article
                    v-for="(item, index) in plan.items"
                    :key="index"
                    class="room mb-3"
                    :aria-label="`Appliance ${index + 1}`"
                  >
                    <div class="d-flex justify-content-between align-items-start gap-2">
                      <div>
                        <h4 class="h6 mb-1">{{ catalogue(item.applianceId)?.name }}</h4>
                        <p v-if="catalogue(item.applianceId)" class="small text-secondary mb-3">
                          {{ catalogue(item.applianceId).type }} ·
                          {{ catalogue(item.applianceId).power }} kW · Efficiency:
                          {{ catalogue(item.applianceId).efficiency || 'not supplied' }}
                        </p>
                        <p v-else class="small text-secondary mb-3">
                          Appliance not found
                        </p>
                      </div>
                      <button
                        class="btn btn-sm btn-outline-danger"
                        :aria-label="`Remove appliance ${index + 1}`"
                        @click="plan.items.splice(index, 1)"
                      >
                        Remove
                      </button>
                    </div>
                    <div class="row g-3">
                      <div class="col-sm-6">
                        <label :for="`room-${index}`" class="form-label">Room</label
                        ><select :id="`room-${index}`" v-model="item.room" class="form-select">
                          <option v-if="!rooms.includes(item.room)" :value="item.room" disabled>
                            {{ item.room }} — reassign room
                          </option>
                          <option v-for="room in rooms" :key="room">{{ room }}</option>
                        </select>
                      </div>
                      <div class="col-sm-6">
                        <label :for="`location-${index}`" class="form-label"
                          >Location within room</label
                        ><input
                          :id="`location-${index}`"
                          v-model="item.location"
                          class="form-control"
                          maxlength="100"
                          required
                        />
                      </div>
                      <div class="col-6 col-xl-3">
                        <label :for="`quantity-${index}`" class="form-label">Quantity</label
                        ><input
                          :id="`quantity-${index}`"
                          v-model.number="item.quantity"
                          type="number"
                          min="1"
                          max="20"
                          class="form-control"
                          required
                        />
                      </div>
                      <div class="col-6 col-xl-3">
                        <label :for="`hours-${index}`" class="form-label">Hours/day</label
                        ><input
                          :id="`hours-${index}`"
                          v-model.number="item.hours"
                          type="number"
                          min="0"
                          max="24"
                          step="0.25"
                          class="form-control"
                          required
                        />
                      </div>
                      <div class="col-6 col-xl-3">
                        <label :for="`week-${index}`" class="form-label">Days/week</label
                        ><input
                          :id="`week-${index}`"
                          v-model.number="item.daysPerWeek"
                          type="number"
                          min="0"
                          max="7"
                          class="form-control"
                          required
                        />
                      </div>
                      <div class="col-6 col-xl-3">
                        <label :for="`load-${index}`" class="form-label">Operating load %</label
                        ><input
                          :id="`load-${index}`"
                          v-model.number="item.loadPercent"
                          type="number"
                          min="1"
                          max="100"
                          class="form-control"
                          required
                        />
                      </div>
                    </div>
                  </article>
                  <details class="small text-secondary mb-3">
                    <summary>How the estimate works</summary>
                    <p class="mt-2">
                      Monthly kWh = rated kW × quantity × hours/day × days in month × days/week ÷ 7
                      × operating load ÷ 100. Operating load represents average power relative to
                      the rating, including cycling or reduced-power settings. Use measured values
                      if available; 100% assumes full rated power throughout usage. These are
                      estimates, not an efficiency certification or exact bill forecast.
                    </p>
                  </details>
                  <div class="d-flex flex-wrap gap-2">
                    <button class="btn btn-success" @click="savePlan(false)">
                      {{ plan.id ? 'Update plan' : 'Save plan' }}</button
                    ><button v-if="plan.id" class="btn btn-outline-success" @click="savePlan(true)">
                      Save as new plan</button
                    ><span v-if="busy" role="status">Saving…</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <section class="mt-4" aria-labelledby="breakdown-title">
            <h2 id="breakdown-title" class="h4">Where your electricity goes</h2>
            <div class="row g-4">
              <div class="col-lg-5">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-body p-4">
                    <h3 class="h5">By room</h3>
                    <p v-if="!totals.byRoom.length" class="text-secondary">
                      Add appliances to see room totals.
                    </p>
                    <div v-for="room in totals.byRoom" :key="room.room" class="mb-3">
                      <div class="d-flex justify-content-between gap-2 small mb-1">
                        <strong>{{ room.room }}</strong
                        ><span>{{ room.kwh.toFixed(1) }} kWh · {{ money(room.cost) }}</span>
                      </div>
                      <div
                        class="progress"
                        role="progressbar"
                        :aria-label="`${room.room} share of energy`"
                        :aria-valuenow="totals.kwh ? Math.round((room.kwh / totals.kwh) * 100) : 0"
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        <div
                          class="progress-bar bg-success"
                          :style="{ width: `${totals.kwh ? (room.kwh / totals.kwh) * 100 : 0}%` }"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-lg-7">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-body p-4">
                    <h3 class="h5">By appliance</h3>
                    <div class="table-responsive">
                      <table class="table align-middle">
                        <caption>
                          Monthly electricity by appliance entry
                        </caption>
                        <thead>
                          <tr>
                            <th>Appliance / location</th>
                            <th>Room</th>
                            <th>kWh</th>
                            <th>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(item, i) in totals.byAppliance" :key="i">
                            <td>
                              {{ item.name }} × {{ item.quantity
                              }}<small class="d-block text-secondary">{{ item.location }}</small>
                            </td>
                            <td>{{ item.room }}</td>
                            <td>{{ item.kwh.toFixed(1) }}</td>
                            <td class="text-nowrap">{{ money(item.cost) }}</td>
                          </tr>
                          <tr v-if="!totals.byAppliance.length">
                            <td colspan="4" class="text-secondary">No appliances selected yet.</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section class="card border-0 shadow-sm mt-4" aria-labelledby="saved-title">
            <div class="card-body p-4">
              <h2 id="saved-title" class="h4">Saved plans & comparison</h2>
              <p class="text-secondary">
                Click a plan name to view its details. Tick the checkboxes to compare plans.
                Each uses its saved tariff, month length and household settings.
              </p>
              <p v-if="!householdPlans.length">No saved plans yet. Save your first plan above.</p>
              <div
                v-for="saved in householdPlans"
                :key="saved.id"
                class="d-flex flex-wrap align-items-center gap-3 border-bottom py-3"
              >
                <div class="form-check flex-grow-1">
                  <input
                    :id="`compare-${saved.id}`"
                    v-model="compareIds"
                    class="form-check-input"
                    type="checkbox"
                    :value="saved.id"
                  />
                  <label :for="`compare-${saved.id}`" class="visually-hidden">
                    Compare {{ saved.name }}
                  </label>
                  <button
                    type="button"
                    class="btn btn-link text-success fw-bold p-0 text-start align-baseline"
                    :aria-label="`View ${saved.name}`"
                    @click="loadPlan(saved)"
                  >
                    {{ saved.name }}
                  </button>
                  <span> · {{ saved.estimate.kwh.toFixed(1) }} kWh · {{ money(saved.estimate.cost) }}</span>
                </div>
                <button
                  class="btn btn-sm btn-outline-danger"
                  :aria-label="`Delete ${saved.name}`"
                  @click="deletePlan(saved)"
                >
                  Delete
                </button>
              </div>
              <p v-if="comparison.length < 2" class="small text-secondary mt-3">
                Select at least two saved plans for a side-by-side comparison.
              </p>
              <div v-else class="table-responsive mt-4">
                <table class="table table-bordered comparison-table">
                  <caption>
                    Saved estimates; differences use the first selected column as the baseline.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Monthly comparison</th>
                      <th v-for="saved in comparison" :key="saved.id" scope="col">
                        {{ saved.name }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Household</th>
                      <td v-for="saved in comparison" :key="saved.id">
                        {{ saved.profile.flatType }} · {{ saved.profile.occupants }} occupants ·
                        {{ saved.profile.bedrooms }} bedrooms
                      </td>
                    </tr>
                    <tr>
                      <th>Assumptions</th>
                      <td v-for="saved in comparison" :key="saved.id">
                        {{ saved.days }} days · S${{ saved.tariff }}/kWh
                      </td>
                    </tr>
                    <tr>
                      <th>Energy</th>
                      <td v-for="saved in comparison" :key="saved.id">
                        {{ saved.estimate.kwh.toFixed(1) }} kWh
                      </td>
                    </tr>
                    <tr>
                      <th>Estimated cost</th>
                      <td v-for="saved in comparison" :key="saved.id" class="fw-bold text-success">
                        {{ money(saved.estimate.cost) }}
                      </td>
                    </tr>
                    <tr>
                      <th>Cost difference</th>
                      <td v-for="saved in comparison" :key="saved.id">
                        {{ money(saved.estimate.cost - comparison[0].estimate.cost) }}
                      </td>
                    </tr>
                    <tr>
                      <th>Budget remaining</th>
                      <td v-for="saved in comparison" :key="saved.id">
                        {{ money(saved.profile.budget - saved.estimate.cost) }}
                      </td>
                    </tr>
                    <tr>
                      <th>Appliance usage</th>
                      <td v-for="saved in comparison" :key="saved.id">
                        <p v-for="(item, i) in saved.items" :key="i" class="small mb-2">
                          {{ catalogue(item.applianceId)?.name }} × {{ item.quantity }} ·
                          {{ item.room }} / {{ item.location }}<br />{{ item.hours }} h/day ·
                          {{ item.daysPerWeek }} days/week · {{ item.loadPercent }}% load
                        </p>
                        <span v-if="!saved.items.length">No appliances</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </fieldset>
      </template>
    </main>
    <footer class="border-top py-4 text-center text-secondary">
      HDB EcoHome · Household Energy Planner
    </footer>
  </div>
</template>
