<script setup>
defineProps({
  cost: Number,
  electricityRate: Number
})
</script>

<template>
  <div class="stat-card">
    <div class="stat-label">💳 ELECTRICITY COST</div>
    <div class="stat-number">
      S${{ cost.toFixed(2) }}
    </div>
    <div class="stat-foot">
      ESTIMATED ELECTRICITY RATE · S${{ electricityRate.toFixed(2) }}/kWh
    </div>
  </div>
</template>