<!--
  AppliancesList.vue
  The catalogue at the bottom of the 3D page: category tabs and a scrolling row of cards.
  Hover over (or tap) a card to choose a brand and press "+ Add".

  Events it sends to its parent:
    tab-changed    { tabId, applianceName }    the user picked another category tab
    add-appliance  { applianceTypeKey, category, name, brand, model, kwhYear }
                   the user pressed "+ Add"

  The list of things to show comes from stores/catalog.js
-->
<template>
  <div class="catalogue d-flex flex-column h-100 w-100">
    <!-- CATEGORY TABS -->
    <div class="d-flex align-items-center justify-content-between gap-2 px-2 px-sm-3 pt-2 pb-1 flex-shrink-0">
      <ul class="cat-tabs nav gap-2 flex-nowrap overflow-x-auto mb-0 flex-grow-1" aria-label="Appliance categories">
        <li v-for="tab in tabs" :key="tab.id" class="nav-item">
          <button
            type="button"
            class="cat-tab text-nowrap"
            :aria-pressed="activeTab === tab.id"
            :class="{ active: activeTab === tab.id }"
            @click="selectTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </li>
      </ul>
      <span class="source-chip d-none d-md-inline-flex flex-shrink-0" title="Yearly energy figures use the Singapore NEA energy benchmarks.">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/></svg>
        NEA energy benchmarks (SG)
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      </span>
    </div>

    <div class="row-wrap flex-grow-1 min-h-0 px-2 px-sm-3 pb-2">
      <!-- SCROLL ARROWS (only shown when there is more to scroll to) -->
      <button v-show="canScrollLeft" type="button" class="scroll-btn scroll-left" aria-label="Scroll left" @click="scrollRow(-1)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button v-show="canScrollRight" type="button" class="scroll-btn scroll-right" aria-label="Scroll right" @click="scrollRow(1)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      <!-- THE ROW OF CARDS -->
      <div ref="row" class="card-row d-flex gap-3 overflow-x-auto overflow-y-hidden align-items-stretch h-100" @scroll="measureRow">
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
            <!-- front of the card: picture and name -->
            <div class="face">
              <Appliance3D :type="item.typeKey" :category="item.categoryKey" />
              <div class="face-name name-clamp">{{ item.typeData.name }}</div>
            </div>

            <!-- energy label ticks -->
            <span v-if="ticksOf(item)" class="ticks" :title="ticksText(item)">
              <svg v-for="n in ticksOf(item)" :key="n" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                <path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="visually-hidden">{{ ticksOf(item) }} ticks</span>
            </span>

            <!-- back of the card: brand, energy use, price and the Add button -->
            <div class="details" @click="stopClick($event)">
              <div class="details-name name-clamp" :title="item.typeData.name">{{ shortName(item.typeData) }}</div>

              <template v-if="item.categoryKey !== 'build'">
                <select
                  class="form-select form-select-sm brand-select"
                  :value="productOf(item).brand"
                  :title="brandLabel(productOf(item))"
                  :aria-label="'Brand for ' + item.typeData.name"
                  @change="setBrand(item.typeKey, $event.target.value)"
                >
                  <option v-for="p in item.typeData.products" :key="p.brand" :value="p.brand">{{ brandLabel(p) }}</option>
                </select>
                <div class="details-figures">
                  <div class="kwh">{{ getKwhYear(item) }}<small> kWh/yr</small></div>
                  <div class="cost">
                    <span v-if="productOf(item).priceSgd != null" class="price">S${{ productOf(item).priceSgd.toLocaleString() }}</span>
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
import { ref, computed, onMounted, onUpdated, onUnmounted } from 'vue'
import Appliance3D from './Appliance3D.vue'
import { isBuild, catalogue, shortNameOf } from '../stores/catalog.js'

const emit = defineEmits(['tab-changed', 'add-appliance'])

// ------------------------------------------------------------
// DATA
// ------------------------------------------------------------
const activeTab = ref('kitchen')    // the category tab that is open
const selectedBrands = ref({})      // the brand picked for each type, e.g. { fridge: 'Samsung' }
const openKey = ref(null)           // the card that is flipped open (touch screens only)

const row = ref(null)               // the scrolling row of cards (an HTML element)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

const HOVER_NAME_MAX = 22           // longest name shown on the back of a card

// ------------------------------------------------------------
// TABS AND CARDS
// ------------------------------------------------------------

// One tab for every category in the catalogue
const tabs = computed(() => {
  const list = []
  for (const id in catalogue.categories) {
    list.push({ id: id, label: catalogue.categories[id].name })
  }
  return list
})

// The cards of the open tab, split into groups.
// Looks like: [ { name: 'Kitchen', items: [ { categoryKey, typeKey, typeData }, ... ] } ]
const visibleGroups = computed(() => {
  const groups = []
  const category = catalogue.categories[activeTab.value]
  if (!category) {
    return groups
  }

  for (const typeKey in category.types) {
    const typeData = category.types[typeKey]
    const groupName = typeData.group || category.name

    // find the group with this name, or make a new one
    let group = null
    for (const g of groups) {
      if (g.name === groupName) {
        group = g
      }
    }
    if (!group) {
      group = { name: groupName, items: [] }
      groups.push(group)
    }

    group.items.push({ categoryKey: activeTab.value, typeKey: typeKey, typeData: typeData })
  }

  return groups
})

function selectTab(tabId) {
  activeTab.value = tabId
  if (row.value) {
    row.value.scrollLeft = 0   // go back to the start of the row
  }

  const category = catalogue.categories[tabId]
  let categoryName = undefined
  if (category) {
    categoryName = category.name
  }
  emit('tab-changed', { tabId: tabId, applianceName: categoryName })
}

// ------------------------------------------------------------
// PRODUCT, BRAND, ENERGY
// ------------------------------------------------------------

// The product (brand + model) chosen for a card. The first product is the default.
function productOf(item) {
  const list = item.typeData.products
  if (!list || list.length === 0) {
    return undefined
  }

  const chosenBrand = selectedBrands.value[item.typeKey]
  for (const product of list) {
    if (product.brand === chosenBrand) {
      return product
    }
  }
  return list[0]
}

function setBrand(typeKey, brand) {
  selectedBrands.value[typeKey] = brand
}

function shortName(type) {
  return shortNameOf(type, HOVER_NAME_MAX)
}

// e.g. "Samsung (3 ticks)"
function brandLabel(product) {
  if (!product) {
    return ''
  }
  if (product.ticks) {
    let word = 'ticks'
    if (product.ticks === 1) {
      word = 'tick'
    }
    return product.brand + ' (' + product.ticks + ' ' + word + ')'
  }
  return product.brand || ''
}

// Number of energy-label ticks, from 0 to 5
function ticksOf(item) {
  const product = productOf(item)
  if (!product) {
    return 0
  }
  const ticks = Number(product.ticks) || 0
  return Math.max(0, Math.min(5, ticks))
}

// e.g. "3 energy-label ticks"
function ticksText(item) {
  const count = ticksOf(item)
  let word = 'ticks'
  if (count === 1) {
    word = 'tick'
  }
  return count + ' energy-label ' + word
}

// Energy use of the chosen product in kWh per year
function getKwhYear(item) {
  const product = productOf(item)
  if (product) {
    return product.kwhYear
  }
  return item.typeData.kwhYear || 0
}

// ------------------------------------------------------------
// ADD BUTTON
// ------------------------------------------------------------
function handleAddAppliance(item) {
  const build = isBuild(item.categoryKey)

  const data = {
    applianceTypeKey: item.typeKey,
    category: item.categoryKey,
    name: item.typeData.name,
    kwhYear: 0,
  }

  // doors, windows and counters have no brand and no energy use
  if (!build) {
    const product = productOf(item)
    if (product) {
      data.brand = product.brand
      data.model = product.model
    }
    data.kwhYear = getKwhYear(item)
  }

  emit('add-appliance', data)
}

// ------------------------------------------------------------
// CARDS ON TOUCH SCREENS
// ------------------------------------------------------------

// On a touch screen there is no hover, so a tap flips the card open or closed.
// (With a mouse, the CSS :hover rule flips it.)
function toggleOpen(key) {
  const hasHover = window.matchMedia('(hover: hover)').matches
  if (hasHover) {
    return
  }

  if (openKey.value === key) {
    openKey.value = null
  } else {
    openKey.value = key
  }
}

// Clicks on the back of a card should not flip the card, so stop them from reaching it.
function stopClick(event) {
  event.stopPropagation()
}

// ------------------------------------------------------------
// SCROLL ARROWS
// ------------------------------------------------------------

// Work out if there is more to scroll to on the left or on the right
function measureRow() {
  const el = row.value
  if (!el) {
    return
  }
  canScrollLeft.value = el.scrollLeft > 4
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}

// Scroll the row left (-1) or right (1) by most of its width
function scrollRow(direction) {
  const el = row.value
  if (!el) {
    return
  }

  // people who prefer less motion get an instant jump instead of a smooth scroll
  let behavior = 'smooth'
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    behavior = 'auto'
  }
  el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: behavior })
}

// ------------------------------------------------------------
// LIFECYCLE
// ------------------------------------------------------------
onMounted(() => {
  measureRow()
  window.addEventListener('resize', measureRow)
})

// After the cards change (a new tab, or the catalogue finished loading), measure again
onUpdated(() => {
  measureRow()
})

onUnmounted(() => {
  window.removeEventListener('resize', measureRow)
})
</script>

<style scoped>
.min-h-0 { min-height: 0; }
.catalogue { background: #fff; color: #19352a; }

.cat-tabs { scrollbar-width: none; padding: 2px; }
.cat-tabs::-webkit-scrollbar { display: none; }
.cat-tab {
  padding: 6px 16px;
  border: 1px solid #e3ece6;
  border-radius: 999px;
  background: #fff;
  color: #35604d;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 6px 14px -12px rgba(16, 40, 28, 0.5);
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.cat-tab:not(.active):hover { background: #eaf7ee; border-color: #bfe3cd; color: #116a42; }
.cat-tab.active { border-color: transparent; background: linear-gradient(135deg, #198754, #2fbf71); color: #fff; box-shadow: 0 8px 16px -10px rgba(25, 135, 84, 0.8); }
.cat-tab:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }
.source-chip {
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: #eaf7ee;
  border: 1px solid #cfe9d8;
  color: #116a42;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: help;
}

.row-wrap { position: relative; }
.card-row {
  padding: 4px 4px 8px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.item-card {
  position: relative;
  flex: 0 0 auto;
  width: clamp(112px, 22vw, 140px);
  border: 1px solid #e8efea;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 18px -14px rgba(16, 40, 28, 0.5);
  overflow: hidden;
  cursor: pointer;
  scroll-snap-align: start;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.item-card:hover,
.item-card:focus-within,
.item-card.open { border-color: #6fc28f; box-shadow: 0 14px 24px -14px rgba(16, 40, 28, 0.6); transform: translateY(-2px); }
.item-card:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }

.face { display: flex; flex-direction: column; height: 100%; padding: 7px 7px 9px; }
.face :deep(.it) { flex: 1 1 auto; height: auto; min-height: 70px; border-radius: 12px; background: #f4f6f5; }
.face-name { margin-top: 7px; text-align: center; font-size: 0.76rem; font-weight: 650; color: #264c3b; }

.name-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.15;
}
.face-name.name-clamp { min-height: 2.3em; }

.scroll-btn {
  position: absolute;
  top: 50%;
  z-index: 5;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  transform: translateY(-50%);
  border: 1px solid #e3ece6;
  border-radius: 50%;
  background: #fff;
  color: #19352a;
  box-shadow: 0 8px 18px -8px rgba(16, 40, 28, 0.5);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.scroll-btn:hover { background: #eaf7ee; color: #116a42; }
.scroll-btn:focus-visible { outline: 3px solid rgba(25, 135, 84, 0.45); outline-offset: 2px; }
.scroll-left { left: 6px; }
.scroll-right { right: 6px; }

.ticks {
  position: absolute;
  top: 10px;
  right: 10px;
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

.details {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 7px;
  overflow: hidden;
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

.details-name { flex-shrink: 0; font-size: 0.78rem; font-weight: 700; line-height: 1.2; color: #19352a; overflow-wrap: anywhere; }
.details-name.name-clamp { -webkit-line-clamp: 2; line-clamp: 2; }

.brand-select {
  width: 100%;
  padding: 2px 20px 2px 7px;
  font-size: 0.72rem;
  text-overflow: ellipsis;
  border-color: #dcebe1;
  color: #264c3b;
  background-color: #f9fcfa;
  background-position: right 6px center;
  background-size: 11px 9px;
}
.brand-select:focus { border-color: #168b59; box-shadow: 0 0 0 0.2rem rgba(25, 135, 84, 0.2); }
.details-figures { margin: 1px 0 2px; line-height: 1.2; }
.kwh { font-size: 0.9rem; font-weight: 750; color: #116a42; }
.kwh small { font-size: 0.65rem; font-weight: 500; color: #75817b; }
.cost { font-size: 0.7rem; font-weight: 600; color: #168b59; white-space: nowrap; }
.cost .price { color: #75817b; font-weight: 500; }

.add-btn { flex-shrink: 0; position: relative; z-index: 1; padding: 4px 0; border-radius: 999px; background: #168a56; border-color: #168a56; color: #fff; font-size: 0.76rem; font-weight: 700; }
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
  .cat-tab { padding: 5px 12px; font-size: 0.78rem; }
  .scroll-btn { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .details, .ticks, .item-card { transition: none; transform: none; }
}
</style>
