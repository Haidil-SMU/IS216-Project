<template>
  <div ref="container" class="it" @pointerenter="startSpin" @pointerleave="stopSpin" @pointercancel="stopSpin">
    <img v-if="still" v-show="!spinning" :src="still" alt="" class="still" draggable="false" />
    <canvas ref="live" v-show="spinning" class="live" :width="THUMB_W" :height="THUMB_H"></canvas>
  </div>
</template>

<script>
import * as THREE from 'three'
import { createAppliance3DModel } from '../stores/applianceModels.js'

const THUMB_W = 280
const THUMB_H = 200

let renderer = null, scene = null, camera = null
const stills = new Map()

function ensure() {
  if (renderer) return true
  try {
    const canvas = document.createElement('canvas')
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch {
    renderer = null
    return false
  }
  renderer.setPixelRatio(1)
  renderer.setSize(THUMB_W, THUMB_H, false)
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); release() })
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, THUMB_W / THUMB_H, 0.1, 100)
  camera.position.set(1.4, 0.9, 1.8)
  camera.lookAt(0, 0, 0)
  scene.add(new THREE.AmbientLight(0xffffff, 1.8))
  const sun = new THREE.DirectionalLight(0xffffff, 2.5)
  sun.position.set(5, 8, 5)
  scene.add(sun)
  return true
}

function release() {
  renderer?.dispose()
  renderer = scene = camera = null
}

function disposeModel(model) {
  model.traverse((o) => {
    o.geometry?.dispose?.()
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose()
  })
}

function makeSubject(type, category) {
  const model = createAppliance3DModel(type, category)
  const box = new THREE.Box3().setFromObject(model)
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
  model.scale.setScalar(1.3 / Math.max(size.x, size.y, size.z))
  model.position.copy(centre).multiplyScalar(-model.scale.x)
  const pivot = new THREE.Group()
  pivot.add(model)
  return pivot
}

function stillOf(type, category) {
  const key = `${category}:${type}`
  if (stills.has(key)) return stills.get(key)
  if (!ensure()) return null
  const subject = makeSubject(type, category)
  scene.add(subject)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(subject)
  disposeModel(subject)
  stills.set(key, url)
  return url
}

function spinner(type, category) {
  if (!ensure()) return null
  const subject = makeSubject(type, category)
  scene.add(subject)
  return {
    draw(angle, ctx2d) {
      if (!renderer) return
      subject.rotation.y = angle
      renderer.render(scene, camera)
      ctx2d.clearRect(0, 0, THUMB_W, THUMB_H)
      ctx2d.drawImage(renderer.domElement, 0, 0)
    },
    dispose() {
      scene?.remove(subject)
      disposeModel(subject)
    },
  }
}
</script>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  type: { type: String, default: '' },
  category: { type: String, default: '' },
})

const container = ref(null)
const live = ref(null)
const still = ref('')
const spinning = ref(false)
let observer = null, frameId = 0, active = null, started = 0

function loadStill() { still.value = stillOf(props.type, props.category) || '' }

function startSpin() {
  if (spinning.value || !live.value) return
  active = spinner(props.type, props.category)
  if (!active) return
  spinning.value = true
  started = performance.now()
  const ctx = live.value.getContext('2d')
  const loop = (now) => {
    active.draw(((now - started) / 1000) * 1.2, ctx)
    frameId = requestAnimationFrame(loop)
  }
  frameId = requestAnimationFrame(loop)
}

function stopSpin() {
  cancelAnimationFrame(frameId)
  frameId = 0
  active?.dispose()
  active = null
  spinning.value = false
}

onMounted(() => {
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { loadStill(); observer?.disconnect(); observer = null }
    }, { rootMargin: '200px' })
    observer.observe(container.value)
  } else {
    loadStill()
  }
})

watch([() => props.type, () => props.category], () => { stopSpin(); if (!observer) loadStill() })

onBeforeUnmount(() => {
  stopSpin()
  observer?.disconnect()
})
</script>

<style scoped>
.it {
  width: 100%;
  height: 75px;
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}
.still, .live {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
</style>