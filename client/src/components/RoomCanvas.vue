<template>
  <div class="room-canvas w-100 h-100 position-relative">
    <div ref="host" class="w-100 h-100"></div>

    <div v-if="appliances.length" class="hint position-absolute top-0 start-50 translate-middle-x mt-2 px-3 py-1 small rounded-pill">
      Drag items to move them. Press R to rotate.
    </div>
    <div v-else class="hint empty position-absolute top-50 start-50 translate-middle text-center p-3 rounded-3">
      <h6 class="fw-bold mb-1">Room is empty</h6>
      <p class="small mb-0">Click "+ Add" on any item below to place it in the room.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createAppliance3DModel } from '../stores/applianceModels.js'
import { placeAt, onWall, onCounter, findSpot, isBlocked, wallPieces, wallPoint, NORMAL, TANGENT, WALL_THICKNESS } from '../stores/placement.js'
import { analyse, suggest, heatAt, sunAt, throwOf, airDirection } from '../stores/energy.js'

const props = defineProps({
  appliances: { type: Array, default: () => [] },
  room: { type: Object, default: () => ({ w: 4.2, d: 3.6, h: 2.6 }) },
  tariff: { type: Number, default: 0.31 }, // S$ per kWh
  overlays: { type: Object, default: () => ({ sun: false, heat: true, air: true }) },
})

const emit = defineEmits(['no-space', 'removed', 'analysis'])

const host = ref(null)


let scene, camera, renderer, controls, frame, observer
const roomGroup = new THREE.Group()
const wallMats = []
const overlay = {}
const flowGroup = new THREE.Group()
let recs = []
let dirty = true
let recsTimer
const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x0ea5e9)
outline.visible = false

const items = new Map()
let selected = null
let drag = null

const ray = new THREE.Raycaster()
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hit = new THREE.Vector3()

function buildRoom() {
  roomGroup.children.forEach((m) => { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose?.() })
  roomGroup.clear()
  wallMats.length = 0
  const { w, d } = props.room

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.8 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(w / 2, 0, d / 2)
  floor.receiveShadow = true
  roomGroup.add(floor)

  for (let i = 0; i < 4; i++) {
    wallMats.push(new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.9, transparent: true }))
  }

  for (const p of wallPieces(props.room, [...items.values()])) {
    const n = NORMAL[p.wall], u = TANGENT[p.wall]
    const [cx, cz] = wallPoint(props.room, p.wall, (p.t0 + p.t1) / 2)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(p.t1 - p.t0, p.y1 - p.y0, WALL_THICKNESS), wallMats[p.wall])
    slab.position.set(cx - (n[0] * WALL_THICKNESS) / 2, (p.y0 + p.y1) / 2, cz - (n[1] * WALL_THICKNESS) / 2)
    slab.rotation.y = Math.atan2(-u[1], u[0])
    slab.castShadow = slab.receiveShadow = true
    roomGroup.add(slab)
  }

  for (const [kind, color, y] of [['sun', 0xffc929, 0.02], ['heat', 0xe8420f, 0.03]]) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const texture = new THREE.CanvasTexture(canvas)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(w / 2, y, d / 2)
    roomGroup.add(mesh)
    overlay[kind] = { mesh, canvas, texture, color: new THREE.Color(color) }
  }
  dirty = true
}

function paintOverlays() {
  const { w, d } = props.room, placed = [...items.values()], N = 64
  for (const kind of ['sun', 'heat']) {
    const o = overlay[kind]
    if (!o) continue
    o.mesh.visible = !!props.overlays[kind]
    if (!o.mesh.visible) continue
    const ctx = o.canvas.getContext('2d'), img = ctx.createImageData(N, N)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = [((i + 0.5) / N) * w, ((j + 0.5) / N) * d]
      const v = kind === 'sun' ? sunAt(props.room, placed, p) : heatAt(props.room, placed, p)
      img.data.set([o.color.r * 255, o.color.g * 255, o.color.b * 255, v * 150], (j * N + i) * 4)
    }
    ctx.putImageData(img, 0, 0)
    o.texture.needsUpdate = true
  }
}

function updateAirflow() {
  flowGroup.children.forEach((a) => a.dispose())
  flowGroup.clear()
  flowGroup.visible = !!props.overlays.air
  if (!flowGroup.visible) return
  const placed = [...items.values()]
  for (const a of placed.filter((i) => i.spec.kind === 'ac')) {
    const reach = Math.min(throwOf(props.room, placed, a), 3.5), [fx, fz] = airDirection(a)
    for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const c = Math.cos(k), s = Math.sin(k)
      const dir = new THREE.Vector3(fx * c - fz * s, -0.25, fx * s + fz * c).normalize()
      flowGroup.add(new THREE.ArrowHelper(dir, new THREE.Vector3(a.x, a.spec.y + a.spec.h / 2, a.z), reach * (1 - Math.abs(k) * 0.3), 0x22b8cf, 0.18, 0.1))
    }
  }
}

function publishAnalysis() {
  const placed = [...items.values()], r = analyse(props.room, placed, props.tariff)
  emit('analysis', { rows: r.rows, totals: { base: r.base, kwh: r.kwh, cost: r.cost, impactPct: r.impactPct }, recs: recs.map((x, i) => ({ idx: i, id: x.id, text: x.text })) })
}
function scheduleRecs() {
  clearTimeout(recsTimer)
  recsTimer = setTimeout(() => {
    recs = suggest(props.room, [...items.values()], props.tariff)
    publishAnalysis()
  }, 150)
}
const markDirty = () => { dirty = true }

function fadeNearWalls() {
  const { w, d } = props.room, c = camera.position
  const outside = [c.z < 0, c.x > w, c.z > d, c.x < 0]
  wallMats.forEach((m, i) => {
    m.opacity = outside[i] ? 0.08 : 1
    m.depthWrite = !outside[i]
  })
}

const others = (item) => [...items.values()].filter((o) => o !== item)

function apply(item, pos) {
  Object.assign(item, pos)
  const { spec, model } = item
  const y = spec.mode === 'ceiling' ? props.room.h - spec.h : spec.y
  model.position.set(item.x, y, item.z)
  model.rotation.y = item.rotY
  if (spec.kind === 'counter') for (const o of items.values()) if (o.on === item.id) apply(o, onCounter(item, o.spec, o.cu))
  markDirty()
}

function addItem(data) {
  const model = createAppliance3DModel(data.type, data.category)
  const spec = model.userData.spec
  const item = { id: data.id, name: data.name, kwh: data.kwhYear || 0, spec, model, x: 0, z: 0, rotY: 0, wall: -1, t: 0 }
  const spot = findSpot(props.room, spec, others(item))
  if (!spot) {
    const noCounter = spec.mode === 'top' && ![...items.values()].some((o) => o.spec.kind === 'counter')
    emit('no-space', data.id, noCounter ? 'Add a countertop first, then place this on it.' : 'No free space for that item. Remove something or make the room bigger.')
    return
  }
  items.set(data.id, item)
  apply(item, spot)
  scene.add(model)
  if (spec.mode === 'opening') buildRoom()
  select(item)
  scheduleRecs()
}

function removeItem(item) {
  scene.remove(item.model)
  items.delete(item.id)
  if (selected === item) select(null)
  if (item.spec.mode === 'opening') buildRoom()
  markDirty()
}

function syncItems(list) {
  if (!scene) return
  const ids = new Set(list.map((a) => a.id)), dropped = []
  for (const item of [...items.values()]) {
    if (ids.has(item.id)) continue
    removeItem(item)
    for (const o of [...items.values()]) if (o.on === item.id) { removeItem(o); dropped.push(o.id) }
  }
  for (const data of list) if (!items.has(data.id) && !dropped.includes(data.id)) addItem(data)
  if (dropped.length) emit('removed', dropped)
  scheduleRecs()
}

function select(item) {
  selected = item
  outline.visible = !!item
  if (item) outline.setFromObject(item.model)
}

function refitItems() {
  if (!scene) return
  for (const item of items.values()) {
    if (item.spec.mode === 'top') continue // follows its counter
    const pos = item.wall >= 0 ? onWall(props.room, item.spec, item.wall, item.t) : placeAt(props.room, item.spec, [item.x, item.z], item, others(item))
    if (pos) apply(item, pos)
  }
  buildRoom()
  frameCamera()
  scheduleRecs()
}

function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
}

function onPointerDown(e) {
  if (e.button !== 0) return
  setRay(e)
  const hits = ray.intersectObjects([...items.values()].map((i) => i.model), true)
  if (!hits.length) return
  let obj = hits[0].object
  while (obj.parent !== scene) obj = obj.parent
  const item = [...items.values()].find((i) => i.model === obj)
  select(item)

  dragPlane.constant = -(obj.position.y + item.spec.h / 2)
  if (ray.ray.intersectPlane(dragPlane, hit)) {
    drag = { item, dx: item.x - hit.x, dz: item.z - hit.z }
    controls.enabled = false
    renderer.domElement.style.cursor = 'grabbing'
  }
}

function onPointerMove(e) {
  setRay(e)
  if (!drag) {
    const over = ray.intersectObjects([...items.values()].map((i) => i.model), true).length
    renderer.domElement.style.cursor = over ? 'grab' : 'default'
    return
  }
  if (!ray.ray.intersectPlane(dragPlane, hit)) return
  const { item } = drag
  const pos = placeAt(props.room, item.spec, [hit.x + drag.dx, hit.z + drag.dz], item, others(item))
  if (!pos || isBlocked({ spec: item.spec, ...pos }, others(item))) return
  apply(item, pos)
  if (item.spec.mode === 'opening') buildRoom()
}

function onPointerUp() {
  if (drag) scheduleRecs()
  drag = null
  if (controls) controls.enabled = true
  if (renderer) renderer.domElement.style.cursor = 'default'
}

function onKey(e) {
  if (e.key.toLowerCase() !== 'r' || !selected || selected.spec.mode !== 'floor' || selected.wall >= 0) return
  const rotY = selected.rotY + Math.PI / 2
  const pos = placeAt(props.room, selected.spec, [selected.x, selected.z], { rotY }, others(selected))
  if (pos && !isBlocked({ spec: selected.spec, ...pos }, others(selected))) apply(selected, pos)
}


function frameCamera() {
  const { w, d } = props.room, reach = Math.max(w, d) * 1.5 + 2
  controls.target.set(w / 2, 1, d / 2)
  camera.position.set(w / 2 + reach * 0.35, reach * 0.75, d + reach * 0.8)
}

function init() {
  const width = host.value.clientWidth || 600, height = host.value.clientHeight || 400
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f6f8)
  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  host.value.appendChild(renderer.domElement)

  const sun = new THREE.DirectionalLight(0xffffff, 1.9)
  sun.position.set(5, 9, 6)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 })
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(new THREE.AmbientLight(0xfff6e5, 1.5), sun, roomGroup, flowGroup, outline)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI / 2.05
  controls.minDistance = 2
  controls.maxDistance = 22

  const el = renderer.domElement
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKey)

  buildRoom()
  frameCamera()
  syncItems(props.appliances)

  const loop = () => {
    frame = requestAnimationFrame(loop)
    controls.update()
    fadeNearWalls()
    if (dirty) { dirty = false; paintOverlays(); updateAirflow(); publishAnalysis() }
    if (selected) outline.setFromObject(selected.model)
    renderer.render(scene, camera)
  }
  loop()

  observer = new ResizeObserver(() => {
    const w = host.value.clientWidth, h = host.value.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  observer.observe(host.value)
}

watch(() => props.appliances, syncItems, { deep: true })
watch(() => props.room, refitItems, { deep: true })
watch(() => props.overlays, markDirty, { deep: true })
watch(() => props.tariff, () => { markDirty(); scheduleRecs() })

function applyRec(idx) {
  const r = recs[idx], item = r && items.get(r.id)
  if (!item) return
  apply(item, r.to)
  select(item)
  scheduleRecs()
}
defineExpose({ applyRec })
onMounted(init)

onBeforeUnmount(() => {
  clearTimeout(recsTimer)
  cancelAnimationFrame(frame)
  observer?.disconnect()
  controls?.dispose()
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKey)
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<style scoped>
.hint { background: rgba(15, 23, 42, 0.75); color: #fff; pointer-events: none; }
.hint.empty { background: rgba(255, 255, 255, 0.85); color: #6b7280; }
</style>
