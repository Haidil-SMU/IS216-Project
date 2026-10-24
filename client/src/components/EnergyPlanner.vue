<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import Chart from 'chart.js/auto'
import { useAuthStore } from '@/stores/auth'

const API_URL = '/api'
const appliances = ref([])
const flatTypes = ref([])
const households = ref([])
const plans = ref([])
const householdId = ref('')
const selectedType = ref('Air Conditioner')
const activePanel = ref('dashboard')
const dashboardHouseholdId = ref('')
const editingHousehold = ref(false)
const editingPlan = ref(false)
const editor = ref(null)
const compareIds = ref([])
const loading = ref(true)
const busy = ref(false)
const loadFailed = ref(false)
const plannerForm = ref(null)
const householdSection = ref(null)
const profile = ref({
  name: 'My household',
  flatType: '4-room',
  occupants: 4,
  bedrooms: 3,
  budget: 150,
  pattern: 'Mostly home in the evenings',
  appliances: [],
})
const plan = ref({ id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items: [] })
const auth = useAuthStore()
const route = useRoute()
const isSingpassUser = computed(() => auth.user?.singpass === true)
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
    if (saved.householdId === householdId.value) result.push(saved)
  }
  return result
})
const comparison = computed(() => {
  if (!compareIds.value.length) return householdPlans.value
  const result = []
  for (const saved of householdPlans.value) {
    if (compareIds.value.includes(saved.id)) result.push(saved)
  }
  return result
})
const totals = computed(() => estimate(plan.value, appliances.value))

const dashboardPlans = computed(() => {
  const result = []
  for (const saved of plans.value) {
    if (saved.householdId === dashboardHouseholdId.value) result.push(saved)
  }
  return result
})
// Each plan gets a 30px bar plus space for its label and a gap; reserve room for the y-axis.
const barChartWidth = computed(() => Math.max(200, 100 + comparison.value.length * 70) + 'px')
const energyBars = ref(null)
const costBars = ref(null)
const purchaseBars = ref(null)
const energyForecast = ref(null)
const costForecast = ref(null)
let charts = []
const chartColours = ['#148958', '#2673ba', '#ad5b17', '#8055ad', '#c44768', '#16838a']

// Forecast running totals over 12 calendar months using unchanged daily usage and saved tariff.
const forecastMonths = []
const today = new Date()
let cumulativeDays = 0
for (let i = 0; i < 12; i++) {
  const month = new Date(today.getFullYear(), today.getMonth() + i, 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  cumulativeDays += days
  forecastMonths.push({
    label: month.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' }),
    cumulativeDays,
  })
}
function purchaseTotal(saved) {
  let total = 0
  for (const item of saved.items || []) {
    const model = catalogue(item.applianceId)
    const price = item.purchasePrice ?? model?.purchasePrice
    if (price == null) return null
    total += price * item.quantity
  }
  return total
}
function chartData(metric, forecast = false) {
  const labels = []
  const datasets = []
  const values = []
  const colours = []
  if (forecast) for (const month of forecastMonths) labels.push(month.label)
  for (const saved of comparison.value) {
    const index = householdPlans.value.indexOf(saved)
    const colour = chartColours[index % chartColours.length]
    if (forecast) {
      const points = []
      const dailyEnergy = saved.estimate.kwh / (Number(saved.days) || 30)
      for (const month of forecastMonths) {
        const energy = dailyEnergy * month.cumulativeDays
        points.push(metric === 'kwh' ? energy : energy * saved.tariff)
      }
      datasets.push({
        label: saved.name,
        data: points,
        borderColor: colour,
        backgroundColor: colour,
        tension: 0,
        pointRadius: 3,
        borderDash: index >= chartColours.length ? [6, 3] : [],
      })
    } else {
      labels.push(saved.name)
      values.push(metric === 'purchase' ? purchaseTotal(saved) : saved.estimate[metric])
      colours.push(colour)
    }
  }
  if (!forecast)
    datasets.push({
      label: metric === 'purchase' ? 'Initial appliance price (S$)' : metric === 'kwh' ? 'Monthly kWh' : 'Monthly cost (S$)',
      data: values,
      backgroundColor: colours,
      borderRadius: 5,
      barThickness: 30,
      maxBarThickness: 30,
    })
  return { labels, datasets }
}
function destroyCharts() {
  for (const chart of charts) chart.destroy()
  charts = []
}
function renderCharts() {
  destroyCharts()
  if (activePanel.value !== 'planner' || editingHousehold.value || !comparison.value.length) return
  const definitions = [
    [energyBars.value, 'kwh', false],
    [costBars.value, 'cost', false],
    [energyForecast.value, 'kwh', true],
    [costForecast.value, 'cost', true],
    [purchaseBars.value, 'purchase', false],
  ]
  for (const [canvas, metric, forecast] of definitions) {
    if (!canvas) continue
    charts.push(
      new Chart(canvas, {
        type: forecast ? 'line' : 'bar',
        data: chartData(metric, forecast),
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: forecast },
            tooltip: {
              callbacks: {
                label: (context) =>
                  context.dataset.label +
                  ': ' +
                  (metric === 'kwh'
                    ? context.parsed.y.toFixed(1) + ' kWh'
                    : money(context.parsed.y)),
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: (forecast ? 'Cumulative ' : '') + (metric === 'kwh' ? 'Energy (kWh)' : 'Cost (S$)') },
            },
          },
        },
      }),
    )
  }
}
watch([comparison, activePanel, editingHousehold, householdId, loading], renderCharts, {
  deep: true,
  flush: 'post',
})
onBeforeUnmount(destroyCharts)
const applianceTypes = computed(() => {
  const types = []
  for (const appliance of appliances.value) {
    const type = appliance.type || appliance.name
    if (!types.includes(type)) types.push(type)
  }
  return types
})
const equipmentCost = computed(() => {
  let cost = 0
  for (const item of plan.value.items) {
    const appliance = catalogue(item.applianceId)
    cost += (item.purchasePrice ?? appliance?.purchasePrice ?? 0) * item.quantity
  }
  return cost
})
function modelsFor(type) {
  const models = []
  for (const appliance of appliances.value) {
    if (appliance.brand && appliance.type === type) models.push(appliance)
  }
  return models
}
function modelEnergy(item, model) {
  return (
    (((model.power * item.quantity * item.hours * plan.value.days * item.daysPerWeek) / 7) *
      item.loadPercent) /
    100
  )
}
function chooseModel(item) {
  const model = catalogue(item.applianceId)
  if (!model) return
  item.power = model.power
  item.purchasePrice = model.purchasePrice ?? null
}
function editHousehold() {
  // Always edit the current household, not an older plan's profile snapshot.
  for (const household of households.value) {
    if (household.id === householdId.value) profile.value = JSON.parse(JSON.stringify(household))
  }
  if (!profile.value.appliances) profile.value.appliances = []
  editingHousehold.value = true
  editingPlan.value = false
}
async function showEditor() {
  activePanel.value = 'planner'
  await nextTick()
  editor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function startPlan() {
  for (const household of households.value) {
    if (household.id === householdId.value) profile.value = JSON.parse(JSON.stringify(household))
  }
  newPlan()
  editingHousehold.value = false
  editingPlan.value = true
  showEditor()
}

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
  households.value = response.data.users
  plans.value = response.data.plans
}
async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    await getData()
    if (isSingpassUser.value) await loadMyinfoDraft()
  } catch (err) {
    console.log(err.message)
    loadFailed.value = true
    window.alert('Unable to load the planner. Check that the server is running.')
  }
  if (route.query.error === 'myinfo') {
    window.alert('Unable to retrieve your Myinfo details. Please try again or fill in the form yourself.')
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
    window.alert('Singpass did not return any Myinfo details for this account, so please fill in your household yourself.')
    return
  }
  householdId.value = ''
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
  editingHousehold.value = true
  activePanel.value = 'planner'
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
  if (householdId.value === '') {
    response = await axios.post(API_URL + '/users', profile.value)
  } else {
    response = await axios.put(API_URL + '/users/' + householdId.value, profile.value)
  }
  householdId.value = response.data.id
}
async function saveProfile() {
  if (!profile.value.appliances?.length) {
    window.alert('Add at least one appliance to your household.')
    return
  }
  for (const item of profile.value.appliances) {
    if (!rooms.value.includes(item.room)) {
      window.alert('Please reassign appliances to an available room.')
      return
    }
  }
  if (!checkInputs(householdSection.value)) return
  busy.value = true
  try {
    await saveHousehold()
    await getData()
    // Confirm that the server stored the inventory before closing the form.
    let storedHousehold = null
    for (const household of households.value) {
      if (household.id === householdId.value) storedHousehold = household
    }
    if (!storedHousehold?.appliances?.length) {
      window.alert('Your appliance list was not returned by the server. Restart the server to load the updated household model, then save this household again. Your entries are still here.')
      busy.value = false
      return
    }
    myinfoBanner.value = false
    editingHousehold.value = false
    dashboardHouseholdId.value = householdId.value
    window.alert('Household saved.')
  } catch (err) {
    console.log(err.message)
    window.alert('Unable to save the household.')
  }
  busy.value = false
}

// POST /plans creates a new plan. PUT /plans/:id updates an existing plan.
async function savePlan(copy = false) {
  if ((!plan.value.id || copy) && !plan.value.items.length) {
    window.alert('This household has no saved appliances. Use Edit household to add and save them, then press Add plan.')
    return
  }
  const name = plan.value.name.trim()
  if (!name) {
    window.alert('Please enter a plan name.')
    return
  }
  for (const saved of householdPlans.value) {
    if (
      saved.name.trim().toLowerCase() === name.toLowerCase() &&
      (copy || saved.id !== plan.value.id)
    ) {
      window.alert('A plan with this name already exists in this household. Choose a different name.')
      return
    }
  }
  plan.value.name = name
  busy.value = true
  try {
    const data = {
      name: plan.value.name,
      householdId: householdId.value,
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
    compareIds.value = []
    await getData()
    editingPlan.value = false
    dashboardHouseholdId.value = householdId.value
    window.alert('Your plan has been saved.')
  } catch (err) {
    console.log(err.message)
    window.alert(err.response?.data?.error || 'Unable to save the plan.')
  }
  busy.value = false
}

// DELETE removes a saved plan; GET refreshes the displayed list afterwards.
async function deletePlan(saved) {
  if (!window.confirm('Delete ' + saved.name + '?')) return
  busy.value = true
  try {
    await axios.delete(API_URL + '/plans/' + saved.id)
    if (plan.value.id === saved.id) plan.value.id = ''
    const index = compareIds.value.indexOf(saved.id)
    if (index !== -1) compareIds.value.splice(index, 1)
    await getData()
    window.alert('Plan deleted.')
  } catch (err) {
    console.log(err.message)
    window.alert('Unable to delete the plan.')
  }
  busy.value = false
}

function newPlan() {
  const items = []
  for (const appliance of profile.value.appliances || []) {
    const models = modelsFor(appliance.type)
    if (!models.length) continue
    const item = { ...appliance, applianceId: models[0].id }
    chooseModel(item)
    items.push(item)
  }
  plan.value = { id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items }
}
function changeHousehold(event) {
  const chosen = event.target.value
  householdId.value = chosen === '__new__' ? '' : chosen
  editingHousehold.value = chosen === '__new__'
  editingPlan.value = false
  myinfoBanner.value = false
  profile.value = {
    name: 'My household',
    flatType: '4-room',
    occupants: 4,
    bedrooms: 3,
    budget: 150,
    pattern: 'Mostly home in the evenings',
    appliances: [],
  }
  for (const user of households.value) {
    if (user.id === householdId.value) {
      // Copy the saved data so editing the form does not change the saved list.
      profile.value = JSON.parse(JSON.stringify(user))
      break
    }
  }
  if (!profile.value.appliances) profile.value.appliances = []
  changeFlat()
  newPlan()
  compareIds.value = []
  for (const saved of householdPlans.value) {
    plan.value = JSON.parse(JSON.stringify(saved))
    break
  }
}
function changeFlat() {
  for (const flat of flatTypes.value) {
    if (flat.id === profile.value.flatType) profile.value.bedrooms = flat.bedrooms
  }
}
function addHouseholdAppliance() {
  if (!profile.value.appliances) profile.value.appliances = []
  const model = modelsFor(selectedType.value)[0]
  if (!model || profile.value.appliances.length >= 100) return
  profile.value.appliances.push({
    type: selectedType.value,
    room: model.room === 'Bedroom' ? 'Bedroom 1' : model.room,
    location: 'Not specified',
    quantity: 1,
    hours: model.defaultHours ?? 4,
    daysPerWeek: 7,
    loadPercent: 100,
  })
}
function loadPlan(saved) {
  householdId.value = saved.householdId
  dashboardHouseholdId.value = saved.householdId
  editingHousehold.value = false
  editingPlan.value = true
  compareIds.value = []
  myinfoBanner.value = false
  plan.value = JSON.parse(JSON.stringify(saved))
  profile.value = JSON.parse(JSON.stringify(saved.profile))
  changeFlat()
  window.alert('Viewing saved plan: ' + saved.name)
  showEditor()
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

    // New entries keep their chosen power; old saved plans still use the catalogue.
    if (typeof item.power === 'number') power = item.power

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
  <div class="planner-page energy-home">
    <div class="planner-sky" aria-hidden="true">
      <div class="planner-sun"></div>
      <div class="planner-cloud cloud-left"></div>
      <div class="planner-cloud cloud-right"></div>
      <div class="planner-cloud planner-cloud-three"></div>
      <div class="planner-cloud planner-cloud-four"></div>
      <div class="planner-hills"></div>
    </div>
    <main class="container py-4 py-lg-5">
      <header class="planner-heading text-center mx-auto">
        <span class="planner-eyebrow">YOUR HOME · YOUR ENERGY</span>
        <h1>A little planning.<br />A smarter everyday home.</h1>
        <p>
          Explore Singapore brands, shape your daily habits and find an energy plan that feels right
          for your household.
        </p>
      </header>
      <nav class="d-flex justify-content-center gap-2 mb-4" aria-label="Energy planner sections">
        <button
          class="btn rounded-pill px-4"
          :class="activePanel === 'dashboard' ? 'btn-success' : 'btn-light'"
          :aria-pressed="activePanel === 'dashboard'"
          @click="activePanel = 'dashboard'"
        >
          My dashboard
        </button>
        <button
          class="btn rounded-pill px-4"
          :class="activePanel === 'planner' ? 'btn-success' : 'btn-light'"
          :aria-pressed="activePanel === 'planner'"
          @click="activePanel = 'planner'"
        >
          Plan my energy
        </button>
      </nav>
      <div v-if="!loading && (loadFailed || !appliances.length)" class="mb-3">
        <p>{{ loadFailed ? 'The planner could not load.' : 'No appliances are available yet.' }}</p>
        <button class="btn btn-outline-secondary" :disabled="busy" @click="load">Retry</button>
      </div>
      <p v-if="loading" role="status">Loading your planner…</p>
      <template v-else-if="appliances.length">
        <section v-if="activePanel === 'dashboard'" aria-labelledby="dashboard-title">
          <h2 id="dashboard-title" class="h3 fw-bold mb-3">Your household’s saved plans</h2>
          <div class="dashboard-selector mb-4">
            <label for="dashboard-household" class="form-label fw-bold"
              >Select your household</label
            >
            <select id="dashboard-household" v-model="dashboardHouseholdId" class="form-select">
              <option value="" disabled>Choose a household</option>
              <option v-for="household in households" :key="household.id" :value="household.id">
                {{ household.name }}
              </option>
            </select>
          </div>
          <template v-if="dashboardHouseholdId && dashboardPlans.length">
            <div class="row g-4">
              <div
                v-for="(saved, index) in dashboardPlans"
                :key="saved.id"
                class="col-md-6 col-xl-4"
              >
                <article class="saved-plan-card">
                  <div class="saved-photo">
                    <img
                      :src="
                        index % 2 === 0
                          ? 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=850&q=85'
                          : 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=850&q=85'
                      "
                      alt=""
                      loading="lazy"
                    />
                    <span class="saved-photo-tag"
                      >{{ saved.profile.flatType }} · {{ saved.profile.occupants }} occupants</span
                    >
                  </div>
                  <div class="p-4 d-flex flex-column flex-grow-1">
                    <span class="small text-success fw-bold mb-2">{{ saved.profile.name }}</span>
                    <h3 class="h4 fw-bold">{{ saved.name }}</h3>
                    <div class="d-flex flex-wrap gap-3 my-3">
                      <span
                        ><strong>{{ saved.estimate.kwh.toFixed(1) }}</strong> kWh/month</span
                      ><strong class="text-success">{{ money(saved.estimate.cost) }}/month</strong>
                    </div>
                    <p class="small text-secondary">
                      {{ saved.items.length }} appliance entries · {{ saved.days }} days
                    </p>
                    <button
                      class="saved-open mt-auto"
                      :aria-label="'Open saved plan ' + saved.name"
                      @click="loadPlan(saved)"
                    >
                      View plan <span>↗</span>
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </template>
          <p v-else-if="dashboardHouseholdId" class="empty-dashboard p-4">
            No plans saved for this household yet. Open “Plan my energy” to create one.
          </p>
          <p v-else-if="!households.length" class="empty-dashboard p-4">
            Create your first household in “Plan my energy” to get started.
          </p>
        </section>
        <div v-show="activePanel === 'planner'" ref="editor" class="planner-editor">
          <fieldset ref="plannerForm" :disabled="busy">
            <legend class="visually-hidden">Energy planner</legend>
            <div class="dashboard-selector mb-4">
              <label for="household" class="form-label fw-bold"
                >Select your household or create a new one</label
              >
              <select
                id="household"
                class="form-select"
                :value="editingHousehold && !householdId ? '__new__' : householdId"
                @change="changeHousehold"
              >
                <option value="" disabled>Choose a household</option>
                <option v-for="household in households" :key="household.id" :value="household.id">
                  {{ household.name }}
                </option>
                <option value="__new__">+ Create new household</option>
              </select>
            </div>
            <section
              ref="householdSection"
              v-if="editingHousehold"
              class="mb-4"
              aria-labelledby="household-title"
            >
              <div class="card border-0 shadow-sm">
                <div class="card-body p-4">
                  <span class="planner-eyebrow">02 / YOUR HOUSEHOLD</span>
                  <h2 id="household-title" class="h4 fw-bold mt-2">A home that’s yours.</h2>
                  <div v-if="myinfoBanner" class="alert alert-success small py-2" role="status">
                    <strong>Filled from Myinfo.</strong> Please check the details, add your budget
                    and save the household.
                    <span v-if="myinfoFlatMissing" class="d-block mt-1">
                      Myinfo has no HDB flat on record, so please choose your flat type.
                    </span>
                    <button
                      type="button"
                      class="btn btn-link btn-sm p-0 mt-1"
                      @click="dismissMyinfo"
                    >
                      Not now
                    </button>
                  </div>
                  <template v-else-if="isSingpassUser && !profile.myinfo">
                    <a class="btn-singpass w-100 mb-1" :href="myinfoUrl">
                      <span>Retrieve Myinfo with</span><span class="sp-wordmark">singpass</span>
                    </a>
                    <p class="small text-secondary text-center mb-2">
                      Fill in your household from your government records.
                    </p>
                  </template>
                  <label for="household-name" class="form-label">
                    Household name
                    <span v-if="fromMyinfo('name')" class="badge badge-singpass ms-1"
                      >Myinfo</span
                    ></label
                  ><input
                    id="household-name"
                    v-model="profile.name"
                    class="form-control mb-3"
                    maxlength="100"
                    required
                  />
                  <p v-if="profile.address" class="small text-secondary mb-3">
                    📍 {{ profile.address }}
                    <span v-if="fromMyinfo('address')" class="badge badge-singpass ms-1"
                      >Myinfo</span
                    >
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
                  <section class="border-top pt-4 mt-3" aria-labelledby="inventory-title">
                    <h3 id="inventory-title" class="h5">Appliances your household needs</h3>
                    <p class="small text-secondary">
                      Set the appliance types, rooms, quantities and usage here. Each plan will use
                      this same setup; choose brands and models when creating the plan. Changes here
                      apply to new plans; saved plans keep their original setup.
                    </p>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                      <label for="household-appliance-type" class="visually-hidden"
                        >Appliance type</label
                      ><select
                        id="household-appliance-type"
                        v-model="selectedType"
                        class="form-select w-auto"
                      >
                        <option v-for="type in applianceTypes" :key="type">
                          {{ type }}
                        </option></select
                      ><button
                        class="btn btn-success"
                        :disabled="(profile.appliances || []).length >= 100"
                        @click="addHouseholdAppliance"
                      >
                        Add household appliance
                      </button>
                    </div>
                    <p v-if="!profile.appliances?.length" class="small text-secondary">
                      Add at least one appliance before saving your household.
                    </p>
                    <article
                      v-for="(item, index) in profile.appliances"
                      :key="index"
                      class="room mb-3"
                      :aria-label="'Household appliance ' + (index + 1)"
                    >
                      <div class="d-flex justify-content-between gap-2 mb-3">
                        <h4 class="h6">{{ item.type }}</h4>
                        <button
                          class="btn btn-sm btn-outline-danger"
                          :aria-label="'Remove household appliance ' + (index + 1)"
                          @click="profile.appliances.splice(index, 1)"
                        >
                          Remove
                        </button>
                      </div>
                      <div class="row g-3">
                        <div class="col-sm-6">
                          <label :for="`house-room-${index}`" class="form-label">Room</label
                          ><select
                            :id="`house-room-${index}`"
                            v-model="item.room"
                            class="form-select"
                          >
                            <option v-if="!rooms.includes(item.room)" :value="item.room" disabled>
                              {{ item.room }} — reassign room
                            </option>
                            <option v-for="room in rooms" :key="room">{{ room }}</option>
                          </select>
                        </div>
                        <div class="col-sm-6">
                          <label :for="`house-location-${index}`" class="form-label"
                            >Location within room</label
                          ><input
                            :id="`house-location-${index}`"
                            v-model="item.location"
                            class="form-control"
                            maxlength="100"
                            required
                          />
                        </div>
                        <div class="col-6 col-xl-3">
                          <label :for="`house-quantity-${index}`" class="form-label">Quantity</label
                          ><input
                            :id="`house-quantity-${index}`"
                            v-model.number="item.quantity"
                            type="number"
                            min="1"
                            max="20"
                            class="form-control"
                            required
                          />
                        </div>
                        <div class="col-6 col-xl-3">
                          <label :for="`house-hours-${index}`" class="form-label">Hours/day</label
                          ><input
                            :id="`house-hours-${index}`"
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
                          <label :for="`house-week-${index}`" class="form-label">Days/week</label
                          ><input
                            :id="`house-week-${index}`"
                            v-model.number="item.daysPerWeek"
                            type="number"
                            min="0"
                            max="7"
                            class="form-control"
                            required
                          />
                        </div>
                        <div class="col-6 col-xl-3">
                          <label :for="`house-load-${index}`" class="form-label"
                            >Operating load %</label
                          ><input
                            :id="`house-load-${index}`"
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
                  </section>
                  <button class="btn btn-outline-success w-100" @click="saveProfile">
                    Save household
                  </button>
                </div>
              </div>
            </section>
            <template v-if="householdId && !editingHousehold">
              <section
                class="card border-0 shadow-sm mb-4"
                aria-labelledby="household-summary-title"
              >
                <div class="card-body p-4">
                  <div class="d-flex flex-wrap justify-content-between gap-3 mb-3">
                    <div>
                      <span class="planner-eyebrow">YOUR HOUSEHOLD</span>
                      <h2 id="household-summary-title" class="h4 fw-bold mt-2">
                        {{ profile.name }}
                      </h2>
                      <p class="text-secondary mb-0">
                        {{ profile.flatType }} · {{ profile.occupants }} occupants · Electricity
                        budget: {{ money(profile.budget) }}/month
                      </p>
                    </div>
                    <button class="btn btn-outline-success align-self-start" @click="editHousehold">
                      Edit household
                    </button>
                  </div>
                  <div class="mt-3 border-top pt-3">
                    <h3 class="h6">Saved household appliances</h3>
                    <template v-for="household in households" :key="household.id">
                      <template v-if="household.id === householdId">
                        <p v-if="!household.appliances?.length" class="small text-secondary">
                          No appliances saved yet. Edit this household to configure them.
                        </p>
                        <ul v-else class="small mb-0">
                          <li v-for="(item, index) in household.appliances" :key="index">
                            {{ item.type }} × {{ item.quantity }} · {{ item.room }} ·
                            {{ item.hours }} hours/day · {{ item.daysPerWeek }} days/week
                          </li>
                        </ul>
                      </template>
                    </template>
                  </div>
                </div>
              </section>
              <div class="d-flex justify-content-end mb-3">
                <button class="btn btn-success rounded-pill px-4" @click="startPlan">
                  + Add plan
                </button>
              </div>
              <section v-if="editingPlan" class="mb-4" aria-labelledby="plan-title">
                <div class="card border-0 shadow-sm mb-4">
                  <div class="card-body p-4">
                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                      <h2 id="plan-title" class="h4 fw-bold mb-0">Build your everyday plan.</h2>
                      <button class="btn btn-sm btn-outline-success" @click="startPlan">
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
                <div class="card border-0 shadow-sm">
                  <div class="card-body p-4">
                    <h3 class="h5">Choose brands for your household appliances</h3>
                    <p class="small text-secondary">
                      Rooms and usage are saved with the household. Select a brand/model for each
                      entry to compare the cost of different choices.
                    </p>
                    <p v-if="!plan.items.length" class="text-secondary">
                      This household has no saved appliances. Use “Edit household” to add them to
                      this existing household, save it, then press “Add plan”.
                    </p>
                    <article
                      v-for="(item, index) in plan.items"
                      :key="index"
                      class="room mb-3"
                      :aria-label="'Appliance ' + (index + 1)"
                    >
                      <h4 class="h6">
                        {{
                          item.type ||
                          catalogue(item.applianceId)?.type ||
                          catalogue(item.applianceId)?.name
                        }}
                      </h4>
                      <p class="small text-secondary">
                        {{ item.room }} · {{ item.location }} · Quantity: {{ item.quantity
                        }}<br />{{ item.hours }} hours/day · {{ item.daysPerWeek }} days/week ·
                        {{ item.loadPercent }}% operating load
                      </p>
                      <label :for="'plan-model-' + index" class="form-label">Brand & model</label>
                      <select
                        :id="'plan-model-' + index"
                        v-model="item.applianceId"
                        class="form-select"
                        @change="chooseModel(item)"
                      >
                        <option
                          v-if="!catalogue(item.applianceId)?.brand"
                          :value="item.applianceId"
                        >
                          {{ catalogue(item.applianceId)?.name || 'Unavailable appliance' }} (saved
                          selection)
                        </option>
                        <option
                          v-for="model in modelsFor(
                            item.type ||
                              catalogue(item.applianceId)?.type ||
                              catalogue(item.applianceId)?.name,
                          )"
                          :key="model.id"
                          :value="model.id"
                        >
                          {{ model.name }} · Buy {{ money(model.purchasePrice) }} ·
                          {{ modelEnergy(item, model).toFixed(1) }} kWh/month ·
                          {{ money(modelEnergy(item, model) * plan.tariff) }}/month
                        </option>
                      </select>
                      <p v-if="catalogue(item.applianceId)" class="small text-secondary mt-2">
                        Power: {{ item.power ?? catalogue(item.applianceId).power }} kW ·
                        {{ catalogue(item.applianceId).powerBasis || 'Generic planning estimate.'
                        }}<br /><span v-if="item.purchasePrice != null"
                          >Reference purchase price: {{ money(item.purchasePrice) }} each. </span
                        ><a
                          v-if="catalogue(item.applianceId).sourceUrl"
                          :href="catalogue(item.applianceId).sourceUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          >View product listing ↗</a
                        >
                      </p>
                    </article>
                    <p>
                      <strong>Equipment purchase subtotal: {{ money(equipmentCost) }}</strong
                      ><br /><small class="text-secondary"
                        >Reference prices, not live quotes. Separate from electricity costs.</small
                      >
                    </p>
                    <p class="small text-success">
                      This plan: {{ totals.kwh.toFixed(1) }} kWh ·
                      {{ money(totals.cost) }} estimated monthly electricity.
                    </p>
                    <details class="small text-secondary mb-3">
                      <summary>How the estimate works</summary>
                      <p class="mt-2">
                        Monthly kWh = rated kW × quantity × hours/day × days in month × days/week ÷
                        7 × operating load ÷ 100. Operating load represents average power relative
                        to the rating, including cycling or reduced-power settings. Use measured
                        values if available; 100% assumes full rated power throughout usage. These
                        are estimates, not an efficiency certification or exact bill forecast.
                      </p>
                    </details>
                    <div class="d-flex flex-wrap gap-2">
                      <button class="btn btn-success" @click="savePlan(false)">
                        {{ plan.id ? 'Update plan' : 'Save plan' }}</button
                      ><button
                        v-if="plan.id"
                        class="btn btn-outline-success"
                        @click="savePlan(true)"
                      >
                        Save as new plan</button
                      ><span v-if="busy" role="status">Saving…</span>
                    </div>
                  </div>
                </div>
              </section>
              <section class="card border-0 shadow-sm mt-4" aria-labelledby="saved-title">
                <div class="card-body p-4">
                  <h2 id="saved-title" class="h4">Saved Plans</h2>
                  <p class="text-secondary">
                    Click a plan name to view its details. Tick the checkboxes to compare plans.
                    Each uses its saved tariff, month length and household settings.
                  </p>
                  <p v-if="!householdPlans.length">
                    No saved plans yet. Add your first plan to start comparing.
                  </p>
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
                      <span>
                        · {{ saved.estimate.kwh.toFixed(1) }} kWh ·
                        {{ money(saved.estimate.cost) }}</span
                      >
                    </div>
                    <button
                      class="btn btn-sm btn-outline-danger"
                      :aria-label="`Delete ${saved.name}`"
                      @click="deletePlan(saved)"
                    >
                      Delete
                    </button>
                  </div>
                  <section
                    v-if="householdPlans.length"
                    class="plan-charts mt-4"
                    aria-label="Saved plan comparison graphs"
                  >
                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                      <h3 class="h5">
                        {{ compareIds.length ? 'Selected plans' : 'All household plans' }}
                      </h3>
                      <button
                        v-if="compareIds.length"
                        class="btn btn-sm btn-outline-success"
                        @click="compareIds = []"
                      >
                        Compare all plans
                      </button>
                    </div>
                    <p class="small text-secondary">
                      All plans are shown initially. Tick plans above to narrow the comparison;
                      clear the selection to show all again.
                    </p>
                    <div class="row g-4">
                      <section class="col-lg-6">
                        <h4 class="h6">Monthly energy consumption</h4>
                        <div class="planner-chart-scroll">
                        <div class="planner-chart planner-bar-chart" :style="{ width: barChartWidth }">
                          <canvas
                            ref="energyBars"
                            role="img"
                            aria-label="Vertical bar chart comparing saved monthly energy consumption"
                          ></canvas>
                        </div>
                      </div>
                      </section>
                      <section class="col-lg-6">
                        <h4 class="h6">Monthly electricity cost</h4>
                        <div class="planner-chart-scroll">
                        <div class="planner-chart planner-bar-chart" :style="{ width: barChartWidth }">
                          <canvas
                            ref="costBars"
                            role="img"
                            aria-label="Vertical bar chart comparing saved monthly electricity costs"
                          ></canvas>
                        </div>
                      </div>
                      </section>
                    </div>
                    <section class="mt-4" aria-labelledby="purchase-chart-title">
                      <h3 id="purchase-chart-title" class="h5">Initial appliance purchase price</h3>
                      <p class="small text-secondary">
                        One-time total for each plan: appliance price × quantity. Uses saved prices,
                        or current catalogue prices when no saved price is available. Plans with
                        missing prices have no bar. Electricity costs are excluded.
                      </p>
                      <div class="planner-chart-scroll">
                        <div class="planner-chart planner-bar-chart" :style="{ width: barChartWidth }">
                        <canvas
                          ref="purchaseBars"
                          role="img"
                          aria-label="Vertical bar chart comparing total initial appliance purchase prices by plan in Singapore dollars"
                        ></canvas>
                      </div>
                      </div>
                      <ul class="small mt-2">
                        <li v-for="saved in comparison" :key="saved.id">
                          {{ saved.name }}: {{ purchaseTotal(saved) == null ? 'Price unavailable' : money(purchaseTotal(saved)) }}
                        </li>
                      </ul>
                    </section>
                    <h3 class="h5 mt-4">12-month cumulative forecast</h3>
                    <p class="small text-secondary">
                      From {{ forecastMonths[0].label }} to {{ forecastMonths[11].label }}. Daily
                      use and each plan’s saved tariff stay constant. Each point adds all full months
                      from the start of this forecast through the labelled month, accounting for
                      the number of days in each month. These are estimates, not actual readings
                      or seasonal predictions. Appliance purchase prices are excluded.
                    </p>
                    <div class="row g-4">
                      <section class="col-lg-6">
                        <h4 class="h6">Cumulative energy consumption</h4>
                        <div class="planner-chart">
                          <canvas
                            ref="energyForecast"
                            role="img"
                            aria-label="Line chart forecasting cumulative energy consumption over 12 months"
                          ></canvas>
                        </div>
                      </section>
                      <section class="col-lg-6">
                        <h4 class="h6">Cumulative electricity cost</h4>
                        <div class="planner-chart">
                          <canvas
                            ref="costForecast"
                            role="img"
                            aria-label="Line chart forecasting cumulative electricity costs over 12 months"
                          ></canvas>
                        </div>
                      </section>
                    </div>
                    <details class="small mt-3">
                      <summary>Cumulative forecast values</summary>
                      <div v-for="saved in comparison" :key="saved.id" class="mt-3">
                        <strong>{{ saved.name }}</strong>
                        <ul>
                          <li v-for="month in forecastMonths" :key="month.label">
                            {{ month.label }}:
                            {{
                              (
                                (saved.estimate.kwh / (Number(saved.days) || 30)) *
                                month.cumulativeDays
                              ).toFixed(1)
                            }}
                            kWh ·
                            {{
                              money(
                                (saved.estimate.kwh / (Number(saved.days) || 30)) *
                                  month.cumulativeDays *
                                  saved.tariff,
                              )
                            }}
                          </li>
                        </ul>
                      </div>
                    </details>
                  </section>
                </div>
              </section>
            </template>
          </fieldset>
        </div>
      </template>
    </main>
    <footer class="border-top py-4 text-center text-secondary">
      HDB EcoHome · Household Energy Planner
    </footer>
  </div>
</template>
