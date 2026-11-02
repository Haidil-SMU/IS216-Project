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

<style scoped>
.stat-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 12px 35px #1a69421c;
  backdrop-filter: blur(16px);
  transition: background 2s ease, border-color 2s ease, box-shadow .3s;
  padding: 18px;
  min-height: 137px;
  color: var(--ink);
}

.stat-card:hover {
  box-shadow: 0 14px 32px #235c4129;
}

.stat-label {
  font-size: 11px;
  letter-spacing: 1.1px;
  color: var(--muted);
  font-weight: 750;
}

.stat-number {
  font-size: 29px;
  font-weight: 900;
  margin: 18px 0 10px;
}

.stat-number small {
  font-size: 13px;
  color: var(--muted);
}

.stat-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  font-size: 9px;
  letter-spacing: 1.1px;
  color: var(--muted);
  font-weight: 750;
}

@media (max-width: 780px) {
  .stat-card { padding: 13px; }
}

@media (max-width: 450px) {
  .stat-number { font-size: 24px; }
}
</style>