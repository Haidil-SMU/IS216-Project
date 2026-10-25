<template>
  <div class="d-flex flex-column justify-content-between h-100 w-100 px-3 py-2 text-white overflow-hidden">
    <div class="d-flex align-items-center justify-content-between pb-1 border-bottom border-secondary flex-shrink-0">
      <ul class="nav nav-pills gap-1 flex-nowrap overflow-x-auto">
        <li v-for="tab in tabs" :key="tab.id" class="nav-item">
          <button 
            class="nav-link nav-link-sm py-1 px-3 text-capitalize fw-semibold text-nowrap"
            :class="{ 'active bg-success text-white': activeTab === tab.id, 'text-light': activeTab !== tab.id }"
            @click="selectTab(tab.id)"
          >
            {{ tab.icon }} {{ tab.label }}
          </button>
        </li>
      </ul>

      <span class="badge bg-success text-light small d-none d-lg-inline flex-shrink-0 ms-2">
        NEA Energy Benchmarks (SG)
      </span>
    </div>

    <div class="d-flex align-items-center flex-grow-1 min-h-0 py-1">
      <div class="d-flex gap-2 overflow-x-auto align-items-stretch w-100 py-1">
        <div 
          v-for="item in visibleApplianceTypes" 
          :key="item.typeKey"
          class="card bg-black text-white border-secondary p-2 text-center flex-shrink-0 shadow-sm d-flex flex-column justify-content-between"
          style="min-width: 165px; max-width: 165px;"
        >

          <Appliance3D :type="item.typeKey" :category="item.categoryKey" />

          <div class="fw-bold fs-7 text-truncate text-light my-1" :title="item.typeData.name">
            {{ item.typeData.name }}
          </div>

          <template v-if="item.categoryKey !== 'build'">

            <div class="d-flex justify-content-center gap-1 my-1" style="min-height: 20px;">
              <template v-if="hasTicks(item.typeData)">
                <button
                  v-for="(tickData, tickKey) in item.typeData.ticks"
                  :key="tickKey"
                  class="btn btn-xs py-0 px-1 border-0"
                  :class="selectedTicks[item.typeKey] === tickKey ? 'btn-warning text-dark fw-bold' : 'btn-outline-secondary text-white-50'"
                  style="font-size: 0.65rem;"
                  @click.stop="setTick(item.typeKey, tickKey)"
                >
                  {{ tickKey.replace('_tick', '✔').replace('standard', '✔') }}
                </button>
              </template>
            </div>

            <div class="lh-1 my-1">
              <div class="fw-bold text-info fs-7">
                {{ getKwhYear(item) }} 
                <span class="text-white-50" style="font-size: 0.65rem;">kWh/yr</span>
              </div>
              <div class="text-success fw-semibold" style="font-size: 0.65rem;">
                ~${{ Math.round(getKwhYear(item) * energyData.electricityTariff) }}/yr
              </div>
            </div>
          </template>

          <button 
            class="btn btn-sm btn-success w-100 py-0 fw-bold fs-7 mt-1"
            @click="handleAddAppliance(item)"
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import energyData from '../data/energyData.json'
import Appliance3D from './Appliance3D.vue'

const emit = defineEmits(['tab-changed', 'add-appliance'])

const tabs = [
  { id: 'build', label: 'Build'},
  { id: 'kitchen', label: 'Kitchen'},
  { id: 'living', label: 'Living'},
  { id: 'television', label: 'TV'},
  { id: 'laundry', label: 'Laundry'},
  { id: 'lights', label: 'Lights'},
  { id: 'fans', label: 'Fans'},
  { id: 'bathroom', label: 'Bathroom'},
  { id: 'home', label: 'Home & Office'}
]

const activeTab = ref('kitchen')
const selectedTicks = ref({})

const visibleApplianceTypes = computed(() => {
  const result = []
  Object.entries(energyData.categories).forEach(([categoryKey, categoryData]) => {
    if (activeTab.value === 'all' || activeTab.value === categoryKey) {
      if (categoryData.types) {
        Object.entries(categoryData.types).forEach(([typeKey, typeData]) => {
          result.push({ categoryKey, typeKey, typeData })
        })
      }
    }
  })
  return result
})

const hasTicks = (typeData) => {
  return typeData.ticks && Object.keys(typeData.ticks).length > 0
}

const getKwhYear = (item) => {
  const ticksMap = item.typeData.ticks
  if (ticksMap && Object.keys(ticksMap).length > 0) {
    const availableTickKeys = Object.keys(ticksMap)
    const currentTickKey = selectedTicks.value[item.typeKey] || availableTickKeys[0]
    return ticksMap[currentTickKey]?.kwhYear || 0
  }
  return item.typeData.kwhYear || 0
}

const setTick = (typeKey, tickKey) => {
  selectedTicks.value[typeKey] = tickKey
}

const selectTab = (tabId) => {
  activeTab.value = tabId
  const currentCategory = energyData.categories[tabId] || energyData.categories.kitchen
  emit('tab-changed', {
    tabId,
    applianceName: currentCategory.name
  })
}

const handleAddAppliance = (item) => {
  const isBuild = item.categoryKey === 'build'
  const kwh = isBuild ? 0 : getKwhYear(item)
  const ticksMap = item.typeData.ticks || {}
  const activeTickKey = !isBuild && hasTicks(item.typeData) 
    ? (selectedTicks.value[item.typeKey] || Object.keys(ticksMap)[0]) 
    : 'none'

  emit('add-appliance', {
    category: item.categoryKey,
    type: item.typeKey,
    name: item.typeData.name,
    tick: activeTickKey,
    kwhYear: kwh,
    annualCost: isBuild ? 0 : Math.round(kwh * energyData.electricityTariff)
  })
}
</script>

<style scoped>
.nav-link-sm {
  font-size: 0.85rem;
  border-radius: 6px;
  transition: all 0.2s ease-in-out;
}

.nav-link:not(.active):hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.btn-xs {
  line-height: 1.2;
}

.overflow-x-auto::-webkit-scrollbar {
  height: 4px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.min-h-0 {
  min-height: 0;
}

.fs-7 {
  font-size: 0.7rem;
}
</style>