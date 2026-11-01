<script setup>
defineProps({
  energy: Number,
  currentPower: Number
})
</script>

<template>
  <div class="stat-card">
    <div class="stat-label">⚡ ENERGY USED</div>
    <div class="stat-number">
      {{ energy.toFixed(3) }} <small>kWh</small>
    </div>
    <div class="stat-foot">
      SIMULATED POWER {{ currentPower.toFixed(3) }} kW
    </div>
  </div>
</template>