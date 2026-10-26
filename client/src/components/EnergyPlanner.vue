<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import Chart from 'chart.js/auto'
import plannerNoticeImage from '../assets/planner-notice.svg'
import { factors } from '../stores/energy.js'
import { resolveSpec } from '../stores/applianceModels.js'

const noticeDialog = ref(null)
const noticeMessage = ref('')
const noticeTitle = ref('A quick heads-up')
async function showNotice(message, title = 'A quick heads-up') {
  noticeMessage.value = message
  noticeTitle.value = title
  await nextTick()
  if (noticeDialog.value && !noticeDialog.value.open) noticeDialog.value.showModal()
}

const API_URL = '/api'
const household = ref(null)
const plans = ref([])
const householdId = computed(() => household.value?.id || '')
const editingPlan = ref(true)
const layoutLoadFailed = ref(false)
const editor = ref(null)
const compareIds = ref([])
const loading = ref(true)
const busy = ref(false)
const loadFailed = ref(false)
const plannerForm = ref(null)
const profile = ref({})
const plan = ref({ id: '', name: 'Everyday plan', days: 30, tariff: 0.32, items: [] })
// A plan keeps the room geometry and positions as they were when Add plan was pressed.
const layoutPreview = computed(() => {
  const rooms = []
  let minX = 0,
    minZ = 0,
    maxX = 1,
    maxZ = 1
  for (const room of plan.value.layout || []) {
    const x = Number(room.origin?.x),
      z = Number(room.origin?.z)
    const w = Number(room.dimension?.w),
      d = Number(room.dimension?.d)
    if (![x, z, w, d].every(Number.isFinite) || w <= 0 || d <= 0) continue
    const markers = []
    for (let index = 0; index < plan.value.items.length; index++) {
      const item = plan.value.items[index]
      if (item.roomId === String(room._id) && item.x != null && item.z != null) {
        markers.push({ x: x + item.x, z: z + item.z, label: index + 1, name: item.name })
      }
    }
    rooms.push({ id: String(room._id), name: room.name || room.type, x, z, w, d, markers })
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x + w)
    maxZ = Math.max(maxZ, z + d)
  }
  return { rooms, viewBox: `${minX - 0.5} ${minZ - 0.5} ${maxX - minX + 1} ${maxZ - minZ + 1}` }
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
const totals = computed(() => estimate(plan.value))

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
  if (!comparison.value.length) return
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
watch([comparison, householdId, loading], renderCharts, {
  deep: true,
  flush: 'post',
})
onBeforeUnmount(destroyCharts)
async function showEditor() {
  await nextTick()
  editor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function money(value) {
  return 'S$' + Number(value || 0).toFixed(2)
}
async function getData() {
  const response = await axios.get(API_URL + '/planner')
  household.value = response.data.users[0] || null
  profile.value = household.value ? { ...household.value } : {}
  plans.value = response.data.plans
}
async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    await getData()
    if (householdId.value) await startPlan(false)
  } catch {
    loadFailed.value = true
    showNotice('Unable to load the planner. Check that the server is running.')
  }
  loading.value = false
}
onMounted(load)

// Rooms provide placements; the server resolves their MongoDB energy-rating references.
function annualEnergy(placement) {
  const details = placement.energyInfo || {}
  let value = details.kwhYear
  if (value == null) value = details.ticks?.[placement.tick]?.kwhYear
  if (value == null) value = placement.kwhYear
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null
  return Number(value)
}
function numberOrNull(value) {
  return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : null
}
function chooseProduct(item) {
  const product = item.products?.[item.productIndex]
  if (!product) return
  item.brand = product.brand || ''
  item.model = product.model || ''
  item.price = numberOrNull(product.priceSgd)
  const base = numberOrNull(product.kwhYear)
  item.annualKwh = base == null ? null : base * (item.placementMultiplier ?? 1)
}
async function startPlan(scroll = true) {
  if (busy.value || !householdId.value) return
  busy.value = true
  layoutLoadFailed.value = false
  try {
    const response = await axios.get(
      API_URL + '/planner/households/' + encodeURIComponent(householdId.value) + '/rooms',
    )
    const items = []
    const electrical = [
      'kitchen',
      'cooling',
      'entertainment',
      'laundry',
      'lighting',
      'bathroom',
      'living',
      'television',
      'lights',
    ]
    for (const room of response.data.rooms) {
      // Windows, furniture and neighbouring appliances all affect placement energy.
      const placed = []
      for (const placement of room.placements || []) {
        placed.push({
          ...placement,
          spec: resolveSpec(
            placement.applianceTypeKey,
            placement.category || placement.energyInfo?.category,
          ),
        })
      }
      for (const placement of room.placements || []) {
        const details = placement.energyInfo || {}
        if (!electrical.includes(placement.category || details.category)) continue
        let placementMultiplier = 1
        if (
          room.dimension?.w > 0 &&
          room.dimension?.d > 0 &&
          Number.isFinite(placement.x) &&
          Number.isFinite(placement.z)
        ) {
          const others = []
          let current
          for (let index = 0; index < placed.length; index++) {
            if (room.placements[index] === placement) current = placed[index]
            else others.push(placed[index])
          }
          const adjustments = factors(room.dimension, others, current)
          for (const adjustment of Object.values(adjustments)) placementMultiplier += adjustment
        }
        const baseEnergy = annualEnergy(placement)
        const item = {
          placementMultiplier,
          placementId: String(placement._id || ''),
          roomId: String(room._id),
          name: placement.name || details.name || placement.applianceTypeKey,
          brand: placement.brand || details.ticks?.[placement.tick]?.brand || details.brand || '',
          model: placement.model || details.ticks?.[placement.tick]?.model || details.model || '',
          x: Number.isFinite(placement.x) ? placement.x : null,
          z: Number.isFinite(placement.z) ? placement.z : null,
          rotY: placement.rotY ?? 0,
          typeKey: placement.applianceTypeKey,
          tick: placement.tick || '',
          room: room.name || room.type || 'Room',
          annualKwh: baseEnergy == null ? null : baseEnergy * placementMultiplier,
          quantity: Number(placement.quantity) || 1,
          usagePercent: 100,
          products: Array.isArray(details.products) ? details.products : [],
          productIndex: 0,
          price: numberOrNull(details.averagePrice),
        }
        for (let index = 0; index < item.products.length; index++) {
          const product = item.products[index]
          if (product.brand === item.brand && product.model === item.model)
            item.productIndex = index
        }
        if (item.products.length) chooseProduct(item)
        items.push(item)
      }
    }
    profile.value = { ...household.value }
    plan.value = {
      id: '',
      name: 'Everyday plan',
      days: 30,
      tariff: 0.32,
      items,
      layout: JSON.parse(JSON.stringify(response.data.rooms)),
      layoutCapturedAt: new Date().toISOString(),
    }
    editingPlan.value = true
    if (scroll) await showEditor()
  } catch (err) {
    layoutLoadFailed.value = true
    showNotice(err.response?.data?.error || 'Unable to load the saved rooms for this household.')
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

// Each save creates a new plan in the database.
async function savePlan() {
  if (busy.value) return
  if (!plan.value.items.length) {
    showNotice('No electrical appliances were found in this household’s saved rooms.')
    return
  }
  for (const item of plan.value.items) {
    if (item.annualKwh == null) {
      showNotice(
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
    showNotice('Please enter a plan name.')
    return
  }
  for (const saved of householdPlans.value) {
    if (saved.name.trim().toLowerCase() === name.toLowerCase()) {
      showNotice('A plan with this name already exists in this household. Choose a different name.')
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
      layout: plan.value.layout || [],
      layoutCapturedAt: plan.value.layoutCapturedAt,
      estimate: totals.value,
    }
    await axios.post(API_URL + '/plans', data)
    compareIds.value = []
    await getData()
    editingPlan.value = true
    showNotice('Your plan has been saved.', 'Plan saved!')
  } catch (err) {
    console.log(err.message)
    showNotice(err.response?.data?.error || 'Unable to save the plan.')
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
    showNotice('Plan deleted.', 'Plan deleted')
  } catch (err) {
    console.log(err.message)
    showNotice('Unable to delete the plan.')
  }
  busy.value = false
}

function loadPlan(saved) {
  if (saved.householdId !== householdId.value) return
  editingPlan.value = true
  compareIds.value = []
  plan.value = JSON.parse(JSON.stringify(saved))
  plan.value.days = 30
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
    <dialog
      ref="noticeDialog"
      class="planner-notice"
      aria-labelledby="planner-notice-title"
      aria-describedby="planner-notice-message"
      @click.self="noticeDialog.close()"
    >
      <div class="planner-notice-art">
        <button
          type="button"
          class="planner-notice-close"
          aria-label="Close notification"
          @click="noticeDialog.close()"
        >
          ×
        </button>
        <img :src="plannerNoticeImage" alt="" width="240" height="160" />
      </div>
      <div class="planner-notice-body">
        <p class="planner-notice-eyebrow">YOUR HOME ENERGY</p>
        <h2 id="planner-notice-title">{{ noticeTitle }}</h2>
        <p id="planner-notice-message">{{ noticeMessage }}</p>
        <button
          type="button"
          class="btn btn-success rounded-pill w-100"
          autofocus
          @click="noticeDialog.close()"
        >
          Got it
        </button>
      </div>
    </dialog>
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
      <div v-if="!loading && loadFailed" class="mb-3">
        <p>The planner could not load.</p>
        <button class="btn btn-outline-secondary" :disabled="busy" @click="load">Retry</button>
      </div>
      <p v-if="loading" role="status">Loading your planner…</p>
      <template v-else-if="!loadFailed">
        <p v-if="!household" class="empty-dashboard p-4">
          No household is linked to your account yet. Save your household in
          <RouterLink to="/MyProfile">My Profile</RouterLink> and its rooms before using the
          planner.
        </p>
        <div v-else class="planner-editor">
          <fieldset ref="plannerForm" :disabled="busy">
            <legend class="visually-hidden">Energy planner</legend>
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
                        {{ household.name }}
                      </h2>
                      <p class="text-secondary mb-0">
                        {{ household.flatType }} · {{ household.occupants }} occupants · Electricity
                        budget: {{ money(household.budget) }}/month
                      </p>
                    </div>
                  </div>
                  <p class="small text-secondary mb-0">
                    Plans use electrical appliances saved in this household’s MongoDB rooms.
                  </p>
                </div>
              </section>
              <section
                v-if="editingPlan"
                ref="editor"
                class="mb-4 planner-editor"
                aria-labelledby="plan-title"
              >
                <div class="card border-0 shadow-sm mb-4">
                  <div class="card-body p-4">
                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                      <h2 id="plan-title" class="h4 fw-bold mb-0">Your home energy plan.</h2>
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
                      <div class="col-md-6">
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
                    <section class="mb-4" aria-labelledby="layout-preview-title">
                      <h3 id="layout-preview-title" class="h5">Review your current home layout</h3>
                      <svg
                        v-if="layoutPreview.rooms.length"
                        class="planner-layout-preview"
                        :viewBox="layoutPreview.viewBox"
                        role="img"
                        aria-label="Home layout with numbered appliance positions"
                      >
                        <g v-for="room in layoutPreview.rooms" :key="room.id">
                          <rect
                            :x="room.x"
                            :y="room.z"
                            :width="room.w"
                            :height="room.d"
                            class="layout-room"
                          />
                          <text :x="room.x + 0.15" :y="room.z + 0.4" class="layout-room-label">
                            {{ room.name }}
                          </text>
                          <g v-for="marker in room.markers" :key="marker.label">
                            <title>{{ marker.label }}. {{ marker.name }} — {{ room.name }}</title>
                            <circle :cx="marker.x" :cy="marker.z" r=".22" class="layout-marker" />
                            <text :x="marker.x" :y="marker.z" class="layout-marker-label">
                              {{ marker.label }}
                            </text>
                          </g>
                        </g>
                      </svg>
                      <p v-else class="small text-secondary">
                        Room dimensions are not available for a drawing. Review the room and
                        appliance list below.
                      </p>
                    </section>
                    <h3 class="h5">Energy use from your saved rooms</h3>
                    <p class="small text-secondary">
                      Choose a product to compare its purchase price and annual energy rating. Basic
                      appliances use their catalogue rating and average price. Usage at 100%
                      represents the full annual rating.
                    </p>
                    <p v-if="!plan.items.length">
                      No electrical appliances were found in this household’s saved rooms.
                    </p>
                    <p v-if="layoutLoadFailed" class="planner-appliance-details">
                      The home layout could not load.
                      <button class="btn btn-outline-success" @click="startPlan">
                        Retry layout
                      </button>
                    </p>
                    <article
                      v-for="(item, index) in plan.items"
                      :key="index"
                      class="room planner-appliance-card mb-3"
                    >
                      <h4 class="h4 fw-bold">{{ index + 1 }}. {{ item.name }}</h4>
                      <p class="planner-appliance-details">
                        {{ item.room }}
                        <span v-if="item.tick"
                          >· 3D rating: {{ item.tick.replace('_tick', ' ticks') }}</span
                        >
                      </p>
                      <p v-if="item.x != null && item.z != null" class="planner-appliance-position">
                        Position in room: {{ item.x.toFixed(2) }} m × {{ item.z.toFixed(2) }} m
                      </p>
                      <div v-if="item.products?.length" class="mb-2">
                        <label :for="'plan-product-' + index" class="form-label fw-bold"
                          >Brand and model</label
                        >
                        <select
                          :id="'plan-product-' + index"
                          v-model.number="item.productIndex"
                          class="form-select"
                          @change="chooseProduct(item)"
                        >
                          <option
                            v-for="(product, productIndex) in item.products"
                            :key="productIndex"
                            :value="productIndex"
                          >
                            {{ product.brand }} · {{ product.model }}
                          </option>
                        </select>
                      </div>
                      <p v-else class="planner-appliance-details">Basic model · {{ item.name }}</p>
                      <div class="row g-2 mb-2">
                        <div class="col-sm-6">
                          <div class="planner-energy-stat">
                            <span>Annual energy per item</span>
                            <strong
                              >{{
                                item.annualKwh == null ? 'Not available' : item.annualKwh.toFixed(1)
                              }}
                              <small v-if="item.annualKwh != null">kWh/year</small></strong
                            >
                          </div>
                        </div>
                        <div class="col-sm-6">
                          <div class="planner-price-stat">
                            <span>Price of item</span>
                            <strong>{{
                              item.price == null ? 'Not available' : money(item.price)
                            }}</strong>
                          </div>
                        </div>
                      </div>
                      <label :for="'plan-usage-' + index" class="form-label fw-bold"
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
                      <p class="planner-monthly-result mt-2 mb-0">
                        <template v-if="item.annualKwh != null"
                          >{{ itemEnergy(item, plan.days).toFixed(1) }} kWh/month ·
                          {{ money(itemEnergy(item, plan.days) * plan.tariff) }}/month</template
                        >
                        <template v-else>Monthly estimate unavailable</template>
                      </p>
                    </article>
                    <p class="planner-monthly-result">
                      This plan: {{ totals.kwh.toFixed(1) }} kWh ·
                      {{ money(totals.cost) }} estimated monthly electricity.
                    </p>
                    <p class="text-secondary">
                      Prices and energy figures are catalogue estimates. Purchase prices are
                      separate from electricity costs.
                    </p>
                    <details class="small text-secondary mb-3">
                      <summary>How the estimate works</summary>
                      <p>
                        Annual energy uses the database rating with the 3D map’s placement
                        adjustments. Monthly kWh = adjusted annual kWh ÷ 365 × 30 days × quantity ×
                        usage percentage ÷ 100. Cost = monthly kWh × tariff. Annual ratings are
                        spread evenly across the year; these are planning estimates, not measured
                        bills.
                      </p>
                    </details>
                    <div class="d-flex flex-wrap gap-2">
                      <button class="btn btn-success" :disabled="busy" @click="savePlan">
                        Save plan
                      </button>
                      <span v-if="busy" role="status">Saving…</span>
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
