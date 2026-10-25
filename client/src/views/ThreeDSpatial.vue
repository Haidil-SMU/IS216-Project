<template>
  <div class="spatial-page" :style="{ '--nav-h': navH + 'px' }">

    <!-- Toolbar: page title, view layers and undo/redo live here instead of the sidebar -->
    <header class="spatial-toolbar">
      <div class="d-flex align-items-center gap-3 min-w-0">
        <span class="title-badge d-none d-sm-grid" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>
        </span>
        <div class="min-w-0">
          <h1 class="page-title text-truncate">{{ plan.household?.name || 'Your flat' }}</h1>
          <div class="page-sub text-truncate">
            3D Spatial<template v-if="flatLabel"> · {{ flatLabel }}</template>
          </div>
        </div>
        <span class="chip d-none d-md-inline-flex" title="Electricity tariff used for cost estimates">${{ tariff }}/kWh</span>
      </div>

      <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
        <div class="layer-group" role="group" aria-label="Show in room">
          <template v-for="layer in OVERLAY_LAYERS" :key="layer.key">
            <input :id="`layer-${layer.key}`" type="checkbox" class="btn-check" v-model="overlays[layer.key]" autocomplete="off">
            <label :for="`layer-${layer.key}`" class="layer-pill">
              <span class="legend-dot" :style="{ background: layer.color }"></span>{{ layer.label }}
            </label>
          </template>
        </div>

        <div class="btn-group" role="group" aria-label="History">
          <button class="btn btn-sm btn-eco-outline" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">↶ Undo</button>
          <button class="btn btn-sm btn-eco-outline" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="redo">↷ Redo</button>
        </div>
      </div>
    </header>

    <div class="spatial-body">
      <!-- 3D canvas -->
      <main class="canvas-card">
        <FloorPlan3D
          :rooms="plan.rooms" :footprint="plan.footprint"
          :selected-id="selectedRoomId" :selected-item-id="selectedItemId"
          @select-room="selectedRoomId = $event" @select-item="selectedItemId = $event"
          :overlays="overlays"
          @edit-rect="onEditRect" @move-items="onMoveItems" @move-opening="onMoveOpening" @drag-preview="preview = $event" @rotate-blocked="flash('No room to rotate it here.')" @door-blocked="flash($event)" />

        <div class="canvas-messages">
          <div v-if="loadError" class="alert alert-danger shadow-sm py-2 px-3 mb-0 small">
            {{ loadError }}
            <RouterLink v-if="needsHousehold" to="/MyProfile" class="alert-link ms-1">Open My Profile</RouterLink>
          </div>
          <div v-if="notice" class="alert alert-warning shadow-sm py-2 px-3 mb-0 small">{{ notice }}</div>
          <div v-if="warnings.length" class="warn-box shadow-sm">
            <button type="button" class="warn-toggle" @click="showWarnings = !showWarnings" :aria-expanded="showWarnings">
              ⚠ {{ warnings.length }} layout {{ warnings.length === 1 ? 'warning' : 'warnings' }}
              <span class="ms-auto">{{ showWarnings ? '▾' : '▸' }}</span>
            </button>
            <ul v-if="showWarnings" class="mb-0 ps-3 pe-2 pb-2 small">
              <li v-for="w in warnings" :key="w">{{ w }}</li>
            </ul>
          </div>
        </div>
      </main>

      <!-- Sidebar -->
      <aside class="side-column">
        <section class="stat-card">
          <div class="stat-label">Estimated energy · whole flat</div>
          <div class="d-flex align-items-baseline gap-2 flex-wrap">
            <span class="stat-value">{{ totalKwhYear.toLocaleString() }}</span>
            <span class="stat-unit">kWh/yr</span>
            <span class="stat-cost ms-auto">≈ ${{ costYear.toLocaleString() }}/yr</span>
          </div>
          <div v-if="placementImpact >= 0.1" class="stat-note">
            +{{ placementImpact.toFixed(1) }}% from placement (rated {{ ratedKwhYear.toLocaleString() }} kWh/yr)
          </div>
        </section>

        <section v-if="selectedOpening" class="panel-card d-flex align-items-center justify-content-between gap-2 py-2">
          <span class="small text-truncate">
            <b>{{ selectedOpening.name }}</b>
            <span class="text-muted"> · drag along the wall</span>
          </span>
          <button class="btn btn-sm btn-outline-danger py-0 flex-shrink-0" @click="removeSelectedOpening">Remove</button>
        </section>

        <section v-if="recs.length || tips.length" class="panel-card recs-card">
          <div class="panel-title mb-2">Recommendations</div>
          <div class="recs-scroll">
            <div v-for="r in recs" :key="r.id" class="rec-row">
              <span class="small">{{ r.text }}</span>
              <button class="btn btn-sm btn-eco flex-shrink-0" @click="applyRec(r)">Apply</button>
            </div>
            <div v-for="t in tips" :key="t.text" class="rec-row rec-tip" @click="selectedItemId = t.id">
              <span class="small">{{ t.text }}</span>
            </div>
          </div>
        </section>

        <section class="panel-card items-card">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="panel-title text-truncate">
              {{ selectedRoom?.name ?? 'Items' }}
              <span v-if="selectedRoom" class="count-pill">{{ roomItems.length }}</span>
            </div>
            <button v-if="roomItems.length" class="btn btn-link btn-sm text-danger text-decoration-none p-0" @click="clearRoomItems">Clear all</button>
          </div>

          <div v-if="!selectedRoom" class="empty-state">
            <div class="empty-icon" aria-hidden="true">⌂</div>
            Click a room in the plan to see its items. New appliances are added to the selected room.
          </div>
          <div v-else-if="!roomItems.length" class="empty-state">
            Nothing here yet. Pick an appliance from the catalogue below.
          </div>

          <ul v-else class="item-list list-unstyled mb-0">
            <li
              v-for="item in roomItems" :key="item.id"
              class="item-row"
              :class="{ active: item.id === selectedItemId }"
              @click="selectedItemId = item.id"
            >
              <div class="min-w-0 flex-grow-1">
                <div class="item-name text-truncate">{{ item.name }}</div>
                <div class="item-meta text-truncate">
                  <template v-if="item.brand">{{ item.brand }} {{ item.model }}<span v-if="item.ticks" class="tick-badge">{{ item.ticks }}&#10004;&#xFE0E;</span> · </template>{{ rowOf(item.id) ? Math.round(rowOf(item.id).kwh) : item.kwh }} kWh/yr
                </div>
                <div v-if="(rowOf(item.id)?.factors?.length) || (rowOf(item.id)?.causedByOthers?.length)" class="item-tags">
                  <span v-for="f in rowOf(item.id)?.factors || []" :key="f.key" class="tag tag-warn">+{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }}</span>
                  <span v-for="f in rowOf(item.id)?.causedByOthers || []" :key="f.key" class="tag tag-warn">+{{ f.pct.toFixed(1) }}% {{ f.label.toLowerCase() }} (move the fan)</span>
                </div>
                <div v-if="rowOf(item.id)?.knockOn?.length" class="item-tags">
                  <span v-for="f in rowOf(item.id)?.knockOn || []" :key="f.label" class="tag tag-good">move it to save ~{{ Math.round(f.kwh) }} kWh/yr on the {{ f.label }}</span>
                </div>
              </div>
              <button class="btn-remove" aria-label="Remove item" title="Remove" @click.stop="removeItem(item.id)">✕</button>
            </li>
          </ul>
        </section>
      </aside>
    </div>

    <!-- Catalogue dock: collapse it to give the 3D view the whole height -->
    <section class="catalogue-dock" :class="{ collapsed: !dockOpen }">
      <button type="button" class="dock-toggle" :aria-expanded="dockOpen" @click="dockOpen = !dockOpen">
        <span class="fw-semibold">Appliance catalogue</span>
        <span class="dock-hint d-none d-sm-inline">Adding to {{ selectedRoom?.name ?? 'the living room' }}</span>
        <span class="ms-auto dock-caret">{{ dockOpen ? '▾ Hide' : '▴ Show' }}</span>
      </button>
      <div v-show="dockOpen" class="dock-body">
        <AppliancesList @add-appliance="handleAddAppliance" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import AppliancesList from '../components/AppliancesList.vue'
import FloorPlan3D from '../components/FloorPlan3D.vue'
import { resolveSpec } from '../stores/applianceModels.js'
import { OPENING_KEYS, isBuild, isOpening, isCountertop, newPlacementDoc, tariff, typeOf, productOf, kwhOfPlacement, loadCatalogue } from '../stores/catalog.js'
import { findSpot, onWall, isBlocked, doorBlockedBeyond, needsOutsideWall, roomBehindOpening } from '../stores/placement.js'
import { analyse } from '../stores/energy.js'
import {
  getFloorplan, getCurrentHousehold, addPlacement, movePlacement, removePlacement, saveRoomPlacements,
  setRoomRect, addOpening, moveOpening, removeOpening, restoreLayout,
} from '../api/spatial.js'


const navH = ref(72)
const dockOpen = ref(typeof window === 'undefined' || window.innerHeight >= 860)
const showWarnings = ref(false)
let navObserver
const measureNav = () => { navH.value = document.querySelector('.eco-navbar')?.offsetHeight || 72 }

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
let flashTimer
const flash = (msg, ms = 4000) => { notice.value = msg; clearTimeout(flashTimer); flashTimer = setTimeout(() => (notice.value = ''), ms) }
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
  id: String(p._id), name: nameOf(p), kwh: isBuild(p.category) ? 0 : kwhOf(p), ticks: productOf(p.category, p.applianceTypeKey, p.brand, p.model)?.ticks ?? null,
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
  ...analyse(r.dimension, placedOf(r), tariff, r.name),
})))
const rowOf = (id) => { for (const a of analyses.value) { const row = a.rows.find((x) => x.id === id); if (row) return row } return null }
const sumOf = (key) => analyses.value.reduce((total, a) => total + a[key], 0)

const costYear = computed(() => Math.round(totalKwhYear.value * tariff))
const flatLabel = computed(() => (plan.value.household?.flatTypeId ? `${plan.value.household.flatTypeId} HDB` : ''))
const ratedKwhYear = computed(() => Math.round(sumOf('base')))
const totalKwhYear = computed(() => Math.round(sumOf('kwh')))
const placementImpact = computed(() => (sumOf('base') ? (sumOf('avoidKwh') / sumOf('base')) * 100 : 0))

const recs = computed(() => analyses.value.find((a) => a.roomId === selectedRoomId.value)?.recs ?? [])
const tips = computed(() => analyses.value.find((a) => a.roomId === selectedRoomId.value)?.tips ?? [])

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

const near = (a, b) => Math.abs(a - b) < 0.02
function sharedWall(A, B) {
  const a = { x: A.origin.x, z: A.origin.z, w: A.dimension.w, d: A.dimension.d }
  const b = { x: B.origin.x, z: B.origin.z, w: B.dimension.w, d: B.dimension.d }
  const tests = [
    [0, near(a.z, b.z + b.d), a.x, a.x + a.w, b.x, b.x + b.w],
    [1, near(a.x + a.w, b.x), a.z, a.z + a.d, b.z, b.z + b.d],
    [2, near(a.z + a.d, b.z), a.x, a.x + a.w, b.x, b.x + b.w],
    [3, near(a.x, b.x + b.w), a.z, a.z + a.d, b.z, b.z + b.d],
  ]
  for (const [wall, ok, a0, a1, b0, b1] of tests) {
    if (!ok) continue
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
    if (hi - lo > 0.05) {
      const mid = (lo + hi) / 2
      const t = [mid - a.x, mid - a.z, a.x + a.w - mid, a.z + a.d - mid][wall]
      return { wall, length: hi - lo, t }
    }
  }
  return null
}
const isConnected = (a, b) =>
  a.placements.some((p) => isOpening(p) && p.connectsTo === b.name) || (a.openWalls || []).some((o) => o.to === b.name)
const DOOR_FIT = 1.1
const unconnectedNeighbours = (room) => plan.value.rooms.filter((o) => {
  if (o === room || isConnected(room, o)) return false
  const s = sharedWall(room, o)
  return s && s.length >= DOOR_FIT
})

const onEditRect = async ({ roomId, rect }) => {
  const before = new Set((roomOf(roomId) ? unconnectedNeighbours(roomOf(roomId)) : []).map((o) => o.name))
  const saved = await run(() => setRoomRect(hid(), roomId, rect))
  if (saved) {
    const moved = roomOf(roomId)
    const fresh = moved ? unconnectedNeighbours(moved).filter((o) => !before.has(o.name)) : []
    if (fresh.length) {
      flash(`The ${moved.name} now touches the ${fresh.map((o) => o.name).join(' and the ')}. To connect them, drag a door onto the wall they share, or add a door from the catalogue.`, 9000)
    }
  }
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

function openingSpots(r, appliance) {
  const spec = resolveSpec(appliance.applianceTypeKey, appliance.category)
  const dim = r.dimension, others = placedOf(r)
  const lenOf = (w) => (w % 2 ? dim.d : dim.w)
  const margin = Math.max(0.6, spec.w / 2 + 0.15)
  const walls = [0, 1, 2, 3].map((w) => ({ w, centre: lenOf(w) / 2, preferred: false }))
  if (spec.kind === 'door' && !needsOutsideWall(spec)) {
    for (const o of plan.value.rooms) {
      if (o === r || isConnected(r, o)) continue
      const s = sharedWall(r, o)
      if (s && s.length >= DOOR_FIT && !walls[s.wall].preferred) Object.assign(walls[s.wall], { preferred: true, centre: s.t })
    }
  }
  walls.sort((a, b) => (b.preferred - a.preferred) || (lenOf(b.w) - lenOf(a.w)))
  const spots = []
  const skipped = new Set()
  const beyond = new Map()
  for (const { w, centre, preferred } of walls) {
    let found = 0
    const refused = new Set()
    const ts = []
    for (let t = margin; t <= lenOf(w) - margin + 1e-9; t += 0.1) ts.push(Math.round(t * 10) / 10)
    ts.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))
    for (const t of ts) {
      const pos = onWall(dim, spec, w, t)
      if (!pos || isBlocked({ spec, ...pos }, others)) continue
      if (needsOutsideWall(spec) && roomBehindOpening(plan.value.rooms, r, spec, pos)) continue
      const behind = doorBlockedBeyond(plan.value.rooms, r, spec, pos, { cache: beyond })
      if (behind) { if (!behind.straddle) refused.add(behind.name); continue }
      spots.push([w, pos.t]); found++
    }
    if (preferred && !found) refused.forEach((n) => skipped.add(n))
  }
  const out = spots.slice(0, 300)
  out.skipped = [...skipped]
  return out
}

const handleAddAppliance = async (appliance) => {
  if (!selectedRoom.value) {
    const first = plan.value.rooms.find((r) => r.type === 'living') ?? plan.value.rooms[0]
    if (!first) return
    selectedRoomId.value = String(first._id)
  }
  const r = selectedRoom.value

  if (isBuild(appliance.category) && OPENING_KEYS.has(appliance.applianceTypeKey)) {
    const roomId = String(r._id)
    const spots = openingSpots(r, appliance)
    if (!spots.length) return flash(`There is no clear space on the ${r.name} walls for that. Move an appliance away from the wall, or make the room bigger.`)
    const added = await run(() => addOpening(hid(), roomId, appliance.applianceTypeKey, spots))
    if (added && spots.skipped?.length)
      flash(`A countertop or appliance in the ${spots.skipped.join(' / ')} is in the way of a door there, so this door went on another wall. Move it first if you want the rooms joined.`, 9000)
    return added
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
onMounted(() => {
  window.addEventListener('keydown', onKey)
  measureNav()
  const nav = document.querySelector('.eco-navbar')
  if (nav && 'ResizeObserver' in window) { navObserver = new ResizeObserver(measureNav); navObserver.observe(nav) }
  // Lock the page behind the editor so the mouse wheel only zooms the 3D view.
  document.documentElement.classList.add('no-page-scroll')
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  navObserver?.disconnect()
  document.documentElement.classList.remove('no-page-scroll')
})
</script>

<style>
html.no-page-scroll,
html.no-page-scroll body {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>

<style scoped>
/* Same palette as the rest of EcoHome: green #168b59, ink #19352a, soft mint backgrounds. */
.spatial-page {
  --eco: #168b59;
  --eco-dark: #116a42;
  --eco-light: #2fbf71;
  --ink: #19352a;
  --muted: #5d6f65;
  --line: #dcebe1;
  --tint: #eaf7ee;
  --radius: 18px;
  --shadow: 0 1px 2px rgba(16, 40, 28, 0.05), 0 12px 26px -16px rgba(16, 40, 28, 0.45);
  --shadow-lift: 0 1px 2px rgba(16, 40, 28, 0.06), 0 18px 34px -16px rgba(16, 40, 28, 0.5);

  height: calc(100dvh - var(--nav-h, 72px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 22px 16px;
  background:
    radial-gradient(1100px 420px at 8% -10%, rgba(47, 191, 113, 0.13), transparent 70%),
    radial-gradient(900px 420px at 100% 0%, rgba(14, 165, 233, 0.08), transparent 70%),
    #f4faf6;
  color: var(--ink);
  overflow: hidden;
  font-feature-settings: 'tnum' 1;
}

.min-w-0 { min-width: 0; }

/* Toolbar */
.spatial-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  flex-wrap: wrap;
}
.title-badge {
  width: 42px;
  height: 42px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, var(--eco-dark), var(--eco-light));
  box-shadow: 0 10px 18px -10px rgba(22, 139, 89, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.page-title { font-size: 1.3rem; font-weight: 780; letter-spacing: -0.4px; margin: 0; color: var(--ink); }
.page-sub { font-size: 0.8rem; color: var(--muted); font-weight: 500; }
.chip {
  align-items: center;
  padding: 4px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 650;
  white-space: nowrap;
}

.layer-group {
  display: inline-flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow);
}
.layer-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 13px;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}
.layer-pill:hover { background: var(--tint); color: var(--eco); }
.btn-check:checked + .layer-pill { background: var(--tint); color: var(--eco-dark); box-shadow: inset 0 0 0 1px #bfe3cd; }
.btn-check:focus-visible + .layer-pill { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 1px; }
.legend-dot { width: 0.65rem; height: 0.65rem; border-radius: 50%; display: inline-block; opacity: 0.4; transition: opacity 0.18s ease, box-shadow 0.18s ease; }
.btn-check:checked + .layer-pill .legend-dot { opacity: 1; box-shadow: 0 0 0 3px rgba(22, 139, 89, 0.12); }

.btn-eco-outline {
  color: var(--eco-dark);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--line);
  font-weight: 650;
  box-shadow: var(--shadow);
}
.btn-eco-outline:hover:not(:disabled) { background: var(--tint); color: var(--eco-dark); border-color: #bfe3cd; }
.btn-eco-outline:disabled { color: #a3b3aa; box-shadow: none; }
.btn-eco {
  background: linear-gradient(135deg, var(--eco), var(--eco-light));
  border-color: var(--eco);
  color: #fff;
  font-weight: 650;
  padding-top: 0.1rem;
  padding-bottom: 0.1rem;
  box-shadow: 0 8px 14px -10px rgba(22, 139, 89, 0.9);
}
.btn-eco:hover { background: var(--eco-dark); border-color: var(--eco-dark); color: #fff; }

/* Body: canvas + sidebar share the remaining height */
.spatial-body { flex: 1 1 0; min-height: 0; display: flex; gap: 14px; }

.canvas-card {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 22px;
  background: linear-gradient(180deg, #e4f0e9, #eef4f0);
  box-shadow: 0 0 0 1px var(--line), 0 24px 44px -26px rgba(16, 40, 28, 0.55);
  overflow: hidden;
}
.canvas-card :deep(.floorplan) { position: absolute; inset: 0; }
.canvas-messages {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(440px, calc(100% - 28px));
}
.canvas-messages .alert {
  border-radius: 14px;
  border-width: 1px;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  animation: rise 0.22s ease-out;
}
.warn-box {
  border: 1px solid #f3dd9a;
  border-radius: 14px;
  background: rgba(255, 248, 225, 0.94);
  color: #7a5a00;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.warn-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: 0;
  background: none;
  color: inherit;
  font-size: 0.8rem;
  font-weight: 650;
}
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* Sidebar */
.side-column {
  flex: 0 0 328px;
  width: 328px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat-card {
  position: relative;
  flex: 0 0 auto;
  padding: 16px 18px;
  border-radius: var(--radius);
  color: #fff;
  background: linear-gradient(135deg, #0f4d35 0%, #168b59 62%, #2fbf71 120%);
  box-shadow: 0 16px 28px -16px rgba(20, 90, 62, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  overflow: hidden;
}
.stat-card::before,
.stat-card::after { content: ''; position: absolute; border-radius: 50%; pointer-events: none; }
.stat-card::before { width: 150px; height: 150px; right: -40px; top: -70px; background: radial-gradient(circle, rgba(255, 255, 255, 0.22), transparent 70%); }
.stat-card::after { width: 110px; height: 110px; left: -30px; bottom: -60px; background: radial-gradient(circle, rgba(169, 237, 198, 0.2), transparent 70%); }
.stat-card > * { position: relative; }
.stat-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #bfe6cf; }
.stat-value { font-size: 2.1rem; font-weight: 780; letter-spacing: -1.2px; line-height: 1.1; }
.stat-unit { font-size: 0.85rem; color: #cfeadb; font-weight: 500; }
.stat-cost { font-size: 0.9rem; font-weight: 750; color: #a9edc6; padding: 2px 9px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); }
.stat-note { margin-top: 6px; font-size: 0.75rem; color: #ffd9a8; }

.panel-card {
  flex: 0 0 auto;
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow);
}
.panel-title { font-size: 0.92rem; font-weight: 720; color: var(--ink); letter-spacing: -0.1px; }
.count-pill {
  margin-left: 6px;
  padding: 1px 9px;
  border-radius: 999px;
  background: var(--tint);
  color: var(--eco-dark);
  font-size: 0.72rem;
  font-weight: 720;
}

.recs-card { max-height: 28%; display: flex; flex-direction: column; min-height: 0; border-left: 4px solid var(--eco-light); }
.recs-scroll { overflow-y: auto; min-height: 0; }
.rec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 0;
  border-top: 1px solid #edf4ef;
}
.rec-row:first-child { border-top: 0; padding-top: 0; }
.rec-tip { cursor: pointer; color: #5d6f65; }

.items-card { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.item-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -6px; padding: 0 6px; }
.item-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 11px;
  margin-bottom: 5px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.item-row:hover { background: #f4faf6; transform: translateX(1px); }
.item-row.active { background: var(--tint); border-color: #bfe3cd; }
.item-row.active::before { content: ''; position: absolute; left: -1px; top: 9px; bottom: 9px; width: 3px; border-radius: 3px; background: var(--eco); }
.item-name { font-size: 0.86rem; font-weight: 680; }
.item-meta { font-size: 0.73rem; color: var(--muted); }
.tick-badge {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 4px;
  background: #e3f6ea;
  color: #12a150;
  font-size: 0.68rem;
  font-weight: 700;
}
.item-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.tag { padding: 1px 9px; border-radius: 999px; font-size: 0.68rem; font-weight: 650; line-height: 1.5; }
.tag-warn { background: #fff1d6; color: #8a5a00; }
.tag-good { background: #dff3e6; color: #0f6a3f; }
.btn-remove {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #a3242b;
  font-size: 0.75rem;
  opacity: 0.55;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.item-row:hover .btn-remove, .btn-remove:focus-visible { opacity: 1; }
.btn-remove:hover { background: #fdecee; }

.empty-state {
  margin: auto 0;
  padding: 20px 10px;
  text-align: center;
  font-size: 0.82rem;
  color: var(--muted);
}
.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 10px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--tint), #d6f0e0);
  color: var(--eco);
  font-size: 1.7rem;
}

/* Scrollbars */
.item-list::-webkit-scrollbar, .recs-scroll::-webkit-scrollbar { width: 6px; }
.item-list::-webkit-scrollbar-thumb, .recs-scroll::-webkit-scrollbar-thumb { background: #c5dccd; border-radius: 6px; }
.item-list::-webkit-scrollbar-track, .recs-scroll::-webkit-scrollbar-track { background: transparent; }

/* Catalogue dock */
.catalogue-dock {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fff;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.dock-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 18px;
  border: 0;
  background: linear-gradient(180deg, #f7fcf9, #eef7f1);
  color: var(--ink);
  font-size: 0.86rem;
  text-align: left;
  transition: background-color 0.15s ease;
}
.dock-toggle:hover { background: var(--tint); }
.dock-toggle:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: -3px; }
.dock-hint { color: var(--muted); font-size: 0.78rem; }
.dock-caret { color: var(--eco-dark); font-size: 0.78rem; font-weight: 700; }
.dock-body { height: 214px; border-top: 1px solid var(--line); }

/* Narrower screens: sidebar shrinks, then drops under the canvas */
@media (max-width: 1199px) {
  .side-column { flex-basis: 288px; width: 288px; }
}
@media (max-width: 767px) {
  .spatial-page { padding: 8px 10px 10px; gap: 8px; }
  .spatial-body { flex-direction: column; gap: 10px; }
  .side-column { flex: 0 0 38%; width: auto; }
  .stat-value { font-size: 1.6rem; }
  .layer-pill { padding: 4px 9px; font-size: 0.75rem; }
  .dock-body { height: 196px; }
  .canvas-card { border-radius: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .canvas-messages .alert, .item-row, .layer-pill, .legend-dot { animation: none; transition: none; }
}
</style>
