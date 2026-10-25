<template>
  <div class="page-container d-flex flex-column">

    <div class="d-flex flex-grow-1 min-h-0 min-w-0">
      <main class="flex-grow-1 min-w-0 bg-light p-0 position-relative">
        <FloorPlan3D
          :rooms="plan.rooms" :footprint="plan.footprint"
          :selected-id="selectedRoomId" :selected-item-id="selectedItemId"
          @select-room="selectedRoomId = $event" @select-item="selectedItemId = $event"
          :overlays="overlays"
          @edit-rect="onEditRect" @move-items="onMoveItems" @move-opening="onMoveOpening" @drag-preview="preview = $event" @rotate-blocked="flash('No room to rotate it here.')" />
        <div v-if="loadError" class="alert alert-danger position-absolute m-3" style="z-index:5">
          {{ loadError }}
          <RouterLink v-if="needsHousehold" to="/MyProfile" class="alert-link ms-1">Open My Profile</RouterLink>
        </div>
      </main>

      <aside class="right-sidebar overflow-auto bg-body-secondary border-start p-3 d-flex flex-column justify-content-between">
        <div>
          <h5 class="fw-bold mb-1">Flat Summary</h5>
          <p class="small text-muted mb-3">Electricity Tariff: ${{ tariff }}/kWh</p>

          <div class="d-flex gap-1 mb-2">
            <button class="btn btn-sm btn-outline-secondary flex-fill" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">↶ Undo</button>
            <button class="btn btn-sm btn-outline-secondary flex-fill" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="redo">↷ Redo</button>
          </div>

          <div v-if="!selectedRoom" class="small text-muted mb-2">Click a room to select it. New items are added to the selected room.</div>

          <div class="card card-body small mb-2 py-2">
            <div class="fw-semibold mb-1">Show in room</div>
            <label v-for="layer in OVERLAY_LAYERS" :key="layer.key" class="form-check d-flex align-items-center gap-2 mb-0">
              <input type="checkbox" class="form-check-input mt-0" v-model="overlays[layer.key]">
              <span class="legend-dot" :style="{ background: layer.color }"></span>{{ layer.label }}
            </label>
          </div>

          <div v-if="selectedOpening" class="card card-body small mb-2 py-2 d-flex flex-row align-items-center justify-content-between">
            <span>Selected: <b>{{ selectedOpening.name }}</b> (drag it along the wall)</span>
            <button class="btn btn-sm btn-outline-danger py-0" @click="removeSelectedOpening">Remove</button>
          </div>

          <div v-if="warnings.length" class="alert alert-warning small mb-2 py-1">
            <div v-for="w in warnings" :key="w">⚠ {{ w }}</div>
          </div>
          <div v-if="notice" class="alert alert-warning py-1 px-2 small">{{ notice }}</div>

          <div class="card bg-white border-0 shadow-sm p-3 mb-3">
            <div class="small text-uppercase text-muted fw-bold">Est. Total Energy (whole flat)</div>
            <div class="fs-4 fw-bold text-info">{{ totalKwhYear }} <span class="fs-6 text-muted">kWh/yr</span></div>
            <div v-if="placementImpact >= 0.1" class="small text-danger">
              +{{ placementImpact.toFixed(1) }}% from placement (rated {{ ratedKwhYear }} kWh/yr)
            </div>
          </div>

          <div v-if="recs.length" class="card bg-white border-0 shadow-sm p-3 mb-3">
            <div class="small text-uppercase text-muted fw-bold mb-2">Recommendations</div>
            <div v-for="r in recs" :key="r.id" class="small mb-2">
              <div>{{ r.text }}</div>
              <button class="btn btn-sm btn-outline-success py-0 mt-1" @click="applyRec(r)">Apply</button>
            </div>
          </div>

          <div class="fw-semibold small mb-2 d-flex justify-content-between align-items-center">
            <span>Items in {{ selectedRoom?.name ?? 'room' }} ({{ roomItems.length }})</span>
            <button v-if="roomItems.length" class="btn btn-link btn-sm text-danger text-decoration-none p-0" @click="clearRoomItems">Clear All</button>
          </div>

          <ul class="list-group list-group-flush rounded shadow-sm overflow-hidden">
            <li
              v-for="item in roomItems" :key="item.id"
              class="list-group-item d-flex align-items-center justify-content-between px-2 py-2 small item-row"
              :class="{ 'bg-info-subtle': item.id === selectedItemId }"
              @click="selectedItemId = item.id"
            >
              <div class="text-truncate me-2">
                <div class="fw-bold text-truncate">{{ item.name }}</div>
                <div class="text-muted fs-7">
                  <span v-if="item.brand" class="me-1">{{ item.brand }}<span v-if="item.ticks" class="badge bg-warning text-dark ms-1">{{ item.ticks }}✔</span> {{ item.model }} ·</span>
                  <span>{{ rowOf(item.id) ? Math.round(rowOf(item.id).kwh) : item.kwh }} kWh/yr</span>
                </div>
                <div v-for="f in rowOf(item.id)?.factors || []" :key="f.key" class="fs-7 text-warning-emphasis">
                  +{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }}
                </div>
                <div v-for="f in rowOf(item.id)?.causedByOthers || []" :key="f.key" class="fs-7 text-warning-emphasis">
                  +{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }} (move the fan)
                </div>
                <div v-for="f in rowOf(item.id)?.knockOn || []" :key="f.label" class="fs-7 text-success">
                  moving it would save ~{{ Math.round(f.kwh) }} kWh/yr on the {{ f.label }}
                </div>
              </div>
              <button class="btn btn-outline-danger btn-xs py-0 px-1 border-0" @click.stop="removeItem(item.id)">✕</button>
            </li>
          </ul>
        </div>
      </aside>

    </div>

    <footer class="bottom-sidebar bg-dark text-white border-top border-secondary flex-shrink-0">
      <AppliancesList @add-appliance="handleAddAppliance" />
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import AppliancesList from '../components/AppliancesList.vue'
import FloorPlan3D from '../components/FloorPlan3D.vue'
import { resolveSpec } from '../stores/applianceModels.js'
import { OPENING_KEYS, isBuild, isOpening, isCountertop, newPlacementDoc, tariff, typeOf, productOf, kwhOfPlacement, loadCatalogue } from '../stores/catalog.js'
import { findSpot } from '../stores/placement.js'
import { analyse } from '../stores/energy.js'
import {
  getFloorplan, getCurrentHousehold, addPlacement, movePlacement, removePlacement, saveRoomPlacements,
  setRoomRect, addOpening, moveOpening, removeOpening, restoreLayout,
} from '../api/spatial.js'

const loadError = ref('')
const needsHousehold = ref(false)

onMounted(async () => {
  try {
    await loadCatalogue()
    applyLoaded(await getCurrentHousehold())
  } catch (e) {
    needsHousehold.value = e.response?.data?.code === 'NO_HOUSEHOLD'
    loadError.value = needsHousehold.value
      ? e.response.data.error
      : 'Could not load the floor plan: ' + (e.response?.data?.error || e.message)
  }
})

const plan = ref({ rooms: [], footprint: null })
const warnings = ref([])
const notice = ref('')
const flash = (msg) => { notice.value = msg; setTimeout(() => (notice.value = ''), 4000) }
const hid = () => plan.value.household._id

function applyLoaded(loaded) {
  plan.value = loaded
  warnings.value = loaded.warnings ?? []
  resetHistory()
}
const loadHousehold = async (id) => applyLoaded(await getFloorplan(id))

const selectedRoomId = ref(null)
const selectedItemId = ref(null)
const selectedRoom = computed(() => plan.value.rooms.find((r) => String(r._id) === selectedRoomId.value))

watch(() => plan.value.rooms, (rooms) => {
  if (selectedRoomId.value && !rooms.some((r) => String(r._id) === selectedRoomId.value)) selectedRoomId.value = null
  if (selectedItemId.value && !rooms.some((r) => r.placements.some((p) => String(p._id) === selectedItemId.value))) selectedItemId.value = null
})
watch(selectedRoomId, (id) => {
  const r = plan.value.rooms.find((x) => String(x._id) === id)
  if (selectedItemId.value && !r?.placements.some((p) => String(p._id) === selectedItemId.value)) selectedItemId.value = null
})

const kwhOf = kwhOfPlacement
const nameOf = (p) => typeOf(p.category, p.applianceTypeKey)?.name ?? p.applianceTypeKey

const preview = ref(null)
const placedOf = (r) => r.placements.map((p) => ({
  id: String(p._id), name: nameOf(p), kwh: isBuild(p.category) ? 0 : kwhOf(p),
  spec: resolveSpec(p.applianceTypeKey, p.category),
  x: p.x, z: p.z, rotY: p.rotY, wall: p.wall, t: p.t, cu: p.cu ?? 0,
  on: p.onPlacementId ? String(p.onPlacementId) : undefined,
  ...(preview.value?.roomId === String(r._id) ? preview.value.poses[String(p._id)] : null),
}))

const roomItems = computed(() => {
  const r = selectedRoom.value
  if (!r) return []
  return r.placements
    .filter((p) => !isOpening(p))
    .map((p) => {
      const product = productOf(p.category, p.applianceTypeKey, p.brand, p.model)
      return { id: String(p._id), name: nameOf(p), brand: product?.brand ?? null, model: product?.model ?? null, ticks: product?.ticks ?? null, kwh: kwhOf(p) }
    })
})

const analyses = computed(() => plan.value.rooms.map((r) => ({
  roomId: String(r._id),
  ...analyse(r.dimension, placedOf(r), tariff),
})))
const rowOf = (id) => { for (const a of analyses.value) { const row = a.rows.find((x) => x.id === id); if (row) return row } return null }
const sumOf = (key) => analyses.value.reduce((total, a) => total + a[key], 0)

const ratedKwhYear = computed(() => Math.round(sumOf('base')))
const totalKwhYear = computed(() => Math.round(sumOf('kwh')))
const placementImpact = computed(() => (sumOf('base') ? (sumOf('avoidKwh') / sumOf('base')) * 100 : 0))

const recs = computed(() => analyses.value.find((a) => a.roomId === selectedRoomId.value)?.recs ?? [])

const overlays = reactive({ sun: false, heat: true, air: true })
const OVERLAY_LAYERS = [
  { key: 'sun', label: 'Sunlight', color: '#ffc929' },
  { key: 'heat', label: 'Heat', color: '#e8420f' },
  { key: 'air', label: 'Airflow (aircon & fans)', color: '#22b8cf' },
]

const MAX_HISTORY = 50
const undoStack = ref([])
const redoStack = ref([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
const snapshot = () => JSON.stringify(plan.value.rooms)
function remember(before) {
  undoStack.value.push(before)
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}
const resetHistory = () => { undoStack.value = []; redoStack.value = [] }

let chain = Promise.resolve()
const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p }

const applyGeometry = (res) => {
  plan.value = { ...plan.value, rooms: res.rooms, footprint: res.footprint }
  warnings.value = res.warnings ?? []
}

function commit(fn) {
  return enqueue(async () => {
    const before = snapshot()
    try {
      const res = await fn()
      applyGeometry(res)
      remember(before)
      return res
    } catch (e) { flash(e.response?.data?.error || e.message); return null }
  })
}
const run = async (fn) => !!(await commit(fn))

function travel(from, to) {
  return enqueue(async () => {
    const target = from.value[from.value.length - 1]
    if (!target) return
    const current = snapshot()
    try {
      applyGeometry(await restoreLayout(hid(), JSON.parse(target)))
      from.value.pop()
      to.value.push(current)
    } catch (e) { flash(e.response?.data?.error || e.message) }
  })
}
const undo = () => travel(undoStack, redoStack)
const redo = () => travel(redoStack, undoStack)

const onEditRect = async ({ roomId, rect }) => {
  const saved = await run(() => setRoomRect(hid(), roomId, rect))
  // A rejected resize leaves the plan as it was, so nudge the 3D view to redraw it and snap back.
  if (!saved) plan.value = { ...plan.value, rooms: [...plan.value.rooms] }
}

const selectedOpening = computed(() => {
  for (const r of plan.value.rooms) {
    const p = r.placements.find((x) => String(x._id) === selectedItemId.value)
    if (p && isOpening(p)) return { roomId: String(r._id), id: String(p._id), name: nameOf(p) }
  }
  return null
})
const removeSelectedOpening = () => {
  const o = selectedOpening.value
  if (o) run(() => removeOpening(hid(), o.roomId, o.id))
}

async function onMoveOpening({ roomId, id, wall, t }) {
  const saved = await run(() => moveOpening(hid(), roomId, id, wall, t))
  preview.value = null
  if (!saved) plan.value = { ...plan.value, rooms: [...plan.value.rooms] }
}

const roomOf = (roomId) => plan.value.rooms.find((x) => String(x._id) === roomId)

const handleAddAppliance = async (appliance) => {
  if (!selectedRoom.value) {
    const first = plan.value.rooms.find((r) => r.type === 'living') ?? plan.value.rooms[0]
    if (!first) return
    selectedRoomId.value = String(first._id)
  }
  const r = selectedRoom.value

  if (isBuild(appliance.category) && OPENING_KEYS.has(appliance.applianceTypeKey)) {
    const roomId = String(r._id)
    return run(() => addOpening(hid(), roomId, appliance.applianceTypeKey))
  }
  const spec = resolveSpec(appliance.applianceTypeKey, appliance.category)
  const others = placedOf(r)
  const spot = findSpot({ ...r.dimension }, spec, others)
  if (!spot) {
    if (spec.mode === 'top') {
      const hasCounter = others.some((o) => o.spec.kind === 'counter')
      return flash(hasCounter
        ? 'No free space on the countertop (the sink can\'t be used). Clear some space or add another countertop.'
        : 'Add a countertop first, then place this on it.')
    }
    return flash(`No free space in the ${r.name}. Move something, or make the room bigger.`)
  }
  const roomId = String(r._id)
  await enqueue(async () => {
    const before = snapshot()
    try {
      const saved = await addPlacement(roomId, newPlacementDoc(appliance, spot))
      roomOf(roomId)?.placements.push(saved)
      remember(before)
      selectedItemId.value = String(saved._id)
    } catch (e) {
      flash('Could not save: ' + (e.response?.data?.error || e.message))
    }
  })
}

function onMoveItems({ roomId, updates }) {
  return enqueue(async () => {
    const before = snapshot()
    const r = roomOf(roomId)
    if (!r) return
    try {
      for (const u of updates) {
        const { id, ...pos } = u
        const p = r.placements.find((x) => String(x._id) === id)
        if (!p) continue
        Object.assign(p, pos)
        await movePlacement(roomId, id, pos)
      }
      remember(before)
    } catch (e) {
      flash('Could not save the move: ' + (e.response?.data?.error || e.message))
      await loadHousehold(hid())
    } finally {
      preview.value = null
    }
  })
}
const applyRec = (rec) => {
  const r = selectedRoom.value
  if (!r) return
  const { x, z, rotY, wall, t, cu } = rec.to
  onMoveItems({ roomId: String(r._id), updates: [{ id: rec.id, x, z, rotY, wall, t, cu: cu ?? 0 }] })
  selectedItemId.value = rec.id
}

function removeItem(id) {
  const r = selectedRoom.value
  if (!r) return
  const roomId = String(r._id)
  return enqueue(async () => {
    const before = snapshot()
    try {
      await removePlacement(roomId, id)
      const room = roomOf(roomId)
      if (room) room.placements = room.placements.filter((p) => String(p._id) !== id && String(p.onPlacementId ?? '') !== id)
      remember(before)
    } catch (e) { flash('Could not remove it: ' + (e.response?.data?.error || e.message)) }
  })
}

function clearRoomItems() {
  const r = selectedRoom.value
  if (!r) return
  const roomId = String(r._id), listed = new Set(roomItems.value.map((i) => i.id))
  return enqueue(async () => {
    const before = snapshot()
    try {
      const kept = roomOf(roomId).placements.filter((p) => !listed.has(String(p._id)) || isCountertop(p))
      const keptIds = new Set(kept.map((p) => String(p._id)))
      const final = kept.filter((p) => !p.onPlacementId || keptIds.has(String(p.onPlacementId)))
      const res = await saveRoomPlacements(roomId, final)
      roomOf(roomId).placements = res.placements
      remember(before)
    } catch (e) { flash('Could not clear the room: ' + (e.response?.data?.error || e.message)) }
  })
}

const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) }
function onKey(e) {
  if (typing(e) || e.altKey) return
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
  if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
  else if (mod && k === 'y') { e.preventDefault(); redo() }
  else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && selectedItemId.value && roomItems.value.some((i) => i.id === selectedItemId.value)) {
    e.preventDefault()
    removeItem(selectedItemId.value)
  } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && selectedOpening.value) {
    e.preventDefault()
    removeSelectedOpening()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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
  height: 310px;
}

.min-h-0 {
  min-height: 0;
}

.min-w-0 {
  min-width: 0;
}

.item-row { cursor: pointer; }

.fs-7 {
  font-size: 0.7rem;
}

.legend-dot {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
}

.btn-xs {
  font-size: 0.75rem;
  line-height: 1;
}
</style>