<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SimulatorEnergy from './SimulatorEnergy.vue'
import SimulatorCost from './SimulatorCost.vue'
import { effectivePower } from '@/tests/effectivePower'
import axios from 'axios'


const householdId = ref('')
const rooms = ref([])
const catalogue = ref([])
const missingCatalogueKeys = ref([])
const selectedRoomId = ref('')
const settingsApplianceId = ref('')
const loading = ref(false)
const error = ref('')
const playing = ref(false)
const finished = ref(false)
const minute = ref(480)
const energy = ref(0)
const cost = ref(0)
// Only show electricity plans saved for the current household.
const savedPlans = ref([])
const selectedPlanId = ref('')
const plansError = ref('')

const selectedPlan = computed(() => {
  return savedPlans.value.find(saved => saved.id === selectedPlanId.value)
})

const electricityRate = computed(() => {
  if (!selectedPlan.value) return 0
  return Number(selectedPlan.value.retailer?.rate ?? selectedPlan.value.tariff)
})

async function loadSavedPlans() {
  savedPlans.value = []
  selectedPlanId.value = ''
  plansError.value = ''

  try {
    const response = await axios.get('/api/planner')
    const plans = response.data.plans || []
    const households = response.data.users || []

    // EnergyPlanner uses the household's id (UUID) for its saved plans.
    // Simulator may receive the MongoDB _id instead, so find the same household.
    const household = households.find(user =>
      user.id === householdId.value ||
      String(user._id?.$oid || user._id) === String(householdId.value)
    ) || households[0]

    const plannerHouseholdId = household?.id || householdId.value
    savedPlans.value = plans.filter(saved => saved.householdId === plannerHouseholdId)

    // Automatically use the first saved plan, but allow the user to change it.
    selectedPlanId.value = savedPlans.value[0]?.id || ''
    changePlan()
  } catch {
    plansError.value = 'Unable to load your saved plans. Please retry.'
  }
}

function changePlan() {
  // Recalculate existing simulated cost at the newly selected plan's rate.
  cost.value = energy.value * electricityRate.value
}
const gameSpeed = 2800 // Wait 1.8 real seconds between 10-minute game ticks

// Each situation lasts 3 game hours, from 8 AM until 11 PM.
const currentSituation = ref(null)
const periodIndex = ref(0)
const missions = ref([])
const goalHistory = ref([])
const toast = ref('')
let timer = null
let toastTimer = null

// These are the actual electrical categories in the updated catalogue_items JSON.
const allowedCategories = ['kitchen', 'cooling', 'entertainment', 'laundry', 'lighting', 'bathroom']

// Older 3D placements sometimes use typeKeys from the earlier catalogue.
// Match those keys to the corresponding updated catalogue type where possible.
const oldTypeKeys = {
  single_split: 'aircon_single_split',
  system_2: 'aircon_single_split',
  system_3: 'aircon_single_split',
  system_4: 'aircon_single_split',
  window: 'aircon_window',
  casement: 'aircon_casement',
  portable: 'aircon_portable',
  vrf: 'aircon_single_split',
  '43_inch': 'tv_43_inch_wall_mounted',
  '55_inch': 'tv_55_inch_wall_mounted',
  '65_inch': 'tv_65_inch_wall_mounted',
  vented: 'dryer_vented',
  condenser: 'dryer_condenser',
  condensor: 'dryer_condenser',
  heat_pump: 'dryer_heat_pump',
  led_10w: 'light_led_10w',
  led_15w: 'light_led_15w',
  cfl: 'light_cfl',
  linear_led: 'light_linear_led',
  fluorescent_tube: 'light_fluorescent_tube'
}


function getCatalogueItem(key) {
  let lookupKey = oldTypeKeys[key] || key

  if (
    key.includes('aircon_multi_split_') ||
    key.includes('aircon_single_split_')
  ) {
    lookupKey = 'aircon_single_split'
  }

  if (
    (key.includes('condenser') || key.includes('condensor')) &&
    key.includes('dryer')
  ) {
    lookupKey = 'dryer_condenser'
  }

  return catalogue.value.find(item => item.typeKey === lookupKey)
}


// A placement identifies a 3D appliance type and a selected efficiency tick.
// It only identifies a specific product when a product model is saved with it.
function getEnergyDetails(details, placement) {
  const products = details.products || []
  const requestedModel = String(placement.productModel || placement.product?.model || placement.model || '').trim().toLowerCase()
  const requestedBrand = String(placement.productBrand || placement.product?.brand || '').trim().toLowerCase()

  if (requestedModel) {
    const chosenProduct = products.find(product =>
      String(product.model || '').trim().toLowerCase() === requestedModel &&
      (!requestedBrand || String(product.brand || '').trim().toLowerCase() === requestedBrand)
    )
    if (chosenProduct && chosenProduct.kwhYear != null && Number(chosenProduct.kwhYear) > 0) {
      return {
        annualKwh: Number(chosenProduct.kwhYear),
        energySource: 'Selected model',
        productName: chosenProduct.brand + ' ' + chosenProduct.model,
        genericEstimate: !chosenProduct.energyVerified
      }
    }
  }

  // A selected 3D efficiency tick may match one or more product examples.
  // Use their middle annual-kWh value as a reference, NOT a claim of owning a model.
  const selectedTick = Number(String(placement.tick || '').match(/\d+/)?.[0])
  if (selectedTick >= 1 && selectedTick <= 5) {
    const matches = products.filter(product =>
      Number(product.ticks) === selectedTick &&
      product.kwhYear != null &&
      Number(product.kwhYear) > 0
    )
    if (matches.length) {
      const verified = matches.filter(product => product.energyVerified === true)
      const examples = verified.length ? verified : matches
      const values = examples.map(product => Number(product.kwhYear)).sort((a, b) => a - b)
      return {
        annualKwh: values[Math.floor(values.length / 2)],
        energySource: selectedTick + '-tick product reference',
        productName: '',
        genericEstimate: !verified.length
      }
    }
  }

  // Product data is not automatically the user's actual model.
  // If no model/tick match is available, use the catalogue type's general estimate.
  if (details.kwhYear != null && Number(details.kwhYear) > 0) {
    return {
      annualKwh: Number(details.kwhYear),
      energySource: 'Catalogue type estimate',
      productName: '',
      genericEstimate: true
    }
  }

  return { annualKwh: null, energySource: 'Unknown', productName: '', genericEstimate: true }
}

// The updated products[] stores yearly kWh, not rated power in kW.
// Converting it to hourly power needs assumed typical operating hours.
// These are GAME assumptions, based on the catalogue descriptions where possible.
function typicalHoursPerYear(typeKey) {
  if (typeKey.startsWith('refrigerator') || typeKey === 'commercial_storage_refrigerator') return 365 * 24
  if (typeKey.startsWith('aircon')) return 365 * 8
  if (typeKey === 'ceiling_fan') return 365 * 8
  if (typeKey === 'stand_fan') return 365 * 6
  if (typeKey === 'air_purifier') return 365 * 12
  if (typeKey === 'dehumidifier') return 365 * 3.5
  if (typeKey.startsWith('tv_')) return 365 * 5
  if (typeKey === 'desktop_computer') return 365 * 4
  if (typeKey.startsWith('light_') || typeKey === 'floor_lamp') return 365 * 5
  if (typeKey === 'microwave_oven') return 365 * (20 / 60)
  if (typeKey === 'rice_cooker') return 365 * 0.75
  if (typeKey === 'air_fryer') return 365 * (25 / 60)
  if (typeKey === 'induction_cooker') return 365 * 0.5
  if (typeKey === 'electric_kettle') return 365 * (14 / 60)
  if (typeKey === 'toaster') return 365 * (8 / 60)
  if (typeKey === 'dishwasher') return 52 * 5 * 1.5 // Five cycles weekly, estimated 1.5 h/cycle
  if (typeKey.startsWith('washer_')) return 52 * 4 * 1.5 // Four loads weekly
  if (typeKey.startsWith('dryer_')) return 52 * 4 * 1.5 // Assumed four loads weekly
  if (typeKey === 'instant_water_heater') return 365 * 0.5 // Approximate shower heating time
  if (typeKey === 'storage_water_heater') return 365 * 24 // Standby consumption is included
  if (typeKey === 'exhaust_fan') return 365 * 1
  return 365 * 5 // General fallback, not a measured operating schedule
}

function prettyName(key) {
  let words = key.split('_')

  for (let i = 0; i < words.length; i++) {
    words[i] = words[i][0].toUpperCase() + words[i].slice(1)
  }

  return words.join(' ')
}
function iconFor(key) {
  const text = String(key).toLowerCase()
  if (text.includes('air') || text.includes('ac') || text.includes('system')) return '❄️'
  if (text.includes('fan')) return '🌀'
  if (text.includes('light') || text.includes('lamp') || text.includes('led')) return '💡'
  if (text.includes('fridge') || text.includes('refrigerator')) return '🧊'
  if (text.includes('tv') || text.includes('television') || text.includes('inch')) return '📺'
  if (text.includes('dryer') || text.includes('laundry')) return '🧺'
  if (text.includes('heater')) return '🚿'
  return '🔌'
}
// Only show settings appropriate for recognized electrical appliances.
// Settings are GENERAL GAME CONTROLS for a catalogue appliance type.
// The products[] data does not prove a particular brand/model supports every control.
function controlTypeFor(name, category, typeKey) {

  if (!typeKey) return ''

  if (typeKey.includes('aircon') || typeKey === 'single_split' ||
      typeKey.includes('system_') || typeKey === 'window' ||
      typeKey === 'casement' || typeKey === 'portable' ||
      typeKey === 'vrf') return 'aircon'

  if (typeKey === 'exhaust_fan') return 'exhaust'

  if (typeKey.includes('fan')) return 'fan'

  if (category === 'lighting' || typeKey.includes('light') ||
      typeKey.includes('lamp') || typeKey.includes('led') ||
      typeKey === 'cfl') return 'light'

  if (typeKey.includes('tv') || typeKey.includes('inch')) return 'tv'

  if (typeKey.includes('washer')) return 'washer'

  if (typeKey.includes('dryer') || typeKey === 'vented' ||
      typeKey === 'condenser' || typeKey === 'heat_pump') return 'dryer'

  if (typeKey.includes('water_heater')) return 'heater'

  if (typeKey.includes('refrigerator') || typeKey.includes('fridge')) return 'fridge'

  if (typeKey.includes('microwave')) return 'microwave'
  if (typeKey.includes('air_fryer')) return 'airfryer'
  if (typeKey.includes('oven')) return 'oven'

  if (typeKey === 'air_purifier') return 'purifier'
  if (typeKey === 'dehumidifier') return 'dehumidifier'
  if (typeKey === 'dishwasher') return 'dishwasher'
  if (typeKey === 'desktop_computer') return 'computer'
  if (typeKey === 'rice_cooker') return 'ricecooker'
  if (typeKey === 'induction_cooker') return 'induction'

  return ''
}
function defaultSetting(type) {
  if (type === 'aircon') return { temperature: 25, mode: 'Cool', speed: 'Auto' }
  if (type === 'fan') return { speed: '2', oscillation: 'On' }
  if (type === 'light') return { brightness: 100 }
  if (type === 'tv') return { picture: 'Normal' }
  if (type === 'washer') return { mode: 'Normal', water: 'Warm' }
  if (type === 'dryer' || type === 'dishwasher') return { mode: 'Normal' }
  if (type === 'heater') return { temperature: 45 }
  if (type === 'fridge') return { temperature: 4 }
  if (type === 'microwave' || type === 'induction') return { level: 'High' }
  if (type === 'airfryer' || type === 'oven') return { temperature: 180 }
  if (type === 'purifier') return { speed: 'Auto' }
  if (type === 'dehumidifier') return { humidity: 65 }
  if (type === 'computer') return { mode: 'Normal' }
  if (type === 'exhaust') return { speed: 'High' }
  if (type === 'ricecooker') return { mode: 'Cook' }
  return {}
}
function settingsDescription(item) {
  const setting = item.setting
  if (item.controlType === 'aircon') return `${setting.temperature}°C · ${setting.mode} · ${setting.speed}`
  if (item.controlType === 'fan') return `Speed ${setting.speed} · Oscillation ${setting.oscillation}`
  if (item.controlType === 'light') return `${setting.brightness}% brightness`
  if (item.controlType === 'tv') return `${setting.picture} picture`
  if (item.controlType === 'washer') return `${setting.mode} · ${setting.water} wash`
  if (['dryer', 'dishwasher', 'computer', 'ricecooker'].includes(item.controlType)) return `${setting.mode} mode`
  if (['heater', 'fridge', 'airfryer', 'oven'].includes(item.controlType)) return `${setting.temperature}°C`
  if (item.controlType === 'microwave' || item.controlType === 'induction') return `${setting.level} power`
  if (item.controlType === 'purifier' || item.controlType === 'exhaust') return `${setting.speed} speed`
  if (item.controlType === 'dehumidifier') return `${setting.humidity}% target humidity`
  return ''
}
// Power = estimated operating kW from the catalogue's annual kWh reference.
// Settings change power with ILLUSTRATIVE GAME MULTIPLIERS, not manufacturer measurements.
// export function effectivePower(item) {
//   if (item.basePowerKw == null) return 0

//   let power = item.basePowerKw
//   const setting = item.setting
//   const type = item.controlType

//   if (type === 'aircon') {
//     if (setting.mode === 'Fan') power *= 0.12
//     else if (setting.mode === 'Dry') power *= 0.75
//     else {
//       const factor = Math.max(0.55, Math.min(1.35, 1 + (25 - setting.temperature) * 0.08))
//       power *= factor
//       if (setting.speed === 'High') power *= 1.08
//       if (setting.speed === 'Low') power *= 0.94
//     }
//   }
//   if (type === 'fan') {
//     if (setting.speed === '1') power *= 0.55
//     if (setting.speed === '2') power *= 0.8
//   }
//   if (type === 'light') power *= setting.brightness / 100
//   if (type === 'tv') {
//     if (setting.picture === 'Eco') power *= 0.75
//     if (setting.picture === 'Vivid') power *= 1.15
//   }
//   if (type === 'washer') {
//     if (setting.mode === 'Eco') power *= 0.7
//     if (setting.mode === 'Intensive') power *= 1.25
//     if (setting.water === 'Warm') power *= 1.3
//   }
//   if (type === 'dryer') {
//     if (setting.mode === 'Eco') power *= 0.8
//     if (setting.mode === 'Quick') power *= 1.15
//   }
//   if (type === 'dishwasher') {
//     if (setting.mode === 'Eco') power *= 0.75
//     if (setting.mode === 'Intensive') power *= 1.2
//   }
//   if (type === 'heater') power *= Math.max(0.6, Math.min(1.2, 1 + (setting.temperature - 40) * 0.025))
//   if (type === 'fridge') power *= Math.max(0.8, Math.min(1.25, 1 + (4 - setting.temperature) * 0.07))
//   if (type === 'microwave' || type === 'induction') {
//     if (setting.level === 'Low') power *= 0.45
//     if (setting.level === 'Medium') power *= 0.7
//   }
//   if (type === 'oven' || type === 'airfryer') power *= Math.max(0.7, Math.min(1.2, 1 + (setting.temperature - 180) * 0.002))
//   if (type === 'purifier') {
//     if (setting.speed === 'Low') power *= 0.6
//     if (setting.speed === 'High') power *= 1.3
//   }
//   if (type === 'dehumidifier') power *= Math.max(0.7, Math.min(1.2, 1 + (60 - setting.humidity) * 0.018))
//   if (type === 'computer') {
//     if (setting.mode === 'Eco') power *= 0.65
//     if (setting.mode === 'Performance') power *= 1.2
//   }
//   if (type === 'exhaust') {
//     if (setting.speed === 'Low') power *= 0.65
//   }
//   if (type === 'ricecooker' && setting.mode === 'Keep Warm') power *= 0.2

//   return power
// }

function openSettings(item) {
  settingsApplianceId.value = settingsApplianceId.value === item.id ? '' : item.id
}
function roomIcon(type) {
  if (type === 'bedroom') return '🛏️'
  if (type === 'kitchen') return '🍳'
  if (type === 'bathroom') return '🛁'
  if (type === 'living') return '🛋️'
  return '🏠'
}
function showToast(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2500)
}


async function loadRooms() {
  pauseGame()
  loading.value = true
  error.value = ''
  rooms.value = []
  missingCatalogueKeys.value = []
  selectedRoomId.value = ''

  try {
    const response = await axios.get('/api/simulator')

    householdId.value = response.data.householdId
    await loadSavedPlans()

    const records = response.data.rooms
    const items = response.data.items

    if (!Array.isArray(records) || !Array.isArray(items)) {
      throw new Error('Invalid rooms or catalogue response')
    }

    catalogue.value = items

    // Go through every room
    for (const room of records) {
      const newRoom = {
        id: String(room._id?.$oid || room._id),
        name: room.name || prettyName(room.type || 'room'),
        type: room.type || 'other',
        order: room.order ?? 0,
        appliances: []
      }

      // Go through every placement in the room
      for (const placement of room.placements || []) {

        // Only include electrical appliances based on category
        if (!allowedCategories.includes(placement.category)) {
          continue
        }

        // Try to find appliance information in catalogue
        let details = getCatalogueItem(placement.applianceTypeKey)

        // If not found, still include the appliance
        if (!details) {
          if (!missingCatalogueKeys.value.includes(placement.applianceTypeKey)) {
            missingCatalogueKeys.value.push(placement.applianceTypeKey)
          }

          let applianceName = prettyName(placement.applianceTypeKey)

          if (
            placement.applianceTypeKey.includes('condenser') ||
            placement.applianceTypeKey.includes('condensor')
          ) {
            applianceName = 'Condenser Clothes Dryer'
          }

          details = {
            typeKey: placement.applianceTypeKey,
            name: applianceName,
            category: placement.category,
            kwhYear: null,
            products: []
          }
        }

        // Identify the available appliance settings
        const type = controlTypeFor(
          details.name + ' ' + details.typeKey,
          details.category,
          details.typeKey
        )

        // Retrieve electricity information
        const energyDetails = getEnergyDetails(details, placement)

        const annualKwh = energyDetails.annualKwh
        const hoursPerYear = typicalHoursPerYear(details.typeKey)

        const basePowerKw = annualKwh == null
          ? null
          : annualKwh / hoursPerYear

        // Add appliance to its room
        newRoom.appliances.push({
          id: String(placement._id?.$oid || placement._id),
          key: placement.applianceTypeKey,
          typeKey: details.typeKey,
          name: details.name,
          category: placement.category,
          tick: placement.tick || '',
          annualKwh: annualKwh,
          basePowerKw: basePowerKw,
          energySource: energyDetails.energySource,
          productName: energyDetails.productName,
          genericEstimate: energyDetails.genericEstimate,
          icon: iconFor(details.name + ' ' + placement.applianceTypeKey),
          on: false,
          controlType: type,
          setting: defaultSetting(type)
        })
      }

      rooms.value.push(newRoom)
    }

    rooms.value.sort((a, b) => a.order - b.order)

    selectedRoomId.value = rooms.value[0]?.id || ''

    resetGame()

  } catch (err) {
    error.value = err.response?.data?.error ||
                  err.message ||
                  'Could not load household'
  } finally {
    loading.value = false
  }
}

// Week 5: computed values automatically update when their inputs change.
const selectedRoom = computed(() => rooms.value.find(room => room.id === selectedRoomId.value))
const allAppliances = computed(() => {
  const list = []
  for (const room of rooms.value) {
    for (const item of room.appliances) {
      list.push(item)
    }
  }
  return list
})
const activeAppliances = computed(() => allAppliances.value.filter(item => item.on))
const currentPower = computed(() => {
  let total = 0
  for (const item of allAppliances.value) {
    if (item.on) total = total + effectivePower(item)
  }
  return total
})
const unknownAnnualCount = computed(() => allAppliances.value.filter(item => item.annualKwh == null).length)
const genericEstimateCount = computed(() => allAppliances.value.filter(item => item.annualKwh != null && item.genericEstimate).length)
const progress = computed(() => Math.min(100, (minute.value - 480) / 900 * 100))
const timeText = computed(() => formatTime(minute.value))
const nextChangeMinute = computed(() => 480 + (periodIndex.value + 1) * 180)
const timeRemaining = computed(() => Math.max(0, nextChangeMinute.value - minute.value))
const doneNow = computed(() => missions.value.filter(goal => goal.done).length)
const completedGoals = computed(() => goalHistory.value.filter(goal => goal.done))
const missedGoals = computed(() => goalHistory.value.filter(goal => !goal.done))

function formatTime(value) {
  const hour = Math.floor(value / 60)
  const minutes = value % 60
  return `${hour % 12 || 12}:${String(minutes).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

// The existing day/night background still follows the game clock.
const skyPhase = computed(() => {
  if (minute.value >= 19 * 60) return 'night'
  if (minute.value >= 17 * 60) return 'sunset'
  if (minute.value < 9 * 60) return 'morning'
  return 'day'
})
const skyLabel = computed(() => {
  if (skyPhase.value === 'night') return '🌙 Night sky'
  if (skyPhase.value === 'sunset') return '🌇 Golden sunset'
  if (skyPhase.value === 'morning') return '🌤️ Fresh morning'
  return '☀️ Daytime'
})

// Situations change throughout the day, instead of selecting one for the entire game.
const situations = {
  sunny: {
    key: 'sunny', icon: '☀️', title: 'A bright, sunny day',
    detail: 'The skies are clear and the weather is pleasant. Check your rooms and switch off appliances that are not needed.',
    roomGoal: 'Check the household', offGoal: 'Save power while the weather is good'
  },
  rain: {
    key: 'rain', icon: '🌧️', title: 'Sudden afternoon rain',
    detail: 'Dark clouds have arrived and heavy rain is falling. Visit the rooms, use lighting only where needed and avoid unnecessary electricity use.',
    roomGoal: 'Check the rooms during the rain', offGoal: 'Turn off an unused device'
  },
  haze: {
    key: 'haze', icon: '🌫️', title: 'Haze levels are rising',
    detail: 'Visibility outside is getting worse. Stay indoors, check the household and reduce unnecessary appliance usage.',
    roomGoal: 'Inspect an indoor room', offGoal: 'Cut unnecessary power use'
  },
  heat: {
    key: 'heat', icon: '🌡️', title: 'Temperatures are climbing',
    detail: 'The afternoon is getting hotter. Manage household electricity wisely and avoid running devices nobody is using.',
    roomGoal: 'Inspect a room during the heat', offGoal: 'Switch off an unattended device'
  },
  peak: {
    key: 'peak', icon: '⚡', title: 'Evening electricity peak',
    detail: 'Household electricity demand is high this evening. Look for unnecessary devices that can be switched off.',
    roomGoal: 'Check a room for wasted electricity', offGoal: 'Reduce evening electricity usage'
  },
  night: {
    key: 'night', icon: '🌙', title: 'Time to wind down',
    detail: 'It is getting late. Make sure that lights and appliances are not left running unnecessarily before bedtime.',
    roomGoal: 'Do an evening room check', offGoal: 'Turn off an unused evening device'
  }
}

// Random choices are appropriate to the time. Morning always starts sunny.
function pickSituation(index) {
  const possibilities = [
    ['sunny'],               // 8 AM
    ['sunny', 'heat', 'haze'], // 11 AM
    ['rain', 'haze', 'heat'],  // 2 PM
    ['peak', 'rain', 'haze'],  // 5 PM
    ['night', 'peak', 'haze']  // 8 PM
  ][index] || ['night']
  let choices = possibilities.filter(key => key !== currentSituation.value?.key)
  if (!choices.length) choices = possibilities
  const key = choices[Math.floor(Math.random() * choices.length)]
  return situations[key]
}

function isEssential(item) {
  return item.controlType === 'fridge'
}

// The catalogue's categories group appliances by use (kitchen, cooling, laundry...), NOT by room.
// Match missions to electrical appliances that the household actually placed.
function isLight(item) {
  return item.category === 'lighting'
}
function isTelevision(item) {
  return item.controlType === 'tv'
}
function isCooling(item) {
  return item.controlType === 'aircon' || item.controlType === 'fan'
}
function isCooking(item) {
  return item.category === 'kitchen' && !isEssential(item) && item.controlType !== 'fan'
}
function isLaundry(item) {
  return item.category === 'laundry'
}
function applianceRoom(item) {
  const room = rooms.value.find(room => room.appliances.some(appliance => appliance.id === item.id))
  return room?.name || 'the household'
}
function chooseRandom(items) {
  return items[Math.floor(Math.random() * items.length)]
}

// Every 3-hour situation builds a different set of missions using the devices
// actually present in the logged-in user's rooms. No appliance = no such mission.
function startSituation(index) {
  periodIndex.value = index
  currentSituation.value = pickSituation(index)
  missions.value = []

  const usedIds = []
  const devices = allAppliances.value.filter(item => !isEssential(item))
  const situation = currentSituation.value.key

  function available(items) {
    return items.filter(item => !usedIds.includes(item.id))
  }
  function appliancesOf(...types) {
    return devices.filter(item => types.includes(item.controlType))
  }
  function addOnGoal(items, title, reason) {
    const choices = available(items).filter(item => !item.on)
    if (!choices.length) return false
    const item = chooseRandom(choices)
    usedIds.push(item.id)
    missions.value.push({
      title, detail: `${reason} Turn on ${item.name} in ${applianceRoom(item)}.`,
      action: 'on', targetId: item.id, done: false
    })
    return true
  }
  function addOffGoal(items, title, reason) {
    const choices = available(items)
    if (!choices.length) return false
    const running = choices.filter(item => item.on)
    const item = chooseRandom(running.length ? running : choices)
    item.on = true // A simulated appliance was left running
    usedIds.push(item.id)
    missions.value.push({
      title, detail: `${reason} Switch off ${item.name} in ${applianceRoom(item)}.`,
      action: 'off', targetId: item.id, done: false
    })
    return true
  }
  function addSettingGoal(items, title, reason, key, target, comparison = 'equals') {
    const choices = available(items).filter(item =>
      item.setting[key] !== undefined && !settingMatches(item.setting[key], target, comparison)
    )
    if (!choices.length) return false
    const item = chooseRandom(choices)
    item.on = true
    usedIds.push(item.id)
    let direction = 'Set ' + key + ' to ' + target
    if (comparison === 'atLeast') direction = 'Set ' + key + ' to at least ' + target
    if (comparison === 'atMost') direction = 'Set ' + key + ' to at most ' + target
    if (key === 'temperature') direction += '°C'
    if (key === 'brightness' || key === 'humidity') direction += '%'
    missions.value.push({
      title,
      detail: `${reason} In ${applianceRoom(item)}, open Settings for ${item.name}. ${direction}.`,
      action: 'setting', targetId: item.id,
      settingKey: key, targetValue: target, comparison, done: false
    })
    return true
  }
  // Different from a single settings click: sustain efficient operation for 30 game minutes.
  function addHoldGoal(items, title, reason, key, target, comparison = 'equals') {
    const choices = available(items).filter(item => item.setting[key] !== undefined)
    if (!choices.length) return false
    const item = chooseRandom(choices)
    item.on = true
    usedIds.push(item.id)
    const instruction = comparison === 'atLeast' ? `at least ${target}` : comparison === 'atMost' ? `at most ${target}` : String(target)
    const unit = key === 'temperature' ? '°C' : key === 'humidity' || key === 'brightness' ? '%' : ''
    missions.value.push({
      title,
      detail: `${reason} Keep ${item.name} ON in ${applianceRoom(item)} with ${key} ${instruction}${unit} for 30 continuous game minutes.`,
      action: 'hold', targetId: item.id,
      settingKey: key, targetValue: target, comparison,
      progress: 0, duration: 30, done: false
    })
    return true
  }
  // Combined challenge: run a fan and air conditioner together with sensible settings.
  function addComboGoal() {
    const aircons = available(appliancesOf('aircon'))
    const fans = available(appliancesOf('fan'))
    if (!aircons.length || !fans.length) return false
    const ac = chooseRandom(aircons)
    const fan = chooseRandom(fans)
    usedIds.push(ac.id, fan.id)
    // Do not pre-complete the challenge; players must switch on both.
    ac.on = false
    fan.on = false
    missions.value.push({
      title: 'Team up fan and aircon',
      detail: `Turn ON ${ac.name} in ${applianceRoom(ac)} and ${fan.name} in ${applianceRoom(fan)}. Set the aircon to at least 26°C to avoid overcooling.`,
      action: 'combo', targetId: ac.id, secondId: fan.id,
      done: false
    })
    return true
  }
  // Restore a mistakenly changed fridge setting, rather than telling users to turn it off.
  function addFridgeGoal() {
    const fridges = available(allAppliances.value.filter(item => isEssential(item)))
    if (!fridges.length) return false
    const item = chooseRandom(fridges)
    item.on = true
    item.setting.temperature = 7 // A simulated 'fridge set too warm' incident
    usedIds.push(item.id)
    missions.value.push({
      title: 'Fix the refrigerator temperature',
      detail: `Someone set ${item.name} in ${applianceRoom(item)} too warm. Keep it ON and set its temperature to 5°C or lower (ideally about 4°C).`,
      action: 'setting', targetId: item.id,
      settingKey: 'temperature', targetValue: 5,
      comparison: 'atMost', done: false
    })
    return true
  }
  // Achieve a power cap for 30 continuous game minutes during peak demand.
  function addPowerGoal() {
    const essentialPower = allAppliances.value
      .filter(item => isEssential(item) && item.on)
      .reduce((sum, item) => sum + effectivePower(item), 0)
    const current = currentPower.value
    const adjustable = current - essentialPower
    if (adjustable < 0.05) return false
    const limit = essentialPower + adjustable * 0.65
    missions.value.push({
      title: 'Beat the peak-power target',
      detail: `Keep total simulated power at or below ${limit.toFixed(2)} kW for 30 continuous game minutes. Adjust settings or turn off unnecessary devices.`,
      action: 'powerHold', limitKw: limit,
      progress: 0, duration: 30, done: false
    })
    return true
  }

  // All tasks below are possible only with a matching appliance category/control.
  const lights = devices.filter(isLight)
  const televisions = devices.filter(isTelevision)
  const cooking = devices.filter(isCooking)
  const laundry = devices.filter(isLaundry)
  const cooling = devices.filter(isCooling)
  const purifier = appliancesOf('purifier')
  const dehumidifier = appliancesOf('dehumidifier')
  const computer = appliancesOf('computer')
  const dishwasher = appliancesOf('dishwasher')
  const exhaust = appliancesOf('exhaust')
  const riceCooker = appliancesOf('ricecooker')

  // Some periods prioritise reducing waste, others require comfortable/healthy operation.
  // Choose different missions from the pool, not the same fixed three every time.
  const goals = []
  if (situation === 'sunny') {
    goals.push(
      () => addSettingGoal(lights.filter(item => item.controlType === 'light'), 'Use sunlight instead of full brightness', 'The sun is already lighting the room.', 'brightness', 50, 'atMost'),
      () => addSettingGoal(appliancesOf('fan'), 'Choose a gentle fan speed', 'The weather is comfortable.', 'speed', '1'),
      () => addSettingGoal(televisions, 'Try Eco picture mode', 'Watching TV does not need maximum display power.', 'picture', 'Eco'),
      () => addSettingGoal(computer, 'Enable computer Eco mode', 'Reduce simulated computing demand while doing light tasks.', 'mode', 'Eco'),
      () => addOffGoal(lights, 'Turn off unnecessary daylight lighting', 'Natural light is available.'),
      () => addOffGoal(televisions, 'Switch off the idle TV', 'Nobody is watching.'),
      () => addOffGoal(cooking, 'Avoid wasted kitchen electricity', 'No cooking is taking place.'),
      () => addSettingGoal(appliancesOf('induction'), 'Reduce induction cooking power', 'Use medium power when simmering does not need maximum heat.', 'level', 'Medium'),
      () => addSettingGoal(riceCooker, 'Switch the rice cooker to Keep Warm', 'The simulated rice has finished cooking.', 'mode', 'Keep Warm'),
      () => addFridgeGoal()
    )
  }
  if (situation === 'heat') {
    goals.push(
      () => addComboGoal(),
      () => addSettingGoal(appliancesOf('aircon'), 'Raise the cooling setpoint', 'Avoid overcooling the home.', 'temperature', 26, 'atLeast'),
      () => addHoldGoal(appliancesOf('aircon'), 'Keep cooling efficient for 30 minutes', 'Keep a comfortable, moderate cooling setting.', 'temperature', 26, 'atLeast'),
      () => addSettingGoal(appliancesOf('fan'), 'Use the fan at a gentle speed', 'Comfortable airflow may not require a high setting.', 'speed', '1'),
      () => addOnGoal(cooling, 'Stay comfortable in the heat', 'Use your existing cooling equipment where it is needed.'),
      () => addOffGoal([...cooking, ...laundry], 'Reduce avoidable indoor heat', 'This unnecessary appliance adds heat.'),
      () => addSettingGoal(appliancesOf('heater'), 'Lower water-heating demand', 'A lower setpoint can reduce heating energy.', 'temperature', 40, 'atMost')
    )
  }
  if (situation === 'rain') {
    goals.push(
      () => addSettingGoal(dehumidifier, 'Lower excess humidity', 'Rainy weather may make the home damp.', 'humidity', 55, 'atMost'),
      () => addHoldGoal(dehumidifier, 'Control indoor moisture for 30 minutes', 'Run the dehumidifier with a moderate humidity target.', 'humidity', 55, 'atMost'),
      () => addSettingGoal(appliancesOf('washer'), 'Choose a cold wash', 'Cold water avoids additional water-heating energy.', 'water', 'Cold'),
      () => addSettingGoal(dishwasher, 'Use the dishwasher Eco cycle', 'An Eco wash can reduce estimated electricity use.', 'mode', 'Eco'),
      () => addSettingGoal(lights.filter(item => item.controlType === 'light'), 'Use moderate rainy-day lighting', 'Cloudy weather does not always require full brightness.', 'brightness', 60, 'atMost'),
      () => addOnGoal(lights, 'Light up a gloomy room', 'Rain clouds are making the home darker.'),
      () => addOffGoal(laundry, 'Pause unnecessary laundry equipment', 'Avoid running an unattended cycle.'),
      () => addSettingGoal(exhaust, 'Reduce unnecessary ventilation speed', 'Use low speed when high ventilation is not required.', 'speed', 'Low')
    )
  }
  if (situation === 'haze') {
    goals.push(
      () => addOnGoal(purifier, 'Run the air purifier', 'Help filter indoor air during the haze.'),
      () => addHoldGoal(purifier, 'Maintain air filtration for 30 minutes', 'During haze, running a purifier is more important than saving a little fan electricity.', 'speed', 'High'),
      () => addSettingGoal(purifier, 'Increase purifier filtration speed', 'Use higher filtration speed when outdoor air is hazy.', 'speed', 'High'),
      () => addOffGoal(exhaust, 'Avoid unnecessary exhaust ventilation', 'Reduce avoidable intake of outdoor haze when ventilation is not needed.'),
      () => addOffGoal(cooking, 'Avoid unnecessary indoor cooking fumes', 'Reduce avoidable sources of indoor particles.'),
      () => addSettingGoal(computer, 'Use computer Eco mode indoors', 'Save energy during indoor activities.', 'mode', 'Eco'),
      () => addSettingGoal(appliancesOf('aircon'), 'Avoid excessive cooling indoors', 'Cooling can stay moderate during haze.', 'temperature', 26, 'atLeast')
    )
  }
  if (situation === 'peak') {
    goals.push(
      () => addSettingGoal(appliancesOf('washer', 'dryer', 'dishwasher'), 'Choose an Eco appliance cycle', 'Reduce demand during the evening peak.', 'mode', 'Eco'),
      () => addHoldGoal(appliancesOf('dryer', 'washer', 'dishwasher'), 'Stay in Eco mode for 30 minutes', 'Keep a laundry or cleaning appliance on its simulated Eco cycle.', 'mode', 'Eco'),
      () => addSettingGoal(computer, 'Reduce computer peak demand', 'Use the computer Eco profile.', 'mode', 'Eco'),
      () => addSettingGoal(televisions, 'Switch TV to Eco picture', 'Avoid high display power during peak hours.', 'picture', 'Eco'),
      () => addSettingGoal(appliancesOf('aircon'), 'Reduce peak cooling load', 'Raise the aircon setpoint.', 'temperature', 27, 'atLeast'),
      () => addSettingGoal(appliancesOf('heater'), 'Choose a moderate hot-water temperature', 'Avoid unnecessary high water-heating demand.', 'temperature', 40, 'atMost'),
      () => addSettingGoal(lights.filter(item => item.controlType === 'light'), 'Dim lights during peak hours', 'Use only the brightness you need.', 'brightness', 50, 'atMost'),
      () => addOffGoal(laundry, 'Stop unnecessary peak laundry loads', 'This cycle is not needed right now.'),
      () => addOffGoal([...televisions, ...computer], 'Switch off idle entertainment', 'Screens left on waste electricity.'),
      () => addOffGoal(cooking, 'Stop unnecessary cooking appliances', 'Reduce avoidable peak-time demand.'),
      () => addSettingGoal(appliancesOf('microwave', 'induction'), 'Reduce instantaneous cooking power', 'Use a lower power setting if the task allows it.', 'level', 'Medium')
    )
  }
  if (situation === 'night') {
    goals.push(
      () => addSettingGoal(lights.filter(item => item.controlType === 'light'), 'Dim lights for bedtime', 'Use softer evening lighting.', 'brightness', 30, 'atMost'),
      () => addSettingGoal(appliancesOf('aircon'), 'Use a gentler night temperature', 'Avoid excessive cooling overnight.', 'temperature', 26, 'atLeast'),
      () => addHoldGoal(appliancesOf('aircon'), 'Keep a comfortable night setting', 'Maintain energy-conscious cooling while winding down.', 'temperature', 26, 'atLeast'),
      () => addSettingGoal(televisions, 'Lower TV display demand', 'Use the Eco picture setting.', 'picture', 'Eco'),
      () => addSettingGoal(appliancesOf('fan'), 'Reduce fan speed at night', 'Keep a gentle breeze.', 'speed', '1'),
      () => addOffGoal(televisions, 'Turn off the television before bed', 'Nobody is watching anymore.'),
      () => addOffGoal(lights, 'Turn off unused lights', 'The room is empty.'),
      () => addOffGoal([...cooking, ...laundry], 'Shut down unused appliances', 'Avoid unnecessary nighttime usage.'),
      () => addFridgeGoal()
    )
  }

  // Randomize candidate order, but prefer household-specific missions over generic visits.
  // Aim for up to three device goals and one room inspection goal.
  const shuffledGoals = goals.sort(() => Math.random() - 0.5)
  const powerChallenge = situation === 'peak' || situation === 'night'
  for (const attempt of shuffledGoals) {
    if (missions.value.length >= (powerChallenge ? 2 : 3)) break
    attempt()
  }

  // Peak-power challenge comes after some appliances have been switched on.
  // If insufficient electricity is running, select another ordinary objective.
  if (powerChallenge && missions.value.length < 3) addPowerGoal()
  if (missions.value.length < 3) {
    for (const attempt of shuffledGoals) {
      if (missions.value.length >= 3) break
      attempt()
    }
  }

  // Fallback for a sparse home: still offer a real appliance task when possible.
  if (!missions.value.length && devices.length) {
    addOffGoal(devices, 'Find an appliance left on', 'An unused appliance is wasting electricity.')
  }

  // Visiting a room is a separate exploration task, if the home has rooms.
  if (rooms.value.length > 1) {
    const otherRooms = rooms.value.filter(room => room.id !== selectedRoomId.value)
    const room = chooseRandom(otherRooms)
    missions.value.push({
      title: currentSituation.value.roomGoal,
      detail: `Visit ${room.name} to inspect the household during this situation.`,
      action: 'visit', targetId: room.id, done: false
    })
  }

  showToast(`${currentSituation.value.icon} New situation: ${currentSituation.value.title}`)
}

function recordGoals() {
  for (const goal of missions.value) {
    goalHistory.value.push({
      ...goal,
      situation: currentSituation.value?.title || 'Household',
      period: `${formatTime(480 + periodIndex.value * 180)} – ${formatTime(660 + periodIndex.value * 180)}`
    })
  }
}
function settingMatches(value, target, comparison) {
  if (comparison === 'atLeast') return Number(value) >= Number(target)
  if (comparison === 'atMost') return Number(value) <= Number(target)
  return String(value) === String(target)
}
function checkComboGoals() {
  if (!playing.value || finished.value) return
  for (const goal of missions.value) {
    if (goal.done || goal.action !== 'combo') continue
    const aircon = allAppliances.value.find(item => item.id === goal.targetId)
    const fan = allAppliances.value.find(item => item.id === goal.secondId)
    if (aircon?.on && fan?.on && aircon.setting.temperature >= 26) {
      goal.done = true
      showToast(`✅ Mission complete: ${goal.title}`)
    }
  }
}
// Sustained goals only make progress while the player maintains the required state.
function checkTimedGoals(step) {
  for (const goal of missions.value) {
    if (goal.done) continue
    let passing = false
    if (goal.action === 'hold') {
      const item = allAppliances.value.find(appliance => appliance.id === goal.targetId)
      passing = !!item?.on && settingMatches(item.setting[goal.settingKey], goal.targetValue, goal.comparison)
    }
    if (goal.action === 'powerHold') {
      passing = currentPower.value <= goal.limitKw
    }
    if (goal.action !== 'hold' && goal.action !== 'powerHold') continue
    goal.progress = passing ? goal.progress + step : 0
    if (goal.progress >= goal.duration) {
      goal.done = true
      showToast(`✅ Mission complete: ${goal.title}`)
    }
  }
}
function checkSettingGoals(item) {
  checkComboGoals()
  if (!playing.value || finished.value) return
  for (const goal of missions.value) {
    if (!goal.done && goal.action === 'setting' && goal.targetId === item.id &&
        settingMatches(item.setting[goal.settingKey], goal.targetValue, goal.comparison)) {
      goal.done = true
      showToast(`✅ Mission complete: ${goal.title}`)
    }
  }
}
function completeGoals(action, targetId) {
  if (!playing.value || finished.value) return
  for (const goal of missions.value) {
    if (!goal.done && goal.action === action && goal.targetId === targetId) {
      goal.done = true
      showToast(`✅ Mission complete: ${goal.title}`)
    }
  }
}
function switchRoom(room) {
  selectedRoomId.value = room.id
  settingsApplianceId.value = ''
  completeGoals('visit', room.id)
}
function toggleAppliance(item) {
  if (!playing.value || finished.value) return
  item.on = !item.on
  completeGoals(item.on ? 'on' : 'off', item.id)
  checkComboGoals()
  if (!missions.value.some(goal => goal.targetId === item.id && goal.done)) {
    showToast(`${item.name} switched ${item.on ? 'ON' : 'OFF'}`)
  }
}
// Keep temperature button clicks short and beginner-friendly.
function minTemperature(item) {
  if (item.controlType === 'aircon') return 18
  if (item.controlType === 'fridge') return 2
  if (item.controlType === 'heater') return 35
  return 100
}
function maxTemperature(item) {
  if (item.controlType === 'aircon') return 30
  if (item.controlType === 'fridge') return 8
  if (item.controlType === 'heater') return 50
  return 220
}
function changeTemperature(item, direction) {
  let step = 1
  if (item.controlType === 'oven' || item.controlType === 'airfryer') step = 10
  item.setting.temperature = item.setting.temperature + direction * step
  checkSettingGoals(item)
}
function resetGame() {
  pauseGame()
  finished.value = false
  minute.value = 480
  energy.value = 0
  cost.value = 0
  goalHistory.value = []
  settingsApplianceId.value = ''
  for (const appliance of allAppliances.value) appliance.setting = defaultSetting(appliance.controlType)
  currentSituation.value = null
  for (const appliance of allAppliances.value) appliance.on = false
  if (rooms.value.length) startSituation(0)
}
function gameTick() {
  if (minute.value >= 1380) {
    finishGame()
    return
  }
  const step = Math.min(10, 1380 - minute.value)
  minute.value += step
  // Add the estimated energy used during this 10-minute in-game period.
  const hoursPassed = step / 60
  const energyThisTick = currentPower.value * hoursPassed
  energy.value = energy.value + energyThisTick
  cost.value = cost.value + energyThisTick * electricityRate.value
  checkTimedGoals(step)

  // Every 3 game hours the old checklist is archived and replaced.
  if (minute.value >= 1380) {
    finishGame()
  } else if (minute.value >= nextChangeMinute.value) {
    recordGoals()
    startSituation(periodIndex.value + 1)
  }
}
function startGame() {
  if (finished.value || playing.value || !rooms.value.length || !selectedPlan.value) return
  playing.value = true
  clearInterval(timer)
  timer = setInterval(gameTick, gameSpeed)
}
function pauseGame() {
  playing.value = false
  clearInterval(timer)
  timer = null
}
function finishGame() {
  pauseGame()
  if (finished.value) return
  recordGoals()
  finished.value = true
}
onMounted(loadRooms)
onUnmounted(() => { clearInterval(timer); clearTimeout(toastTimer) })
</script>

<template>
  <div class="quest-page" :class="['sky-' + skyPhase, 'weather-' + (currentSituation?.key || 'sunny')]">
    <!-- Existing animated sky follows the clock; rain and haze add weather effects. -->
    <div class="sky-scene" aria-hidden="true">
      <div class="sky-morning-layer"></div>
      <div class="sky-sunset-layer"></div>
      <div class="sky-night-layer"></div>
      <div class="sky-stars"></div>
      <div class="sky-sun"></div>
      <div class="sky-moon"></div>
      <div class="sky-cloud cloud-one"></div>
      <div class="sky-cloud cloud-two"></div>
      <div class="sky-cloud cloud-three"></div>
      <div class="sky-cloud cloud-four"></div>
      <div class="sky-weather"></div>
      <div class="sky-landscape"></div>
    </div>
    <div class="quest-glow"></div>

    <main class="game-shell">
      <header class="game-header">
        <div>
          <div class="eyebrow">HDB ECOHOME / INTERACTIVE SIMULATION</div>
          <h1>ENERGY <span>QUEST</span><small> // DAILY MISSIONS</small></h1>
          <p>Explore your household, respond to changing situations and complete as many missions as possible.</p>
        </div>
        <div class="header-actions">
          <span class="sky-caption">{{ skyLabel }}</span>
          <span class="live-dot"></span>
          <span>{{ playing ? 'DAY IN PROGRESS' : finished ? 'DAY COMPLETE' : 'READY' }}</span>
          <button v-if="!playing && !finished" class="game-button primary" @click="startGame" :disabled="!rooms.length || !selectedPlanId">▶ {{ minute === 480 ? 'START DAY' : 'RESUME' }}</button>
          <button v-if="playing" class="game-button" @click="pauseGame">Ⅱ PAUSE</button>
          <button class="game-button" @click="resetGame" :disabled="!rooms.length">↻ RESTART</button>
        </div>
      </header>

      <div v-if="loading" class="notice">Loading household from MongoDB...</div>
      <div v-if="error" class="notice error">{{ error }} <button class="game-button" @click="loadRooms">Retry</button></div>

      <section class="top-stats">
        <div class="stat-card clock-card">
          <div class="stat-label">◷ IN-GAME TIME</div>
          <div class="clock">{{ timeText }}</div>
          <div class="time-track"><div :style="{ width: progress + '%' }"></div></div>
          <div class="stat-foot"><span>8:00 AM</span><span>11:00 PM</span></div>
          <div class="time-speed-note">10 game minutes every 1.8 real seconds · 3 game hours per situation</div>
        </div>
        <SimulatorEnergy :energy="energy" :currentPower="currentPower"
/>
        <div class="stat-card cost-plan-card">
          <SimulatorCost :cost="cost" :electricityRate="electricityRate" />
          <div class="cost-plan-picker">
            <label for="sim-retailer">YOUR SAVED ELECTRICITY PLAN</label>
            <select id="sim-retailer" v-model="selectedPlanId" @change="changePlan" :disabled="playing || !savedPlans.length">
              <option v-if="!savedPlans.length" value="">No saved plans</option>
              <option v-for="saved in savedPlans" :key="saved.id" :value="saved.id">
                {{ saved.name }} — {{ saved.retailer?.name || 'Saved tariff' }} (S${{ Number(saved.retailer?.rate ?? saved.tariff).toFixed(4) }}/kWh)
              </option>
            </select>
            <small v-if="plansError">{{ plansError }} <button type="button" class="game-button" @click="loadSavedPlans">Retry</button></small>
            <small v-else-if="!savedPlans.length">No saved plans found. Save one in EnergyPlanner first.</small>
          </div>
        </div>
        <div class="stat-card mission-stat">
          <div class="stat-label">✅ MISSIONS COMPLETED</div>
          <div class="stat-number green">{{ completedGoals.length + doneNow }}</div>
          <div class="stat-foot">{{ missedGoals.length }} missed from earlier situations</div>
        </div>
      </section>

      <div class="main-grid">
        <section class="house-panel">
          <!-- Current situation appears ABOVE the floor plan / interactive room. -->
          <Transition name="situation" mode="out-in">
            <div v-if="currentSituation" :key="periodIndex" class="situation-banner" :class="'situation-' + currentSituation.key">
              <div class="situation-icon">{{ currentSituation.icon }}</div>
              <div class="situation-copy">
                <div class="situation-label">CURRENT SITUATION · {{ formatTime(480 + periodIndex * 180) }} – {{ formatTime(nextChangeMinute) }}</div>
                <h2>{{ currentSituation.title }}</h2>
                <p>{{ currentSituation.detail }}</p>
              </div>
              <div class="situation-timer">
                <strong>{{ timeRemaining }}</strong>
                <small>game mins left</small>
              </div>
            </div>
          </Transition>

          <div class="home-heading">
            <h2>Explore your home</h2>
            <span class="room-count">{{ rooms.length }} ROOMS</span>
          </div>
          <div class="room-tabs">
            <button v-for="room in rooms" :key="room.id" class="room-tab" :class="{ active: selectedRoomId === room.id }" @click="switchRoom(room)">
              <span>{{ roomIcon(room.type) }}</span>
              <strong>{{ room.name }}</strong>
              <small>{{ room.appliances.length }} devices</small>
            </button>
          </div>

          <Transition name="room-swap" mode="out-in">
            <div v-if="selectedRoom" :key="selectedRoom.id" class="room-stage" :class="'room-' + selectedRoom.type">
              <div class="stage-shine"></div>
              <div class="room-stage-top"><span class="stage-tag">● CURRENT ROOM</span><span>{{ selectedRoom.type.toUpperCase() }}</span></div>
              <div class="room-art">{{ roomIcon(selectedRoom.type) }}</div>
              <h3>{{ selectedRoom.name }}</h3>
              <p>Tap an appliance to switch it on or off. Open Settings to adjust supported appliances.</p>
              <div class="room-devices">
                <template v-for="item in selectedRoom.appliances" :key="item.id">
                <div class="device-wrapper">
                  <button
  type="button" class="device-tile" :class="{powered: item.on,selected: settingsApplianceId === item.id}":disabled="!playing || finished" @click="toggleAppliance(item)"
>
                    <span class="device-emoji">{{ item.icon }}</span>
                    <strong>{{ item.name }}</strong>
                    <span class="device-power">{{ item.basePowerKw != null ? item.basePowerKw.toFixed(3) + ' estimated kW' : 'Power estimate unavailable' }}</span>
                    <span class="device-power">{{ item.productName || item.energySource }}</span>
                    <span class="switch" :class="{ on: item.on }"><span></span></span>
                  </button>
                  <button v-if="item.controlType" type="button" class="settings-button" :disabled="!playing || finished" @click="openSettings(item)">
                    ⚙️ {{ settingsApplianceId === item.id ? 'Close settings' : 'Settings' }}
                  </button>
                </div>
                <div v-if="settingsApplianceId === item.id && item.controlType" class="appliance-settings">
                  <div class="settings-heading"><strong>⚙️ {{ item.name }} settings</strong><button type="button" @click="settingsApplianceId = ''">✕</button></div>
                  <p class="setting-summary">{{ settingsDescription(item) }} · {{ item.on ? 'ON' : 'OFF' }} · Simulated {{ effectivePower(item).toFixed(3) }} kW when on</p>
                  <div v-if="item.controlType === 'aircon' || item.controlType === 'heater' || item.controlType === 'fridge' || item.controlType === 'airfryer' || item.controlType === 'oven'" class="setting-row">
                    <label>{{ item.controlType === 'aircon' || item.controlType === 'fridge' ? 'Target temperature' : 'Temperature' }}</label>
                    <div class="setting-stepper">
                      <button type="button" :disabled="!playing || finished || item.setting.temperature <= minTemperature(item)" @click="changeTemperature(item, -1)">−</button>
                      <strong>{{ item.setting.temperature }}°C</strong>
                      <button type="button" :disabled="!playing || finished || item.setting.temperature >= maxTemperature(item)" @click="changeTemperature(item, 1)">+</button>
                    </div>
                  </div>
                  <div v-if="item.controlType === 'aircon'" class="setting-row"><label>Mode</label><select @change="checkSettingGoals(item)" v-model="item.setting.mode"><option>Cool</option><option>Dry</option><option>Fan</option></select></div>
                  <div v-if="item.controlType === 'aircon'" class="setting-row"><label>Fan speed</label><select @change="checkSettingGoals(item)" v-model="item.setting.speed"><option>Low</option><option>Auto</option><option>High</option></select></div>
                  <div v-if="item.controlType === 'fan'" class="setting-row"><label>Speed</label><select @change="checkSettingGoals(item)" v-model="item.setting.speed"><option value="1">1 - Low</option><option value="2">2 - Medium</option><option value="3">3 - High</option></select></div>
                  <div v-if="item.controlType === 'fan'" class="setting-row"><label>Oscillation</label><select @change="checkSettingGoals(item)" v-model="item.setting.oscillation"><option>On</option><option>Off</option></select></div>
                  <div v-if="item.controlType === 'light'" class="setting-row"><label>Brightness: {{ item.setting.brightness }}%</label><input @input="checkSettingGoals(item)" v-model.number="item.setting.brightness" type="range" min="10" max="100" step="10" /></div>
                  <div v-if="item.controlType === 'tv'" class="setting-row"><label>Picture mode</label><select @change="checkSettingGoals(item)" v-model="item.setting.picture"><option>Eco</option><option>Normal</option><option>Vivid</option></select></div>
                  <div v-if="item.controlType === 'washer' || item.controlType === 'dryer' || item.controlType === 'dishwasher'" class="setting-row"><label>Cycle</label><select @change="checkSettingGoals(item)" v-model="item.setting.mode"><option>Eco</option><option>Normal</option><option v-if="item.controlType === 'washer' || item.controlType === 'dishwasher'">Intensive</option><option v-else>Quick</option></select></div>
                  <div v-if="item.controlType === 'washer'" class="setting-row"><label>Water</label><select @change="checkSettingGoals(item)" v-model="item.setting.water"><option>Cold</option><option>Warm</option></select></div>
                  <div v-if="item.controlType === 'microwave' || item.controlType === 'induction'" class="setting-row"><label>Power level</label><select @change="checkSettingGoals(item)" v-model="item.setting.level"><option>Low</option><option>Medium</option><option>High</option></select></div>
                  <div v-if="item.controlType === 'purifier'" class="setting-row"><label>Air filtration speed</label><select @change="checkSettingGoals(item)" v-model="item.setting.speed"><option>Low</option><option>Auto</option><option>High</option></select></div>
                  <div v-if="item.controlType === 'dehumidifier'" class="setting-row"><label>Target humidity: {{ item.setting.humidity }}%</label><input @input="checkSettingGoals(item)" v-model.number="item.setting.humidity" type="range" min="45" max="65" step="5" /></div>
                  <div v-if="item.controlType === 'computer'" class="setting-row"><label>Power profile</label><select @change="checkSettingGoals(item)" v-model="item.setting.mode"><option>Eco</option><option>Normal</option><option>Performance</option></select></div>
                  <div v-if="item.controlType === 'exhaust'" class="setting-row"><label>Ventilation speed</label><select @change="checkSettingGoals(item)" v-model="item.setting.speed"><option>Low</option><option>High</option></select></div>
                  <div v-if="item.controlType === 'ricecooker'" class="setting-row"><label>Cooking state</label><select @change="checkSettingGoals(item)" v-model="item.setting.mode"><option>Cook</option><option>Keep Warm</option></select></div>
                  <small class="settings-note">Power is estimated from catalogue annual kWh and assumed typical operating hours, not a measured wattage. Setting multipliers are illustrative. Oscillation does not change this estimate.</small>
                </div>
                </template>
                <div v-if="!selectedRoom.appliances.length" class="empty-devices">No electrical appliances placed in this room yet.</div>
              </div>
            </div>
          </Transition>
          <div class="house-footer">
            <span>● {{ activeAppliances.length }} APPLIANCES RUNNING</span>
            <span>HOUSEHOLD · {{ householdId.slice(-8) }}</span>
          </div>
        </section>

        <!-- Sidebar contains ONLY the current situation's mission checklist. -->
        <aside class="side-panel">
          <section class="mission-sidebar">
            <div class="mission-heading">
              <div class="mission-label">CURRENT MISSION CHECKLIST</div>
              <h2>{{ currentSituation?.icon }} {{ currentSituation?.title || 'Daily missions' }}</h2>
            </div>
            <p class="mission-intro">Complete these before the situation changes. Missions are checked automatically when you do the task.</p>
            <div class="mission-progress">
              <strong>{{ doneNow }} / {{ missions.length }} done</strong>
              <span>{{ timeRemaining }} min remaining</span>
            </div>
            <div class="mission-track"><div :style="{ width: missions.length ? (doneNow / missions.length * 100) + '%' : '0%' }"></div></div>
            <div class="current-goals">
              <div v-for="(mission, i) in missions" :key="periodIndex + '-' + i" class="checklist-item" :class="{ completed: mission.done }">
                <span class="check-square">{{ mission.done ? '✓' : '' }}</span>
                <div><strong>{{ mission.title }}</strong><p>{{ mission.detail }}</p><small v-if="mission.action === 'hold' || mission.action === 'powerHold'">{{ mission.progress }} / {{ mission.duration }} game minutes sustained</small></div>
              </div>
              <p v-if="!missions.length" class="mission-intro">No missions for this household yet.</p>
            </div>
            <div class="mission-bottom">{{ playing ? '⏳ Time is running — complete the checklist!' : finished ? '✅ Day complete' : '▶ Start the day to work on these goals.' }}</div>
          </section>
        </aside>
      </div>
      <p class="calculation-note">⚡ Note: Electricity consumption and costs are estimates based on appliance catalogue data and simulated usage. Actual consumption may vary.
        <span v-if="genericEstimateCount"> {{ genericEstimateCount }} appliance(s) use unverified or general catalogue estimates.</span>
        <span v-if="unknownAnnualCount"> ⚠ {{ unknownAnnualCount }} appliance(s) have no usable energy data and cannot be counted.</span>
        <span v-if="missingCatalogueKeys.length"> ⚠ Unmatched 3D appliance types: {{ missingCatalogueKeys.join(', ') }}.</span>
      </p>
      <footer class="game-footer">HDB ECOHOME · ENERGY QUEST <span>REAL HOUSEHOLD DATA · SIMULATED SCENARIOS</span></footer>
    </main>

    <Transition name="modal">
      <div v-if="finished" class="event-overlay">
        <div class="event-modal results goal-results">
          <div class="eyebrow">YOUR DAY IN REVIEW</div>
          <div class="event-hero">🏁</div>
          <h2>Day complete!</h2>
          <p>Here's every goal from your day — including the ones you missed.</p>
          <div class="results-grid">
            <div><strong>{{ completedGoals.length }}</strong><small>Completed goals</small></div>
            <div><strong>{{ missedGoals.length }}</strong><small>Incomplete goals</small></div>
          </div>
          <div class="goal-result-columns">
            <div class="result-column">
              <h3>✅ Completed goals</h3>
              <p v-if="!completedGoals.length" class="result-empty">No missions completed this time.</p>
              <div v-for="(goal, i) in completedGoals" :key="'complete-' + i" class="result-goal done">
                <strong>{{ goal.title }}</strong><span>{{ goal.detail }}</span><small>{{ goal.situation }} · {{ goal.period }}</small>
              </div>
            </div>
            <div class="result-column">
              <h3>○ Incomplete goals</h3>
              <p v-if="!missedGoals.length" class="result-empty">Amazing! No missed missions.</p>
              <div v-for="(goal, i) in missedGoals" :key="'miss-' + i" class="result-goal missed">
                <strong>{{ goal.title }}</strong><span>{{ goal.detail }}</span><small>{{ goal.situation }} · {{ goal.period }}</small>
              </div>
            </div>
          </div>
          <p class="result-footnote">Estimated electricity used: {{ energy.toFixed(3) }} kWh · Simulated cost: S${{ cost.toFixed(2) }}</p>
          <button class="game-button primary" @click="resetGame">↻ PLAY AGAIN</button>
        </div>
      </div>
    </Transition>
    <Transition name="toast"><div v-if="toast" class="toast-message" role="status">{{ toast }}</div></Transition>
  </div>
</template>

<style scoped>

/* ECO QUEST: all scenery is CSS, so no image assets or extra packages are needed. */

* { box-sizing: border-box; }

.quest-page {

  --ink: #264a3c;

  --muted: #698679;

  --accent: #16855c;

  --accent-strong: #086b4b;

  --panel: rgba(255, 255, 255, .86);

  --border: rgba(255, 255, 255, .94);

  --soft: rgba(225, 246, 225, .82);

  --tile: rgba(250, 255, 250, .8);

  --tile-border: #d9ebdb;

  --track: #dbece1;

  --green-gradient: linear-gradient(110deg, #3acb90, #0f9970);

  --hill-back: #94cfa8;

  --hill-front: #5eb78c;

  position: relative;

  min-height: 100vh;

  overflow: hidden;

  isolation: isolate;

  background: #a4e5ec;

  color: var(--ink);

  font-family: Inter, system-ui, Arial, sans-serif;

  transition: color 1.8s ease, background 1.8s ease;

}

.quest-page.sky-night {

  --ink: #f0faf5;

  --muted: #aac7c5;

  --accent: #8de4b5;

  --accent-strong: #b5f2ce;

  --panel: rgba(13, 37, 51, .86);

  --border: rgba(167, 217, 204, .23);

  --soft: rgba(29, 68, 65, .79);

  --tile: rgba(23, 56, 65, .83);

  --tile-border: rgba(142, 199, 184, .27);

  --track: #2a4d55;

  --green-gradient: linear-gradient(110deg, #58d9a0, #299d83);

  --hill-back: #2b6066;

  --hill-front: #153c4c;

}



/* Sky transitions: the overlays FADE instead of abruptly changing backgrounds. */

.sky-scene { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none;

  background: linear-gradient(180deg, #71cfee 0%, #b4e9e9 40%, #d9f4d9 100%); }

.sky-morning-layer, .sky-sunset-layer, .sky-night-layer {

  position: absolute; inset: 0; opacity: 0; transition: opacity 2.6s ease;

}

.sky-morning-layer { background: linear-gradient(180deg, #91cce9 0%, #ffe7bd 65%, #e6f5d7 100%); }

.sky-sunset-layer { background: linear-gradient(180deg, #7f98d0 0%, #f2ac94 54%, #ffdda4 100%); }

.sky-night-layer { background: linear-gradient(180deg, #101d42 0%, #1e365d 52%, #37576b 100%); }

.sky-morning .sky-morning-layer, .sky-sunset .sky-sunset-layer, .sky-night .sky-night-layer { opacity: 1; }

.sky-sun, .sky-moon { position: absolute; border-radius: 50%; transition: opacity 2.2s ease, transform 2.8s ease, top 2.8s ease; }

.sky-sun {

  width: 123px; height: 123px; right: 11%; top: 104px;

  background: #fff5bf; box-shadow: 0 0 0 20px #fff3b12b, 0 0 90px 38px #ffe8a480;

  animation: sun-breathe 7s ease-in-out infinite;

}

.sky-morning .sky-sun { top: 170px; }

.sky-sunset .sky-sun { top: 245px; background: #ffce8e; box-shadow: 0 0 0 24px #ffd3a132, 0 0 85px 40px #ffc5a06b; }

.sky-night .sky-sun { opacity: 0; transform: translateY(180px) scale(.75); }

.sky-moon {

  width: 93px; height: 93px; right: 14%; top: 120px; opacity: 0;

  transform: translateY(105px) scale(.72);

  background: #f8f5dd;

  box-shadow: 0 0 0 12px #d5eaff16, 0 0 62px 22px #c9e2ff50;

}

.sky-moon::after { content: ''; position: absolute; width: 15px; height: 15px; border-radius: 50%;

  background: #d8decd77; left: 25px; top: 24px; box-shadow: 30px 28px 0 5px #d8decd55, 15px 51px 0 -3px #d8decd66; }

.sky-night .sky-moon { opacity: 1; transform: translateY(0) scale(1); }

.sky-stars { position: absolute; inset: 0; opacity: 0; transition: opacity 2s ease 0.5s; }

.sky-night .sky-stars { opacity: 1; }

.sky-stars::before, .sky-stars::after {

  content: ''; position: absolute; top: 70px; left: 12%; width: 3px; height: 3px;

  border-radius: 50%; background: #fff;

  box-shadow: 17vw 42px #ffffffc9, 31vw 98px #fff, 47vw 12px #ffffffbd,

    60vw 122px #fff, 78vw 50px #ffffffdb, 8vw 220px #ffffffa1,

    25vw 180px #fff, 42vw 270px #ffffffbe, 70vw 200px #fff,

    85vw 275px #ffffffc2, 3vw 360px #fff, 55vw 330px #ffffffcc;

  animation: twinkle 3.5s ease-in-out infinite alternate;

}

.sky-stars::after { top: 150px; left: 5%; transform: scale(.7); opacity: .68; animation-delay: -1.9s; }

.sky-cloud { position: absolute; width: 195px; height: 52px; left: -250px;

  border-radius: 90px; background: #ffffffc4; box-shadow: 0 6px 22px #27688014;

  opacity: .92; transition: background 2s, opacity 2s;

  animation: cloud-drift linear infinite; }

.sky-cloud::before, .sky-cloud::after { content: ''; position: absolute; border-radius: 50%; background: inherit; }

.sky-cloud::before { width: 95px; height: 83px; left: 37px; bottom: 11px; }

.sky-cloud::after { width: 103px; height: 68px; left: 95px; bottom: 4px; }

.cloud-one { top: 105px; animation-duration: 67s; animation-delay: -12s; }

.cloud-two { top: 250px; width: 135px; height: 38px; transform: scale(.72);

  animation-duration: 92s; animation-delay: -55s; opacity: .75; }

.cloud-two::before { width: 65px; height: 54px; }

.cloud-two::after { width: 62px; height: 46px; left: 75px; }

.cloud-three { top: 425px; animation-duration: 83s; animation-delay: -43s; opacity: .5; }

.cloud-four { top: 680px; animation-duration: 110s; animation-delay: -77s; opacity: .42; }

.sky-night .sky-cloud { background: #b7cbdc3f; opacity: .65; }

.sky-landscape { position: absolute; inset: auto 0 0; height: 285px; opacity: .52;

  background:

    radial-gradient(ellipse 58% 89% at 5% 138%, var(--hill-front) 0 82%, transparent 83%),

    radial-gradient(ellipse 58% 85% at 74% 145%, var(--hill-front) 0 82%, transparent 83%),

    radial-gradient(ellipse 58% 86% at 42% 120%, var(--hill-back) 0 82%, transparent 83%);

  transition: background 2s ease;

}

.quest-glow { position: absolute; inset: 0; z-index: 0; pointer-events: none;

  background: radial-gradient(ellipse at 8% 30%, #ffffff35, transparent 44%); }



/* Airy glass-like cards, rounded corners and friendly forest-green controls. */

.game-shell { position: relative; z-index: 1; max-width: 1480px; margin: auto; padding: 35px 24px 42px; }

.game-header, .header-actions, .section-heading, .stat-foot, .house-footer, .game-footer {

  display: flex; justify-content: space-between; align-items: center; gap: 12px;

}

.game-header { margin-bottom: 25px; flex-wrap: wrap; gap: 20px; }

.eyebrow, .stat-label, .small-muted, .stat-foot, .stage-tag, .house-footer, .game-footer, .room-count, .modal-note {

  font-size: 11px; letter-spacing: 1.1px; color: var(--muted); font-weight: 750;

}

.eyebrow { color: var(--accent-strong); }

.game-header h1 { font-size: clamp(32px, 4vw, 54px); margin: 8px 0 4px; font-weight: 900; letter-spacing: -2px; }

.game-header h1 span { color: var(--accent-strong); }

.game-header h1 small { font-size: 13px; color: var(--muted); letter-spacing: .6px; }

.game-header p, .room-stage p, .tips-panel p { color: var(--muted); font-size: 13px; }

.game-header p { margin: 4px 0; }

.header-actions { justify-content: flex-end; flex-wrap: wrap; font-size: 11px; font-weight: 800; color: var(--accent-strong); }

.sky-caption { padding: 8px 11px; border-radius: 999px; background: var(--panel);

  border: 1px solid var(--border); box-shadow: 0 4px 14px #184c3012; white-space: nowrap; }

.live-dot { width: 9px; height: 9px; background: #23b875; border-radius: 50%; box-shadow: 0 0 0 5px #42cf9a33;

  animation: pulse 1.5s infinite; }

.game-button { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;

  padding: 12px 17px; color: var(--ink); font-weight: 800; cursor: pointer;

  box-shadow: 0 5px 16px #164e3010; transition: transform .2s, background .2s, border-color .2s; }

.game-button:hover:not(:disabled) { transform: translateY(-2px); border-color: #38bc88; }

.game-button.primary { background: var(--green-gradient); border-color: transparent; color: #fff; }

.game-button:disabled { opacity: .45; cursor: not-allowed; }

button:focus-visible, .device-tile:focus-visible { outline: 3px solid #ffbb64; outline-offset: 2px; }



.top-stats { display: grid; grid-template-columns: 1.5fr repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }

.top-stats > .stat-card, .missions, .house-panel, .event-panel, .tips-panel {

  background: var(--panel); border: 1px solid var(--border); border-radius: 20px;

  box-shadow: 0 12px 35px #1a69421c; backdrop-filter: blur(16px);

  transition: background 2s ease, border-color 2s ease, box-shadow .3s;

}

.top-stats > .stat-card { padding: 18px; min-height: 137px; }

.top-stats > .stat-card:hover, .mission:hover { box-shadow: 0 14px 32px #235c4129; }

.top-stats > .stat-card .stat-number { font-size: 29px; font-weight: 900; margin: 18px 0 10px; }

.top-stats > .stat-card .stat-number small { font-size: 13px; color: var(--muted); }

.top-stats > .stat-card .stat-number.green { color: var(--accent-strong); }

.top-stats > .stat-card .stat-number.blue { color: #3698c1; }

.sky-night .top-stats > .stat-card .stat-number.blue { color: #8ad6f4; }

.clock { font-size: 35px; font-weight: 900; letter-spacing: -1px; margin: 12px 0; }

.time-track, .meter { height: 8px; background: var(--track); border-radius: 30px; overflow: hidden; }

.time-track > div, .meter > div { height: 100%; background: var(--green-gradient); transition: width .6s; border-radius: inherit; }

.blue-meter > div { background: linear-gradient(90deg, #67bade, #309ec2); }

.stat-foot { margin-top: 12px; font-size: 9px; }

.missions { padding: 22px; margin-bottom: 18px; }

.section-heading { margin-bottom: 17px; }

.section-heading h2 { font-size: 22px; margin: 4px 0 0; font-weight: 850; }

.section-heading h2 span { color: var(--accent-strong); font-size: 14px; }

.mission-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 11px; }

.mission { display: flex; align-items: center; gap: 12px; border: 1px solid var(--tile-border);

  background: var(--tile); border-radius: 14px; padding: 15px; min-height: 77px;

  transition: transform .25s, background 2s, border-color .25s; }

.mission.completed { background: var(--soft); border-color: #53c59685; }

.mission-icon { font-weight: 900; font-size: 19px; color: var(--accent-strong); }

.mission strong { font-size: 12px; }

.mission p { font-size: 11px; color: var(--muted); margin: 4px 0 0; }

.main-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(270px, 1fr); gap: 18px; }

.house-panel, .event-panel, .tips-panel { padding: 23px; }

.room-tabs { display: flex; gap: 9px; overflow-x: auto; padding-bottom: 12px; }

.room-tab { min-width: 125px; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;

  background: var(--tile); color: var(--ink); border: 1px solid var(--tile-border);

  border-radius: 14px; padding: 14px 8px; cursor: pointer; transition: .25s; }

.room-tab:hover { transform: translateY(-3px); border-color: #49bd88; }

.room-tab.active { background: var(--soft); border-color: #49bd88; box-shadow: 0 0 18px #34a46c25; }

.room-tab span { font-size: 27px; }

.room-tab strong { font-size: 12px; }

.room-tab small { font-size: 10px; color: var(--muted); }



/* The play area also uses nature-inspired colors so it feels part of the world. */

.room-stage { position: relative; overflow: hidden; min-height: 425px;

  background: linear-gradient(145deg, #e6f6e7, #bfe6dd); border: 1px solid #b6ddc5;

  border-radius: 18px; text-align: center; padding: 18px 22px 25px; color: #245345; }

.room-bedroom { background: linear-gradient(145deg, #edf0fc, #d3e6e1); }

.room-kitchen { background: linear-gradient(145deg, #f3f9df, #cae9d1); }

.room-bathroom { background: linear-gradient(145deg, #e4f5fc, #c3e8df); }

.sky-night .room-stage { background: linear-gradient(145deg, #234e58, #183748); border-color: #376d6d; color: #f1faf7; }

.sky-night .room-bedroom { background: linear-gradient(145deg, #394b6c, #20364b); }

.sky-night .room-kitchen { background: linear-gradient(145deg, #365d4d, #203d46); }

.sky-night .room-bathroom { background: linear-gradient(145deg, #1c5264, #1f374a); }

.stage-shine { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 18%, #ffffff60, transparent 55%); pointer-events: none; }

.sky-night .stage-shine { background: radial-gradient(ellipse at 50% 18%, #9aecce19, transparent 55%); }

.room-stage-top { position: relative; display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 2px; color: inherit; opacity: .72; }

.room-art { position: relative; font-size: 95px; margin: 8px auto 0; filter: drop-shadow(0 14px 24px #2486682d); animation: float 4s ease-in-out infinite; }

.room-stage h3 { position: relative; font-size: 27px; margin: 0; font-weight: 900; }

.room-stage p { position: relative; margin: 5px 0 20px; color: inherit; opacity: .75; }

.room-devices { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }

.device-tile { width: 155px; min-height: 155px; border-radius: 15px; border: 1px solid #c1ddd1;

  background: #ffffffd9; color: #254b3c; padding: 16px 12px; display: flex;

  flex-direction: column; align-items: center; gap: 7px; cursor: pointer; transition: .25s; }

.device-tile:hover { transform: translateY(-5px); box-shadow: 0 10px 24px #346b5330; }

.device-tile.powered { border-color: #39ba80; background: #d8f6e4; box-shadow: 0 0 22px #29d9a227; }

.sky-night .device-tile { background: #173748e8; border-color: #43716c; color: #eff9f3; }

.sky-night .device-tile.powered { background: #245c4e; border-color: #7fe1ae; }

.device-emoji { font-size: 31px; }

.device-tile strong { font-size: 12px; }

.device-power { font-size: 10px; color: #628272; }

.sky-night .device-power { color: #b5d0c6; }

.switch { margin-top: auto; width: 40px; height: 21px; background: #9bb8ad; border-radius: 20px; padding: 3px; transition: .2s; }

.switch span { display: block; width: 15px; height: 15px; border-radius: 50%; background: white; transition: .2s; }

.switch.on { background: #26ad78; }

.switch.on span { transform: translateX(19px); }

.empty-devices { color: inherit; opacity: .72; font-size: 13px; padding: 35px; }

.house-footer { margin-top: 16px; font-size: 10px; }

.side-panel { display: flex; flex-direction: column; gap: 18px; }

.radar { width: 37px; height: 37px; border: 1px solid #44b887; border-radius: 50%; display: grid;

  place-items: center; box-shadow: 0 0 16px #2fb77d3d; animation: pulse 2s infinite; }

.radar span { width: 10px; height: 10px; background: #35ba84; border-radius: 50%; }

.event-countdown { border-radius: 14px; background: var(--soft); padding: 19px;

  display: flex; flex-direction: column; gap: 8px; }

.event-countdown span { font-size: 10px; color: var(--muted); letter-spacing: 1px; }

.event-countdown strong { font-size: 27px; color: var(--accent-strong); }

.event-feed { min-height: 180px; }

.feed-empty { font-size: 12px; color: var(--muted); padding: 24px 8px; }

.feed-item { display: flex; gap: 12px; border-bottom: 1px solid var(--tile-border); padding: 14px 0; }

.feed-item > span { font-size: 23px; }

.feed-item strong { display: block; font-size: 12px; }

.feed-item small { color: var(--muted); font-size: 11px; }

.tips-panel h3 { font-size: 18px; margin-top: 8px; }

.tips-panel p { line-height: 1.65; }

.game-footer { padding: 25px 0; }

.notice { background: var(--panel); border: 1px solid var(--border); padding: 16px; border-radius: 12px; margin-bottom: 16px; }

.notice.error { color: #c45a48; }



/* Keep events and end-of-day results easy to read in both sky modes. */

.event-overlay { position: fixed; inset: 0; background: #0b252b9e; backdrop-filter: blur(9px);

  display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 1000; }

.event-modal { background: #f8fff8; color: #234939; border: 1px solid #72c9a0;

  border-radius: 24px; max-width: 510px; width: 100%; text-align: center;

  padding: 35px; box-shadow: 0 25px 90px #0b393950; }

.event-modal .eyebrow { color: #16855c; }

.event-hero { font-size: 70px; margin: 12px 0; }

.event-modal h2 { font-size: 29px; font-weight: 900; }

.event-modal > p { color: #5c7d6e; font-size: 14px; }

.choice-list { display: grid; gap: 12px; margin: 28px 0; }

.choice-list button { position: relative; text-align: left; padding: 18px 45px 18px 18px;

  background: #eaf7ec; border: 1px solid #c9e5d4; border-radius: 13px;

  color: #285543; cursor: pointer; transition: .2s; }

.choice-list button:hover { background: #d8f1df; border-color: #46bf89; transform: translateX(4px); }

.choice-list strong, .choice-list small { display: block; }

.choice-list small { color: #668a77; margin-top: 5px; }

.choice-list button span { position: absolute; right: 17px; top: 25px; font-size: 22px; }

.modal-note { color: #668a77; }

.results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }

.results-grid > div { background: #e5f6e9; border-radius: 12px; padding: 17px; }

.results-grid strong, .results-grid small { display: block; }

.results-grid strong { font-size: 24px; color: #138558; }

.results-grid small { font-size: 11px; color: #658475; }

.toast-message { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);

  background: #1d9c71; color: #fff; padding: 14px 24px; border-radius: 12px;

  font-weight: 800; z-index: 1100; box-shadow: 0 10px 30px #163d3540; }

.room-swap-enter-active, .room-swap-leave-active, .modal-enter-active, .modal-leave-active,

.toast-enter-active, .toast-leave-active { transition: all .28s; }

.room-swap-enter-from { opacity: 0; transform: translateX(24px); }

.room-swap-leave-to { opacity: 0; transform: translateX(-24px); }

.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(.94); }

.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 20px); }



@keyframes cloud-drift { from { translate: 0 0; } to { translate: calc(100vw + 500px) 0; } }

@keyframes twinkle { 50% { opacity: .35; } }

@keyframes sun-breathe { 50% { box-shadow: 0 0 0 25px #fff3b132, 0 0 110px 55px #ffe8a48c; } }

@keyframes pulse { 50% { opacity: .55; box-shadow: 0 0 20px #29c48a78; } }

@keyframes float { 50% { transform: translateY(-9px); } }



@media (max-width: 1100px) {

  .top-stats { grid-template-columns: repeat(3, 1fr); }

  .mission-grid { grid-template-columns: repeat(2, 1fr); }

}

@media (max-width: 780px) {

  .main-grid { grid-template-columns: 1fr; }

  .top-stats { grid-template-columns: repeat(2, 1fr); }

  .game-shell { padding: 18px 12px; }

  .game-header h1 { font-size: 33px; }

  .room-tab { min-width: 110px; }

  .top-stats > .stat-card { padding: 13px; }

  .clock { font-size: 28px; }

  .sky-sun { right: 9%; width: 85px; height: 85px; }

  .sky-moon { right: 9%; width: 68px; height: 68px; }

  .cloud-four { display: none; }

}

@media (max-width: 450px) {

  .mission-grid { grid-template-columns: 1fr; }

  .top-stats > .stat-card .stat-number { font-size: 24px; }

  .game-header h1 small { display: none; }

  .header-actions { justify-content: flex-start; }

  .sky-caption { flex-basis: 100%; width: max-content; }

  .game-button { padding: 10px 12px; }

}

@media (prefers-reduced-motion: reduce) {

  .sky-cloud, .sky-sun, .sky-stars::before, .sky-stars::after,

  .room-art, .radar, .live-dot { animation: none !important; }

  .sky-morning-layer, .sky-sunset-layer, .sky-night-layer,

  .sky-sun, .sky-moon { transition-duration: .01ms; }

  .sky-cloud { left: 20%; }

  .cloud-two { left: 55%; }

  .cloud-three { left: 8%; }

}





/* Mission-based layout: no Eco Score or Comfort components. */

.top-stats { grid-template-columns: 1.6fr repeat(3, minmax(0, 1fr)); }

.main-grid { grid-template-columns: minmax(0, 2fr) minmax(290px, 1fr); align-items: start; }

.house-panel { min-width: 0; }

.mission-sidebar { background: var(--panel); border: 1px solid var(--border); border-radius: 20px;

  box-shadow: 0 12px 35px #1a69421c; padding: 24px; backdrop-filter: blur(16px); position: sticky; top: 16px; }

.mission-sidebar h2 { font-size: 22px; margin: 8px 0 10px; line-height: 1.3; }

.mission-intro { color: var(--muted); font-size: 12px; line-height: 1.65; margin-bottom: 20px; }

.mission-progress { display: flex; justify-content: space-between; align-items: center; gap: 10px;

  font-size: 12px; margin: 16px 0 10px; }

.mission-progress strong { font-size: 14px; color: var(--accent-strong); }

.mission-progress span { color: var(--muted); }

.mission-track { height: 9px; background: var(--track); border-radius: 999px; overflow: hidden; }

.mission-track > div { height: 100%; background: var(--green-gradient); transition: width .3s; }

.current-goals { display: flex; flex-direction: column; gap: 11px; margin-top: 22px; }

.checklist-item { display: flex; align-items: flex-start; gap: 12px; background: var(--tile);

  border: 1px solid var(--tile-border); border-radius: 14px; padding: 15px 13px; transition: .3s; }

.checklist-item.completed { background: var(--soft); border-color: #55c49d; }

.check-square { display: grid; place-items: center; width: 25px; height: 25px; min-width: 25px;

  border: 2px solid #70bb95; border-radius: 7px; font-size: 17px; font-weight: 900; color: white; }

.checklist-item.completed .check-square { background: #24966a; border-color: #24966a; }

.checklist-item strong { display: block; font-size: 13px; }

.checklist-item p { color: var(--muted); font-size: 11px; line-height: 1.5; margin: 6px 0 0; }

.mission-bottom { margin-top: 22px; background: var(--soft); padding: 12px; border-radius: 11px;

  color: var(--accent-strong); font-size: 11px; line-height: 1.5; font-weight: 700; }

.home-heading { margin: 22px 0 15px; }

.situation-banner { display: flex; align-items: center; gap: 17px; padding: 20px;

  border-radius: 18px; border: 1px solid #a3dcc1; background: linear-gradient(120deg, #e3f8e9, #daf3eb);

  color: #245845; box-shadow: 0 8px 23px #2b96611a; }

.situation-icon { font-size: 49px; min-width: 54px; text-align: center; }

.situation-copy { flex: 1; min-width: 0; }

.situation-copy .eyebrow { color: #2e8e69; font-size: 9px; }

.situation-copy h2 { margin: 5px 0 7px; font-size: clamp(20px, 2.2vw, 27px); font-weight: 850; }

.situation-copy p { margin: 0; font-size: 12px; line-height: 1.65; color: #477665; }

.situation-timer { text-align: center; border-left: 1px solid #a2d8bd; padding-left: 17px; min-width: 86px; }

.situation-timer strong { display: block; font-size: 29px; line-height: 1.2; color: #187c5a; }

.situation-timer small { font-size: 10px; color: #477665; }

.situation-rain { background: linear-gradient(120deg, #daedfa, #d4eae9); border-color: #9fc7d2; }

.situation-haze { background: linear-gradient(120deg, #f5efd9, #e2e9da); border-color: #d5cda8; }

.situation-heat { background: linear-gradient(120deg, #fff0ce, #ecf5da); border-color: #e7cb8a; }

.situation-peak { background: linear-gradient(120deg, #e0f5ea, #e2edfd); }

.situation-night { background: linear-gradient(120deg, #dce2f7, #e1eeeb); }

.device-tile { font: inherit; }

.device-tile:disabled { cursor: not-allowed; opacity: .76; }

.device-tile:disabled:hover { transform: none; box-shadow: none; }

.calculation-note { margin: 18px 4px 0; font-size: 11px; color: var(--muted); line-height: 1.5; }

.situation-enter-active, .situation-leave-active { transition: opacity .35s ease, transform .35s ease; }

.situation-enter-from { opacity: 0; transform: translateY(-12px); }

.situation-leave-to { opacity: 0; transform: translateY(12px); }

.goal-results { max-width: 850px; max-height: 90vh; overflow-y: auto; }

.goal-result-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; text-align: left; }

.result-column { min-width: 0; background: #f1f9f2; border-radius: 14px; padding: 16px; }

.result-column h3 { font-size: 16px; margin: 0 0 13px; color: #24694b; }

.result-goal { padding: 12px; margin-bottom: 9px; border-radius: 9px; border-left: 3px solid #38ae78;

  background: #fff; font-size: 12px; }

.result-goal.missed { border-left-color: #dfa76a; }

.result-goal strong, .result-goal span, .result-goal small { display: block; }

.result-goal span { margin: 6px 0; line-height: 1.45; color: #527263; }

.result-goal small { color: #7a9282; font-size: 10px; }

.result-empty, .result-footnote { color: #668a77; font-size: 12px; }

/* Weather effects are CSS-only and are layered over the existing moving clouds. */

.sky-weather { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 2.4s; }

.weather-rain .sky-weather { opacity: .47; background: repeating-linear-gradient(110deg,

  transparent 0, transparent 23px, #e0f4ffac 24px, #e0f4ffac 26px, transparent 27px, transparent 45px);

  background-size: 110px 190px; animation: rain-fall 1s linear infinite; }

.weather-haze .sky-weather { opacity: .65; background: linear-gradient(180deg, #c2bca668, #e8e3c5a6 70%, #f2eddf6e); }

.weather-rain .sky-cloud { background: #becbd6c4; }

.weather-haze .sky-cloud { opacity: .75; background: #e8e0d6c1; }

@keyframes rain-fall { from { background-position: 0 0; } to { background-position: -110px 190px; } }

@media (max-width: 1100px) { .top-stats { grid-template-columns: repeat(2, 1fr); } }

@media (max-width: 780px) {

  .main-grid { grid-template-columns: 1fr; }

  .mission-sidebar { position: static; }

  .goal-result-columns { grid-template-columns: 1fr; }

  .situation-banner { flex-wrap: wrap; }

  .situation-timer { margin-left: auto; }

}

@media (max-width: 450px) { .top-stats { grid-template-columns: 1fr 1fr; } .situation-icon { font-size: 36px; } }

@media (prefers-reduced-motion: reduce) { .sky-weather { animation: none !important; } }





/* Clear separation between labels and headings (and mobile-safe wrapping). */

.quest-page .situation-banner { min-height: 120px; align-items: center; }

.quest-page .situation-copy .situation-label {

  display: block; position: static; transform: none;

  font-size: 11px; font-weight: 800; letter-spacing: .55px;

  line-height: 1.6; margin: 0 0 9px; color: #2e8e69;

}

.quest-page .situation-copy h2 {

  display: block; position: static; margin: 0 0 9px;

  line-height: 1.25; overflow-wrap: anywhere;

}

.quest-page .situation-copy p { line-height: 1.65; }

.quest-page .situation-timer { flex-shrink: 0; }

.quest-page .home-heading {

  display: flex; justify-content: space-between; align-items: center;

  gap: 12px; margin: 26px 0 16px;

}

.quest-page .home-heading h2 { margin: 0; font-size: 22px; font-weight: 850; line-height: 1.3; }

.quest-page .mission-heading {

  display: flex; flex-direction: column; align-items: flex-start;

  gap: 8px; margin-bottom: 14px;

}

.quest-page .mission-heading .mission-label {

  display: block; position: static; transform: none;

  font-size: 11px; font-weight: 800; line-height: 1.5;

  letter-spacing: .7px; color: var(--accent-strong); margin: 0;

}

.quest-page .mission-heading h2 {

  display: block; position: static; transform: none;

  margin: 0; line-height: 1.35; overflow-wrap: anywhere;

}

.quest-page .checklist-item > div { flex: 1; min-width: 0; }

.quest-page .checklist-item strong { line-height: 1.45; }

.quest-page .checklist-item p { line-height: 1.65; }

.quest-page .time-speed-note { font-size: 10px; line-height: 1.45; color: var(--muted); margin-top: 8px; }

@media (max-width: 520px) {

  .quest-page .situation-banner { gap: 12px; padding: 16px; }

  .quest-page .situation-icon { font-size: 38px; min-width: 42px; }

  .quest-page .situation-timer { border-left: 0; padding-left: 0; margin-left: 0; }

  .quest-page .home-heading h2 { font-size: 20px; }

}





/* Appliance settings added without changing the existing room layout. */

.device-wrapper { width: 155px; display: flex; flex-direction: column; gap: 7px; }

.device-wrapper .device-tile { width: 100%; }

.settings-button { border: 1px solid #b7dec9; border-radius: 10px; background: var(--panel); color: var(--ink); padding: 8px 4px; cursor: pointer; font-size: 12px; font-weight: 700; }

.settings-button:disabled { opacity: .55; cursor: not-allowed; }

.appliance-settings { flex-basis: 100%; width: 100%; max-width: 630px; margin: 6px auto; padding: 18px; background: var(--panel); color: var(--ink); border: 1px solid var(--tile-border); border-radius: 16px; text-align: left; }

.settings-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }

.settings-heading button { border: 0; background: transparent; color: var(--ink); font-size: 18px; cursor: pointer; }

.appliance-settings .setting-summary { margin: 7px 0 14px; color: var(--muted); opacity: 1; }

.setting-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin: 12px 0; }

.setting-row label { font-size: 13px; font-weight: 700; }

.setting-row select { min-width: 155px; padding: 9px; border-radius: 8px; border: 1px solid #b7dec9; color: #23483c; background: #fff; }

.setting-row input[type="range"] { width: min(230px, 100%); accent-color: #16855c; }

.setting-stepper { display: flex; align-items: center; gap: 15px; }

.setting-stepper button { width: 34px; height: 34px; border: 1px solid #b7dec9; border-radius: 8px; background: #e6f7eb; color: #174632; font-size: 18px; cursor: pointer; }

.setting-stepper button:disabled { opacity: .4; cursor: not-allowed; }

.settings-note { display: block; color: var(--muted); margin-top: 14px; line-height: 1.5; }



/* Highlight the appliance currently being adjusted */

.device-tile.selected {

  border: 3px solid #2563eb;

  background: #dbeafe;

  box-shadow: 0 0 0 3px #93c5fd;

}



/* Keep the blue highlight even when the appliance is ON */

.device-tile.powered.selected {

  border: 3px solid #2563eb;

  background: #dbeafe;

  box-shadow: 0 0 0 3px #93c5fd;

}



/* Selected appliance in nighttime mode */

.sky-night .device-tile.selected {

  border-color: #60a5fa;

  background: #1e3a5f;

  box-shadow: 0 0 0 3px #2563eb;

}


/* Keep all four statistic cards at their original height. Place the dropdown
   inside Electricity Cost without making the grid row taller. */
.top-stats > .stat-card.cost-plan-card {
  position: relative;
  padding: 0;
  min-width: 0;
  overflow: hidden;
}
.cost-plan-card :deep(.stat-card) {
  position: absolute;
  inset: 0;
  min-height: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  padding: 12px 14px 48px;
}
.cost-plan-card :deep(.stat-number) { margin: 8px 0 3px; }
.cost-plan-card :deep(.stat-foot) { margin-top: 4px; }
.cost-plan-picker {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 9px;
  min-width: 0;
}
.cost-plan-picker label {
  display: block;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .2px;
  color: var(--muted);
  margin-bottom: 3px;
}
.cost-plan-picker select {
  display: block;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 5px 6px;
  border: 1px solid #b7dec9;
  border-radius: 7px;
  background: #fff;
  color: #23483c;
  font-size: 11px;
}
.cost-plan-picker small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.2;
}

</style>