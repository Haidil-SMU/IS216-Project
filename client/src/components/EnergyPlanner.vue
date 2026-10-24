<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import Chart from 'chart.js/auto'

const API_URL = '/api'
const households = ref([])
const plans = ref([])
const householdId = ref('')
const activePanel = ref('dashboard')
const dashboardHouseholdId = ref('')
const editingPlan = ref(false)
const editor = ref(null)
const compareIds = ref([])
const loading = ref(true)
const busy = ref(false)
const loadFailed = ref(false)
const plannerForm = ref(null)
const profile = ref({})
const plan = ref({ id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items: [] })
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
const totals = computed(() => estimate(plan.value))

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
      values.push(saved.estimate[metric])
      colours.push(colour)
    }
  }
  if (!forecast)
    datasets.push({
      label: metric === 'kwh' ? 'Monthly kWh' : 'Monthly cost (S$)',
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
  if (activePanel.value !== 'planner' || !comparison.value.length) return
  const definitions = [
    [energyBars.value, 'kwh', false],
    [costBars.value, 'cost', false],
    [energyForecast.value, 'kwh', true],
    [costForecast.value, 'cost', true],
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
              title: {
                display: true,
                text:
                  (forecast ? 'Cumulative ' : '') +
                  (metric === 'kwh' ? 'Energy (kWh)' : 'Cost (S$)'),
              },
            },
          },
        },
      }),
    )
  }
}
watch([comparison, activePanel, householdId, loading], renderCharts, {
  deep: true,
  flush: 'post',
})
onBeforeUnmount(destroyCharts)
async function showEditor() {
  activePanel.value = 'planner'
  await nextTick()
  editor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function money(value) {
  return 'S$' + Number(value || 0).toFixed(2)
}
async function getData() {
  const response = await axios.get(API_URL + '/planner')
  households.value = response.data.users
  plans.value = response.data.plans
}
async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    await getData()
  } catch {
    loadFailed.value = true
    window.alert('Unable to load the planner. Check that the server is running.')
  }
  loading.value = false
}
onMounted(load)

// Rooms provide placements; the server resolves their MongoDB energy-rating references.
function annualEnergy(placement) {
  const details = placement.energyInfo || {}
  let value = placement.kwhYear
  if (value == null) value = details.ticks?.[placement.tick]?.kwhYear
  if (value == null) value = details.kwhYear
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null
  return Number(value)
}
async function startPlan() {
  if (busy.value || !householdId.value) return
  busy.value = true
  try {
    const response = await axios.get(
      API_URL + '/planner/households/' + encodeURIComponent(householdId.value) + '/rooms',
    )
    const items = []
    const electrical = ['kitchen', 'living', 'television', 'laundry', 'lights']
    for (const room of response.data.rooms) {
      for (const placement of room.placements || []) {
        const details = placement.energyInfo || {}
        if (!electrical.includes(details.category || placement.category)) continue
        items.push({
          placementId: String(placement._id || ''),
          roomId: String(room._id),
          name: details.name || placement.name || placement.applianceTypeKey,
          typeKey: placement.applianceTypeKey,
          tick: placement.tick || '',
          room: room.name || room.type || 'Room',
          annualKwh: annualEnergy(placement),
          quantity: Number(placement.quantity) || 1,
          usagePercent: 100,
        })
      }
    }
    for (const household of households.value) {
      if (household.id === householdId.value) profile.value = { ...household }
    }
    plan.value = { id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items }
    editingPlan.value = true
    await showEditor()
  } catch (err) {
    window.alert(err.response?.data?.error || 'Unable to load the saved rooms for this household.')
  }
  busy.value = false
}
function checkInputs(section) {
  const inputs = section.querySelectorAll('input, select, textarea')
  for (const input of inputs) {
    if (!input.reportValidity()) return false
  }
  return true
}

// POST creates a household; PUT updates the selected household.
// The calling save function handles request errors.
// POST /plans creates a new plan. PUT /plans/:id updates an existing plan.
async function savePlan(copy = false) {
  if (!plan.value.items.length) {
    window.alert('No electrical appliances were found in this household’s saved rooms.')
    return
  }
  for (const item of plan.value.items) {
    if (item.annualKwh == null) {
      window.alert(
        'Energy information is missing for ' +
          item.name +
          '. Save a valid energy rating in the room data before creating this plan.',
      )
      return
    }
  }
  if (!checkInputs(editor.value)) return
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
      window.alert(
        'A plan with this name already exists in this household. Choose a different name.',
      )
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

function changeHousehold(event) {
  householdId.value = event.target.value
  editingPlan.value = false
  compareIds.value = []
  profile.value = {}
  for (const household of households.value) {
    if (household.id === householdId.value) profile.value = { ...household }
  }
}
function loadPlan(saved) {
  householdId.value = saved.householdId
  dashboardHouseholdId.value = saved.householdId
  editingPlan.value = true
  compareIds.value = []
  plan.value = JSON.parse(JSON.stringify(saved))
  profile.value = { ...saved.profile }
  // Older plans retain their saved estimates without looking up a removed catalogue.
  for (let index = 0; index < plan.value.items.length; index++) {
    const item = plan.value.items[index]
    if ('annualKwh' in item) continue
    const snapshot = saved.estimate.byAppliance?.[index]
    const monthlyKwh =
      snapshot?.kwh ??
      (typeof item.power === 'number'
        ? (((item.power * item.quantity * item.hours * saved.days * item.daysPerWeek) / 7) *
            item.loadPercent) /
          100
        : null)
    item.name = item.name || snapshot?.name || item.type || 'Saved appliance'
    item.annualKwh =
      monthlyKwh == null
        ? null
        : ((monthlyKwh / (Number(saved.days) || 30)) * 365) / (item.quantity || 1)
    item.usagePercent = 100
  }
  showEditor()
}

function itemEnergy(item, days) {
  return (((item.annualKwh || 0) / 365) * days * item.quantity * item.usagePercent) / 100
}
function estimate(currentPlan) {
  let kwh = 0
  const byAppliance = []
  const byRoom = []
  for (const item of currentPlan.items) {
    const energy = itemEnergy(item, currentPlan.days)
    const cost = energy * currentPlan.tariff
    kwh += energy
    byAppliance.push({ ...item, kwh: energy, cost })
    let roomTotal = null
    for (const room of byRoom) {
      if (room.room === item.room) roomTotal = room
    }
    if (!roomTotal) {
      roomTotal = { room: item.room, kwh: 0, cost: 0 }
      byRoom.push(roomTotal)
    }
    roomTotal.kwh += energy
    roomTotal.cost += cost
  }
  return { kwh, cost: kwh * currentPlan.tariff, byAppliance, byRoom }
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
          Use your household’s saved rooms to estimate energy use and compare electricity plans.
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
      <div v-if="!loading && loadFailed" class="mb-3">
        <p>The planner could not load.</p>
        <button class="btn btn-outline-secondary" :disabled="busy" @click="load">Retry</button>
      </div>
      <p v-if="loading" role="status">Loading your planner…</p>
      <template v-else-if="!loadFailed">
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
            No households are linked to your account yet. Save a household and its rooms before
            using the planner.
          </p>
        </section>
        <div v-show="activePanel === 'planner'" ref="editor" class="planner-editor">
          <fieldset ref="plannerForm" :disabled="busy">
            <legend class="visually-hidden">Energy planner</legend>
            <div class="dashboard-selector mb-4">
              <label for="household" class="form-label fw-bold">Select your household</label>
              <select
                id="household"
                class="form-select"
                :value="householdId"
                @change="changeHousehold"
              >
                <option value="" disabled>Choose a household</option>
                <option v-for="household in households" :key="household.id" :value="household.id">
                  {{ household.name }}
                </option>
              </select>
            </div>
            <template v-if="householdId">
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
                  </div>
                  <p class="small text-secondary mb-0">
                    Plans use electrical appliances saved in this household’s MongoDB rooms.
                  </p>
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
                    <h3 class="h5">Energy use from your saved rooms</h3>
                    <p class="small text-secondary">
                      Each entry uses the energy rating saved for its 3D placement. Adjust usage as
                      a percentage of that annual rating to compare scenarios; 100% uses the full
                      rated annual consumption.
                    </p>
                    <p v-if="!plan.items.length">
                      No electrical appliances were found in this household’s saved rooms.
                    </p>
                    <article v-for="(item, index) in plan.items" :key="index" class="room mb-3">
                      <h4 class="h6">{{ item.name }}</h4>
                      <p class="small text-secondary">
                        {{ item.room }} · Quantity: {{ item.quantity }}
                        <span v-if="item.tick">· Rating: {{ item.tick }}</span>
                      </p>
                      <p v-if="item.annualKwh == null">
                        Energy information is missing. Update the saved room’s rating before saving
                        this plan.
                      </p>
                      <template v-else>
                        <p class="small">
                          Saved rating: {{ item.annualKwh.toFixed(1) }} kWh/year per item.
                        </p>
                        <label :for="'plan-usage-' + index" class="form-label"
                          >Usage (% of annual rating)</label
                        >
                        <input
                          :id="'plan-usage-' + index"
                          v-model.number="item.usagePercent"
                          class="form-control"
                          type="number"
                          min="0"
                          max="200"
                          step="1"
                          required
                        />
                        <p class="small mt-2">
                          {{ itemEnergy(item, plan.days).toFixed(1) }} kWh/month ·
                          {{ money(itemEnergy(item, plan.days) * plan.tariff) }}/month
                        </p>
                      </template>
                    </article>
                    <p>
                      This plan: {{ totals.kwh.toFixed(1) }} kWh ·
                      {{ money(totals.cost) }} estimated monthly electricity.
                    </p>
                    <details class="small text-secondary mb-3">
                      <summary>How the estimate works</summary>
                      <p>
                        Monthly kWh = saved annual kWh ÷ 365 × days in month × quantity × usage
                        percentage ÷ 100. Cost = monthly kWh × tariff. Annual ratings are spread
                        evenly across the year; these are planning estimates, not measured bills.
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
                          <div
                            class="planner-chart planner-bar-chart"
                            :style="{ width: barChartWidth }"
                          >
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
                          <div
                            class="planner-chart planner-bar-chart"
                            :style="{ width: barChartWidth }"
                          >
                            <canvas
                              ref="costBars"
                              role="img"
                              aria-label="Vertical bar chart comparing saved monthly electricity costs"
                            ></canvas>
                          </div>
                        </div>
                      </section>
                    </div>
                    <h3 class="h5 mt-4">12-month cumulative forecast</h3>
                    <p class="small text-secondary">
                      From {{ forecastMonths[0].label }} to {{ forecastMonths[11].label }}. Daily
                      use and each plan’s saved tariff stay constant. Each point adds all full
                      months from the start of this forecast through the labelled month, accounting
                      for the number of days in each month. These are estimates, not actual readings
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
