<template>
  <div class="page-container d-flex flex-column">

    <div class="d-flex flex-grow-1 min-h-0 min-w-0">
      <main class="flex-grow-1 min-w-0 bg-light p-0 position-relative">
        <FloorPlan3D v-if="mode==='flat'" :rooms="plan.rooms" :footprint="plan.footprint"
  :selected-id="selectedRoomId" @select-room="selectedRoomId = $event" @open-room="openRoom" />
        <RoomCanvas
          v-else
          ref="canvas"
          :appliances="spawnedAppliances"
          :room="room"
          :tariff="energyData.electricityTariff"
          :overlays="overlays"
          @no-space="handleNoSpace"
          @removed="handleRemoved"
          @analysis="analysis = $event"
          @layout-changed="onLayoutChanged"
        />
        <button v-if="mode==='room'" class="btn btn-sm btn-dark position-absolute top-0 start-0 m-2" style="z-index:5" @click="backToFlat">← Whole flat</button>
        <div v-if="loadError" class="alert alert-danger position-absolute m-3" style="z-index:5">{{ loadError }}</div>
      </main>

      <aside class="right-sidebar overflow-auto bg-body-secondary border-start p-3 d-flex flex-column justify-content-between">
        <div>
          <h5 class="fw-bold mb-1">Room Summary</h5>
          <p class="small text-muted mb-3">Electricity Tariff: ${{ energyData.electricityTariff }}/kWh</p>
          <div v-if="mode==='flat'" class="small mb-2">Adding to: <b>{{ selectedRoom?.name ?? 'click a room first' }}</b></div>
          <div class="card bg-white border-0 shadow-sm p-3 mb-3">
            <label v-for="s in sliders" :key="s.key" class="small d-block mb-1">
              <span class="d-flex justify-content-between"><span>{{ s.label }}</span><b>{{ room[s.key].toFixed(1) }} m</b></span>
              <input type="range" class="form-range" :min="s.min" :max="s.max" step="0.1" v-model.number="room[s.key]">
            </label>
          </div>

          <div class="card bg-white border-0 shadow-sm p-3 mb-3">
            <div class="small text-uppercase text-muted fw-bold mb-1">Show in room</div>
            <div v-for="o in overlayOptions" :key="o.key" class="form-check form-switch small">
              <input :id="'ov-' + o.key" v-model="overlays[o.key]" class="form-check-input" type="checkbox">
              <label :for="'ov-' + o.key" class="form-check-label">{{ o.label }}</label>
            </div>
          </div>

          <div v-if="notice" class="alert alert-warning py-1 px-2 small">{{ notice }}</div>

          <div class="card bg-white border-0 shadow-sm p-3 mb-3">
            <div class="small text-uppercase text-muted fw-bold">Est. Total Energy</div>
            <div class="fs-4 fw-bold text-info">{{ totalKwhYear }} <span class="fs-6 text-muted">kWh/yr</span></div>
            <div v-if="placementImpact" class="small" :class="placementImpact > 0 ? 'text-danger' : 'text-success'">
              {{ placementImpact > 0 ? '+' : '' }}{{ placementImpact.toFixed(1) }}% from placement (rated {{ ratedKwhYear }} kWh/yr)
            </div>

            <hr class="my-2">

            <div class="small text-uppercase text-muted fw-bold">Est. Annual Cost</div>
            <div class="fs-4 fw-bold text-success">${{ totalAnnualCost }} <span class="fs-6 text-muted">/yr</span></div>
          </div>

          <div v-if="analysis.recs.length" class="card bg-white border-0 shadow-sm p-3 mb-3">
            <div class="small text-uppercase text-muted fw-bold mb-2">Recommendations</div>
            <div v-for="r in analysis.recs" :key="r.idx" class="small mb-2">
              <div>{{ r.text }}</div>
              <button class="btn btn-sm btn-outline-success py-0 mt-1" @click="canvas.applyRec(r.idx)">Apply</button>
            </div>
          </div>

          <div class="fw-semibold small mb-2 d-flex justify-content-between align-items-center">
            <span>Items in Room ({{ spawnedAppliances.length }})</span>
            <button 
              v-if="spawnedAppliances.length > 0" 
              class="btn btn-link btn-sm text-danger text-decoration-none p-0"
              @click="clearAllAppliances"
            >
              Clear All
            </button>
          </div>

          <ul class="list-group list-group-flush rounded shadow-sm overflow-hidden">
            <li 
              v-for="item in spawnedAppliances" 
              :key="item.id"
              class="list-group-item d-flex align-items-center justify-content-between px-2 py-2 small"
            >
              <div class="text-truncate me-2">
                <div class="fw-bold text-truncate">{{ item.name }}</div>
                <div class="text-muted fs-7">
                  <span v-if="item.tick !== 'none'" class="badge bg-warning text-dark me-1">
                    {{ item.tick.replace('_tick', '✔') }}
                  </span>
                  <span>{{ rowOf(item.id) ? Math.round(rowOf(item.id).kwh) : item.kwhYear }} kWh/yr</span>
                </div>
                <div v-for="f in rowOf(item.id)?.factors || []" :key="f.key" v-show="Math.abs(f.pct) >= 0.5" class="fs-7 text-warning-emphasis">
                  +{{ f.pct.toFixed(0) }}% {{ f.label.toLowerCase() }}
                </div>
              </div>
              <button 
                class="btn btn-outline-danger btn-xs py-0 px-1 border-0"
                @click="removeAppliance(item.id)"
              >
                ✕
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>

    <footer class="bottom-sidebar bg-dark text-white border-top border-secondary flex-shrink-0">
      <AppliancesList 
        @tab-changed="handleTabChange" 
        @add-appliance="handleAddAppliance" 
      />
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import energyData from '../data/energyData.json'
import AppliancesList from '../components/AppliancesList.vue'
import RoomCanvas from '../components/RoomCanvas.vue'
import FloorPlan3D from '../components/FloorPlan3D.vue'
import { resolveSpec } from '../stores/applianceModels.js'
import { findSpot } from '../stores/placement.js'
import { getFloorplan, saveRoomPlacements, createHousehold, addPlacement, saveRoom } from '../api/spatial.js'
// import { getFloorplan, createHousehold, addPlacement, saveRoom } from '../api/spatial.js'
const loadError = ref('')
const HOUSEHOLD_KEY = 'ecohomeHouseholdId'

onMounted(async () => {
  try {
    const saved = localStorage.getItem(HOUSEHOLD_KEY)
    if (saved) {
      try { return await loadHousehold(saved) }
      catch { localStorage.removeItem(HOUSEHOLD_KEY) }
    }
    const created = await createHousehold({ userId: 'demo-user', name: 'My flat', flatTypeId: '2-room' })
    localStorage.setItem(HOUSEHOLD_KEY, created.household._id)
    await loadHousehold(created.household._id)
  } catch (e) {
    loadError.value = 'Could not load the floor plan: ' + (e.response?.data?.error || e.message)
  }
})

const activeCategory = ref('kitchen')
const activeApplianceName = ref('Refrigerator')
const spawnedAppliances = ref([])
const plan = ref({ rooms: [], footprint: null })
const activeRoomId = ref(null)
const mode = computed(() => (activeRoomId.value ? 'room' : 'flat'))

const handleTabChange = (data) => {
  activeCategory.value = data.tabId
  activeApplianceName.value = data.applianceName
}

const room = reactive({ w: 4.2, d: 3.6, h: 2.6 })
const activeRoom = computed(() => plan.value.rooms.find((r) => String(r._id) === activeRoomId.value))
const limits = computed(() => {
  const r = activeRoom.value
  if (!r) return { w: 6, d: 6 }
  const EPS = 0.01, o = r.origin
  let w = 10, d = 10
  for (const x of plan.value.rooms) {
    if (x === r) continue
    const zOverlap = x.origin.z < o.z + room.d - EPS && x.origin.z + x.dimension.d > o.z + EPS
    const xOverlap = x.origin.x < o.x + room.w - EPS && x.origin.x + x.dimension.w > o.x + EPS
    if (zOverlap && x.origin.x >= o.x + EPS) w = Math.min(w, x.origin.x - o.x)
    if (xOverlap && x.origin.z >= o.z + EPS) d = Math.min(d, x.origin.z - o.z)
  }
  return { w: Math.floor(w * 10) / 10, d: Math.floor(d * 10) / 10 }
})
const sliders = computed(() => [
  { key: 'w', label: 'Width', min: 1.5, max: limits.value.w },
  { key: 'd', label: 'Depth', min: 1.5, max: limits.value.d },
  { key: 'h', label: 'Ceiling height', min: 2.4, max: 3 },
])
async function loadHousehold(id) { plan.value = await getFloorplan(id) }

function openRoom(roomId) {
  const r = plan.value.rooms.find((x) => String(x._id) === roomId)
  activeRoomId.value = roomId
  Object.assign(room, r.dimension)
  const sorted = [...r.placements].sort((a, b) => (a.onPlacementId ? 1 : 0) - (b.onPlacementId ? 1 : 0))
  spawnedAppliances.value = sorted.map((p) => {
    const t = energyData.categories[p.category]?.types?.[p.applianceTypeKey]
    return {
      id: String(p._id), name: t?.name ?? p.applianceTypeKey, type: p.applianceTypeKey, category: p.category,
      tick: p.tick, kwhYear: t?.ticks?.[p.tick]?.kwhYear ?? t?.kwhYear ?? 0,
      pos: { x: p.x, z: p.z, rotY: p.rotY, wall: p.wall, t: p.t, on: p.onPlacementId ? String(p.onPlacementId) : undefined, cu: p.cu },
    }
  })
}

let saveTimer
async function persistRoom() {
  if (!activeRoomId.value || !canvas.value) return true
  try {
    await saveRoom(activeRoomId.value, { dimension: { ...room }, placements: canvas.value.getPlacements() })
    return true
  } catch (e) {
    notice.value = e.response?.data?.error || 'Could not save the room'
    setTimeout(() => (notice.value = ''), 4000)
    return false
  }
}
function onLayoutChanged() { clearTimeout(saveTimer); saveTimer = setTimeout(persistRoom, 400) }
watch(() => [room.w, room.d, room.h], () => { if (mode.value === 'room') onLayoutChanged() })

async function backToFlat() {
  clearTimeout(saveTimer)
  if (!(await persistRoom())) return
  await loadHousehold(plan.value.household._id)
  activeRoomId.value = null
}

const notice = ref('')
const handleNoSpace = (id, reason) => {
  removeAppliance(id)
  notice.value = reason
  setTimeout(() => (notice.value = ''), 4000)
}

const handleRemoved = (ids) => {
  spawnedAppliances.value = spawnedAppliances.value.filter((item) => !ids.includes(item.id))
}

const canvas = ref(null)
const overlays = reactive({ sun: false, heat: true, air: true })
const overlayOptions = [
  { key: 'heat', label: 'Heat from appliances' },
  { key: 'sun', label: 'Sunlight from windows' },
  { key: 'air', label: 'Aircon airflow' },
]
const analysis = ref({ rows: [], totals: null, recs: [] })
const rowOf = (id) => analysis.value.rows.find((r) => r.id === id)

const selectedRoomId = ref(null)
const selectedRoom = computed(() => plan.value.rooms.find((r) => String(r._id) === selectedRoomId.value))

const flash = (msg) => { notice.value = msg; setTimeout(() => (notice.value = ''), 4000) }

const handleAddAppliance = async (appliance) => {
  if (mode.value === 'room') {
    spawnedAppliances.value.push({ ...appliance, id: Date.now() + Math.random() })
    return
  }

  const r = selectedRoom.value
  if (!r) return flash('Click a room in the floor plan first, then add the item.')

  const spec = resolveSpec(appliance.type, appliance.category)
  const others = r.placements.map((p) => ({
    spec: resolveSpec(p.applianceTypeKey, p.category), id: String(p._id),
    x: p.x, z: p.z, rotY: p.rotY, wall: p.wall, t: p.t, cu: p.cu,
    on: p.onPlacementId ? String(p.onPlacementId) : undefined,
  }))
  const spot = findSpot({ ...r.dimension }, spec, others)
  if (!spot) {
    const needsCounter = spec.mode === 'top' && !others.some((o) => o.spec.kind === 'counter')
    return flash(needsCounter ? 'Add a countertop first, then place this on it.' : 'No free space in this room.')
  }
  try {
    const saved = await addPlacement(r._id, {
      applianceTypeKey: appliance.type, category: appliance.category, tick: appliance.tick ?? 'none',
      x: spot.x, z: spot.z, rotY: spot.rotY, wall: spot.wall, t: spot.t, cu: spot.cu ?? 0,
      onPlacementId: spot.on ?? null,
    })
    r.placements.push(saved)
  } catch (e) {
    flash('Could not save: ' + (e.response?.data?.error || e.message))
  }
}

const removeAppliance = (id) => {
  spawnedAppliances.value = spawnedAppliances.value.filter(item => item.id !== id)
}

const clearAllAppliances = () => {
  spawnedAppliances.value = []
}

const ratedKwhYear = computed(() => spawnedAppliances.value.reduce((sum, item) => sum + (item.kwhYear || 0), 0))
const totalKwhYear = computed(() => Math.round(analysis.value.totals ? analysis.value.totals.kwh : ratedKwhYear.value))
const totalAnnualCost = computed(() => Math.round(totalKwhYear.value * energyData.electricityTariff))
const placementImpact = computed(() => (analysis.value.totals ? analysis.value.totals.impactPct : 0))
</script>

<style scoped>
.page-container {
  height: calc(100vh - 56px);
  height: calc(100dvh - 56px);
  width: 100%;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.right-sidebar {
  width: 320px;
  flex-shrink: 0;
}

.bottom-sidebar {
  height: 260px;
}

.min-h-0 {
  min-height: 0;
}

.min-w-0 {
  min-width: 0;
}

.fs-7 {
  font-size: 0.7rem;
}

.btn-xs {
  font-size: 0.75rem;
  line-height: 1;
}
</style>