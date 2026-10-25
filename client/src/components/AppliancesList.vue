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
            {{ tab.label }}
          </button>
        </li>
      </ul>

      <span class="badge bg-success text-light small d-none d-lg-inline flex-shrink-0 ms-2">
        NEA Energy Benchmarks (SG)
      </span>
    </div>

    <div class="d-flex align-items-center flex-grow-1 min-h-0 py-1">
      <div class="d-flex gap-2 overflow-x-auto align-items-stretch w-100 py-1">
        <template v-for="group in visibleGroups" :key="group.name">
        <div class="group-label flex-shrink-0 text-uppercase fw-semibold text-white-50" :title="group.name">{{ group.name }}</div>
        <div
          v-for="item in group.items"
          :key="item.typeKey"
          class="card bg-black text-white border-secondary p-2 text-center flex-shrink-0 shadow-sm d-flex flex-column justify-content-between"
          style="min-width: 165px; max-width: 165px;"
        >

          <Appliance3D :type="item.typeKey" :category="item.categoryKey" />

          <div class="fw-bold fs-7 text-light my-1 name-clamp" :title="item.typeData.name">
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
                ~${{ Math.round(getKwhYear(item) * tariff) }}/yr
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
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Appliance3D from './Appliance3D.vue'
import { isBuild, catalogue, tariff } from '../stores/catalog.js'

const emit = defineEmits(['tab-changed', 'add-appliance'])

// One tab per catalogue category (build, kitchen, cooling...). Inside a tab, appliances are
// grouped by their `group` (Refrigerators, Cooking, Fans...) so similar things sit together.
const tabs = Object.entries(catalogue.categories).map(([id, c]) => ({ id, label: c.name }))

const activeTab = ref(tabs.some((t) => t.id === 'kitchen') ? 'kitchen' : tabs[0].id)
const selectedTicks = ref({})

const visibleGroups = computed(() => {
  const groups = new Map()
  const category = catalogue.categories[activeTab.value]
  for (const [typeKey, typeData] of Object.entries(category?.types ?? {})) {
    const name = typeData.group || category.name
    if (!groups.has(name)) groups.set(name, { name, items: [] })
    groups.get(name).items.push({ categoryKey: activeTab.value, typeKey, typeData })
  }
  return [...groups.values()]
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
  const currentCategory = catalogue.categories[tabId] || catalogue.categories.kitchen
  emit('tab-changed', {
    tabId,
    applianceName: currentCategory.name
  })
}

const handleAddAppliance = (item) => {
  const build = isBuild(item.categoryKey)
  // Builds (doors, windows, countertops) have no efficiency rating and use no electricity.
  const tick = !build && hasTicks(item.typeData) ? (selectedTicks.value[item.typeKey] || Object.keys(item.typeData.ticks)[0]) : null
  const kwhYear = build ? 0 : getKwhYear(item)

  emit('add-appliance', {
    applianceTypeKey: item.typeKey,
    category: item.categoryKey,
    name: item.typeData.name,
    tick,
    kwhYear,
    annualCost: Math.round(kwhYear * tariff)
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

.name-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
  line-height: 1.2;
}

.group-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  max-height: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  align-self: stretch;
  text-align: center;
  padding: 2px 0;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
  margin-left: 2px;
}

.min-h-0 {
  min-height: 0;
}

.fs-7 {
  font-size: 0.7rem;
}
</style>