<template>
  <div ref="container" class="it"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createAppliance3DModel } from '../stores/applianceModels.js'

const props = defineProps({
  type: { type: String, default: '' },
  category: { type: String, default: '' }
})

const container = ref(null)
let scene, camera, renderer, controls, frameId, resizeObserver
let currentModel = null

const loadModel = () => {
  if (!scene) return
  if (currentModel) scene.remove(currentModel)

  currentModel = createAppliance3DModel(props.type, props.category)

  const box = new THREE.Box3().setFromObject(currentModel)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  currentModel.scale.setScalar(1.3 / Math.max(size.x, size.y, size.z))
  currentModel.position.copy(center).multiplyScalar(-currentModel.scale.x)

  scene.add(currentModel)
}

const initThree = async () => {
  await nextTick()
  if (!container.value) return

  const width = container.value.clientWidth || 120
  const height = container.value.clientHeight || 75

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(1.4, 0.9, 1.8)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.value.appendChild(renderer.domElement)

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.8)
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
  dirLight.position.set(5, 8, 5)
  scene.add(ambientLight, dirLight)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.autoRotate = true
  controls.autoRotateSpeed = 3.0
  controls.enableZoom = false

  loadModel()

  const animate = () => {
    frameId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      const w = entry.contentRect.width
      const h = entry.contentRect.height
      if (w > 0 && h > 0 && camera && renderer) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
    }
  })
  resizeObserver.observe(container.value)
}

watch([() => props.type, () => props.category], () => loadModel())

onMounted(() => requestAnimationFrame(() => initThree()))

onBeforeUnmount(() => {
  if (frameId) cancelAnimationFrame(frameId)
  if (resizeObserver) resizeObserver.disconnect()
  if (controls) controls.dispose()
  if (renderer) {
    renderer.forceContextLoss()
    renderer.dispose()
    if (renderer.domElement?.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }
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
</style>