<template>
  <div class="room-canvas-container w-100 h-100 position-relative">
    <div ref="canvasContainer" class="w-100 h-100"></div>

    <div 
      v-if="appliances.length > 0" 
      class="position-absolute top-0 start-50 translate-middle-x mt-2 px-3 py-1 bg-dark bg-opacity-75 text-white small rounded-pill shadow-sm pointer-events-none"
    >
      💡 Click & Drag appliances. They auto-rotate & snap when moved near walls!
    </div>

    <div 
      v-if="appliances.length === 0" 
      class="position-absolute top-50 start-50 translate-middle text-center text-muted bg-white bg-opacity-75 p-3 rounded-3 shadow-sm pointer-events-none"
    >
      <h6 class="fw-bold mb-1">Room is Empty</h6>
      <p class="small mb-0">Click "+ Add" on any appliance below to spawn it into your 3D room.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createAppliance3DModel } from '../stores/applianceModels.js'

const props = defineProps({
  appliances: {
    type: Array,
    default: () => []
  }
})

const canvasContainer = ref(null)
let scene, camera, renderer, controls, frameId, resizeObserver
const spawnedMeshesMap = new Map()

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const planeIntersectPoint = new THREE.Vector3()
const dragOffset = new THREE.Vector3()

let isDragging = false
let selectedMesh = null

const updatePointer = (event) => {
  if (!canvasContainer.value) return
  const rect = canvasContainer.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

const onPointerDown = (event) => {
  if (event.button !== 0) return
  updatePointer(event)

  raycaster.setFromCamera(pointer, camera)
  const draggableObjects = Array.from(spawnedMeshesMap.values())
  const intersects = raycaster.intersectObjects(draggableObjects, true)

  if (intersects.length > 0) {
    let hitMesh = intersects[0].object
    while (hitMesh.parent && hitMesh.parent !== scene && !Array.from(spawnedMeshesMap.values()).includes(hitMesh)) {
      hitMesh = hitMesh.parent
    }

    if (Array.from(spawnedMeshesMap.values()).includes(hitMesh)) {
      isDragging = true
      selectedMesh = hitMesh
      controls.enabled = false

      if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
        dragOffset.copy(selectedMesh.position).sub(planeIntersectPoint)
      }

      if (canvasContainer.value) canvasContainer.value.style.cursor = 'grabbing'
    }
  }
}

const onPointerMove = (event) => {
  updatePointer(event)
  raycaster.setFromCamera(pointer, camera)

  if (isDragging && selectedMesh) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
      let rawX = planeIntersectPoint.x + dragOffset.x
      let rawZ = planeIntersectPoint.z + dragOffset.z

      const distBack = Math.abs(rawZ - (-5.0))
      const distLeft = Math.abs(rawX - (-5.0))
      const distRight = Math.abs(rawX - 5.0)

      const snapThreshold = 1.2
      const minDist = Math.min(distBack, distLeft, distRight)

      if (minDist < snapThreshold) {

        if (minDist === distBack) {
          selectedMesh.position.z = -4.55
          selectedMesh.position.x = Math.max(-4.2, Math.min(4.2, rawX))
          selectedMesh.rotation.y = 0
        } 

        else if (minDist === distLeft) {
          selectedMesh.position.x = -4.55
          selectedMesh.position.z = Math.max(-4.2, Math.min(4.2, rawZ))
          selectedMesh.rotation.y = Math.PI / 2
        } 

        else if (minDist === distRight) {
          selectedMesh.position.x = 4.55
          selectedMesh.position.z = Math.max(-4.2, Math.min(4.2, rawZ))
          selectedMesh.rotation.y = -Math.PI / 2
        }
      } 

      else {
        selectedMesh.position.x = Math.max(-4.2, Math.min(4.2, rawX))
        selectedMesh.position.z = Math.max(-4.2, Math.min(4.2, rawZ))
        selectedMesh.rotation.y = 0
      }
    }
  } else {
    const draggableObjects = Array.from(spawnedMeshesMap.values())
    const intersects = raycaster.intersectObjects(draggableObjects, true)
    if (canvasContainer.value) {
      canvasContainer.value.style.cursor = intersects.length > 0 ? 'grab' : 'default'
    }
  }
}

const onPointerUp = () => {
  if (isDragging) {
    isDragging = false
    selectedMesh = null
    controls.enabled = true
    if (canvasContainer.value) canvasContainer.value.style.cursor = 'grab'
  }
}


const createRoomEnvironment = () => {
  const roomGroup = new THREE.Group()

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  roomGroup.add(floor)

  const gridHelper = new THREE.GridHelper(10, 10, 0x94a3b8, 0xcbd5e1)
  gridHelper.position.y = 0.01
  roomGroup.add(gridHelper)

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f2eb, roughness: 0.85 })

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 0.15), wallMat)
  backWall.position.set(0, 1.75, -5.075)
  backWall.receiveShadow = true

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 10), wallMat)
  leftWall.position.set(-5.075, 1.75, 0)
  leftWall.receiveShadow = true

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 10), wallMat)
  rightWall.position.set(5.075, 1.75, 0)
  rightWall.receiveShadow = true

  const skirtingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })

  const backSkirting = new THREE.Mesh(new THREE.BoxGeometry(9.85, 0.12, 0.04), skirtingMat)
  backSkirting.position.set(0, 0.06, -4.98)

  const leftSkirting = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 9.85), skirtingMat)
  leftSkirting.position.set(-4.98, 0.06, 0)

  const rightSkirting = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 9.85), skirtingMat)
  rightSkirting.position.set(4.98, 0.06, 0)

  roomGroup.add(backWall, leftWall, rightWall, backSkirting, leftSkirting, rightSkirting)
  return roomGroup
}

const syncAppliances = (appliancesList) => {
  if (!scene) return

  const currentIds = new Set(appliancesList.map(a => a.id))

  for (const [id, mesh] of spawnedMeshesMap.entries()) {
    if (!currentIds.has(id)) {
      scene.remove(mesh)
      spawnedMeshesMap.delete(id)
    }
  }

  appliancesList.forEach((item, index) => {
    if (!spawnedMeshesMap.has(item.id)) {
      const model = createAppliance3DModel(item.type, item.category)

      const col = index % 4
      const row = Math.floor(index / 4)
      model.position.x = -3 + col * 2.0
      model.position.z = -3 + row * 2.0

      scene.add(model)
      spawnedMeshesMap.set(item.id, model)
    }
  })
}

const initThree = async () => {
  await nextTick()
  if (!canvasContainer.value) return

  const width = canvasContainer.value.clientWidth || 600
  const height = canvasContainer.value.clientHeight || 400

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf8fafc)

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(7, 7, 10)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  canvasContainer.value.appendChild(renderer.domElement)

  const ambientLight = new THREE.AmbientLight(0xfff8e7, 1.2)
  
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.8)
  dirLight.position.set(8, 12, 10)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 1024
  dirLight.shadow.mapSize.height = 1024
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 25

  scene.add(ambientLight, dirLight)
  scene.add(createRoomEnvironment())

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 1, 0)

  const domEl = renderer.domElement
  domEl.addEventListener('pointerdown', onPointerDown)
  domEl.addEventListener('pointermove', onPointerMove)
  domEl.addEventListener('pointerup', onPointerUp)
  domEl.addEventListener('pointerleave', onPointerUp)

  syncAppliances(props.appliances)

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
  resizeObserver.observe(canvasContainer.value)
}

watch(() => props.appliances, (newList) => {
  syncAppliances(newList)
}, { deep: true })

onMounted(() => requestAnimationFrame(() => initThree()))

onBeforeUnmount(() => {
  if (frameId) cancelAnimationFrame(frameId)
  if (resizeObserver) resizeObserver.disconnect()
  if (controls) controls.dispose()

  if (renderer) {
    const domEl = renderer.domElement
    if (domEl) {
      domEl.removeEventListener('pointerdown', onPointerDown)
      domEl.removeEventListener('pointermove', onPointerMove)
      domEl.removeEventListener('pointerup', onPointerUp)
      domEl.removeEventListener('pointerleave', onPointerUp)
    }
    renderer.forceContextLoss()
    renderer.dispose()
    if (domEl?.parentNode) {
      domEl.parentNode.removeChild(domEl)
    }
  }
})
</script>

<style scoped>
.pointer-events-none {
  pointer-events: none;
}
</style>