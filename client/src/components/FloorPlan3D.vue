<template>
  <div class="floorplan w-100 h-100 position-relative">
    <div ref="host" class="w-100 h-100"></div>
    <div class="view-controls" role="group" aria-label="Camera view">
      <button type="button" class="vbtn" title="Isometric view" @click="setView('iso')">3D</button>
      <button type="button" class="vbtn" title="Top-down floor plan" @click="setView('top')">Plan</button>
      <button type="button" class="vbtn" title="Front elevation" @click="setView('front')">Front</button>
    </div>
    <div v-if="!readonly && !glError && focusedId" class="tool-rail" role="group" aria-label="Room view">
      <button
        v-if="!focusedId" type="button" class="tool" :class="{ on: hammer }" :aria-pressed="hammer"
        title="Hammer: click a wall between two rooms to knock it out (Esc to put it down)" @click="setHammer(!hammer)"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 13-8.4 8.4a2 2 0 0 1-2.8-2.8L11 10.8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>
        <span>Hammer</span>
      </button>
      <button v-if="focusedId" type="button" class="tool" title="Show every room again" @click="setView('iso')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
        <span>Whole flat</span>
      </button>
    </div>
    <div v-if="planName && !glError" class="plan-cue" title="This 3D view is editing a saved plan, not your current home layout">
      Editing plan: <b>{{ planName }}</b>
    </div>
    <div v-if="glError" class="gl-error" role="alert">
      <div class="gl-error-card">
        <svg class="gl-mascot" viewBox="10 4 82 82" aria-hidden="true">
          <rect x="58" y="22" width="9" height="16" rx="2" fill="#fff" stroke="#198754" stroke-width="3" stroke-linejoin="round" />
          <path d="M22 46 L48 24 L74 46 V72 a6 6 0 0 1 -6 6 H28 a6 6 0 0 1 -6 -6 Z" fill="#fff" stroke="#198754" stroke-width="3" stroke-linejoin="round" />
          <g fill="#0f3d27"><ellipse cx="40" cy="55" rx="3" ry="3.6" /><ellipse cx="56" cy="55" rx="3" ry="3.6" /></g>
          <path d="M44.5 65 q3.5 -3.5 7 0" fill="none" stroke="#0f3d27" stroke-width="2.2" stroke-linecap="round" />
          <circle cx="74" cy="68" r="8" fill="#ffc94d" stroke="#0f3d27" stroke-width="2" />
          <text x="74" y="72.6" text-anchor="middle" font-size="12" font-weight="800" fill="#0f3d27">!</text>
        </svg>
        <h2 class="gl-title">The 3D view isn't available</h2>
        <p class="gl-message">{{ glError }}</p>
        <button type="button" class="gl-btn" @click="reloadView">Reload view</button>
      </div>
    </div>
    <div v-if="!readonly && !glError" class="hint" :class="{ 'hint-hammer': hammer }" role="note">
      <template v-if="hammer">Click a wall between two rooms to knock it out, or a green gap to build it back · Esc to stop</template>
      <template v-else-if="focusedId">Editing one room · Drag items to move them, or the edges to resize</template>
      <template v-else-if="locked && !selectedItemId">Room sizes are locked · Drag items to move them</template>
      <template v-else-if="selectedItemId && isTouch">Drag to move the item · Use the list to remove it</template>
      <template v-else-if="selectedItemId">Drag to move · Arrow keys nudge · R rotates · Delete removes</template>
      <template v-else-if="selectedId">Drag items to move · Drag edges to resize · Drag the floor to move the room</template>
      <template v-else-if="isTouch">Drag to pan · Pinch to zoom · Two fingers to orbit · Tap a room in the list to edit it</template>
      <template v-else>Right-drag to orbit · Drag to pan · Scroll to zoom · Double-click a room to edit it alone</template>
    </div>
  </div>
</template>
<script setup>
// ============================================================
// IMPORTS
// ============================================================
import { watch, ref, computed, onMounted, onUnmounted } from 'vue'

const isTouch = window.matchMedia('(pointer: coarse)').matches
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createAppliance3DModel, resolveSpec } from '../stores/applianceModels.js'
import { wallPieces, wallPoint, wallLength, placeAt, onWall, counterPose, isBlocked, sharedRange, sameSpotOn, sharedWall, refitPlacements, itemsOfRoom, gapsOf, doorBlockedBeyond, roomBehindOpening, needsOutsideWall, outsideOnlyMessage, nearestWall, NORMAL, WALL_THICKNESS } from '../stores/placement.js'
import { sunAt, heatAt, throwOf, airDirection } from '../stores/energy.js'

// ============================================================
// PROPS AND EVENTS
// ============================================================
const props = defineProps({
  rooms: { type: Array, default: () => [] },
  footprint: { type: Object, default: null },
  selectedId: { type: String, default: null },
  selectedItemId: { type: String, default: null },
  readonly: { type: Boolean, default: false },
  hammer: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  layoutKey: { type: String, default: '' },
  planName: { type: String, default: '' },
  overlays: { type: Object, default: () => ({ sun: false, heat: true, air: true }) },
  plain: { type: Boolean, default: false },
})

const emit = defineEmits(['select-room', 'select-item', 'edit-rect', 'move-items', 'move-opening', 'drag-preview', 'rotate-blocked', 'door-blocked', 'move-blocked', 'hammer-wall', 'update:hammer', 'locked', 'ready'])

// ============================================================
// CONSTANTS
// ============================================================
const GL_UNAVAILABLE = 'Your browser could not start 3D graphics. WebGL may be turned off or blocked by the graphics driver. Check your browser settings, then reload the view.'
const GL_LOST = 'The browser reclaimed the graphics context (this can happen after many tabs, or when the computer sleeps). Reload the view to bring the model back.'
const ACCENT = { living: '#f59e0b', kitchen: '#0ea5e9', bedroom: '#8b5cf6', bathroom: '#10b981' }
const FLOOR_TILE = { living: 0.6, bedroom: 0.6, kitchen: 1.2, bathroom: 1.2 }

// Smallest allowed side (metres) of each room type, the largest side, and the allowed area
const MIN = { living: 3.0, kitchen: 1.8, bedroom: 2.4, bathroom: 1.2 }
const MAX = 15
const AREA = { min: -20, max: 40 }

// A dragged room edge sticks to another room's edge when it is this close (metres)
const MAGNET = 0.25

// How the floor tiles look: n = tiles per side of the picture, base = colour, grout = line colour
const TILE_STYLE = {
  living: { n: 1, base: [226, 228, 229], grout: '#b4babe' },
  bedroom: { n: 1, base: [222, 225, 227], grout: '#b4babe' },
  kitchen: { n: 4, base: [190, 196, 200], grout: '#8f979c' },
  bathroom: { n: 4, base: [214, 222, 226], grout: '#9aa7ad' },
}

// The sun / heat pictures are drawn on a small square canvas of this many pixels
const HEATMAP_SIZE = 64

// Colour of the airflow arrows
const AIR_COLOR = { ac: 0x22b8cf, fan: 0x38bdf8, exhaust: 0xf59e0b }

// Colours of the resize handles
const HANDLE_BLUE = 0x168b59
const HANDLE_HOT = 0xf59e0b

// Sliding a door or window along a wall: step size and how far it may jump (metres)
const SLIDE_STEP = 0.1
const SLIDE_REACH = 1.2

// Arrow keys: [forward, right] direction of each key
const ARROWS = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }

// Arrow key nudge sizes (metres) and how long to wait before saving (milliseconds)
const NUDGE = 0.1
const NUDGE_BIG = 0.5
const NUDGE_SAVE_MS = 350

// The hammer only works on a shared wall at least this long (metres)
const MIN_OPEN_WALL = 0.6

// The mouse cursor shown in hammer mode (a little hammer drawn as an SVG picture)
const HAMMER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#19352a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.4 8.4a2 2 0 0 1-2.8-2.8L11 10.8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>')}") 4 28, pointer`

// How long (milliseconds) the animation keeps running after the last mouse movement
const IDLE_MS = 3000

// ============================================================
// DATA THAT THE PAGE SHOWS (refs and computed)
// ============================================================
const host = ref(null)
const glError = ref('')
const focusedId = ref(null)

// The hammer prop
const hammer = computed(function () {
  return props.hammer
})

// The rooms prop
const roomsList = computed(function () {
  return props.rooms
})

// The footprint prop
const footprintValue = computed(function () {
  return props.footprint
})

// The overlays prop
const overlaysValue = computed(function () {
  return props.overlays
})

// The selected room id, the selected item id and the locked switch
const selectedIdValue = computed(function () {
  return props.selectedId
})

const selectedItemIdValue = computed(function () {
  return props.selectedItemId
})

const lockedValue = computed(function () {
  return props.locked
})


// The three.js objects (created in start())
let scene = null
let camera = null
let renderer = null
let controls = null
let sun = null
let envTexture = null

const world = new THREE.Group()     // holds one group per room
const handles = new THREE.Group()   // the resize handles of the selected room
const base = new THREE.Group()      // the ground and the slab under the flat
const gaps = new THREE.Group()      // the green "gaps" shown in hammer mode

// The squares on the ground
let gridColor1 = 0x94a3b8
let gridColor2 = 0xd5dbe3
if (props.plain) {
  gridColor1 = 0xc4d3ca
  gridColor2 = 0xdde7e1
}
const grid = new THREE.GridHelper(60, 60, gridColor1, gridColor2)
grid.position.set(10, 0.002, 10)

// The box drawn around the selected item
const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x0ea5e9)
outline.visible = false

// The red/green glow shown over the wall under the hammer
const wallGlow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.5, depthTest: false }))
wallGlow.visible = false
wallGlow.renderOrder = 9

// The 4 wall materials (one per wall number) and the 4 materials for the top edge of the walls
const wallMats = []
const capMats = []
for (let i = 0; i < 4; i++) {
  wallMats.push(new THREE.MeshStandardMaterial({ color: 0xf8f4ec, roughness: 0.92, transparent: true }))
  capMats.push(new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.8, transparent: true }))
}

// Lookups by room id
let roomGroups = {}     // three.js group of that room
let floors = {}         // floor mesh
let tags = {}           // name tag sprite
let overlayParts = {}   // the sun/heat/air pictures

// Lookup by item id
let itemModels = {}

// Floor textures are drawn once per room type and then reused
let floorTextures = {}

// All the wall meshes of all rooms
let wallMeshes = []

// While a room is being resized
let live = null

// Camera movement in progress else null
let tween = null

// The room under the mouse, and where the mouse was pressed
let hoverId = null
let downAt = null
let hoverHandle = null
let lastPointer = null

// The current mouse drags
let bd = null
let idrag = null
let nudge = null
let nudgeTimer = 0

// The room whose overlays must be redrawn on the next frame
let overlayDirtyRoom = null

// Remember the last drawn rooms so that syncRooms() can see what changed
let roomSigs = {}
let footSig = ''
let dirtyRooms = {}

// Camera framing
let framed = false
let framedFor = null

// Animation loop
let rafId = 0
let awakeUntil = 0
let lastTick = 0

// Keeping the canvas the same size as its box
let resizeTimer = 0
let lastWidth = 0
let lastHeight = 0

// The ray used to find what is under the mouse, and the flat plane used to find the floor point
const ray = new THREE.Raycaster()
const liftedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

// Seed for the little random number generator used when painting floor tiles
let randomSeed = 0

// ============================================================
// SMALL HELPERS
// ============================================================

function isMissing(value) {
  return value === undefined || value === null
}

// Keep a number between a low and a high limit.
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

// Round a number to 1 decimal place.
function snap(value) {
  return Math.round(value * 10) / 10
}

// Copy every key of "source" onto "target".
function copyInto(target, source) {
  for (const key in source) {
    target[key] = source[key]
  }
}

// What isBlocked() wants: the spec of an item together with a position.
function candidateOf(spec, pos) {
  const candidate = { spec: spec }
  copyInto(candidate, pos)
  return candidate
}

// All the items of a list except one.
function othersOf(all, item, room) {
  const others = []
  for (const o of all) {
    if (o !== item) {
      others.push(o)
    }
  }
  // knocked-out wall stretches: wall-mounted things (aircon, TV...) may not sit on them
  if (room) {
    for (const g of gapsOf(room)) {
      others.push(g)
    }
  }
  return others
}

// The footprint of the flat, or a default one when there is none.
function getFootprint() {
  if (isMissing(props.footprint)) {
    return { x: 0, z: 0, w: 10, d: 8 }
  }
  return props.footprint
}

// Smallest allowed side of a room type.
function minSize(type) {
  const size = MIN[type]
  if (isMissing(size)) {
    return 1.2
  }
  return size
}

// Is this room id the one being edited alone (or is the whole flat showing)?
function inFocus(id) {
  return !focusedId.value || id === focusedId.value
}

// The rooms, but with the room that is being resized replaced by its temporary shape.
function liveRooms() {
  if (!live) {
    return props.rooms
  }
  const list = []
  for (const r of props.rooms) {
    if (String(r._id) === live.id) {
      list.push(live.room)
    } else {
      list.push(r)
    }
  }
  return list
}

// Find a room by its id (using the temporary shape while resizing).
function roomById(id) {
  const list = liveRooms()
  for (const r of list) {
    if (String(r._id) === id) {
      return r
    }
  }
  return null
}

// Is there a room with this id in the props?
function propsHasRoom(id) {
  for (const r of props.rooms) {
    if (String(r._id) === id) {
      return true
    }
  }
  return false
}

// Find a room by its name in a list of rooms.
function roomByName(list, name) {
  for (const r of list) {
    if (r.name === name) {
      return r
    }
  }
  return null
}

// Find an item by its id in a list of items.
function itemById(all, id) {
  for (const i of all) {
    if (i.id === id) {
      return i
    }
  }
  return null
}

// How high above the floor the model of an item sits.
function modelY(spec, h) {
  if (spec.mode === 'ceiling') {
    return h - spec.h
  }
  return spec.y
}

// Free the memory of an object's geometry
function disposeNode(o) {
  if (o.geometry && o.geometry.dispose) {
    o.geometry.dispose()
  }
  if (o.material && o.material.dispose) {
    o.material.dispose()
  }
}

// Free the memory of a whole group, then empty it.
function disposeGroup(g) {
  g.traverse(disposeNode)
  g.clear()
}

// Free the memory of one object
function disposeOneObject(o) {
  if (o.geometry && o.geometry.dispose) {
    o.geometry.dispose()
  }
  let materials = []
  if (Array.isArray(o.material)) {
    materials = o.material
  } else if (o.material) {
    materials = [o.material]
  }
  for (const m of materials) {
    const keys = Object.keys(m)
    for (const key of keys) {
      const v = m[key]
      if (v && v.isTexture) {
        v.dispose()
      }
    }
    m.dispose()
  }
}

// Free the memory of an object and everything inside it.
function disposeObject(root) {
  root.traverse(disposeOneObject)
}

// Free the memory of the geometry of an object
function disposeGeometry(o) {
  if (o.geometry && o.geometry.dispose) {
    o.geometry.dispose()
  }
}

// ============================================================
// DRAWING: NAME TAGS, FLOOR TILES, SKY
// ============================================================

// Make the name tag of a room: a small picture with the name and size, shown as a sprite.
function makeLabel(text, sub, type) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 176
  const g = canvas.getContext('2d')
  g.shadowColor = 'rgba(15,40,28,0.28)'
  g.shadowBlur = 18
  g.shadowOffsetY = 6
  g.fillStyle = 'rgba(255,255,255,0.94)'
  g.beginPath()
  g.roundRect(16, 12, 480, 128, 30)
  g.fill()
  g.shadowColor = 'transparent'

  let accent = ACCENT[type]
  if (isMissing(accent)) {
    accent = '#168b59'
  }
  g.fillStyle = accent
  g.beginPath()
  g.roundRect(16, 12, 16, 128, [30, 0, 0, 30])
  g.fill()

  g.fillStyle = '#19352a'
  g.textAlign = 'center'
  g.font = '700 54px "Segoe UI", system-ui, sans-serif'
  g.fillText(text, 264, 70, 430)
  g.font = '500 33px "Segoe UI", system-ui, sans-serif'
  g.fillStyle = '#5d6f65'
  g.fillText(sub, 264, 116, 430)

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: map, depthTest: false, transparent: true, toneMapped: false }))
  sprite.scale.set(1.9, 0.653, 1)
  sprite.renderOrder = 10
  return sprite
}

// A small random number generator: gives a number from 0 up to (not including) 1.
// The same seed always gives the same numbers, so the tiles always look the same.
function nextRandom() {
  randomSeed = randomSeed | 0
  randomSeed = (randomSeed + 0x6d2b79f5) | 0
  let t = Math.imul(randomSeed ^ (randomSeed >>> 15), 1 | randomSeed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Make a colour text
function shade(color, k) {
  const r = Math.round(color[0] * k)
  const g = Math.round(color[1] * k)
  const b = Math.round(color[2] * k)
  return `rgb(${r},${g},${b})`
}

// Draw the picture of the floor tiles of one room type.
function paintFloor(type) {
  const S = 512
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const g = canvas.getContext('2d')
  randomSeed = type.length * 977 + type.charCodeAt(0)

  let style = TILE_STYLE[type]
  if (isMissing(style)) {
    style = TILE_STYLE.living
  }
  const n = style.n
  const tile = S / n
  const line = 3

  g.fillStyle = style.grout
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.fillStyle = shade(style.base, 0.97 + nextRandom() * 0.06)
      g.fillRect(i * tile + line / 2, j * tile + line / 2, tile - line, tile - line)
      const sheen = g.createLinearGradient(i * tile, j * tile, (i + 1) * tile, (j + 1) * tile)
      sheen.addColorStop(0, 'rgba(255,255,255,0.22)')
      sheen.addColorStop(0.7, 'rgba(255,255,255,0)')
      g.fillStyle = sheen
      g.fillRect(i * tile + line / 2, j * tile + line / 2, tile - line, tile - line)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

// The floor material of a room type
function floorMaterial(type) {
  if (floorTextures[type] === undefined) {
    floorTextures[type] = paintFloor(type)
  }
  const map = floorTextures[type].clone()
  map.needsUpdate = true
  let roughness = 0.4
  if (type === 'kitchen' || type === 'bathroom') {
    roughness = 0.55
  }
  return new THREE.MeshStandardMaterial({ map: map, color: 0xffffff, roughness: roughness, metalness: 0 })
}

// Repeat the tile picture so that every tile keeps the same real-world size.
function fitFloor(floor, type, w, d) {
  let m = FLOOR_TILE[type]
  if (isMissing(m)) {
    m = 2
  }
  if (floor.material.map) {
    floor.material.map.repeat.set(w / m, d / m)
  }
}

// The picture of the sky behind the flat (a colour fade from top to bottom).
function skyTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 512
  const g = canvas.getContext('2d')
  const gradient = g.createLinearGradient(0, 0, 0, 512)
  gradient.addColorStop(0, '#9fdcf0')
  gradient.addColorStop(0.5, '#cdeee6')
  gradient.addColorStop(1, '#e3f4e6')
  g.fillStyle = gradient
  g.fillRect(0, 0, 4, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ============================================================
// BUILDING THE SCENE: GROUND, WALLS, ROOMS
// ============================================================

// Build the ground and the slab under the flat.
function buildBase() {
  disposeGroup(base)
  const fp = getFootprint()
  const pad = 1.0

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(fp.w + pad * 2, 0.24, fp.d + pad * 2),
    new THREE.MeshStandardMaterial({ color: 0xf3f6f3, roughness: 0.9 }),
  )
  slab.position.set(fp.x + fp.w / 2, -0.055 - 0.12, fp.z + fp.d / 2)
  slab.receiveShadow = true
  slab.castShadow = true

  let groundMaterial
  if (props.plain) {
    groundMaterial = new THREE.ShadowMaterial({ color: 0x1f3a2d, opacity: 0.12 })
  } else {
    groundMaterial = new THREE.MeshStandardMaterial({ color: 0xe6efe9, roughness: 1 })
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(fp.x + fp.w / 2, -0.3, fp.z + fp.d / 2)
  ground.receiveShadow = true

  base.add(ground, slab)
}

// Used to decide whether the start of a wall must be trimmed.
function insideOtherRoom(id, gx, gz) {
  const list = liveRooms()
  for (const o of list) {
    if (String(o._id) === id) {
      continue
    }
    if (!inFocus(String(o._id))) {
      continue
    }
    if (gx > o.origin.x + 0.001 && gx < o.origin.x + o.dimension.w - 0.001 &&
      gz > o.origin.z + 0.001 && gz < o.origin.z + o.dimension.d - 0.001) {
      return true
    }
  }
  return false
}

// (Re)build the walls of one room.
function buildWalls(r, moved) {
  if (moved === undefined) {
    moved = {}
  }
  const id = String(r._id)
  const group = roomGroups[id]
  const w = r.dimension.w
  const d = r.dimension.d
  const h = r.dimension.h
  if (!group) {
    return
  }

  // Remove the old wall meshes of this room
  const keptMeshes = []
  for (const mesh of wallMeshes) {
    if (mesh.userData.wall.roomId !== id) {
      keptMeshes.push(mesh)
    } else {
      group.remove(mesh)
      mesh.geometry.dispose()
    }
  }
  wallMeshes = keptMeshes

  // Everything that cuts a hole in a wall: doors, windows and knocked-out wall parts
  const items = []
  const placements = r.placements || []
  for (const p of placements) {
    let at = moved[String(p._id)]
    if (isMissing(at)) {
      at = p
    }
    items.push({ spec: resolveSpec(p.applianceTypeKey, p.category), wall: at.wall, t: at.t })
  }
  const openWalls = r.openWalls || []
  for (const o of openWalls) {
    items.push({ spec: { mode: 'opening', w: o.t1 - o.t0, y: 0, h: h }, wall: o.wall, t: (o.t0 + o.t1) / 2 })
  }

  const trimStart = []
  for (let i = 0; i < 4; i++) {
    const n = NORMAL[i]
    const point = wallPoint({ w: w, d: d }, i, -WALL_THICKNESS / 2)
    const gx = r.origin.x + point[0] - (n[0] * WALL_THICKNESS) / 2
    const gz = r.origin.z + point[1] - (n[1] * WALL_THICKNESS) / 2
    trimStart.push(insideOtherRoom(id, gx, gz))
  }

  // One box for each piece of wall
  const pieces = wallPieces({ w: w, d: d, h: h }, items, trimStart)
  for (const pc of pieces) {
    const len = pc.t1 - pc.t0
    const hh = pc.y1 - pc.y0
    const point = wallPoint({ w: w, d: d }, pc.wall, (pc.t0 + pc.t1) / 2)
    const n = NORMAL[pc.wall]
    let geo
    if (pc.wall % 2) {
      geo = new THREE.BoxGeometry(WALL_THICKNESS, hh, len)
    } else {
      geo = new THREE.BoxGeometry(len, hh, WALL_THICKNESS)
    }
    const wm = wallMats[pc.wall]
    const mesh = new THREE.Mesh(geo, [wm, wm, capMats[pc.wall], wm, wm, wm])
    mesh.position.set(point[0] - (n[0] * WALL_THICKNESS) / 2, (pc.y0 + pc.y1) / 2, point[1] - (n[1] * WALL_THICKNESS) / 2)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.userData.wall = { roomId: id, wall: pc.wall }
    wallMeshes.push(mesh)
    group.add(mesh)
  }
}

// Build one room: floor, appliance models, walls, overlays and name tag.
function buildRoom(r) {
  const w = r.dimension.w
  const d = r.dimension.d
  const h = r.dimension.h
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
  floors[id] = floor
  roomGroups[id] = group
  group.visible = inFocus(id)

  const placements = r.placements || []
  for (const p of placements) {
    const model = createAppliance3DModel(p.applianceTypeKey, p.category)
    const spec = model.userData.spec
    model.position.set(p.x, modelY(spec, h), p.z)
    model.rotation.y = p.rotY
    group.add(model)
    itemModels[String(p._id)] = { model: model, roomId: id }
  }

  buildWalls(r)
  addOverlays(id, group, w, d)

  setTag(id, r)
  world.add(group)
}

// (Re)make the name tag of a room.
function setTag(id, r) {
  const group = roomGroups[id]
  if (!group) {
    return
  }
  const old = tags[id]
  if (old) {
    group.remove(old)
    old.material.map.dispose()
    old.material.dispose()
  }
  const w = r.dimension.w
  const d = r.dimension.d
  const tag = makeLabel(r.name, `${snap(w)} × ${snap(d)} m · ${snap(w * d)} m²`, r.type)
  tag.position.set(w / 2, 0.4, d / 2)
  group.add(tag)
  tags[id] = tag
}

// ============================================================
// SUN / HEAT / AIR OVERLAYS
// ============================================================

// Make a flat coloured picture (a "heatmap") lying on the floor of a room.
function makeHeatmap(color, height, w, d) {
  const canvas = document.createElement('canvas')
  canvas.width = HEATMAP_SIZE
  canvas.height = HEATMAP_SIZE
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(w / 2, height, d / 2)
  mesh.renderOrder = 2
  return { mesh: mesh, canvas: canvas, texture: texture, color: new THREE.Color(color) }
}

// Add the sun picture, the heat picture and the arrows group to a room.
function addOverlays(roomId, group, w, d) {
  const parts = {
    sun: makeHeatmap(0xffc929, 0.02, w, d),
    heat: makeHeatmap(0xe8420f, 0.03, w, d),
    arrows: new THREE.Group(),
  }
  group.add(parts.sun.mesh, parts.heat.mesh, parts.arrows)
  overlayParts[roomId] = parts
}

// Free the memory of the arrows of one room.
function disposeArrows(parts) {
  for (const arrow of parts.arrows.children) {
    arrow.dispose()
  }
}

// Free the memory of the sun picture, heat picture and arrows of one room.
function disposeOverlayParts(parts) {
  const maps = [parts.sun, parts.heat]
  for (const map of maps) {
    map.texture.dispose()
    map.mesh.material.dispose()
  }
  disposeArrows(parts)
}

// Free the memory of the overlays of every room.
function disposeOverlays() {
  for (const id in overlayParts) {
    disposeOverlayParts(overlayParts[id])
  }
  overlayParts = {}
}

// The sun or heat value (0 to 1) at one point of the room.
function heatmapValue(kind, room, items, point) {
  if (kind === 'sun') {
    return sunAt(room, items, point)
  }
  return heatAt(room, items, point)
}

// Colour every pixel of a heatmap picture. kind is 'sun' or 'heat'.
function paintHeatmap(map, kind, items, room) {
  const ctx = map.canvas.getContext('2d')
  const image = ctx.createImageData(HEATMAP_SIZE, HEATMAP_SIZE)
  const r = map.color.r
  const g = map.color.g
  const b = map.color.b
  for (let row = 0; row < HEATMAP_SIZE; row++) {
    for (let col = 0; col < HEATMAP_SIZE; col++) {
      const point = [((col + 0.5) / HEATMAP_SIZE) * room.w, ((row + 0.5) / HEATMAP_SIZE) * room.d]
      const start = (row * HEATMAP_SIZE + col) * 4
      image.data[start] = r * 255
      image.data[start + 1] = g * 255
      image.data[start + 2] = b * 255
      image.data[start + 3] = heatmapValue(kind, room, items, point) * 150
    }
  }
  ctx.putImageData(image, 0, 0)
  map.texture.needsUpdate = true
}

// Add one arrow (skipped when it would be too short to see).
function addArrow(parts, direction, from, length, color) {
  if (length < 0.1) {
    return
  }
  parts.arrows.add(new THREE.ArrowHelper(direction.normalize(), from, length, color, Math.min(0.18, length * 0.4), 0.1))
}

// Draw a fan of arrows from a point, all turned a little differently ("spreads" are the turns).
function fanOut(parts, item, from, reach, tilt, spreads, color) {
  const dir = airDirection(item)
  const fx = dir[0]
  const fz = dir[1]
  for (const spread of spreads) {
    const cos = Math.cos(spread)
    const sin = Math.sin(spread)
    const direction = new THREE.Vector3(fx * cos - fz * sin, tilt, fx * sin + fz * cos)
    addArrow(parts, direction, from, reach * (1 - Math.abs(spread) * 0.3), color)
  }
}

// Redraw the airflow arrows of a room (air conditioner, fans and exhaust fan).
function drawAirflow(parts, room, items) {
  disposeArrows(parts)
  parts.arrows.clear()
  for (const item of items) {
    const kind = item.spec.kind
    const y = item.spec.y
    const h = item.spec.h

    if (kind === 'ac') {
      const reach = Math.min(throwOf(room, items, item), 3.5)
      const from = new THREE.Vector3(item.x, y + h / 2, item.z)
      fanOut(parts, item, from, reach, -0.25, [-0.5, -0.25, 0, 0.25, 0.5], AIR_COLOR.ac)
    } else if (kind === 'standfan') {
      const reach = Math.min(throwOf(room, items, item), 2.8)
      const dir = airDirection(item)
      const head = new THREE.Vector3(item.x + dir[0] * 0.2, h * 0.72, item.z + dir[1] * 0.2)
      fanOut(parts, item, head, reach, -0.05, [-0.35, -0.17, 0, 0.17, 0.35], AIR_COLOR.fan)
    } else if (kind === 'ceilingfan') {
      const top = room.h - h - 0.02
      const wallDistance = Math.min(item.x, room.w - item.x, item.z, room.d - item.z)
      const length = Math.max(0.5, Math.min(top - 0.3, 1.7))
      const spread = Math.min(0.5, Math.max(0.15, wallDistance - 0.45))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const from = new THREE.Vector3(item.x + Math.cos(a) * 0.45, top, item.z + Math.sin(a) * 0.45)
        addArrow(parts, new THREE.Vector3(Math.cos(a) * spread, -1, Math.sin(a) * spread), from, length, AIR_COLOR.fan)
      }
    } else if (kind === 'exhaust') {
      const offsets = [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]
      for (const offset of offsets) {
        const dx = offset[0]
        const dz = offset[1]
        const from = new THREE.Vector3(item.x + dx, room.h - 0.75, item.z + dz)
        addArrow(parts, new THREE.Vector3(-dx * 0.8, 0.75, -dz * 0.8), from, 0.7, AIR_COLOR.exhaust)
      }
    }
  }
}

// Redraw the overlays (sun, heat, air) of one room, and show or hide them as the props say.
function refreshOverlays(roomId) {
  const r = roomById(roomId)
  const parts = overlayParts[roomId]
  if (!r || !parts) {
    return
  }
  // While an item is being dragged or nudged, use its temporary position
  let active = idrag
  if (isMissing(active)) {
    active = nudge
  }
  let items
  if (active && active.roomId === roomId) {
    items = active.all
  } else {
    items = itemsOfRoom(r)
  }
  parts.sun.mesh.visible = Boolean(props.overlays.sun)
  parts.heat.mesh.visible = Boolean(props.overlays.heat)
  parts.arrows.visible = Boolean(props.overlays.air)
  if (props.overlays.sun) {
    paintHeatmap(parts.sun, 'sun', items, r.dimension)
  }
  if (props.overlays.heat) {
    paintHeatmap(parts.heat, 'heat', items, r.dimension)
  }
  if (props.overlays.air) {
    drawAirflow(parts, r.dimension, items)
  }
}

// ============================================================
// REBUILDING: EVERYTHING, OR ONLY THE ROOMS THAT CHANGED
// ============================================================

// Remove everything from the scene and free its memory.
function clearWorld() {
  disposeOverlays()
  for (const id in floors) {
    if (floors[id].material.map) {
      floors[id].material.map.dispose()
    }
    floors[id].material.dispose()
  }
  for (const id in tags) {
    if (tags[id].material.map) {
      tags[id].material.map.dispose()
    }
    tags[id].material.dispose()
  }
  for (const id in itemModels) {
    disposeObject(itemModels[id].model)
  }
  world.traverse(disposeGeometry)
  world.clear()
  floors = {}
  roomGroups = {}
  itemModels = {}
  tags = {}
  wallMeshes = []
}

// Build the whole scene again from the rooms prop.
function build() {
  if (!scene) {
    return
  }
  if (framedFor !== props.layoutKey) {
    framedFor = props.layoutKey
    framed = false
    focusedId.value = null
  }
  if (focusedId.value && !propsHasRoom(focusedId.value)) {
    focusedId.value = null
  }
  live = null
  clearWorld()
  buildBase()
  base.visible = !focusedId.value
  for (const r of props.rooms) {
    buildRoom(r)
  }
  for (const r of props.rooms) {
    refreshOverlays(String(r._id))
  }
  refreshHammer()
  highlight()
  drawHandles()
  if (!framed && props.rooms.length) {
    frameCamera()
    framed = true
  }
  dirtyRooms = {}
  rememberSigs()
  fitShadow()
  wake()
  if (props.rooms.length) {
    emit('ready')
  }
}

// Check if a room changed.
function sigOf(r) {
  return { all: JSON.stringify(r), rect: JSON.stringify([r.origin, r.dimension]) }
}

// Remember the signature of every room (and of the footprint) as they are drawn now.
function rememberSigs() {
  roomSigs = {}
  for (const r of props.rooms) {
    roomSigs[String(r._id)] = sigOf(r)
  }
  footSig = JSON.stringify(props.footprint)
}

// Remove one room from the scene and free its memory.
function disposeRoom(id) {
  const group = roomGroups[id]
  if (!group) {
    return
  }
  const parts = overlayParts[id]
  if (parts) {
    disposeOverlayParts(parts)
    delete overlayParts[id]
  }
  const floor = floors[id]
  if (floor) {
    if (floor.material.map) {
      floor.material.map.dispose()
    }
    floor.material.dispose()
    floor.geometry.dispose()
    delete floors[id]
  }
  const tag = tags[id]
  if (tag) {
    if (tag.material.map) {
      tag.material.map.dispose()
    }
    tag.material.dispose()
    delete tags[id]
  }
  for (const itemId in itemModels) {
    if (itemModels[itemId].roomId === id) {
      disposeObject(itemModels[itemId].model)
      delete itemModels[itemId]
    }
  }
  const keptMeshes = []
  for (const mesh of wallMeshes) {
    if (mesh.userData.wall.roomId !== id) {
      keptMeshes.push(mesh)
    } else {
      mesh.geometry.dispose()
    }
  }
  wallMeshes = keptMeshes
  world.remove(group)
  delete roomGroups[id]
}

// Rebuild everything if rooms were added or removed, otherwise only the rooms that changed.
function syncRooms() {
  if (!scene) {
    return
  }
  const ids = []
  for (const r of props.rooms) {
    ids.push(String(r._id))
  }
  let sameRooms = ids.length === Object.keys(roomSigs).length
  for (const id of ids) {
    if (roomSigs[id] === undefined) {
      sameRooms = false
    }
  }
  if (live || !sameRooms) {
    build()
    return
  }

  const fp = JSON.stringify(props.footprint)
  const changed = []
  for (const r of props.rooms) {
    const id = String(r._id)
    const sig = sigOf(r)
    if (dirtyRooms[id] || sig.all !== roomSigs[id].all) {
      changed.push(r)
    }
  }
  if (changed.length === 0 && fp === footSig) {
    return
  }

  if (fp !== footSig) {
    buildBase()
    fitShadow()
  }
  for (const r of changed) {
    disposeRoom(String(r._id))
    buildRoom(r)
  }
  for (const r of changed) {
    const id = String(r._id)
    delete dirtyRooms[id]
    refreshOverlays(id)
  }
  rememberSigs()
  refreshHammer()
  highlight()
  drawHandles()
  wake()
}

// ============================================================
// HIGHLIGHT, CAMERA AND VIEWS
// ============================================================

// Give a room's floor a coloured glow (hex 0 = no glow).
function setTint(id, hex, strength) {
  if (strength === undefined) {
    strength = 0.35
  }
  const f = floors[id]
  if (!f) {
    return
  }
  f.material.emissive.setHex(hex)
  if (hex) {
    f.material.emissiveIntensity = strength
  } else {
    f.material.emissiveIntensity = 0
  }
}

// Glow green on the selected room, grey on the room under the mouse.
function highlight() {
  for (const id in floors) {
    const on = id === props.selectedId
    const hov = id === hoverId
    if (on) {
      setTint(id, 0x16a34a, 0.3)
    } else if (hov) {
      setTint(id, 0x64748b, 0.2)
    } else {
      setTint(id, 0x000000, 0.2)
    }
  }
}

// Where the camera should stand and look for a view: 'iso', 'top' or 'front'.
function viewPose(kind, area) {
  let fp = area
  if (isMissing(fp)) {
    fp = getFootprint()
  }
  const cx = fp.x + fp.w / 2
  const cz = fp.z + fp.d / 2
  const reach = Math.max(fp.w, fp.d) * 1.2
  const target = new THREE.Vector3(cx, 0, cz)
  if (kind === 'top') {
    return { target: target, pos: new THREE.Vector3(cx, reach * 1.9, cz + 0.001) }
  }
  if (kind === 'front') {
    return { target: target, pos: new THREE.Vector3(cx, reach * 0.42, fp.z + fp.d + reach * 1.25) }
  }
  return { target: target, pos: new THREE.Vector3(cx + reach * 0.3, reach * 0.95, fp.z + fp.d + reach * 0.75) }
}

// Move the sun light and its shadow area so that they cover the whole flat.
function fitShadow() {
  if (!sun) {
    return
  }
  const fp = getFootprint()
  const c = new THREE.Vector3(fp.x + fp.w / 2, 0, fp.z + fp.d / 2)
  const half = clamp(Math.max(fp.w, fp.d) * 0.75 + 6, 12, 30)
  sun.target.position.copy(c)
  sun.position.set(c.x + 8, 16, c.z + 10)
  sun.shadow.camera.left = -half
  sun.shadow.camera.right = half
  sun.shadow.camera.top = half
  sun.shadow.camera.bottom = -half
  sun.shadow.camera.updateProjectionMatrix()
  sun.target.updateMatrixWorld()
}

// Put the camera in the isometric view straight away.
function frameCamera() {
  const pose = viewPose('iso')
  controls.target.copy(pose.target)
  camera.position.copy(pose.pos)
}

// Start an animated camera move to a new position and target.
function startTween(pose) {
  tween = { t: 0, fromPos: camera.position.clone(), toPos: pose.pos, fromTarget: controls.target.clone(), toTarget: pose.target }
}

// Show one room alone and fly the camera to it.
function focusRoom(id) {
  const r = roomById(id)
  if (!r) {
    return
  }
  setHammer(false)
  focusedId.value = id
  build()
  const pose = viewPose('iso', { x: r.origin.x, z: r.origin.z, w: r.dimension.w * 1.15 + 1, d: r.dimension.d * 1.15 + 1 })
  startTween(pose)
  wake()
}

// Double-click on a room: select it and show it alone.
function onDblClick(e) {
  if (hammer.value || idrag || bd) {
    return
  }
  const id = pickRoom(e)
  if (!id) {
    return
  }
  if (id !== props.selectedId) {
    emit('select-room', id)
  }
  if (id !== focusedId.value) {
    focusRoom(id)
  }
}

// Buttons "3D", "Plan", "Front" (and "Whole flat"): show every room and fly to that view.
function setView(kind) {
  if (focusedId.value) {
    focusedId.value = null
    build()
  }
  startTween(viewPose(kind))
  wake()
}

// One step of the camera animation (called every frame).
function stepTween() {
  if (!tween) {
    return
  }
  tween.t = Math.min(1, tween.t + 0.05)
  const k = 1 - Math.pow(1 - tween.t, 3)
  camera.position.lerpVectors(tween.fromPos, tween.toPos, k)
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k)
  if (tween.t >= 1) {
    tween = null
  }
}

// Make the walls that are between the camera and the rooms see-through.
function fadeWalls() {
  if (controls.getPolarAngle() < 0.3) {
    for (let i = 0; i < wallMats.length; i++) {
      wallMats[i].opacity = 1
      capMats[i].opacity = 1
      wallMats[i].depthWrite = true
      capMats[i].depthWrite = true
    }
    return
  }
  const fp = getFootprint()
  const dx = camera.position.x - (fp.x + fp.w / 2)
  const dz = camera.position.z - (fp.z + fp.d / 2)
  const facing = [dz < 0, dx > 0, dz > 0, dx < 0]
  for (let i = 0; i < wallMats.length; i++) {
    if (facing[i]) {
      wallMats[i].opacity = 0.1
      capMats[i].opacity = 0.1
    } else {
      wallMats[i].opacity = 1
      capMats[i].opacity = 1
    }
    wallMats[i].depthWrite = !facing[i]
    capMats[i].depthWrite = !facing[i]
  }
}

// ============================================================
// FINDING WHAT IS UNDER THE MOUSE
// ============================================================

// Point the ray from the camera through the mouse position.
function aim(e) {
  const box = renderer.domElement.getBoundingClientRect()
  const x = ((e.clientX - box.left) / box.width) * 2 - 1
  const y = -((e.clientY - box.top) / box.height) * 2 + 1
  ray.setFromCamera(new THREE.Vector2(x, y), camera)
}

// The id of the room whose floor is under the mouse (or null).
function pickRoom(e) {
  aim(e)
  const targets = []
  for (const id in floors) {
    if (inFocus(floors[id].userData.roomId)) {
      targets.push(floors[id])
    }
  }
  const hits = ray.intersectObjects(targets, false)
  if (hits.length > 0) {
    return hits[0].object.userData.roomId
  }
  return null
}

// The point on the flat plane at height y that is under the mouse (or null).
function groundPoint(e, y) {
  if (y === undefined) {
    y = 0
  }
  aim(e)
  const p = new THREE.Vector3()
  liftedPlane.constant = -y
  if (ray.ray.intersectPlane(liftedPlane, p)) {
    return p
  }
  return null
}

// ============================================================
// RESIZE HANDLES OF THE SELECTED ROOM
// ============================================================

// Make one handle: a white shape with a coloured rim around it.
function makeGrip(geometry, rimScale) {
  const grip = new THREE.Group()
  const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, toneMapped: false }))
  const rim = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: HANDLE_BLUE, side: THREE.BackSide, depthTest: false, toneMapped: false }))
  rim.scale.setScalar(rimScale)
  body.renderOrder = 7
  rim.renderOrder = 6
  grip.add(rim, body)
  grip.userData.body = body
  return grip
}

// Draw the 4 edge lines and the 8 handles (4 sides and 4 corners) of the selected room.
function drawHandles() {
  disposeGroup(handles)
  const r = roomById(props.selectedId)
  if (!r || props.locked) {
    return
  }
  const x = r.origin.x
  const z = r.origin.z
  const w = r.dimension.w
  const d = r.dimension.d

  // The 4 edge lines: [centre x, centre z, length along x, length along z]
  const line = 0.05
  const edgeSpecs = [[w / 2, 0, w, line], [w / 2, d, w, line], [0, d / 2, line, d], [w, d / 2, line, d]]
  for (const spec of edgeSpecs) {
    const cx = spec[0]
    const cz = spec[1]
    const lw = spec[2]
    const ld = spec[3]
    let extraW = 0
    if (lw > line) {
      extraW = line
    }
    let extraD = 0
    if (ld > line) {
      extraD = line
    }
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(lw + extraW, 0.01, ld + extraD),
      new THREE.MeshBasicMaterial({ color: HANDLE_BLUE, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
    )
    edge.position.set(x + cx, 0.02, z + cz)
    edge.renderOrder = 5
    handles.add(edge)
  }

  // The 8 handles: [sx, sz] says which side (-1, 0 or 1 in each direction)
  const handleSpots = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  for (const spot of handleSpots) {
    const sx = spot[0]
    const sz = spot[1]
    let grip
    if (sx !== 0 && sz !== 0) {
      // a corner: a ball
      grip = makeGrip(new THREE.SphereGeometry(0.15, 20, 14), 1.28)
      grip.position.set(x + w / 2 + (sx * w) / 2, 0.15, z + d / 2 + (sz * d) / 2)
    } else {
      // a side: a pill shape lying along the edge
      let side = w
      if (sx !== 0) {
        side = d
      }
      const length = Math.max(0.2, Math.min(0.9, side * 0.35))
      grip = makeGrip(new THREE.CapsuleGeometry(0.07, length, 6, 16), 1.3)
      if (sx !== 0) {
        grip.rotation.x = Math.PI / 2
      } else {
        grip.rotation.z = Math.PI / 2
      }
      grip.position.set(x + w / 2 + (sx * w) / 2, 0.08, z + d / 2 + (sz * d) / 2)
    }
    grip.userData.handle = { sx: sx, sz: sz }
    handles.add(grip)
  }
}

// The mouse cursor to show over a handle.
function resizeCursor(h) {
  if (h.sx === 0) {
    return 'ns-resize'
  }
  if (h.sz === 0) {
    return 'ew-resize'
  }
  if (h.sx === h.sz) {
    return 'nwse-resize'
  }
  return 'nesw-resize'
}

// Keep the handles the same size on screen, and make the one under the mouse orange.
function animateHandles() {
  if (!handles.children.length) {
    return
  }
  const k = Math.max(0.7, Math.min(2.2, camera.position.distanceTo(controls.target) / 14))
  for (const g of handles.children) {
    const h = g.userData.handle
    if (!h) {
      continue
    }
    const hot = Boolean(hoverHandle) && h.sx === hoverHandle.sx && h.sz === hoverHandle.sz
    if (hot) {
      g.scale.setScalar(k * 1.25)
      g.userData.body.material.color.setHex(HANDLE_HOT)
    } else {
      g.scale.setScalar(k)
      g.userData.body.material.color.setHex(0xffffff)
    }
  }
}

// The handle under the mouse, as { sx, sz } (or null).
function pickHandle(e) {
  aim(e)
  const hits = ray.intersectObjects(handles.children, true)
  for (const hit of hits) {
    let o = hit.object
    while (o && !o.userData.handle) {
      o = o.parent
    }
    if (o) {
      return o.userData.handle
    }
  }
  return null
}

// ============================================================
// MOVING AND RESIZING A ROOM
// ============================================================

// The x (or z) positions of the edges of all other rooms.
function edgesOf(axis, exceptId) {
  const out = []
  for (const o of props.rooms) {
    if (String(o._id) === exceptId) {
      continue
    }
    let start = o.origin.z
    let length = o.dimension.d
    if (axis === 'x') {
      start = o.origin.x
      length = o.dimension.w
    }
    out.push(start)
    out.push(start + length)
  }
  return out
}

// Snap one coordinate to the closest edge of another room
function snapCoord(v, axis, exceptId) {
  let best = null
  for (const e of edgesOf(axis, exceptId)) {
    if (Math.abs(e - v) <= MAGNET && (best === null || Math.abs(e - v) < Math.abs(best - v))) {
      best = e
    }
  }
  if (best === null) {
    return snap(v)
  }
  return best
}

// How far to shift a room so that one of its edges meets another room's edge.
function snapShift(a0, a1, axis, exceptId) {
  let best = null
  for (const e of edgesOf(axis, exceptId)) {
    for (const mine of [a0, a1]) {
      const dlt = e - mine
      if (Math.abs(dlt) <= MAGNET && (best === null || Math.abs(dlt) < Math.abs(best))) {
        best = dlt
      }
    }
  }
  if (best === null) {
    return snap(a0) - a0
  }
  return best
}

// Check room shape (inside the area, not overlapping another room)
function rectOk(rect, type, exceptId) {
  const EPS = 0.02
  const lo = minSize(type)
  if (rect.w < lo - EPS || rect.d < lo - EPS) {
    return false
  }
  if (rect.w > MAX + EPS || rect.d > MAX + EPS) {
    return false
  }
  if (rect.x < AREA.min || rect.z < AREA.min || rect.x + rect.w > AREA.max || rect.z + rect.d > AREA.max) {
    return false
  }
  for (const o of props.rooms) {
    if (String(o._id) === exceptId) {
      continue
    }
    const overlapX = Math.min(rect.x + rect.w, o.origin.x + o.dimension.w) - Math.max(rect.x, o.origin.x)
    const overlapZ = Math.min(rect.z + rect.d, o.origin.z + o.dimension.d) - Math.max(rect.z, o.origin.z)
    if (overlapX > EPS && overlapZ > EPS) {
      return false
    }
  }
  return true
}

// The shape the mouse is asking for while dragging a room ("move") or one of its handles.
function dragRect(drag, p) {
  const dx = p.x - drag.start.x
  const dz = p.z - drag.start.z
  const o = drag.rect0

  if (drag.kind === 'move') {
    const x = snap(o.x + dx + snapShift(o.x + dx, o.x + dx + o.w, 'x', drag.id))
    const z = snap(o.z + dz + snapShift(o.z + dz, o.z + dz + o.d, 'z', drag.id))
    return { x: x, z: z, w: o.w, d: o.d }
  }

  let x = o.x
  let z = o.z
  let w = o.w
  let d = o.d
  const lo = minSize(drag.type)
  if (drag.sx === 1) {
    w = clamp(snapCoord(o.x + o.w + dx, 'x', drag.id) - o.x, lo, MAX)
  }
  if (drag.sx === -1) {
    w = clamp(o.x + o.w - snapCoord(o.x + dx, 'x', drag.id), lo, MAX)
    x = o.x + o.w - w
  }
  if (drag.sz === 1) {
    d = clamp(snapCoord(o.z + o.d + dz, 'z', drag.id) - o.z, lo, MAX)
  }
  if (drag.sz === -1) {
    d = clamp(o.z + o.d - snapCoord(o.z + dz, 'z', drag.id), lo, MAX)
    z = o.z + o.d - d
  }
  return { x: snap(x), z: snap(z), w: snap(w), d: snap(d) }
}

function sameRect(a, b) {
  return a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d
}

// Generate the shape the wanted one if allowed, else the wanted one but keeping the
// old z and depth, else the wanted one but keeping the old x and width, else the old shape.
function allowedRect(want) {
  const last = bd.rect
  const tries = [
    want,
    { x: want.x, w: want.w, z: last.z, d: last.d },
    { x: last.x, w: last.w, z: want.z, d: want.d },
  ]
  for (const attempt of tries) {
    if (rectOk(attempt, bd.type, bd.id)) {
      return attempt
    }
  }
  return last
}

// Show a room with a new shape while dragging (before it is saved).
function showRect(id, rect) {
  let original = null
  for (const r of props.rooms) {
    if (original === null && String(r._id) === id) {
      original = r
    }
  }
  const group = roomGroups[id]
  const floor = floors[id]
  if (!original || !group || !floor) {
    return
  }
  const resized = rect.w !== original.dimension.w || rect.d !== original.dimension.d

  // A copy of the room with the new position and size
  const room = {}
  copyInto(room, original)
  room.origin = { x: rect.x, z: rect.z }
  room.dimension = {}
  copyInto(room.dimension, original.dimension)
  room.dimension.w = rect.w
  room.dimension.d = rect.d
  room.placements = refitPlacements(original, room, !resized)
  live = { id: id, room: room }

  group.position.set(rect.x, 0, rect.z)
  floor.geometry.dispose()
  floor.geometry = new THREE.BoxGeometry(rect.w, 0.05, rect.d)
  floor.position.set(rect.w / 2, -0.025, rect.d / 2)
  fitFloor(floor, room.type, rect.w, rect.d)
  for (const p of room.placements) {
    const entry = itemModels[String(p._id)]
    if (entry) {
      entry.model.position.set(p.x, modelY(entry.model.userData.spec, room.dimension.h), p.z)
    }
  }
  for (const r of liveRooms()) {
    buildWalls(r)
  }
  setTag(id, room)
  const parts = overlayParts[id]
  if (parts) {
    parts.sun.mesh.visible = false
    parts.heat.mesh.visible = false
    parts.arrows.visible = false
  }
  drawHandles()
}

// ============================================================
// PICKING AND MOVING ITEMS
// ============================================================

// Find which entry of the list holds this model (or null).
function entryOfModel(entries, model) {
  for (const entry of entries) {
    if (entry.model === model) {
      return entry
    }
  }
  return null
}

function ownerOf(hit, entries) {
  let obj = hit.object
  while (obj.parent && !entryOfModel(entries, obj)) {
    obj = obj.parent
  }
  const found = entryOfModel(entries, obj)
  if (found) {
    return { id: found.id, roomId: found.roomId }
  }
  return null
}

// The item under the mouse, as { id, roomId } (or null).
function pickItem(e) {
  aim(e)
  const entries = []
  const models = []
  for (const id in itemModels) {
    if (inFocus(itemModels[id].roomId)) {
      entries.push({ id: id, roomId: itemModels[id].roomId, model: itemModels[id].model })
      models.push(itemModels[id].model)
    }
  }
  const hits = ray.intersectObjects(models, true)
  if (hits.length === 0) {
    return null
  }
  const first = hits[0]
  let chosen = first
  if (props.selectedId) {
    for (const hit of hits) {
      if (hit.distance - first.distance < 0.35) {
        const owner = ownerOf(hit, entries)
        if (owner && owner.roomId === props.selectedId) {
          chosen = hit
          break
        }
      }
    }
  }
  return ownerOf(chosen, entries)
}

// Put the 3D model of an item where the item is now.
function poseModel(it, h) {
  const entry = itemModels[it.id]
  if (!entry) {
    return
  }
  entry.model.position.set(it.x, modelY(it.spec, h), it.z)
  entry.model.rotation.y = it.rotY
}

// The position data of an item that is sent to the parent.
function poseOf(it) {
  let cu = it.cu
  if (isMissing(cu)) {
    cu = 0
  }
  return { x: it.x, z: it.z, rotY: it.rotY, wall: it.wall, t: it.t, cu: cu }
}

// poseOf with the item id in front.
function poseWithId(it) {
  const pose = poseOf(it)
  return { id: it.id, x: pose.x, z: pose.z, rotY: pose.rotY, wall: pose.wall, t: pose.t, cu: pose.cu }
}

// ============================================================
// SLIDING DOORS AND WINDOWS ALONG A WALL
// ============================================================

// Check door placements
function openingTooClose(others, wall, t, spec) {
  for (const o of others) {
    if (o.spec.mode === 'opening' && o.wall === wall && Math.abs(o.t - t) < (o.spec.w + spec.w) / 2 + 0.1) {
      return true
    }
  }
  return false
}

// Find a free spot for a door/window close to where the mouse is.
function openingPos(r, drag, local, others) {
  const room = r.dimension
  const spec = drag.item.spec
  const wall = nearestWall(room, local).i
  const alongList = [local[0], local[1], room.w - local[0], room.d - local[1]]
  const along = alongList[wall]
  const end = Math.max(0.6, spec.w / 2 + 0.15)
  let lo = end
  let hi = wallLength(room, wall) - end

  // A door between two rooms may only slide along the wall the rooms share
  const linked = Boolean(drag.shared) && wall === drag.wall0
  if (linked) {
    const margin = spec.w / 2 + 0.1
    lo = drag.shared.t0 + margin
    hi = drag.shared.t1 - margin
    if (hi < lo) {
      return { pos: null, why: 'The wall these rooms share is too short for this door to slide.' }
    }
  }

  // All the spots to try, the closest to the wanted spot first
  const want = clamp(snap(along), lo, hi)
  const ts = []
  for (let t = lo; t <= hi + 1e-9; t += SLIDE_STEP) {
    ts.push(Math.round(t * 10) / 10)
  }
  ts.push(want)
  ts.sort(function (a, b) {
    return Math.abs(a - want) - Math.abs(b - want)
  })

  let blocker = null
  for (const t of ts) {
    if (Math.abs(t - want) > SLIDE_REACH) {
      break
    }
    const pos = onWall(room, spec, wall, t)
    if (!pos || isBlocked(candidateOf(spec, pos), others)) {
      continue
    }
    if (openingTooClose(others, wall, t, spec)) {
      continue
    }
    if (needsOutsideWall(spec)) {
      // windows and similar must face the outside
      const facing = roomBehindOpening(liveRooms(), r, spec, pos)
      if (facing) {
        if (!blocker) {
          blocker = { name: facing.name, outsideOnly: true }
        }
        continue
      }
    } else if (spec.kind === 'door') {
      // a door must not open onto something in the room behind it
      let ignoreId = null
      if (drag.partner) {
        ignoreId = drag.partner.placement._id
      }
      const behind = doorBlockedBeyond(liveRooms(), r, spec, pos, { ignoreId: ignoreId, cache: drag.beyond })
      if (behind) {
        if (!blocker) {
          blocker = behind
        }
        continue
      }
    }
    return { pos: pos }
  }

  // alerts
  let why
  if (!blocker) {
    why = 'There is no clear space for it there.'
  } else if (blocker.outsideOnly) {
    why = outsideOnlyMessage(spec, blocker.name)
  } else if (blocker.straddle) {
    why = 'A door needs a clear stretch of wall, and that part sits between two rooms.'
  } else {
    why = `Something in the ${blocker.name} is in the way of a door there.`
  }
  let blockerName = ''
  if (blocker && !isMissing(blocker.name)) {
    blockerName = blocker.name
  }
  return { pos: null, why: why, key: `${wall}:${blockerName}` }
}

function poseDoorPartner(drag) {
  const room = drag.partner.room
  const placement = drag.partner.placement
  const spec = drag.partner.spec
  const otherT = sameSpotOn(roomById(drag.roomId), drag.item.wall, drag.item.t, room, placement.wall)
  const pos = onWall(room.dimension, spec, placement.wall, otherT)
  const entry = itemModels[String(placement._id)]
  if (pos && entry) {
    entry.model.position.set(pos.x, spec.y, pos.z)
    entry.model.rotation.y = pos.rotY
  }
  return pos
}

// Rebuild the walls around a door/window that is being dragged.
function rebuildDragWalls(drag) {
  const moved = {}
  moved[drag.item.id] = drag.item
  buildWalls(roomById(drag.roomId), moved)
  if (drag.partner) {
    const partnerMoved = {}
    partnerMoved[String(drag.partner.placement._id)] = drag.partnerPos
    buildWalls(drag.partner.room, partnerMoved)
  }
}

// If the item is a door that joins two rooms, find the shared wall and the partner door.
function linkedDoorInfo(r, item) {
  const info = { shared: null, partner: null }
  if (item.spec.kind !== 'door' || !item.connectsTo || item.connectsTo === 'outside') {
    return info
  }
  const other = roomByName(props.rooms, item.connectsTo)
  if (!other) {
    return info
  }
  info.shared = sharedRange(r, other, item.wall)
  const otherPlacements = other.placements || []
  for (const q of otherPlacements) {
    if (info.partner === null && q.connectsTo === r.name && q.wall === (item.wall + 2) % 4) {
      info.partner = { room: other, placement: q, spec: item.spec }
    }
  }
  return info
}

// Dragging an item with the mouse.
function dragItem(e) {
  const d = idrag
  const r = roomById(d.roomId)
  if (!r) {
    return
  }
  const p = groundPoint(e, d.planeY)
  if (!p) {
    return
  }
  if (!d.moved) {
    d.moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4
  }
  if (!d.moved) {
    return
  }
  const room = r.dimension
  const others = othersOf(d.all, d.item, roomById(d.roomId))
  const local = [p.x - r.origin.x + d.dx, p.z - r.origin.z + d.dz]
  let pos
  if (d.item.spec.mode === 'opening') {
    const found = openingPos(r, d, local, others)
    pos = found.pos
    if (!pos) {
      if (d.warnedFor !== found.key) {
        d.warnedFor = found.key
        emit('door-blocked', found.why)
      }
      return
    }
    d.warnedFor = null
  } else {
    pos = placeAt(room, d.item.spec, local, d.item, others)
    if (!pos || isBlocked(candidateOf(d.item.spec, pos), others)) {
      return
    }
  }
  applyDragPose(d, room, pos)
}

// Put an item (and everything that depends on it) at its new position while dragging or nudging.
function applyDragPose(d, room, pos) {
  copyInto(d.item, pos)
  dirtyRooms[d.roomId] = true
  if (d.partner) {
    dirtyRooms[String(d.partner.room._id)] = true
  }
  poseModel(d.item, room.h)
  if (d.partner) {
    const stays = d.item.wall === d.wall0
    const partnerEntry = itemModels[String(d.partner.placement._id)]
    if (partnerEntry) {
      partnerEntry.model.visible = stays
    }
    if (stays) {
      d.partnerPos = poseDoorPartner(d)
    } else {
      d.partnerPos = { wall: -1, t: 0 }
    }
  }
  if (d.item.spec.mode === 'opening') {
    rebuildDragWalls(d)
  }
  overlayDirtyRoom = d.roomId
  // Things standing on a counter move together with the counter
  if (d.item.spec.kind === 'counter') {
    for (const o of d.all) {
      if (o.on === d.item.id) {
        copyInto(o, counterPose(d.item, o.spec, o.cu))
        poseModel(o, room.h)
      }
    }
  }
}

// The drag is over: send the new position(s) to the parent so that they are saved.
function commitDrag(d) {
  if (d.item.spec.mode === 'opening') {
    emit('move-opening', { roomId: d.roomId, id: d.item.id, wall: d.item.wall, t: d.item.t })
    return
  }
  const updates = []
  for (const o of d.all) {
    if (o === d.item || o.on === d.item.id) {
      updates.push(poseWithId(o))
    }
  }
  emit('move-items', { roomId: d.roomId, updates: updates })
}

// ============================================================
// MOUSE EVENTS
// ============================================================

// Mouse moves over the 3D view.
function onMove(e) {
  if (hammer.value) {
    hammerHover(e)
    return
  }
  if (idrag) {
    dragItem(e)
    return
  }
  if (bd) {
    const p = groundPoint(e)
    if (!p) {
      return
    }
    if (!bd.moved) {
      bd.moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4
    }
    if (!bd.moved) {
      return
    }
    bd.exact = dragRect(bd, p)
    const next = allowedRect(bd.exact)
    if (rectOk(bd.exact, bd.type, bd.id)) {
      highlight()
    } else {
      setTint(bd.id, 0xdc2626, 0.5)
    }
    if (!sameRect(next, bd.rect)) {
      bd.rect = next
      showRect(bd.id, next)
    }
    return
  }

  // Nothing is being dragged: just show the right cursor and highlight
  const id = pickRoom(e)
  const item = pickItem(e)
  let grip = null
  if (!item && !props.locked) {
    grip = pickHandle(e)
  }
  hoverHandle = grip
  let cursor = ''
  if (item) {
    cursor = 'grab'
  } else if (grip) {
    cursor = resizeCursor(grip)
  } else if (id && id === props.selectedId && !props.locked) {
    cursor = 'move'
  }
  renderer.domElement.style.cursor = cursor
  if (id !== hoverId) {
    hoverId = id
    highlight()
  }
}

// Mouse button pressed on the 3D view.
function onDown(e) {
  downAt = [e.clientX, e.clientY]
  if (e.button !== 0) {
    return
  }
  if (hammer.value) {
    return
  }
  flushNudge()
  const el = renderer.domElement

  // Pressed on an item: start dragging it
  const hit = pickItem(e)
  if (hit) {
    const r = roomById(hit.roomId)
    const all = itemsOfRoom(r)
    const item = itemById(all, hit.id)
    const entry = itemModels[hit.id]
    const planeY = entry.model.position.y + item.spec.h / 2
    const start = groundPoint(e, planeY)
    if (hit.roomId !== props.selectedId) {
      emit('select-room', hit.roomId)
    }
    emit('select-item', hit.id)
    entry.model.visible = true
    if (!start || !item) {
      return
    }
    idrag = {
      beyond: new Map(),
      roomId: hit.roomId,
      item: item,
      all: all,
      planeY: planeY,
      wall0: item.wall,
      dx: item.x - (start.x - r.origin.x),
      dz: item.z - (start.z - r.origin.z),
      moved: false,
      shared: null,
      partner: null,
    }
    const info = linkedDoorInfo(r, item)
    idrag.shared = info.shared
    idrag.partner = info.partner
    controls.enabled = false
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    return
  }

  if (props.locked) {
    return
  }

  // Pressed on a handle, or on the selected room's floor: start resizing / moving the room
  const h = pickHandle(e)
  const start = groundPoint(e)
  let id
  if (h) {
    id = props.selectedId
  } else {
    id = pickRoom(e)
  }
  if (!id || (!h && id !== props.selectedId)) {
    return
  }
  const r = roomById(id)
  if (!start || !r) {
    return
  }
  hoverHandle = h
  const rect0 = { x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d }
  let kind = 'move'
  let sx = 0
  let sz = 0
  if (h) {
    kind = 'handle'
    sx = h.sx
    sz = h.sz
  }
  bd = {
    kind: kind,
    id: id,
    type: r.type,
    sx: sx,
    sz: sz,
    start: start,
    moved: false,
    exact: rect0,
    rect: { x: rect0.x, z: rect0.z, w: rect0.w, d: rect0.d },
    rect0: rect0,
  }
  controls.enabled = false
  el.setPointerCapture(e.pointerId)
}

// Mouse button released on the 3D view.
function onUp(e) {
  // Hammer mode: a click on a wall knocks it out (or builds it back)
  if (hammer.value) {
    if (e.button !== 0 || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) {
      return
    }
    const hit = pickWall(e)
    if (hit && props.locked) {
      emit('locked', 'Room sizes are locked, so walls can\'t be knocked out. Turn off "Lock room sizes" in the toolbar to use the hammer.')
      return
    }
    if (hit) {
      emit('hammer-wall', { roomId: hit.roomId, otherId: hit.otherId, open: !hit.open })
    }
    return
  }

  // An item drag ends: save the new position
  if (idrag) {
    const d = idrag
    idrag = null
    controls.enabled = true
    renderer.domElement.style.cursor = ''
    if (d.moved) {
      commitDrag(d)
    }
    return
  }

  // A room drag ends: save the new shape
  if (bd) {
    const d = bd
    bd = null
    hoverHandle = null
    controls.enabled = true
    if (d.moved && !sameRect(d.rect, d.rect0)) {
      emit('edit-rect', { roomId: d.id, rect: d.rect })
      return
    }
    if (d.moved) {
      build()
      return
    }
  }

  // A plain click: select the room under the mouse
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) {
    return
  }
  const id = pickRoom(e)
  emit('select-item', null)
  if (id) {
    emit('select-room', id)
  }
}

// The mouse leaves the 3D view.
function onPointerLeave() {
  if (!bd) {
    hoverHandle = null
  }
}

// The browser cancels a mouse/touch drag: drop it and draw everything again.
function onPointerCancel() {
  bd = null
  idrag = null
  controls.enabled = true
  emit('drag-preview', null)
  build()
}

// ============================================================
// MOVING THE SELECTED ITEM WITH THE ARROW KEYS
// ============================================================

// Identify which way to move based on camera view
function screenAxes() {
  const fx = controls.target.x - camera.position.x
  const fz = controls.target.z - camera.position.z
  let fwd
  if (Math.abs(fx) > Math.abs(fz)) {
    fwd = [Math.sign(fx), 0]
  } else {
    fwd = [0, Math.sign(fz) || -1]
  }
  return { fwd: fwd, right: [-fwd[1], fwd[0]] }
}

// Save the nudge that is waiting (if any) right now.
function flushNudge() {
  clearTimeout(nudgeTimer)
  nudgeTimer = 0
  const d = nudge
  nudge = null
  if (d) {
    commitDrag(d)
  }
}

// Move the selected item one step with an arrow key.
function nudgeSelected(e) {
  if (idrag || bd) {
    return
  }
  const entry = itemModels[props.selectedItemId]
  let r = null
  if (entry) {
    r = roomById(entry.roomId)
  }
  if (!r) {
    return
  }
  e.preventDefault()

  // Start a new nudge when it is a different item than before
  if (!nudge || nudge.item.id !== props.selectedItemId) {
    flushNudge()
    const all = itemsOfRoom(r)
    const item = itemById(all, props.selectedItemId)
    if (!item) {
      return
    }
    nudge = { beyond: new Map(), roomId: entry.roomId, item: item, all: all, wall0: item.wall, shared: null, partner: null }
    const info = linkedDoorInfo(r, item)
    nudge.shared = info.shared
    nudge.partner = info.partner
  }
  const d = nudge
  let step = NUDGE
  if (e.shiftKey) {
    step = NUDGE_BIG
  }
  const keys = ARROWS[e.key]
  const kf = keys[0]
  const kr = keys[1]
  const axes = screenAxes()
  const vx = axes.fwd[0] * kf + axes.right[0] * kr
  const vz = axes.fwd[1] * kf + axes.right[1] * kr
  const room = r.dimension
  const others = othersOf(d.all, d.item, roomById(d.roomId))
  let pos

  if (d.item.spec.mode === 'opening') {
    // a door/window slides along its wall
    const wall = d.item.wall
    const wallStart = wallPoint(room, wall, 0)
    const wallEnd = wallPoint(room, wall, 1)
    const along = (wallEnd[0] - wallStart[0]) * vx + (wallEnd[1] - wallStart[1]) * vz
    if (Math.abs(along) < 0.5) {
      return
    }
    const dir = Math.sign(along)
    const found = openingPos(r, d, wallPoint(room, wall, d.item.t + dir * step), others)
    let moved = 0
    if (found.pos) {
      moved = (found.pos.t - d.item.t) * dir
    }
    let cannotMove = false
    if (!found.pos) {
      cannotMove = true
    } else {
      let posWall = found.pos.wall
      if (isMissing(posWall)) {
        posWall = wall
      }
      if (posWall !== wall || moved <= 1e-6 || moved > step + 0.05) {
        cannotMove = true
      }
    }
    if (cannotMove) {
      let message = found.why
      if (isMissing(message)) {
        message = 'Something is in the way of that move.'
      }
      emit('door-blocked', message)
      return
    }
    pos = found.pos
  } else {
    pos = placeAt(room, d.item.spec, [d.item.x + vx * step, d.item.z + vz * step], d.item, others)
    if (!pos || isBlocked(candidateOf(d.item.spec, pos), others)) {
      emit('move-blocked')
      return
    }

    let changed = false
    for (const key in pos) {
      let before = d.item[key]
      if (isMissing(before)) {
        before = 0
      }
      if (typeof pos[key] === 'number' && Math.abs(pos[key] - before) > 1e-6) {
        changed = true
      }
    }
    if (!changed) {
      return
    }
  }
  applyDragPose(d, r.dimension, pos)
  wake()
  // Save a moment after the last key press
  clearTimeout(nudgeTimer)
  nudgeTimer = setTimeout(flushNudge, NUDGE_SAVE_MS)
}

// ============================================================
// THE HAMMER (knock out a wall between two rooms)
// ============================================================

// Turn the hammer on or off
function setHammer(on) {
  if (hammer.value !== on) {
    emit('update:hammer', on)
  }
}

// Stretch a box (mesh) so that it covers a stretch of wall from t0 to t1.
function spanBox(mesh, r, wall, t0, t1, thick) {
  const w = r.dimension.w
  const d = r.dimension.d
  const h = r.dimension.h
  const len = t1 - t0
  const point = wallPoint({ w: w, d: d }, wall, (t0 + t1) / 2)
  const n = NORMAL[wall]
  if (wall % 2) {
    mesh.scale.set(thick, h, len)
  } else {
    mesh.scale.set(len, h, thick)
  }
  mesh.position.set(r.origin.x + point[0] - (n[0] * WALL_THICKNESS) / 2, h / 2, r.origin.z + point[1] - (n[1] * WALL_THICKNESS) / 2)
}

// In hammer mode, draw a green box in every gap that was knocked out (click it to build the wall back).
function drawGaps() {
  disposeGroup(gaps)
  if (!hammer.value) {
    return
  }
  for (const r of liveRooms()) {
    const openWalls = r.openWalls || []
    for (const o of openWalls) {
      const other = roomByName(liveRooms(), o.to)
      // each gap is shared by two rooms: only draw it from one of them
      if (!other || r.name > other.name) {
        continue
      }
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.22, depthWrite: false }))
      spanBox(m, r, o.wall, o.t0, o.t1, WALL_THICKNESS * 1.4)
      m.userData.gap = { roomId: String(r._id), otherId: String(other._id), wall: o.wall, t0: o.t0, t1: o.t1, open: true }
      gaps.add(m)
    }
  }
}

// The wall (or gap) under the mouse in hammer mode.
function pickWall(e) {
  aim(e)
  const targets = wallMeshes.concat(gaps.children)
  const hits = ray.intersectObjects(targets, false)
  for (const hit of hits) {
    const u = hit.object.userData
    if (u.gap) {
      return u.gap
    }
    // skip walls that are see-through right now
    const firstMaterial = hit.object.material[0]
    if (firstMaterial && firstMaterial.opacity < 0.5) {
      continue
    }
    const room = roomById(u.wall.roomId)
    if (!room) {
      return null
    }
    const lx = hit.point.x - room.origin.x
    const lz = hit.point.z - room.origin.z
    const distances = [lx, lz, room.dimension.w - lx, room.dimension.d - lz]
    const t = distances[u.wall.wall]
    for (const o of liveRooms()) {
      if (o === room) {
        continue
      }
      const s = sharedWall(room, o)
      if (!s || s.wall !== u.wall.wall || s.length < MIN_OPEN_WALL) {
        continue
      }
      const rg = sharedRange(room, o, s.wall)
      if (rg && t > rg.t0 - 0.1 && t < rg.t1 + 0.1) {
        const result = { roomId: u.wall.roomId, otherId: String(o._id), wall: s.wall }
        copyInto(result, rg)
        result.open = false
        return result
      }
    }
    return null
  }
  return null
}

// Redraw the gaps and hide the glow (the walls changed).
function refreshHammer() {
  drawGaps()
  wallGlow.visible = false
  if (hammer.value && lastPointer) {
    hammerHover(lastPointer)
  }
}

// The mouse moves in hammer mode: glow the wall under it (red = knock out, green = build back).
function hammerHover(e) {
  lastPointer = { clientX: e.clientX, clientY: e.clientY }
  const hit = pickWall(e)
  const was = wallGlow.visible
  wallGlow.visible = Boolean(hit)
  if (hit) {
    spanBox(wallGlow, roomById(hit.roomId), hit.wall, hit.t0, hit.t1, WALL_THICKNESS * 1.8)
    if (hit.open) {
      wallGlow.material.color.set(0x2fbf71)
    } else {
      wallGlow.material.color.set(0xdc2626)
    }
  }
  renderer.domElement.style.cursor = HAMMER_CURSOR
  if (was !== wallGlow.visible || hit) {
    wake()
  }
}

// The hammer prop changed (turned on or off).
function onHammerChange(on) {
  if (!scene) {
    return
  }
  if (on) {
    emit('select-item', null)
  }
  wallGlow.visible = false
  drawGaps()
  if (on) {
    renderer.domElement.style.cursor = HAMMER_CURSOR
  } else {
    renderer.domElement.style.cursor = ''
  }
  wake()
}

// ============================================================
// KEYBOARD
// ============================================================

// A key is pressed anywhere on the page.
function onKey(e) {
  if (e.key === 'Escape' && hammer.value) {
    setHammer(false)
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey || !props.selectedItemId || !controls) {
    return
  }
  // Ignore keys typed into a text box
  const t = e.target
  if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
    return
  }
  if (ARROWS[e.key]) {
    nudgeSelected(e)
    return
  }
  if (e.key.toLowerCase() !== 'r' || nudge) {
    return
  }

  // The R key turns the selected floor item by 90 degrees
  const entry = itemModels[props.selectedItemId]
  let r = null
  if (entry) {
    r = roomById(entry.roomId)
  }
  if (!r) {
    return
  }
  const all = itemsOfRoom(r)
  const item = itemById(all, props.selectedItemId)
  if (!item || item.spec.mode !== 'floor' || item.wall >= 0) {
    return
  }
  const others = othersOf(all, item)
  const pos = placeAt(r.dimension, item.spec, [item.x, item.z], { rotY: item.rotY + Math.PI / 2 }, others)
  if (!pos || isBlocked(candidateOf(item.spec, pos), others)) {
    emit('rotate-blocked')
    return
  }
  const turned = {}
  copyInto(turned, item)
  copyInto(turned, pos)
  emit('move-items', { roomId: entry.roomId, updates: [poseWithId(turned)] })
}

// ============================================================
// STARTING AND STOPPING THE 3D VIEW
// ============================================================

// Stop drawing and show a message.
function onGlLost(ev) {
  ev.preventDefault()
  cancelAnimationFrame(rafId)
  rafId = 0
  glError.value = GL_LOST
  emit('ready')
}

// Start the view again.
function onGlRestored() {
  reloadView()
}

function wakeFromEvent() {
  wake()
}

// The orbit controls moved the camera.
function onControlsChange() {
  wake(250)
}

// Start the 3D view. When 3D graphics are not available, show the error message instead.
function init() {
  try {
    start()
  } catch (err) {
    console.error('3D view failed to start', err)
    teardown()
    glError.value = GL_UNAVAILABLE
    emit('ready')
  }
}

// Make the renderer, scene, lights, camera and controls, and hook up the mouse and keyboard.
function start() {
  let width = host.value.clientWidth
  if (!width) {
    width = 800
  }
  let height = host.value.clientHeight
  if (!height) {
    height = 500
  }
  renderer = new THREE.WebGLRenderer({ antialias: true })
  glError.value = ''
  scene = new THREE.Scene()
  if (props.plain) {
    scene.background = new THREE.Color(0xfbfdfc)
    scene.fog = new THREE.Fog(0xfbfdfc, 55, 130)
  } else {
    scene.background = skyTexture()
    scene.fog = new THREE.Fog(0xd5eee4, 55, 130)
  }
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)

  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  if (isMissing(THREE.NeutralToneMapping)) {
    renderer.toneMapping = THREE.NoToneMapping
  } else {
    renderer.toneMapping = THREE.NeutralToneMapping
  }
  renderer.toneMappingExposure = 1.0
  host.value.appendChild(renderer.domElement)

  // Soft room-like lighting reflected in shiny materials
  const pmrem = new THREE.PMREMGenerator(renderer)
  envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  scene.environment = envTexture
  scene.environmentIntensity = 0.35

  // The sun (with shadows) and a weak fill light
  sun = new THREE.DirectionalLight(0xfff1dc, 2.1)
  sun.position.set(8, 16, 10)
  sun.castShadow = true
  sun.shadow.camera.left = -18
  sun.shadow.camera.right = 18
  sun.shadow.camera.top = 18
  sun.shadow.camera.bottom = -18
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 70
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.04
  sun.shadow.radius = 3
  const fill = new THREE.DirectionalLight(0xdcecff, 0.45)
  fill.position.set(-10, 9, -8)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd5e6dc, 0.55), new THREE.AmbientLight(0xfff6e5, 0.9), sun, sun.target, fill, grid, base, world, handles, outline, wallGlow, gaps)

  // Mouse: left = pan, wheel = zoom, right = orbit
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
  // Touch: one finger pans (like the left mouse button), two fingers pinch to zoom and turn to orbit
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
  controls.maxPolarAngle = Math.PI / 2.05
  controls.minDistance = 3
  controls.maxDistance = 45

  const el = renderer.domElement
  el.addEventListener('webglcontextlost', onGlLost)
  el.addEventListener('webglcontextrestored', onGlRestored)
  controls.addEventListener('change', onControlsChange)
  const wakeEvents = ['pointermove', 'pointerdown', 'pointerup', 'wheel']
  for (const type of wakeEvents) {
    el.addEventListener(type, wakeFromEvent)
  }
  if (!props.readonly) {
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('dblclick', onDblClick)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKey)
  }

  build()

  // Keep the canvas the same size as its box
  lastWidth = 0
  lastHeight = 0
  checkSize()
  window.addEventListener('resize', checkSize)
  resizeTimer = setInterval(checkSize, 250)
}

// If the box around the canvas changed size, make the canvas follow.
function checkSize() {
  if (!renderer || !host.value) {
    return
  }
  const w = host.value.clientWidth
  const h = host.value.clientHeight
  if (!w || !h) {
    return
  }
  if (w === lastWidth && h === lastHeight) {
    return
  }
  lastWidth = w
  lastHeight = h
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  wake(500)
}

// ============================================================
// THE ANIMATION LOOP
// ============================================================

// Keep drawing frames for the next "ms" milliseconds (starts the loop if it was asleep).
function wake(ms) {
  if (ms === undefined) {
    ms = IDLE_MS
  }
  awakeUntil = Math.max(awakeUntil, performance.now() + ms)
  if (!rafId && renderer && !glError.value) {
    rafId = requestAnimationFrame(tick)
  }
}

// Draw one frame. The loop goes back to sleep when nothing moves for a while.
function tick(now) {
  rafId = 0
  if (!renderer || glError.value) {
    return
  }
  const dt = Math.min(0.05, (now - lastTick) / 1000 || 0.016)
  lastTick = now
  stepTween()
  controls.update()
  fadeWalls()
  animateHandles()

  // While an item is dragged: redraw the overlays and tell the parent where the items are now
  if (overlayDirtyRoom) {
    refreshOverlays(overlayDirtyRoom)
    let active = idrag
    if (isMissing(active)) {
      active = nudge
    }
    if (active) {
      const poses = {}
      for (const o of active.all) {
        poses[o.id] = poseOf(o)
      }
      emit('drag-preview', { roomId: active.roomId, poses: poses })
    }
    overlayDirtyRoom = null
  }

  // Spin the fans while the loop is awake
  const awake = now < awakeUntil
  if (awake) {
    for (const id in itemModels) {
      const model = itemModels[id].model
      if (model.userData.rotor) {
        model.userData.rotor.rotation.y += 2.4 * dt
      }
    }
  }

  // The box around the selected item
  let sel = null
  if (props.selectedItemId) {
    sel = itemModels[props.selectedItemId]
  }
  outline.visible = Boolean(sel)
  if (sel) {
    outline.setFromObject(sel.model)
  }

  renderer.render(scene, camera)
  if (!rafId && (awake || tween || idrag || bd)) {
    rafId = requestAnimationFrame(tick)
  }
}

// ============================================================
// WATCHERS (react to prop changes)
// ============================================================

// The rooms or the footprint changed
watch(roomsList, syncRooms, { deep: true })
watch(footprintValue, syncRooms, { deep: true })

// The sun / heat / air switches changed
watch(overlaysValue, function () {
  for (const r of props.rooms) {
    refreshOverlays(String(r._id))
  }
  wake()
}, { deep: true })

// Another room was selected
watch(selectedIdValue, function () {
  highlight()
  wake()
})

// Another item was selected (save a waiting nudge first)
watch(selectedItemIdValue, function () {
  flushNudge()
  wake()
})

// Room sizes were locked or unlocked (the handles come or go)
watch(lockedValue, function () {
  if (scene) {
    drawHandles()
    wake()
  }
})

// Another room was selected: its handles must be drawn
watch(selectedIdValue, function () {
  if (scene) {
    drawHandles()
  }
})

// The hammer was turned on or off
watch(hammer, onHammerChange)

// ============================================================
// CLEAN UP AND RELOAD
// ============================================================

// Stop everything and free all the memory used by the 3D view.
function teardown() {
  cancelAnimationFrame(rafId)
  rafId = 0
  clearTimeout(nudgeTimer)
  clearInterval(resizeTimer)
  resizeTimer = 0
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', checkSize)
  if (controls) {
    controls.dispose()
  }
  clearWorld()
  disposeGroup(handles)
  disposeGroup(base)
  if (envTexture) {
    envTexture.dispose()
  }
  for (const type in floorTextures) {
    floorTextures[type].dispose()
  }
  floorTextures = {}
  if (scene && scene.background && scene.background.dispose) {
    scene.background.dispose()
  }
  grid.geometry.dispose()
  grid.material.dispose()
  outline.geometry.dispose()
  outline.material.dispose()
  wallGlow.geometry.dispose()
  wallGlow.material.dispose()
  disposeGroup(gaps)
  wallGlow.visible = false
  for (const m of wallMats) {
    m.dispose()
  }
  for (const m of capMats) {
    m.dispose()
  }
  if (renderer) {
    renderer.domElement.removeEventListener('webglcontextlost', onGlLost)
    renderer.domElement.removeEventListener('webglcontextrestored', onGlRestored)
    if (sun && sun.dispose) {
      sun.dispose()
    }
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
  scene = null
  camera = null
  renderer = null
  controls = null
  sun = null
  envTexture = null
  live = null
  idrag = null
  bd = null
  tween = null
  hoverHandle = null
  overlayDirtyRoom = null
  nudge = null
  hoverId = null
  nudgeTimer = 0
  roomSigs = {}
  dirtyRooms = {}
  focusedId.value = null
  framed = false
  framedFor = null
}

// The "Reload view" button
function reloadView() {
  flushNudge()
  teardown()
  glError.value = ''
  if (host.value) {
    init()
  }
}

// ============================================================
// LIFECYCLE
// ============================================================
onMounted(init)

onUnmounted(function () {
  flushNudge()
  teardown()
})
</script>

<style scoped>
.hint {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 3;
  width: max-content;
  max-width: min(540px, calc(100% - 210px));
  padding: 8px 14px;
  border: 1px solid #e3ece6;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  color: #35604d;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: left;
  box-shadow: 0 8px 22px -14px rgba(16, 40, 28, 0.45);
  pointer-events: none;
}
@media (max-width: 767px) {
  .hint { top: auto; bottom: 10px; left: 10px; max-width: calc(100% - 20px); font-size: 0.74rem; padding: 6px 11px; }
  .view-controls { top: 8px; right: 8px; }
  .vbtn { padding: 6px 13px; font-size: 0.78rem; }
  .tool { width: 46px; padding: 6px 2px 4px; }
  .tool-rail { left: 6px; }
  .plan-cue { top: 8px; bottom: auto; left: 8px; right: auto; max-width: calc(100% - 170px); font-size: 0.72rem; padding: 5px 10px; }
}
@media (pointer: coarse) {
  .vbtn { min-height: 34px; }
}
.plan-cue {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 4;
  max-width: min(320px, calc(100% - 24px));
  padding: 8px 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid #bfe3cd;
  border-radius: 14px;
  background: rgba(234, 247, 238, 0.92);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  color: #116a42;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.4;
  box-shadow: 0 8px 22px -14px rgba(16, 40, 28, 0.45);
  pointer-events: none;
}

.gl-error {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(228, 240, 233, 0.9);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}
.gl-error-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin-top: 40px;
  padding: 58px 26px 22px;
  border-radius: 24px;
  background: #fff;
  color: #1d2b23;
  text-align: center;
  box-shadow: 0 2px 6px rgba(16, 40, 28, 0.08), 0 24px 48px -12px rgba(16, 40, 28, 0.35);
}
.gl-mascot {
  position: absolute;
  top: -46px;
  left: 50%;
  width: 92px;
  height: 92px;
  margin-left: -46px;
  padding: 4px;
  border-radius: 50%;
  background: #e3f5ea;
  box-shadow: 0 0 0 6px #fff;
}
.gl-title { margin: 0 0 8px; font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
.gl-message { margin: 0 0 18px; font-size: 0.875rem; line-height: 1.55; color: #56665d; }
.gl-btn {
  padding: 9px 22px;
  border: 0;
  border-radius: 999px;
  background: #198754;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 650;
  box-shadow: 0 6px 14px -6px rgba(25, 135, 84, 0.7);
  transition: background-color 0.15s ease, transform 0.15s ease;
}
.gl-btn:hover { background: #146c43; transform: translateY(-1px); }
.gl-btn:active { transform: scale(0.97); }
.gl-btn:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }
.view-controls {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 4;
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid #e3ece6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: 0 8px 22px -14px rgba(16, 40, 28, 0.45);
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
.tool-rail {
  position: absolute;
  left: 10px;
  top: 50%;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 3px;
  transform: translateY(-50%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: 0 8px 22px -12px rgba(16, 40, 28, 0.5);
}
.tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 52px;
  padding: 7px 2px 5px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: #35604d;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.1;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.tool:hover { background: #e3f4ea; color: #116a42; }
.tool:focus-visible { outline: 2px solid #168b59; outline-offset: 1px; }
.tool.on, .tool.on:hover { background: #fde8e6; color: #a3242b; box-shadow: inset 0 0 0 1px #f1b9b2; }
.hint-hammer { border-color: #f1b9b2; background: rgba(253, 236, 234, 0.94); color: #8f2a1f; }
.vbtn:focus-visible { outline: 2px solid #168b59; outline-offset: 1px; }
</style>
