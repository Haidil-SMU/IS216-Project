<template>
  <div class="page-container d-flex flex-column">
    <div class="d-flex flex-grow-1 min-h-0 min-w-0">

      <main class="flex-grow-1 min-w-0 bg-light p-0 position-relative">
        <RoomCanvas :appliances="spawnedAppliances" />
      </main>

      <aside class="right-sidebar overflow-auto bg-dark text-white border-start p-3 d-flex flex-column justify-content-between">
        <div>
          <h5 class="fw-bold mb-1">Room Summary</h5>

          <div class="card bg-white border-0 shadow-sm p-3 mb-3">
            <div class="small text-uppercase text-muted fw-bold">Est. Total Energy</div>
            <div class="fs-4 fw-bold text-info">{{ totalKwhYear }} <span class="fs-6 text-muted">kWh/yr</span></div>

            <hr class="my-2">

            <div class="small text-uppercase text-muted fw-bold">Est. Annual Cost</div>
            <div class="fs-4 fw-bold text-success">${{ totalAnnualCost }} <span class="fs-6 text-muted">/yr</span></div>
          </div>

          <div class="fw-semibold small mb-2 d-flex justify-content-between align-items-center">
            <span>Items in Room ({{ spawnedAppliances.length }})</span>
            <button v-if="spawnedAppliances.length > 0" class="btn btn-link btn-sm text-danger text-decoration-none p-0" @click="clearAllAppliances">
              Clear All
            </button>
          </div>

          <ul class="list-group list-group-flush rounded shadow-sm overflow-hidden">
            <li v-for="item in spawnedAppliances" :key="item.id" class="list-group-item d-flex align-items-center justify-content-between px-2 py-2 small">
              <div class="text-truncate me-2">
                <div class="fw-bold text-truncate">{{ item.name }}</div>
                <div class="text-muted fs-7">
                  <span v-if="item.tick !== 'none'" class="badge bg-warning text-dark me-1">
                    {{ item.tick.replace('_tick', '✔') }}
                  </span>
                  <span>{{ item.kwhYear }} kWh/yr</span>
                </div>
              </div>
              <button class="btn btn-outline-danger btn-xs py-0 px-1 border-0" @click="removeAppliance(item.id)">
                ✕
              </button>
            </li>
          </ul>
        </div>
      </aside>

    </div>


    <footer class="bottom-sidebar border-top border-secondary flex-shrink-0">
      <AppliancesList @tab-changed="handleTabChange" @add-appliance="handleAddAppliance"/>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppliancesList from '../components/AppliancesList.vue'
import RoomCanvas from '../components/RoomCanvas.vue'

const activeCategory = ref('build')
const activeApplianceName = ref('Refrigerator')
const spawnedAppliances = ref([])

const handleTabChange = (data) => {
  activeCategory.value = data.tabId
  activeApplianceName.value = data.applianceName
}

const handleAddAppliance = (appliance) => {
  spawnedAppliances.value.push({
    ...appliance,
    id: Date.now() + Math.random()
  })
}

const removeAppliance = (id) => {
  spawnedAppliances.value = spawnedAppliances.value.filter(item => item.id !== id)
}

const clearAllAppliances = () => {
  spawnedAppliances.value = []
}

const totalKwhYear = computed(() => {
  return spawnedAppliances.value.reduce((sum, item) => sum + (item.kwhYear || 0), 0)
})

const totalAnnualCost = computed(() => {
  return spawnedAppliances.value.reduce((sum, item) => sum + (item.annualCost || 0), 0)
})
</script>

<style scoped>
.page-container {
  height: calc(100vh - 56px);
  height: calc(100dvh - 56px);
  width: 100%;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.right-sidebar {
  width: 320px;
  flex-shrink: 0;
}

.bottom-sidebar {
  height: 260px;
}

.min-h-0 {
  min-height: 0;
}

.min-w-0 {
  min-width: 0;
}

.fs-7 {
  font-size: 0.7rem;
}

.btn-xs {
  font-size: 0.75rem;
  line-height: 1;
}
</style>