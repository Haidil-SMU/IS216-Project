<template>
  <div class="floorplan w-100 h-100 position-relative">
    <div ref="host" class="w-100 h-100"></div>
    <div class="view-controls" role="group" aria-label="Camera view">
      <button type="button" class="vbtn" title="Isometric view" @click="setView('iso')">3D</button>
      <button type="button" class="vbtn" title="Top-down floor plan" @click="setView('top')">Plan</button>
      <button type="button" class="vbtn" title="Front elevation" @click="setView('front')">Front</button>
    </div>
    <div v-if="!readonly" class="hint position-absolute top-0 start-50 translate-middle-x mt-2 px-3 py-1 rounded-pill text-center">
      <template v-if="selectedItemId">Drag to move it (doors and windows slide along their wall) · R rotates floor items · Delete removes appliances</template>
      <template v-else-if="selectedId">Drag an item to move it · drag the room's edges or corners to resize · drag the room floor to move the room</template>
      <template v-else>Right-drag to orbit · left-drag to pan · scroll to zoom · click a room to select it, then drag items or edges</template>
    </div>
  </div>
</template>

<script setup>
import { watch, ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createAppliance3DModel, resolveSpec } from '../stores/applianceModels.js'
import { wallPieces, wallPoint, wallLength, placeAt, onWall, counterPose, isBlocked, sharedRange, sameSpotOn, refitPlacements, itemsOfRoom, doorBlockedBeyond, roomBehindOpening, needsOutsideWall, outsideOnlyMessage, nearestWall, NORMAL, WALL_THICKNESS } from '../stores/placement.js'
import { sunAt, heatAt, throwOf, airDirection } from '../stores/energy.js'

const props = defineProps({
  rooms: { type: Array, default: () => [] },
  footprint: { type: Object, default: null },
  selectedId: { type: String, default: null },
  selectedItemId: { type: String, default: null },
  readonly: { type: Boolean, default: false },
  overlays: { type: Object, default: () => ({ sun: false, heat: true, air: true }) },
})
const emit = defineEmits(['select-room', 'select-item', 'edit-rect', 'move-items', 'move-opening', 'drag-preview', 'rotate-blocked', 'door-blocked'])

const ACCENT = { living: '#f59e0b', kitchen: '#0ea5e9', bedroom: '#8b5cf6', bathroom: '#10b981' }
const FLOOR_TILE = { living: 0.6, bedroom: 0.6, kitchen: 1.2, bathroom: 1.2 }
const ARCH_H = 2.1
const MIN = { living: 3.0, kitchen: 1.8, bedroom: 2.4, bathroom: 1.2 }
const MAX = 15
const AREA = { min: -20, max: 40 }
const MAGNET = 0.25
const host = ref(null)

let scene, camera, renderer, controls, frame, observer
const world = new THREE.Group()
const handles = new THREE.Group()
const grid = new THREE.GridHelper(60, 60, 0x94a3b8, 0xd5dbe3)
grid.position.set(10, 0.002, 10)
grid.visible = false
const groups = new Map()
const itemModels = new Map()
const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x0ea5e9)
outline.visible = false
const floors = new Map()
const tags = new Map()
let wallMeshes = []
let live = null

const wallMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xf8f4ec, roughness: 0.92, transparent: true }))
const capMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.8, transparent: true }))
const base = new THREE.Group()
let envTexture = null, tween = null
const floorTextures = new Map()
const ray = new THREE.Raycaster()
let hoverId = null
let downAt = null

const snap = (v) => Math.round(v * 10) / 10
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function label(text, sub, type) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 176
  const g = c.getContext('2d')
  g.shadowColor = 'rgba(15,40,28,0.28)'; g.shadowBlur = 18; g.shadowOffsetY = 6
  g.fillStyle = 'rgba(255,255,255,0.94)'
  g.beginPath(); g.roundRect(16, 12, 480, 128, 30); g.fill()
  g.shadowColor = 'transparent'
  g.fillStyle = ACCENT[type] ?? '#168b59'
  g.beginPath(); g.roundRect(16, 12, 16, 128, [30, 0, 0, 30]); g.fill()
  g.fillStyle = '#19352a'; g.textAlign = 'center'
  g.font = '700 54px "Segoe UI", system-ui, sans-serif'
  g.fillText(text, 264, 70, 430)
  g.font = '500 33px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#5d6f65'
  g.fillText(sub, 264, 116, 430)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, toneMapped: false }))
  sprite.scale.set(1.9, 0.653, 1)
  sprite.renderOrder = 10
  return sprite
}

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const shade = ([r, g, b], k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`

const TILE_STYLE = {
  living:   { n: 1, base: [226, 228, 229], grout: '#b4babe' },
  bedroom:  { n: 1, base: [222, 225, 227], grout: '#b4babe' },
  kitchen:  { n: 4, base: [190, 196, 200], grout: '#8f979c' },
  bathroom: { n: 4, base: [214, 222, 226], grout: '#9aa7ad' },
}

function paintFloor(type) {
  const S = 512, c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d'), rand = rng(type.length * 977 + type.charCodeAt(0))
  const { n, base, grout } = TILE_STYLE[type] ?? TILE_STYLE.living
  const tile = S / n, line = 3
  g.fillStyle = grout; g.fillRect(0, 0, S, S)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = shade(base, 0.97 + rand() * 0.06)
    g.fillRect(i * tile + line / 2, j * tile + line / 2, tile - line, tile - line)
    const sheen = g.createLinearGradient(i * tile, j * tile, (i + 1) * tile, (j + 1) * tile)
    sheen.addColorStop(0, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.7, 'rgba(255,255,255,0)')
    g.fillStyle = sheen; g.fillRect(i * tile + line / 2, j * tile + line / 2, tile - line, tile - line)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function floorMaterial(type) {
  if (!floorTextures.has(type)) floorTextures.set(type, paintFloor(type))
  const map = floorTextures.get(type).clone()
  map.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: type === 'kitchen' || type === 'bathroom' ? 0.55 : 0.4, metalness: 0 })
}

function fitFloor(floor, type, w, d) {
  const m = FLOOR_TILE[type] ?? 2
  floor.material.map?.repeat.set(w / m, d / m)
}

function skyTexture() {
  const c = document.createElement('canvas')
  c.width = 4; c.height = 512
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, '#cfe7dc'); grad.addColorStop(0.5, '#e4f0e9'); grad.addColorStop(1, '#eef4f0')
  g.fillStyle = grad; g.fillRect(0, 0, 4, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildBase() {
  disposeGroup(base)
  const fp = props.footprint ?? { x: 0, z: 0, w: 10, d: 8 }
  const pad = 1.0
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(fp.w + pad * 2, 0.24, fp.d + pad * 2),
    new THREE.MeshStandardMaterial({ color: 0xf3f6f3, roughness: 0.9 }),
  )
  slab.position.set(fp.x + fp.w / 2, -0.055 - 0.12, fp.z + fp.d / 2)
  slab.receiveShadow = slab.castShadow = true
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0xe6efe9, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(fp.x + fp.w / 2, -0.3, fp.z + fp.d / 2)
  ground.receiveShadow = true
  base.add(ground, slab)
}

function buildWalls(r, moved = {}) {
  const id = String(r._id), group = groups.get(id), { w, d, h } = r.dimension
  if (!group) return

  wallMeshes = wallMeshes.filter((mesh) => {
    if (mesh.userData.wall.roomId !== id) return true
    group.remove(mesh)
    mesh.geometry.dispose()
    return false
  })

  const items = []
  for (const p of r.placements || []) {
    const at = moved[String(p._id)] ?? p
    items.push({ spec: resolveSpec(p.applianceTypeKey, p.category), wall: at.wall, t: at.t })
  }
  for (const o of r.openWalls || [])
    items.push({ spec: { mode: 'opening', w: o.t1 - o.t0, y: 0, h: ARCH_H }, wall: o.wall, t: (o.t0 + o.t1) / 2 })

  const trimStart = [0, 1, 2, 3].map((i) => {
    const n = NORMAL[i], [px, pz] = wallPoint({ w, d }, i, -WALL_THICKNESS / 2)
    const gx = r.origin.x + px - (n[0] * WALL_THICKNESS) / 2, gz = r.origin.z + pz - (n[1] * WALL_THICKNESS) / 2
    return liveRooms().some((o) => String(o._id) !== id &&
      gx > o.origin.x + 0.001 && gx < o.origin.x + o.dimension.w - 0.001 &&
      gz > o.origin.z + 0.001 && gz < o.origin.z + o.dimension.d - 0.001)
  })

  for (const pc of wallPieces({ w, d, h }, items, trimStart)) {
    const len = pc.t1 - pc.t0, hh = pc.y1 - pc.y0
    const [px, pz] = wallPoint({ w, d }, pc.wall, (pc.t0 + pc.t1) / 2)
    const n = NORMAL[pc.wall]
    const geo = pc.wall % 2 ? new THREE.BoxGeometry(WALL_THICKNESS, hh, len) : new THREE.BoxGeometry(len, hh, WALL_THICKNESS)
    const wm = wallMats[pc.wall]
    const mesh = new THREE.Mesh(geo, [wm, wm, capMats[pc.wall], wm, wm, wm])
    mesh.position.set(px - (n[0] * WALL_THICKNESS) / 2, (pc.y0 + pc.y1) / 2, pz - (n[1] * WALL_THICKNESS) / 2)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.userData.wall = { roomId: id, wall: pc.wall }
    wallMeshes.push(mesh)
    group.add(mesh)
  }
}

function buildRoom(r) {
  const { w, d, h } = r.dimension
  const id = String(r._id)
  const group = new THREE.Group()
  group.position.set(r.origin.x, 0, r.origin.z)
  group.userData = { roomId: id }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), floorMaterial(r.type))
  fitFloor(floor, r.type, w, d)
  floor.position.set(w / 2, -0.025, d / 2)
  floor.receiveShadow = true
  floor.userData.roomId = id
  group.add(floor)
  floors.set(id, floor)
  groups.set(id, group)

  for (const p of r.placements || []) {
    const model = createAppliance3DModel(p.applianceTypeKey, p.category)
    const spec = model.userData.spec
    model.position.set(p.x, spec.mode === 'ceiling' ? h - spec.h : spec.y, p.z)
    model.rotation.y = p.rotY
    group.add(model)
    itemModels.set(String(p._id), { model, roomId: id })
  }

  buildWalls(r)
  addOverlays(id, group, w, d)

  setTag(id, r)
  world.add(group)
}

const tenth = (v) => Math.round(v * 10) / 10

function setTag(id, r) {
  const group = groups.get(id)
  if (!group) return
  const old = tags.get(id)
  if (old) { group.remove(old); old.material.map.dispose(); old.material.dispose() }
  const { w, d } = r.dimension
  const tag = label(r.name, `${tenth(w)} × ${tenth(d)} m · ${tenth(w * d)} m²`, r.type)
  tag.position.set(w / 2, 0.4, d / 2)
  group.add(tag)
  tags.set(id, tag)
}

const HEATMAP_SIZE = 64
const overlayParts = new Map()
let overlayDirtyRoom = null

function makeHeatmap(color, height, w, d) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = HEATMAP_SIZE
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(w / 2, height, d / 2)
  mesh.renderOrder = 2
  return { mesh, canvas, texture, color: new THREE.Color(color) }
}

function addOverlays(roomId, group, w, d) {
  const parts = { sun: makeHeatmap(0xffc929, 0.02, w, d), heat: makeHeatmap(0xe8420f, 0.03, w, d), arrows: new THREE.Group() }
  group.add(parts.sun.mesh, parts.heat.mesh, parts.arrows)
  overlayParts.set(roomId, parts)
}

function disposeOverlays() {
  for (const parts of overlayParts.values()) {
    for (const map of [parts.sun, parts.heat]) { map.texture.dispose(); map.mesh.material.dispose() }
    parts.arrows.children.forEach((arrow) => arrow.dispose())
  }
  overlayParts.clear()
}

function paintHeatmap(map, valueAt, room) {
  const ctx = map.canvas.getContext('2d'), image = ctx.createImageData(HEATMAP_SIZE, HEATMAP_SIZE)
  const { r, g, b } = map.color
  for (let row = 0; row < HEATMAP_SIZE; row++)
    for (let col = 0; col < HEATMAP_SIZE; col++) {
      const point = [((col + 0.5) / HEATMAP_SIZE) * room.w, ((row + 0.5) / HEATMAP_SIZE) * room.d]
      image.data.set([r * 255, g * 255, b * 255, valueAt(point) * 150], (row * HEATMAP_SIZE + col) * 4)
    }
  ctx.putImageData(image, 0, 0)
  map.texture.needsUpdate = true
}

const AIR_COLOR = { ac: 0x22b8cf, fan: 0x38bdf8, exhaust: 0xf59e0b }

function addArrow(parts, direction, from, length, color) {
  if (length < 0.1) return
  parts.arrows.add(new THREE.ArrowHelper(direction.normalize(), from, length, color, Math.min(0.18, length * 0.4), 0.1))
}

function fanOut(parts, item, from, reach, tilt, spreads, color) {
  const [fx, fz] = airDirection(item)
  for (const spread of spreads) {
    const cos = Math.cos(spread), sin = Math.sin(spread)
    const direction = new THREE.Vector3(fx * cos - fz * sin, tilt, fx * sin + fz * cos)
    addArrow(parts, direction, from, reach * (1 - Math.abs(spread) * 0.3), color)
  }
}

function drawAirflow(parts, room, items) {
  parts.arrows.children.forEach((arrow) => arrow.dispose())
  parts.arrows.clear()
  for (const item of items) {
    const { kind, y, h } = item.spec
    if (kind === 'ac') {
      const reach = Math.min(throwOf(room, items, item), 3.5)
      fanOut(parts, item, new THREE.Vector3(item.x, y + h / 2, item.z), reach, -0.25, [-0.5, -0.25, 0, 0.25, 0.5], AIR_COLOR.ac)
    } else if (kind === 'standfan') {
      const reach = Math.min(throwOf(room, items, item), 2.8)
      const [fx, fz] = airDirection(item)
      const head = new THREE.Vector3(item.x + fx * 0.2, h * 0.72, item.z + fz * 0.2)
      fanOut(parts, item, head, reach, -0.05, [-0.35, -0.17, 0, 0.17, 0.35], AIR_COLOR.fan)
    } else if (kind === 'ceilingfan') {
      const top = room.h - h - 0.02
      const nearestWall = Math.min(item.x, room.w - item.x, item.z, room.d - item.z)
      const length = Math.max(0.5, Math.min(top - 0.3, 1.7))
      const spread = Math.min(0.5, Math.max(0.15, nearestWall - 0.45))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const from = new THREE.Vector3(item.x + Math.cos(a) * 0.45, top, item.z + Math.sin(a) * 0.45)
        addArrow(parts, new THREE.Vector3(Math.cos(a) * spread, -1, Math.sin(a) * spread), from, length, AIR_COLOR.fan)
      }
    } else if (kind === 'exhaust') {
      for (const [dx, dz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        const from = new THREE.Vector3(item.x + dx, room.h - 0.75, item.z + dz)
        addArrow(parts, new THREE.Vector3(-dx * 0.8, 0.75, -dz * 0.8), from, 0.7, AIR_COLOR.exhaust)
      }
    }
  }
}

function refreshOverlays(roomId) {
  const r = roomById(roomId), parts = overlayParts.get(roomId)
  if (!r || !parts) return
  const items = idrag && idrag.roomId === roomId ? idrag.all : itemsOf(r)
  parts.sun.mesh.visible = !!props.overlays.sun
  parts.heat.mesh.visible = !!props.overlays.heat
  parts.arrows.visible = !!props.overlays.air
  if (props.overlays.sun) paintHeatmap(parts.sun, (p) => sunAt(r.dimension, items, p), r.dimension)
  if (props.overlays.heat) paintHeatmap(parts.heat, (p) => heatAt(r.dimension, items, p), r.dimension)
  if (props.overlays.air) drawAirflow(parts, r.dimension, items)
}

function clearWorld() {
  disposeOverlays()
  for (const f of floors.values()) { f.material.map?.dispose(); f.material.dispose() }
  world.traverse((o) => o.geometry?.dispose?.())
  world.clear()
  floors.clear(); groups.clear(); itemModels.clear(); tags.clear()
  wallMeshes = []
}

let framed = false
function build() {
  if (!scene) return
  live = null
  clearWorld()
  buildBase()
  props.rooms.forEach(buildRoom)
  props.rooms.forEach((r) => refreshOverlays(String(r._id)))
  highlight()
  drawHandles()
  if (!framed && props.rooms.length) { frameCamera(); framed = true }
}

function setTint(id, hex, strength = 0.35) {
  const f = floors.get(id)
  if (!f) return
  f.material.emissive.setHex(hex)
  f.material.emissiveIntensity = hex ? strength : 0
}

function highlight() {
  for (const id of floors.keys()) {
    const on = id === props.selectedId, hov = id === hoverId
    setTint(id, on ? 0x16a34a : hov ? 0x64748b : 0x000000, on ? 0.3 : 0.2)
  }
}

function viewPose(kind) {
  const fp = props.footprint ?? { x: 0, z: 0, w: 10, d: 8 }
  const cx = fp.x + fp.w / 2, cz = fp.z + fp.d / 2, reach = Math.max(fp.w, fp.d) * 1.2
  const target = new THREE.Vector3(cx, 0, cz)
  if (kind === 'top') return { target, pos: new THREE.Vector3(cx, reach * 1.9, cz + 0.001) }
  if (kind === 'front') return { target, pos: new THREE.Vector3(cx, reach * 0.42, fp.z + fp.d + reach * 1.25) }
  return { target, pos: new THREE.Vector3(cx + reach * 0.3, reach * 0.95, fp.z + fp.d + reach * 0.75) }
}

function frameCamera() {
  const { target, pos } = viewPose('iso')
  controls.target.copy(target)
  camera.position.copy(pos)
}

function setView(kind) {
  const { target, pos } = viewPose(kind)
  tween = { t: 0, fromPos: camera.position.clone(), toPos: pos, fromTarget: controls.target.clone(), toTarget: target }
}

function stepTween() {
  if (!tween) return
  tween.t = Math.min(1, tween.t + 0.05)
  const k = 1 - Math.pow(1 - tween.t, 3)
  camera.position.lerpVectors(tween.fromPos, tween.toPos, k)
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k)
  if (tween.t >= 1) tween = null
}

function fadeWalls() {
  if (controls.getPolarAngle() < 0.3) { wallMats.forEach((m, i) => { m.opacity = capMats[i].opacity = 1; m.depthWrite = capMats[i].depthWrite = true }); return }
  const fp = props.footprint ?? { x: 0, z: 0, w: 10, d: 8 }
  const dx = camera.position.x - (fp.x + fp.w / 2), dz = camera.position.z - (fp.z + fp.d / 2)
  const facing = [dz < 0, dx > 0, dz > 0, dx < 0]
  wallMats.forEach((m, i) => {
    m.opacity = capMats[i].opacity = facing[i] ? 0.1 : 1
    m.depthWrite = capMats[i].depthWrite = !facing[i]
  })
}

function aim(e) {
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
}
function pickRoom(e, exceptId = null) {
  aim(e)
  const hit = ray.intersectObjects([...floors.values()], false).find((h) => h.object.userData.roomId !== exceptId)
  return hit ? hit.object.userData.roomId : null
}
const liftedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
function groundPoint(e, y = 0) {
  aim(e)
  const p = new THREE.Vector3()
  liftedPlane.constant = -y
  return ray.ray.intersectPlane(liftedPlane, p) ? p : null
}

const liveRooms = () => (live ? props.rooms.map((r) => (String(r._id) === live.id ? live.room : r)) : props.rooms)
const roomById = (id) => liveRooms().find((r) => String(r._id) === id)

function disposeGroup(g) { g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() }); g.clear() }

const HANDLE_BLUE = 0x168b59, HANDLE_HOT = 0xf59e0b
let hoverHandle = null

function makeGrip(geometry, rimScale) {
  const grip = new THREE.Group()
  const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, toneMapped: false }))
  const rim = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: HANDLE_BLUE, side: THREE.BackSide, depthTest: false, toneMapped: false }))
  rim.scale.setScalar(rimScale)
  body.renderOrder = 7; rim.renderOrder = 6
  grip.add(rim, body)
  grip.userData.body = body
  return grip
}

function drawHandles() {
  disposeGroup(handles)
  const r = roomById(props.selectedId)
  if (!r) return
  const { x, z } = r.origin, { w, d } = r.dimension

  const line = 0.05
  for (const [cx, cz, lw, ld] of [[w / 2, 0, w, line], [w / 2, d, w, line], [0, d / 2, line, d], [w, d / 2, line, d]]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(lw + (lw > line ? line : 0), 0.01, ld + (ld > line ? line : 0)),
      new THREE.MeshBasicMaterial({ color: HANDLE_BLUE, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
    )
    edge.position.set(x + cx, 0.02, z + cz)
    edge.renderOrder = 5
    handles.add(edge)
  }

  for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const corner = sx && sz
    let grip
    if (corner) {
      grip = makeGrip(new THREE.SphereGeometry(0.15, 20, 14), 1.28)
      grip.position.set(x + w / 2 + (sx * w) / 2, 0.15, z + d / 2 + (sz * d) / 2)
    } else {
      const side = sx ? d : w
      const length = Math.max(0.2, Math.min(0.9, side * 0.35))
      grip = makeGrip(new THREE.CapsuleGeometry(0.07, length, 6, 16), 1.3)
      if (sx) grip.rotation.x = Math.PI / 2
      else grip.rotation.z = Math.PI / 2
      grip.position.set(x + w / 2 + (sx * w) / 2, 0.08, z + d / 2 + (sz * d) / 2)
    }
    grip.userData.handle = { sx, sz }
    handles.add(grip)
  }
}

const RESIZE_CURSOR = (h) => (!h.sx ? 'ns-resize' : !h.sz ? 'ew-resize' : h.sx === h.sz ? 'nwse-resize' : 'nesw-resize')

function animateHandles() {
  if (!handles.children.length) return
  const k = Math.max(0.7, Math.min(2.2, camera.position.distanceTo(controls.target) / 14))
  for (const g of handles.children) {
    const h = g.userData.handle
    if (!h) continue
    const hot = !!hoverHandle && h.sx === hoverHandle.sx && h.sz === hoverHandle.sz
    g.scale.setScalar(k * (hot ? 1.25 : 1))
    g.userData.body.material.color.setHex(hot ? HANDLE_HOT : 0xffffff)
  }
}

function edgesOf(axis, exceptId) {
  const out = []
  for (const o of props.rooms) {
    if (String(o._id) === exceptId) continue
    const a = axis === 'x' ? o.origin.x : o.origin.z, len = axis === 'x' ? o.dimension.w : o.dimension.d
    out.push(a, a + len)
  }
  return out
}

function snapCoord(v, axis, exceptId) {
  let best = null
  for (const e of edgesOf(axis, exceptId)) if (Math.abs(e - v) <= MAGNET && (best === null || Math.abs(e - v) < Math.abs(best - v))) best = e
  return best ?? snap(v)
}

function snapShift(a0, a1, axis, exceptId) {
  let best = null
  for (const e of edgesOf(axis, exceptId)) for (const mine of [a0, a1]) {
    const dlt = e - mine
    if (Math.abs(dlt) <= MAGNET && (best === null || Math.abs(dlt) < Math.abs(best))) best = dlt
  }
  return best ?? snap(a0) - a0
}

function rectOk(rect, type, exceptId) {
  const EPS = 0.02
  if (rect.w < (MIN[type] ?? 1.2) - EPS || rect.d < (MIN[type] ?? 1.2) - EPS) return false
  if (rect.w > MAX + EPS || rect.d > MAX + EPS) return false
  if (rect.x < AREA.min || rect.z < AREA.min || rect.x + rect.w > AREA.max || rect.z + rect.d > AREA.max) return false
  return !props.rooms.some((o) => String(o._id) !== exceptId &&
    Math.min(rect.x + rect.w, o.origin.x + o.dimension.w) - Math.max(rect.x, o.origin.x) > EPS &&
    Math.min(rect.z + rect.d, o.origin.z + o.dimension.d) - Math.max(rect.z, o.origin.z) > EPS)
}

function dragRect(bd, p) {
  const dx = p.x - bd.start.x, dz = p.z - bd.start.z
  const o = bd.rect0
  if (bd.kind === 'move')
    return { x: snap(o.x + dx + snapShift(o.x + dx, o.x + dx + o.w, 'x', bd.id)), z: snap(o.z + dz + snapShift(o.z + dz, o.z + dz + o.d, 'z', bd.id)), w: o.w, d: o.d }
  let { x, z, w, d } = o
  const lo = MIN[bd.type] ?? 1.2
  if (bd.sx === 1) w = clamp(snapCoord(o.x + o.w + dx, 'x', bd.id) - o.x, lo, MAX)
  if (bd.sx === -1) { w = clamp(o.x + o.w - snapCoord(o.x + dx, 'x', bd.id), lo, MAX); x = o.x + o.w - w }
  if (bd.sz === 1) d = clamp(snapCoord(o.z + o.d + dz, 'z', bd.id) - o.z, lo, MAX)
  if (bd.sz === -1) { d = clamp(o.z + o.d - snapCoord(o.z + dz, 'z', bd.id), lo, MAX); z = o.z + o.d - d }
  return { x: snap(x), z: snap(z), w: snap(w), d: snap(d) }
}

const sameRect = (a, b) => a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d

function allowedRect(want) {
  const last = bd.rect
  const tries = [want, { x: want.x, w: want.w, z: last.z, d: last.d }, { x: last.x, w: last.w, z: want.z, d: want.d }]
  return tries.find((r) => rectOk(r, bd.type, bd.id)) ?? last
}

function showRect(id, rect) {
  const base = props.rooms.find((r) => String(r._id) === id), group = groups.get(id), floor = floors.get(id)
  if (!base || !group || !floor) return
  const resized = rect.w !== base.dimension.w || rect.d !== base.dimension.d
  const room = { ...base, origin: { x: rect.x, z: rect.z }, dimension: { ...base.dimension, w: rect.w, d: rect.d } }
  room.placements = refitPlacements(base, room, !resized)
  live = { id, room }

  group.position.set(rect.x, 0, rect.z)
  floor.geometry.dispose()
  floor.geometry = new THREE.BoxGeometry(rect.w, 0.05, rect.d)
  floor.position.set(rect.w / 2, -0.025, rect.d / 2)
  fitFloor(floor, room.type, rect.w, rect.d)
  for (const p of room.placements) {
    const model = itemModels.get(String(p._id))?.model
    if (model) model.position.set(p.x, modelY(model.userData.spec, room.dimension.h), p.z)
  }
  for (const r of liveRooms()) buildWalls(r)
  setTag(id, room)
  const parts = overlayParts.get(id)
  if (parts) parts.sun.mesh.visible = parts.heat.mesh.visible = parts.arrows.visible = false
  drawHandles()
}

function pickHandle(e) {
  aim(e)
  for (const hit of ray.intersectObjects(handles.children, true)) {
    let o = hit.object
    while (o && !o.userData.handle) o = o.parent
    if (o) return o.userData.handle
  }
  return null
}

const modelY = (spec, h) => (spec.mode === 'ceiling' ? h - spec.h : spec.y)

const itemsOf = itemsOfRoom
function pickItem(e) {
  aim(e)
  const entries = [...itemModels.entries()]
  const hits = ray.intersectObjects(entries.map(([, v]) => v.model), true)
  if (!hits.length) return null
  const ownerOf = (hit) => {
    let obj = hit.object
    while (obj.parent && !entries.some(([, v]) => v.model === obj)) obj = obj.parent
    const found = entries.find(([, v]) => v.model === obj)
    return found ? { id: found[0], roomId: found[1].roomId } : null
  }
  const first = hits[0]
  const mine = props.selectedId && hits.find((h) => h.distance - first.distance < 0.35 && ownerOf(h)?.roomId === props.selectedId)
  return ownerOf(mine || first)
}
const poseModel = (it, h) => {
  const m = itemModels.get(it.id)?.model
  if (!m) return
  m.position.set(it.x, modelY(it.spec, h), it.z)
  m.rotation.y = it.rotY
}
const poseOf = (it) => ({ x: it.x, z: it.z, rotY: it.rotY, wall: it.wall, t: it.t, cu: it.cu ?? 0 })

let bd = null
let idrag = null

function onMove(e) {
  if (idrag) return dragItem(e)
  if (bd) {
    const p = groundPoint(e)
    if (!p) return
    bd.moved = bd.moved || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4
    if (!bd.moved) return
    bd.exact = dragRect(bd, p)
    const next = allowedRect(bd.exact)
    if (rectOk(bd.exact, bd.type, bd.id)) highlight()
    else setTint(bd.id, 0xdc2626, 0.5)
    if (!sameRect(next, bd.rect)) { bd.rect = next; showRect(bd.id, next) }
    return
  }
  const id = pickRoom(e), item = pickItem(e), grip = item ? null : pickHandle(e)
  hoverHandle = grip
  renderer.domElement.style.cursor = item ? 'grab' : grip ? RESIZE_CURSOR(grip) : id && id === props.selectedId ? 'move' : ''
  if (id !== hoverId) { hoverId = id; highlight() }
}

const SLIDE_STEP = 0.1, SLIDE_REACH = 1.2

function openingPos(r, d, local, others) {
  const room = r.dimension, spec = d.item.spec
  const wall = nearestWall(room, local).i
  const along = [local[0], local[1], room.w - local[0], room.d - local[1]][wall]
  const end = Math.max(0.6, spec.w / 2 + 0.15)
  let lo = end, hi = wallLength(room, wall) - end
  const linked = !!d.shared && wall === d.wall0
  if (linked) {
    const margin = spec.w / 2 + 0.1
    lo = d.shared.t0 + margin; hi = d.shared.t1 - margin
    if (hi < lo) return { pos: null, why: 'The wall these rooms share is too short for this door to slide.' }
  }
  const want = clamp(snap(along), lo, hi)
  const ts = []
  for (let t = lo; t <= hi + 1e-9; t += SLIDE_STEP) ts.push(Math.round(t * 10) / 10)
  ts.push(want)
  ts.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))

  let blocker = null
  for (const t of ts) {
    if (Math.abs(t - want) > SLIDE_REACH) break
    const pos = onWall(room, spec, wall, t)
    if (!pos || isBlocked({ spec, ...pos }, others)) continue
    if (others.some((o) => o.spec.mode === 'opening' && o.wall === wall && Math.abs(o.t - t) < (o.spec.w + spec.w) / 2 + 0.1)) continue
    if (needsOutsideWall(spec)) {
      const facing = roomBehindOpening(liveRooms(), r, spec, pos)
      if (facing) { blocker ||= { name: facing.name, outsideOnly: true }; continue }
    } else if (spec.kind === 'door') {
      const behind = doorBlockedBeyond(liveRooms(), r, spec, pos, { ignoreId: d.partner ? d.partner.placement._id : null, cache: d.beyond })
      if (behind) { blocker ||= behind; continue }
    }
    return { pos }
  }
  return { pos: null, why: !blocker ? 'There is no clear space for it there.' : blocker.outsideOnly ? outsideOnlyMessage(spec, blocker.name) : blocker.straddle ? 'A door needs a clear stretch of wall, and that part sits between two rooms.' : `Something in the ${blocker.name} is in the way of a door there.`, key: `${wall}:${blocker?.name ?? ''}` }
}

function poseDoorPartner(d) {
  const { room, placement, spec } = d.partner
  const pos = onWall(room.dimension, spec, placement.wall, sameSpotOn(roomById(d.roomId), d.item.wall, d.item.t, room, placement.wall))
  const model = itemModels.get(String(placement._id))?.model
  if (pos && model) { model.position.set(pos.x, spec.y, pos.z); model.rotation.y = pos.rotY }
  return pos
}

function rebuildDragWalls(d) {
  buildWalls(roomById(d.roomId), { [d.item.id]: d.item })
  if (d.partner) buildWalls(d.partner.room, { [String(d.partner.placement._id)]: d.partnerPos })
}

function linkedDoorInfo(r, item) {
  if (item.spec.kind !== 'door' || !item.connectsTo || item.connectsTo === 'outside') return {}
  const other = props.rooms.find((o) => o.name === item.connectsTo)
  const shared = other && sharedRange(r, other, item.wall)
  const placement = other && (other.placements || []).find((q) => q.connectsTo === r.name && q.wall === (item.wall + 2) % 4)
  return { shared, partner: placement && { room: other, placement, spec: item.spec } }
}

function dragItem(e) {
  const d = idrag, r = roomById(d.roomId)
  if (!r) return
  const p = groundPoint(e, d.planeY)
  if (!p) return
  d.moved = d.moved || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4
  if (!d.moved) return
  const room = r.dimension, others = d.all.filter((o) => o !== d.item)
  const local = [p.x - r.origin.x + d.dx, p.z - r.origin.z + d.dz]
  let pos
  if (d.item.spec.mode === 'opening') {
    const found = openingPos(r, d, local, others)
    pos = found.pos
    if (!pos) {
      if (d.warnedFor !== found.key) { d.warnedFor = found.key; emit('door-blocked', found.why) }
      return
    }
    d.warnedFor = null
  } else {
    pos = placeAt(room, d.item.spec, local, d.item, others)
    if (!pos || isBlocked({ spec: d.item.spec, ...pos }, others)) return
  }
  Object.assign(d.item, pos)
  poseModel(d.item, room.h)
  if (d.partner) {
    const stays = d.item.wall === d.wall0
    const partnerModel = itemModels.get(String(d.partner.placement._id))?.model
    if (partnerModel) partnerModel.visible = stays
    d.partnerPos = stays ? poseDoorPartner(d) : { wall: -1, t: 0 }
  }
  if (d.item.spec.mode === 'opening') rebuildDragWalls(d)
  overlayDirtyRoom = d.roomId
  if (d.item.spec.kind === 'counter')
    for (const o of d.all) if (o.on === d.item.id) { Object.assign(o, counterPose(d.item, o.spec, o.cu)); poseModel(o, room.h) }
}

function onDown(e) {
  downAt = [e.clientX, e.clientY]
  if (e.button !== 0) return
  const el = renderer.domElement

  const hit = pickItem(e)
  if (hit) {
    const r = roomById(hit.roomId), all = itemsOf(r), item = all.find((i) => i.id === hit.id)
    const entry = itemModels.get(hit.id), planeY = entry.model.position.y + item.spec.h / 2
    const start = groundPoint(e, planeY)
    if (hit.roomId !== props.selectedId) emit('select-room', hit.roomId)
    emit('select-item', hit.id)
    entry.model.visible = true
    if (!start || !item) return
    idrag = { beyond: new Map(), roomId: hit.roomId, item, all, planeY, wall0: item.wall, dx: item.x - (start.x - r.origin.x), dz: item.z - (start.z - r.origin.z), moved: false, ...linkedDoorInfo(r, item) }
    controls.enabled = false
    el.setPointerCapture?.(e.pointerId)
    el.style.cursor = 'grabbing'
    return
  }

  const h = pickHandle(e), start = groundPoint(e)
  const id = h ? props.selectedId : pickRoom(e)
  if (!id || (!h && id !== props.selectedId)) return
  const r = roomById(id)
  if (!start || !r) return
  hoverHandle = h
  const rect0 = { x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d }
  bd = { kind: h ? 'handle' : 'move', id, type: r.type, sx: h?.sx ?? 0, sz: h?.sz ?? 0, start, moved: false, exact: rect0, rect: { ...rect0 }, rect0 }
  controls.enabled = false
  el.setPointerCapture?.(e.pointerId)
}

function onUp(e) {
  if (idrag) {
    const d = idrag
    idrag = null
    controls.enabled = true
    renderer.domElement.style.cursor = ''
    if (d.moved && d.item.spec.mode === 'opening') {
      emit('move-opening', { roomId: d.roomId, id: d.item.id, wall: d.item.wall, t: d.item.t })
      return
    }
    if (d.moved) {
      const updates = d.all.filter((o) => o === d.item || o.on === d.item.id).map((o) => ({ id: o.id, ...poseOf(o) }))
      emit('move-items', { roomId: d.roomId, updates })
    }
    return
  }
  if (bd) {
    const d = bd
    bd = null
    hoverHandle = null
    controls.enabled = true
    if (d.moved && !sameRect(d.rect, d.rect0)) { emit('edit-rect', { roomId: d.id, rect: d.rect }); return }
    if (d.moved) { build(); return }
  }
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return
  const id = pickRoom(e)
  emit('select-item', null)
  if (id) emit('select-room', id)
}

function onKey(e) {
  if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey || !props.selectedItemId) return
  const t = e.target
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
  const entry = itemModels.get(props.selectedItemId), r = entry && roomById(entry.roomId)
  if (!r) return
  const all = itemsOf(r), item = all.find((i) => i.id === props.selectedItemId)
  if (!item || item.spec.mode !== 'floor' || item.wall >= 0) return
  const others = all.filter((o) => o !== item)
  const pos = placeAt(r.dimension, item.spec, [item.x, item.z], { rotY: item.rotY + Math.PI / 2 }, others)
  if (!pos || isBlocked({ spec: item.spec, ...pos }, others)) return emit('rotate-blocked')
  emit('move-items', { roomId: entry.roomId, updates: [{ id: item.id, ...poseOf({ ...item, ...pos }) }] })
}

function init() {
  const width = host.value.clientWidth || 800, height = host.value.clientHeight || 500
  scene = new THREE.Scene()
  scene.background = skyTexture()
  scene.fog = new THREE.Fog(0xeaf2ed, 55, 130)
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0
  host.value.appendChild(renderer.domElement)

  const pmrem = new THREE.PMREMGenerator(renderer)
  envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  scene.environment = envTexture
  scene.environmentIntensity = 0.35

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1)
  sun.position.set(8, 16, 10)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 })
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.04
  sun.shadow.radius = 3
  const fill = new THREE.DirectionalLight(0xdcecff, 0.45)
  fill.position.set(-10, 9, -8)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd5e6dc, 0.55), new THREE.AmbientLight(0xfff6e5, 0.9), sun, fill, grid, base, world, handles, outline)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
  controls.maxPolarAngle = Math.PI / 2.05
  controls.minDistance = 3
  controls.maxDistance = 45

  const el = renderer.domElement
  if (!props.readonly) {
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', () => { if (!bd) hoverHandle = null })
    el.addEventListener('pointercancel', () => { bd = null; idrag = null; controls.enabled = true; emit('drag-preview', null); build() })
    window.addEventListener('keydown', onKey)
  }

  showGrid()
  build()
  const loop = () => {
    frame = requestAnimationFrame(loop)
    stepTween()
    controls.update()
    fadeWalls()
    animateHandles()
    if (overlayDirtyRoom) {
      refreshOverlays(overlayDirtyRoom)
      if (idrag) emit('drag-preview', { roomId: idrag.roomId, poses: Object.fromEntries(idrag.all.map((o) => [o.id, poseOf(o)])) })
      overlayDirtyRoom = null
    }
    for (const { model } of itemModels.values()) if (model.userData.rotor) model.userData.rotor.rotation.y += 0.04
    const sel = props.selectedItemId && itemModels.get(props.selectedItemId)
    outline.visible = !!sel
    if (sel) outline.setFromObject(sel.model)
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
watch(() => props.overlays, () => props.rooms.forEach((r) => refreshOverlays(String(r._id))), { deep: true })
watch(() => props.selectedId, highlight)
const showGrid = () => { if (grid) grid.visible = !!props.selectedId }
watch(() => props.selectedId, () => { showGrid(); drawHandles() })
onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', onKey)
  observer?.disconnect()
  controls?.dispose()
  clearWorld()
  disposeGroup(handles)
  disposeGroup(base)
  envTexture?.dispose()
  floorTextures.forEach((t) => t.dispose())
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<style scoped>
.hint {
  max-width: calc(100% - 150px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.78);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  color: #264c3b;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 8px 22px -12px rgba(16, 40, 28, 0.5);
  pointer-events: none;
}
.view-controls {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 4;
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: 0 8px 22px -12px rgba(16, 40, 28, 0.5);
}
.vbtn {
  border: 0;
  border-radius: 999px;
  padding: 3px 11px;
  background: transparent;
  color: #35604d;
  font-size: 0.74rem;
  font-weight: 700;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.vbtn:hover { background: #e3f4ea; color: #116a42; }
.vbtn:focus-visible { outline: 2px solid #168b59; outline-offset: 1px; }
</style>
