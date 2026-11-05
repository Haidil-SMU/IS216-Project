import * as THREE from 'three'
import { createAppliance3DModel } from '../stores/applianceModels.js'

// Size of a thumbnail picture, in pixels
export const THUMB_W = 280
export const THUMB_H = 200

let renderer = null
let scene = null
let camera = null
const stills = {}

// ============================================================
// SET UP / TEAR DOWN THE SHARED RENDERER
// ============================================================

// Make the renderer, scene, camera and lights
function setupRenderer() {
  if (renderer) {
    return true
  }

  try {
    const canvas = document.createElement('canvas')
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch (error) {
    renderer = null
    return false
  }

  renderer.setPixelRatio(1)
  renderer.setSize(THUMB_W, THUMB_H, false)

  // If the browser takes the WebGL context away, throw everything away.
  // It will be built again the next time a thumbnail is needed.
  renderer.domElement.addEventListener('webglcontextlost', function (event) {
    event.preventDefault()
    releaseRenderer()
  })

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(45, THUMB_W / THUMB_H, 0.1, 100)
  camera.position.set(1.4, 0.9, 1.8)
  camera.lookAt(0, 0, 0)

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.8))
  const sun = new THREE.DirectionalLight(0xffffff, 2.5)
  sun.position.set(5, 8, 5)
  scene.add(sun)

  return true
}

function releaseRenderer() {
  if (renderer) {
    renderer.dispose()
  }
  renderer = null
  scene = null
  camera = null
}

// Free the memory used by a 3D model once we are done with it.
function disposeModel(model) {
  model.traverse(function (object) {
    if (object.geometry) {
      object.geometry.dispose()
    }

    // a mesh can have one material or a list of materials
    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        material.dispose()
      }
    } else if (object.material) {
      object.material.dispose()
    }
  })
}

// ============================================================
// BUILD THE MODEL THAT IS PHOTOGRAPHED
// ============================================================

// Make the model, shrink or grow it to a standard size and centre it,
// so every appliance fills its thumbnail nicely.
function makeSubject(type, category) {
  const model = createAppliance3DModel(type, category)

  const box = new THREE.Box3().setFromObject(model)
  const centre = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  const biggestSide = Math.max(size.x, size.y, size.z)
  model.scale.setScalar(1.3 / biggestSide)
  model.position.copy(centre).multiplyScalar(-model.scale.x)

  // Put the model inside a group, so we can spin the group around its middle.
  const pivot = new THREE.Group()
  pivot.add(model)
  return pivot
}

// ============================================================
// WHAT Appliance3D.vue CALLS
// ============================================================

// A still picture (image data URL) of one appliance.
export function getStillPicture(type, category) {
  const key = category + ':' + type

  // already made before? reuse it
  if (stills[key]) {
    return stills[key]
  }

  if (!setupRenderer()) {
    return null
  }

  const subject = makeSubject(type, category)
  scene.add(subject)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')

  scene.remove(subject)
  disposeModel(subject)

  stills[key] = url
  return url
}

// A spinning version of the appliance.
export function createSpinner(type, category) {
  if (!setupRenderer()) {
    return null
  }

  const subject = makeSubject(type, category)
  scene.add(subject)

  return {
    draw: function (angle, ctx2d) {
      if (!renderer) {
        return
      }
      subject.rotation.y = angle
      renderer.render(scene, camera)

      // copy what the shared renderer just drew onto the card's own canvas
      ctx2d.clearRect(0, 0, THUMB_W, THUMB_H)
      ctx2d.drawImage(renderer.domElement, 0, 0)
    },

    dispose: function () {
      if (scene) {
        scene.remove(subject)
      }
      disposeModel(subject)
    },
  }
}
