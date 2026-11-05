<template>
  <div class="it" @pointerenter="startSpin" @pointerleave="stopSpin" @pointercancel="stopSpin">
    <!-- the still picture: hidden while the appliance is spinning -->
    <img v-if="still" v-show="!spinning" :src="still" alt="" class="still" draggable="false" />

    <!-- the spinning picture: only visible while the mouse is over the card -->
    <canvas ref="live" v-show="spinning" class="live" :width="THUMB_W" :height="THUMB_H"></canvas>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { THUMB_W, THUMB_H, getStillPicture, createSpinner } from '../utils/thumbnails.js'

const props = defineProps({
  type: { type: String, default: '' },
  category: { type: String, default: '' },
})

// ------------------------------------------------------------
// DATA
// ------------------------------------------------------------
const live = ref(null)
const still = ref('')
const spinning = ref(false)
let spinner = null
let frameId = 0
let startTime = 0

// Changes whenever the card should show a different appliance
const pictureKey = computed(() => props.category + ':' + props.type)

// ------------------------------------------------------------
// STILL PICTURE
// ------------------------------------------------------------
function loadStill() {
  still.value = getStillPicture(props.type, props.category) || ''
}

// ------------------------------------------------------------
// SPIN
// ------------------------------------------------------------
function startSpin() {
  if (spinning.value || !live.value) {
    return
  }

  spinner = createSpinner(props.type, props.category)
  if (!spinner) {
    return
  }

  spinning.value = true
  startTime = performance.now()
  const ctx = live.value.getContext('2d')

  function animate(now) {
    const seconds = (now - startTime) / 1000
    spinner.draw(seconds * 1.2, ctx)
    frameId = requestAnimationFrame(animate)
  }
  frameId = requestAnimationFrame(animate)
}

function stopSpin() {
  cancelAnimationFrame(frameId)
  frameId = 0

  if (spinner) {
    spinner.dispose()
    spinner = null
  }

  spinning.value = false
}

// ------------------------------------------------------------
// LIFECYCLE
// ------------------------------------------------------------
onMounted(() => {
  loadStill()
})

// If the card is reused for a different appliance, draw the new picture
watch(pictureKey, () => {
  stopSpin()
  loadStill()
})

// Clean up when the card is removed from the page
onUnmounted(() => {
  stopSpin()
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
