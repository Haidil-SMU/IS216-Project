<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

// Lets the user drag and zoom a photo inside the round profile frame,
// then emits the framed part as a square JPEG.
const props = defineProps({ file: { type: File, required: true } })
const emit = defineEmits(['cancel', 'save'])

const OUTPUT = 256
const MAX_ZOOM = 4

const viewport = ref(null)
const size = ref(280) // viewport width and height on screen, in px
const image = ref(null) // ImageBitmap, already turned the right way up
const src = URL.createObjectURL(props.file)
const zoom = ref(1)
const x = ref(0) // image's top-left corner inside the viewport
const y = ref(0)
const error = ref('')
let drag = null

// At zoom 1 the photo just covers the frame.
const scale = computed(() =>
  image.value
    ? Math.max(size.value / image.value.width, size.value / image.value.height) * zoom.value
    : 1,
)
const imageStyle = computed(() => ({
  width: `${image.value.width * scale.value}px`,
  height: `${image.value.height * scale.value}px`,
  transform: `translate(${x.value}px, ${y.value}px)`,
}))

// Keep the photo covering the whole frame, so no empty corners are saved.
function clamp() {
  x.value = Math.min(0, Math.max(size.value - image.value.width * scale.value, x.value))
  y.value = Math.min(0, Math.max(size.value - image.value.height * scale.value, y.value))
}
// Zoom while keeping the point under (cx, cy) in place.
function setZoom(next, cx = size.value / 2, cy = size.value / 2) {
  const before = scale.value
  zoom.value = Math.min(MAX_ZOOM, Math.max(1, next))
  const ratio = scale.value / before
  x.value = cx - (cx - x.value) * ratio
  y.value = cy - (cy - y.value) * ratio
  clamp()
}

onMounted(async () => {
  size.value = Math.min(280, window.innerWidth - 80)
  try {
    image.value = await createImageBitmap(props.file)
  } catch {
    error.value = 'This image could not be opened. Please choose a JPEG, PNG or WebP photo.'
    return
  }
  x.value = (size.value - image.value.width * scale.value) / 2
  y.value = (size.value - image.value.height * scale.value) / 2
  await nextTick()
  viewport.value?.focus()
})
onBeforeUnmount(() => {
  URL.revokeObjectURL(src)
  image.value?.close()
})

function startDrag(event) {
  if (!image.value) return
  viewport.value.setPointerCapture(event.pointerId)
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX - x.value,
    startY: event.clientY - y.value,
  }
}
function moveDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return
  x.value = event.clientX - drag.startX
  y.value = event.clientY - drag.startY
  clamp()
}
function endDrag() {
  drag = null
}
function wheelZoom(event) {
  if (!image.value) return
  const box = viewport.value.getBoundingClientRect()
  setZoom(
    zoom.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
    event.clientX - box.left,
    event.clientY - box.top,
  )
}
// Arrow keys move the photo; + and - zoom.
function keyMove(event) {
  if (!image.value) return
  const step = event.shiftKey ? 40 : 10
  const moves = {
    ArrowLeft: [step, 0],
    ArrowRight: [-step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  }
  if (moves[event.key]) {
    x.value += moves[event.key][0]
    y.value += moves[event.key][1]
    clamp()
  } else if (event.key === '+' || event.key === '=') {
    setZoom(zoom.value * 1.1)
  } else if (event.key === '-') {
    setZoom(zoom.value / 1.1)
  } else {
    return
  }
  event.preventDefault()
}

// Draw just the framed square of the original photo at 256 × 256.
function save() {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT
  canvas.height = OUTPUT
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, OUTPUT, OUTPUT)
  const side = size.value / scale.value
  context.drawImage(
    image.value,
    -x.value / scale.value,
    -y.value / scale.value,
    side,
    side,
    0,
    0,
    OUTPUT,
    OUTPUT,
  )
  canvas.toBlob(
    (blob) => {
      if (blob) emit('save', blob)
      else error.value = 'This image could not be saved. Please try another photo.'
    },
    'image/jpeg',
    0.9,
  )
}
</script>
<template>
  <div
    class="popup-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="crop-title"
    @click.self="emit('cancel')"
    @keydown.esc="emit('cancel')"
  >
    <div class="popup-card crop-card">
      <h2 id="crop-title" class="h5 fw-bold mb-1">Adjust your photo</h2>
      <p class="small text-secondary mb-3">Drag to move it, and zoom to fit the frame.</p>
      <p v-if="error" class="text-danger small" role="alert">{{ error }}</p>
      <div
        v-else
        ref="viewport"
        class="crop-viewport"
        :style="{ width: `${size}px`, height: `${size}px` }"
        tabindex="0"
        aria-label="Photo position. Use arrow keys to move and plus or minus to zoom."
        @pointerdown.prevent="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @wheel.prevent="wheelZoom"
        @keydown="keyMove"
      >
        <img
          v-if="image"
          :src="src"
          alt=""
          class="crop-image"
          :style="imageStyle"
          draggable="false"
        />
        <div class="crop-frame" aria-hidden="true"></div>
      </div>
      <div v-if="!error" class="crop-zoom">
        <span aria-hidden="true">−</span>
        <input
          type="range"
          class="form-range"
          min="1"
          :max="MAX_ZOOM"
          step="0.01"
          :value="zoom"
          aria-label="Zoom"
          :disabled="!image"
          @input="setZoom(Number($event.target.value))"
        />
        <span aria-hidden="true">+</span>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-outline-secondary flex-fill" @click="emit('cancel')">
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-success flex-fill"
          :disabled="!image || Boolean(error)"
          @click="save"
        >
          Save photo
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.crop-card {
  max-width: 340px;
  text-align: center;
}
.crop-viewport {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 12px;
  background: #1d2b23;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.crop-viewport:active {
  cursor: grabbing;
}
.crop-viewport:focus-visible {
  outline: 3px solid rgba(25, 135, 84, 0.45);
  outline-offset: 3px;
}
.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  transform-origin: 0 0;
  pointer-events: none;
}
/* The round profile frame; everything outside it is dimmed. */
.crop-frame {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 0 999px rgba(16, 24, 20, 0.55);
  pointer-events: none;
}
.crop-zoom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  color: #5c6b63;
  font-weight: 700;
}
</style>
