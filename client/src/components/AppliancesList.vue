<template>
  <div class="catalogue d-flex flex-column h-100 w-100">
    <div class="d-flex align-items-center justify-content-between gap-2 px-2 px-sm-3 pt-2 pb-1 flex-shrink-0">
      <ul class="cat-tabs nav gap-1 flex-nowrap overflow-x-auto mb-0 flex-grow-1">
        <li v-for="tab in tabs" :key="tab.id" class="nav-item">
          <button
            type="button"
            class="cat-tab text-nowrap"
            :class="{ active: activeTab === tab.id }"
            @click="selectTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </li>
      </ul>
      <span class="source-chip d-none d-xl-inline flex-shrink-0">NEA energy benchmarks (SG)</span>
    </div>

    <div class="flex-grow-1 min-h-0 px-2 px-sm-3 pb-2">
      <div class="card-row d-flex gap-2 overflow-x-auto overflow-y-hidden align-items-stretch h-100">
        <template v-for="group in visibleGroups" :key="group.name">
          <div v-if="visibleGroups.length > 1" class="group-label flex-shrink-0 d-none d-sm-block" :title="group.name">{{ group.name }}</div>

          <div
            v-for="item in group.items"
            :key="item.typeKey"
            class="item-card flex-shrink-0"
            :class="{ open: openKey === item.typeKey }"
            tabindex="0"
            @click="toggleOpen(item.typeKey)"
          >

            <div class="face">
              <Appliance3D :type="item.typeKey" :category="item.categoryKey" />
              <div class="face-name name-clamp">{{ item.typeData.name }}</div>
            </div>

            <span v-if="ticksOf(item)" class="ticks" :title="`${ticksOf(item)} energy-label ${ticksOf(item) === 1 ? 'tick' : 'ticks'}`">
              <svg v-for="n in ticksOf(item)" :key="n" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                <path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="visually-hidden">{{ ticksOf(item) }} ticks</span>
            </span>

            <div class="details" @click.stop>
              <div class="details-name text-truncate" :title="item.typeData.name">{{ shortName(item.typeData) }}</div>

              <template v-if="item.categoryKey !== 'build'">
                <select
                  class="form-select form-select-sm brand-select"
                  :value="productOf(item).brand"
                  :aria-label="`Brand for ${item.typeData.name}`"
                  @change="setBrand(item.typeKey, $event.target.value)"
                >
                  <option v-for="p in item.typeData.products" :key="p.brand" :value="p.brand">{{ brandLabel(p) }}</option>
                </select>
                <div class="details-figures">
                  <div class="kwh">{{ getKwhYear(item) }}<small> kWh/yr</small></div>
                  <div class="cost">
                    ~${{ Math.round(getKwhYear(item) * tariff) }}/yr<template v-if="productOf(item).priceSgd != null"><span class="sep"> · </span><span class="price">S${{ productOf(item).priceSgd.toLocaleString() }}</span></template>
                  </div>
                </div>
              </template>

              <button type="button" class="btn btn-sm add-btn mt-auto" @click="handleAddAppliance(item)">+ Add</button>
            </div>
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

const tabs = computed(() => Object.entries(catalogue.categories).map(([id, c]) => ({ id, label: c.name })))

const activeTab = ref('kitchen')
const selectedBrands = ref({})

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

const productOf = (item) => {
  const list = item.typeData.products
  return list?.find((p) => p.brand === selectedBrands.value[item.typeKey]) ?? list?.[0]
}

const shortName = (type) => {
  const base = (type.shortName || type.name || '').split(/\s+[(\u2013\u2014-]\s*|\s*\(|,/)[0].trim()
  if (base.length <= 24) return base
  const cut = base.slice(0, 24), space = cut.lastIndexOf(' ')
  return (space > 8 ? cut.slice(0, space) : cut).trimEnd() + '\u2026'
}

const brandLabel = (p) => (p.ticks ? `${p.brand} · ${p.ticks} ${p.ticks === 1 ? 'tick' : 'ticks'}` : p.brand)

const ticksOf = (item) => Math.max(0, Math.min(5, Number(productOf(item)?.ticks) || 0))

const openKey = ref(null)
const canHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches
const toggleOpen = (key) => {
  if (canHover()) return
  openKey.value = openKey.value === key ? null : key
}

const setBrand = (typeKey, brand) => {
  selectedBrands.value[typeKey] = brand
}

const getKwhYear = (item) => (productOf(item) ? productOf(item).kwhYear : item.typeData.kwhYear || 0)

const selectTab = (tabId) => {
  activeTab.value = tabId
  const currentCategory = catalogue.categories[tabId]
  emit('tab-changed', {
    tabId,
    applianceName: currentCategory?.name
  })
}

const handleAddAppliance = (item) => {
  const build = isBuild(item.categoryKey)
  const product = build ? null : productOf(item)
  const kwhYear = build ? 0 : getKwhYear(item)

  emit('add-appliance', {
    applianceTypeKey: item.typeKey,
    category: item.categoryKey,
    name: item.typeData.name,
    ...(product ? { brand: product.brand, model: product.model } : {}),
    kwhYear,
    annualCost: Math.round(kwhYear * tariff)
  })
}
</script>

<style scoped>
.min-h-0 { min-height: 0; }
.catalogue { background: #fff; color: #19352a; }

/* Category tabs: same green pill as the tabs on My Profile */
.cat-tabs { scrollbar-width: none; }
.cat-tabs::-webkit-scrollbar { display: none; }
.cat-tab {
  padding: 5px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #485950;
  font-size: 0.82rem;
  font-weight: 600;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.cat-tab:not(.active):hover { background: #eaf7ee; color: #168b59; }
.cat-tab.active { background: linear-gradient(135deg, #198754, #2fbf71); color: #fff; box-shadow: 0 6px 14px -8px rgba(25, 135, 84, 0.7); }
.cat-tab:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }
.source-chip { padding: 3px 10px; border-radius: 999px; background: #f4faf6; border: 1px solid #dcebe1; color: #5d6f65; font-size: 0.7rem; font-weight: 600; }

/* Cards: a fixed, compact tile. Everything but the model is tucked into .details */
.card-row {
  padding: 2px 2px 6px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.item-card {
  position: relative;
  flex: 0 0 auto;
  width: clamp(112px, 22vw, 140px);
  border: 1px solid #dcebe1;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
  cursor: pointer;
  scroll-snap-align: start;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.item-card:hover,
.item-card:focus-within,
.item-card.open { border-color: #6fc28f; box-shadow: 0 14px 24px -14px rgba(16, 40, 28, 0.6); transform: translateY(-2px); }
.item-card:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }

.face { display: flex; flex-direction: column; height: 100%; padding: 6px 6px 8px; }
.face :deep(.it) { flex: 1 1 auto; height: auto; min-height: 70px; border-radius: 10px; background: radial-gradient(circle at 50% 35%, #ffffff, #eaf5ee 85%); }
.face-name { margin-top: 6px; text-align: center; font-size: 0.74rem; font-weight: 650; color: #264c3b; }

.name-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.15;
}
.face-name.name-clamp { min-height: 2.3em; }

/* Green energy-label ticks, top-right corner */
.ticks {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #e3f6ea;
  border: 1px solid #b9e3c8;
  color: #12a150;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.item-card:hover .ticks,
.item-card:focus-within .ticks,
.item-card.open .ticks { opacity: 0; }

/* Hover / focus / tap details cover the card */
.details {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  overflow-y: auto;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.98);
  text-align: center;
  opacity: 0;
  visibility: hidden;
  transform: translateY(6px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0.15s;
}
@media (hover: hover) {
  .item-card:hover .details { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
}
.item-card:focus-within .details,
.item-card.open .details { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }

.details-name { font-size: 0.8rem; font-weight: 700; color: #19352a; }
.brand-select { padding: 1px 6px; font-size: 0.72rem; border-color: #dcebe1; color: #264c3b; background-color: #f9fcfa; }
.brand-select:focus { border-color: #168b59; box-shadow: 0 0 0 0.2rem rgba(25, 135, 84, 0.2); }
.details-figures { margin: 2px 0 4px; line-height: 1.25; }
.kwh { font-size: 0.9rem; font-weight: 750; color: #116a42; }
.kwh small { font-size: 0.65rem; font-weight: 500; color: #75817b; }
.cost { font-size: 0.7rem; font-weight: 600; color: #168b59; white-space: nowrap; }
.cost .sep, .cost .price { color: #75817b; font-weight: 500; }

.add-btn { padding: 3px 0; background: #168a56; border-color: #168a56; color: #fff; font-size: 0.76rem; font-weight: 700; }
.add-btn:hover, .add-btn:focus-visible { background: #116a42; border-color: #116a42; color: #fff; }

.group-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  align-self: stretch;
  max-height: 100%;
  padding: 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: #75817b;
  border-right: 2px solid #dcebe1;
}

.overflow-x-auto::-webkit-scrollbar { height: 6px; }
.overflow-x-auto::-webkit-scrollbar-track { background: #f1f6f3; border-radius: 6px; }
.overflow-x-auto::-webkit-scrollbar-thumb { background: #bcd6c6; border-radius: 6px; }

@media (max-width: 575px) {
  .cat-tab { padding: 4px 11px; font-size: 0.78rem; }
}
@media (prefers-reduced-motion: reduce) {
  .details, .ticks, .item-card { transition: none; transform: none; }
}
</style>
