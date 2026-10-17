<template>
  <div class="floorplan w-100 h-100 position-relative">
    <div ref="host" class="w-100 h-100"></div>
    <div class="hint position-absolute top-0 start-50 translate-middle-x mt-2 px-3 py-1 small rounded-pill">
      Drag to orbit · scroll to zoom · click a room to select · double-click to edit it
    </div>
  </div>
</template>

<script setup>

import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createAppliance3DModel } from '../stores/applianceModels.js'
import { wallPieces, wallPoint, NORMAL, WALL_THICKNESS } from '../stores/placement.js'

const props = defineProps({
  rooms: { type: Array, default: () => [] },
  footprint: { type: Object, default: null },
  selectedId: { type: String, default: null },
})
const emit = defineEmits(['select-room', 'open-room'])

const FLOOR = { living: 0xf3e9d2, kitchen: 0xdcebf5, bedroom: 0xf0e2ee, bathroom: 0xd8efe4 }
const host = ref(null)

let scene, camera, renderer, controls, frame, observer
const world = new THREE.Group()
const floors = new Map()
const wallMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true }))
const ray = new THREE.Raycaster()
let hoverId = null
let downAt = null

function label(text, sub) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(15,23,42,0.75)'
  g.beginPath(); g.roundRect(4, 4, 248, 88, 14); g.fill()
  g.fillStyle = '#fff'; g.textAlign = 'center'
  g.font = 'bold 30px sans-serif'; g.fillText(text, 128, 44)
  g.font = '22px sans-serif'; g.fillStyle = '#cbd5e1'; g.fillText(sub, 128, 74)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
  sprite.scale.set(1.6, 0.6, 1)
  sprite.renderOrder = 10
  return sprite
}

function buildRoom(r) {
  const { w, d, h } = r.dimension
  const group = new THREE.Group()
  group.position.set(r.origin.x, 0, r.origin.z)

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.05, d),
    new THREE.MeshStandardMaterial({ color: FLOOR[r.type] ?? 0xeeeeee, roughness: 0.85 }),
  )
  floor.position.set(w / 2, -0.025, d / 2)
  floor.receiveShadow = true
  floor.userData.roomId = String(r._id)
  floor.userData.base = FLOOR[r.type] ?? 0xeeeeee
  group.add(floor)
  floors.set(String(r._id), floor)

  const items = []
  for (const p of r.placements || []) {
    const model = createAppliance3DModel(p.applianceTypeKey, p.category)
    const spec = model.userData.spec
    model.position.set(p.x, spec.mode === 'ceiling' ? h - spec.h : spec.y, p.z)
    model.rotation.y = p.rotY
    group.add(model)
    items.push({ spec, wall: p.wall, t: p.t })
  }

  for (const pc of wallPieces({ w, d, h }, items)) {
    const len = pc.t1 - pc.t0, hh = pc.y1 - pc.y0
    const [px, pz] = wallPoint({ w, d }, pc.wall, (pc.t0 + pc.t1) / 2)
    const n = NORMAL[pc.wall]
    const geo = pc.wall % 2 ? new THREE.BoxGeometry(WALL_THICKNESS, hh, len) : new THREE.BoxGeometry(len, hh, WALL_THICKNESS)
    const mesh = new THREE.Mesh(geo, wallMats[pc.wall])
    mesh.position.set(px - (n[0] * WALL_THICKNESS) / 2, (pc.y0 + pc.y1) / 2, pz - (n[1] * WALL_THICKNESS) / 2)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
  }

  const tag = label(r.name, `${(w * d).toFixed(0)} m²`)
  tag.position.set(w / 2, 0.4, d / 2)
  group.add(tag)
  world.add(group)
}

function clearWorld() {
  world.traverse((o) => o.geometry?.dispose?.())
  world.clear()
  floors.clear()
}

let framed = false
function build() {
  if (!scene) return
  clearWorld()
  props.rooms.forEach(buildRoom)
  highlight()
  if (!framed && props.rooms.length) { frameCamera(); framed = true }
}

function highlight() {
  for (const [id, f] of floors) {
    const on = id === props.selectedId, hov = id === hoverId
    f.material.emissive.setHex(on ? 0x2563eb : hov ? 0x64748b : 0x000000)
    f.material.emissiveIntensity = on ? 0.35 : 0.25
  }
}

function frameCamera() {
  const W = props.footprint?.w ?? 10, D = props.footprint?.d ?? 8
  const reach = Math.max(W, D) * 1.2
  controls.target.set(W / 2, 0, D / 2)
  camera.position.set(W / 2 + reach * 0.3, reach * 0.95, D + reach * 0.75)
}

function fadeWalls() {
  const W = props.footprint?.w ?? 10, D = props.footprint?.d ?? 8
  const dx = camera.position.x - W / 2, dz = camera.position.z - D / 2
  const facing = [dz < 0, dx > 0, dz > 0, dx < 0] // outward direction of walls 0..3 is -NORMAL
  wallMats.forEach((m, i) => { m.opacity = facing[i] ? 0.1 : 1; m.depthWrite = !facing[i] })
}

function pick(e) {
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
  const hit = ray.intersectObjects([...floors.values()], false)[0]
  return hit ? hit.object.userData.roomId : null
}

const onMove = (e) => { const id = pick(e); if (id !== hoverId) { hoverId = id; highlight() } }
const onDown = (e) => { downAt = [e.clientX, e.clientY] }
const onUp = (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return
  const id = pick(e)
  if (id) emit('select-room', id)
}
const onDbl = (e) => { const id = pick(e); if (id) emit('open-room', id) }

function init() {
  const width = host.value.clientWidth || 800, height = host.value.clientHeight || 500
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4f6f8)
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  host.value.appendChild(renderer.domElement)

  const sun = new THREE.DirectionalLight(0xffffff, 1.9)
  sun.position.set(8, 16, 10)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 })
  sun.shadow.mapSize.set(2048, 2048)
  scene.add(new THREE.AmbientLight(0xfff6e5, 1.5), sun, world)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI / 2.05
  controls.minDistance = 3
  controls.maxDistance = 45

  const el = renderer.domElement
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('dblclick', onDbl)

  build()
  const loop = () => {
    frame = requestAnimationFrame(loop)
    controls.update()
    fadeWalls()
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

watch(() => props.rooms, build, { deep: true })
watch(() => props.selectedId, highlight)
onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  controls?.dispose()
  clearWorld()
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<style scoped>
.hint { background: rgba(15, 23, 42, 0.75); color: #fff; pointer-events: none; }
</style>
