<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

// Temporary test household: the Express API retrieves this household from MongoDB.
const householdId = '6ad89eaa947d323d4c2b0ac0'
const rooms = ref([])
const catalogue = ref([])
const selectedRoomId = ref('')
const settingsApplianceId = ref('')
const loading = ref(false)
const error = ref('')

const playing = ref(false)
const finished = ref(false)
const minute = ref(480)
const energy = ref(0)
const cost = ref(0)
const electricityRate = 0.32 // Demonstration tariff (SGD per kWh)
const gameSpeed = 1800 // Wait 1.8 real seconds between 10-minute game ticks
const gameHours = 15 // 8 AM to 11 PM is 15 hours

// Each situation lasts 3 game hours, from 8 AM until 11 PM.
const currentSituation = ref(null)
const periodIndex = ref(0)
const missions = ref([])
const goalHistory = ref([])
const toast = ref('')
let timer = null
let toastTimer = null

const allowedCategories = ['kitchen', 'living', 'television', 'laundry', 'lights']

function getCatalogueItem(key) {
  return catalogue.value.find(item => item.typeKey === key)
}
// Read annual kWh for the exact efficiency tick chosen in the 3D home.
// If no tick was saved, use the catalogue's middle rating as a provisional estimate.
function getAnnualEnergy(details, tick) {
  if (!details) return null

  // Use the rating chosen in the 3D household when possible.
  if (details.ticks && details.ticks[tick]) {
    const value = Number(details.ticks[tick].kwhYear)
    if (Number.isFinite(value) && value >= 0) return value
  }

  // Some appliances, such as rice cookers, have one yearly value.
  if (details.kwhYear != null) {
    const value = Number(details.kwhYear)
    if (Number.isFinite(value) && value >= 0) return value
  }

  // If no efficiency rating was saved, use the median available value.
  const values = []
  const ratings = details.ticks || {}
  for (const rating in ratings) {
    const value = Number(ratings[rating].kwhYear)
    if (Number.isFinite(value) && value > 0) {
      values.push(value)
    }
  }

  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  if (values.length % 2 === 0) {
    return (values[middle - 1] + values[middle]) / 2
  }
  return values[middle]
}

function prettyName(key) {
  return String(key || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
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
function controlTypeFor(name, category) {
  const text = String(name).toLowerCase()
  if (/air.?con|air condition|split unit|system[_ -]?[234]|vrf/.test(text)) return 'aircon'
  if (/fan|circulator/.test(text) && !/extractor|hood/.test(text)) return 'fan'
  if (category === 'lights' || /lamp|light bulb|ceiling light|led light/.test(text)) return 'light'
  if (category === 'television' || /television|\btv\b/.test(text)) return 'tv'
  if (/washing machine|washer/.test(text)) return 'washer'
  if (/tumble dryer|clothes dryer|drying machine/.test(text)) return 'dryer'
  if (/water heater|instant heater|storage heater/.test(text)) return 'heater'
  if (/refrigerator|fridge|freezer/.test(text)) return 'fridge'
  if (/microwave/.test(text)) return 'microwave'
  if (/air fryer/.test(text)) return 'airfryer'
  if (/\boven\b/.test(text)) return 'oven'
  return ''
}
function defaultSetting(type) {
  if (type === 'aircon') return { temperature: 25, mode: 'Cool', speed: 'Auto' }
  if (type === 'fan') return { speed: '2', oscillation: 'On' }
  if (type === 'light') return { brightness: 100 }
  if (type === 'tv') return { picture: 'Normal' }
  if (type === 'washer') return { mode: 'Normal', water: 'Cold' }
  if (type === 'dryer') return { mode: 'Normal' }
  if (type === 'heater') return { temperature: 40 }
  if (type === 'fridge') return { temperature: 4 }
  if (type === 'microwave') return { level: 'Medium' }
  if (type === 'airfryer' || type === 'oven') return { temperature: 180 }
  return {}
}
function settingsDescription(item) {
  if (item.controlType === 'aircon') return `${item.setting.temperature}°C · ${item.setting.mode} · ${item.setting.speed}`
  if (item.controlType === 'fan') return `Speed ${item.setting.speed} · Oscillation ${item.setting.oscillation}`
  if (item.controlType === 'light') return `${item.setting.brightness}% brightness`
  if (item.controlType === 'tv') return `${item.setting.picture} picture`
  if (item.controlType === 'washer') return `${item.setting.mode} · ${item.setting.water} wash`
  if (item.controlType === 'dryer') return `${item.setting.mode} mode`
  if (item.controlType === 'heater' || item.controlType === 'fridge' || item.controlType === 'airfryer' || item.controlType === 'oven') return `${item.setting.temperature}°C`
  if (item.controlType === 'microwave') return `${item.setting.level} power`
  return ''
}
// ANNUAL-kWh GAME MODEL
// Annual kWh / 365 gives the reference energy for one whole day.
// Dividing by 15 spreads that amount equally across our 8 AM–11 PM game.
// This is a GAME assumption, not the appliance's actual measured kW.
// Multipliers below are also illustrative. They let settings affect energy use.
function effectivePower(item) {
  if (item.annualKwh == null) return 0

  let power = item.annualKwh / 365 / gameHours
  const setting = item.setting
  const type = item.controlType

  if (type === 'aircon') {
    if (setting.mode === 'Fan') {
      power = power * 0.12
    } else if (setting.mode === 'Dry') {
      power = power * 0.75
    } else {
      let temperatureFactor = 1 + (25 - setting.temperature) * 0.08
      temperatureFactor = Math.max(0.55, Math.min(1.35, temperatureFactor))
      power = power * temperatureFactor
      if (setting.speed === 'High') power = power * 1.08
      if (setting.speed === 'Low') power = power * 0.94
    }
  }

  if (type === 'fan') {
    if (setting.speed === '1') power = power * 0.55
    if (setting.speed === '2') power = power * 0.8
  }

  if (type === 'light') power = power * (setting.brightness / 100)

  if (type === 'tv') {
    if (setting.picture === 'Eco') power = power * 0.75
    if (setting.picture === 'Vivid') power = power * 1.15
  }

  if (type === 'washer') {
    if (setting.mode === 'Eco') power = power * 0.7
    if (setting.mode === 'Intensive') power = power * 1.25
    if (setting.water === 'Warm') power = power * 1.3
  }

  if (type === 'dryer') {
    if (setting.mode === 'Eco') power = power * 0.8
    if (setting.mode === 'Quick') power = power * 1.15
  }

  if (type === 'heater') {
    power = power * Math.max(0.6, Math.min(1.2, 1 + (setting.temperature - 40) * 0.025))
  }
  if (type === 'fridge') {
    power = power * Math.max(0.8, Math.min(1.25, 1 + (4 - setting.temperature) * 0.07))
  }
  if (type === 'microwave') {
    if (setting.level === 'Low') power = power * 0.45
    if (setting.level === 'Medium') power = power * 0.7
  }
  if (type === 'oven' || type === 'airfryer') {
    power = power * Math.max(0.7, Math.min(1.2, 1 + (setting.temperature - 180) * 0.002))
  }

  return power
}

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

// Week 5: async/await + Axios GET.
// Read the appliances the player placed in the 3D home.
async function loadRooms() {
  pauseGame()
  loading.value = true
  error.value = ''
  rooms.value = []
  selectedRoomId.value = ''

  try {
    const response = await axios.get('/api/dev/simulator')
    const records = response.data.rooms
    const items = response.data.items

    if (!Array.isArray(records) || !Array.isArray(items)) {
      throw new Error('Invalid rooms or catalogue response')
    }

    catalogue.value = items

    // Ordinary loops are easier to follow than several nested map/filter calls.
    for (const room of records) {
      const newRoom = {
        id: String(room._id?.$oid || room._id),
        name: room.name || prettyName(room.type || 'room'),
        type: room.type || 'other',
        order: room.order ?? 0,
        appliances: []
      }

      for (const placement of room.placements || []) {
        const details = getCatalogueItem(placement.applianceTypeKey)
        if (!details) continue
        if (!allowedCategories.includes(details.category)) continue

        const type = controlTypeFor(details.name + ' ' + details.typeKey, details.category)
        const yearly = getAnnualEnergy(details, placement.tick)
        const selectedRating = details.ticks && details.ticks[placement.tick]

        newRoom.appliances.push({
          id: String(placement._id?.$oid || placement._id),
          key: placement.applianceTypeKey,
          name: details.name,
          category: details.category,
          tick: placement.tick || '',
          annualKwh: yearly,
          estimatedRating: !selectedRating && details.kwhYear == null,
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
    error.value = err.response?.data?.error || err.message || 'Could not load household'
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
const settingAppliances = computed(() => allAppliances.value.filter(item => item.id === settingsApplianceId.value && item.controlType))
const currentPower = computed(() => {
  let total = 0
  for (const item of allAppliances.value) {
    if (item.on) total = total + effectivePower(item)
  }
  return total
})
const unknownAnnualCount = computed(() => allAppliances.value.filter(item => item.annualKwh == null).length)
const estimatedRatingCount = computed(() => allAppliances.value.filter(item => item.annualKwh != null && item.estimatedRating).length)
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

// The catalogue's categories describe the kind of appliance, NOT its room.
// Match missions to electrical appliances that the household actually placed.
function isLight(item) {
  return item.category === 'lights'
}
function isTelevision(item) {
  return item.category === 'television'
}
function isCooling(item) {
  return item.controlType === 'aircon' || item.controlType === 'fan'
}
function isCooking(item) {
  return item.category === 'kitchen' && !isEssential(item)
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

function startSituation(index) {
  periodIndex.value = index
  currentSituation.value = pickSituation(index)
  missions.value = []

  const usedIds = []
  const devices = allAppliances.value.filter(item => !isEssential(item))
  const lights = devices.filter(isLight)
  const televisions = devices.filter(isTelevision)
  const cooling = devices.filter(isCooling)
  const cooking = devices.filter(isCooking)
  const laundry = devices.filter(isLaundry)

  // Add a task to switch on a real appliance, but only if it is OFF already.
  // Don't switch an appliance off just to make the player turn it on again.
  function addOnGoal(candidates, title, reason) {
    const choices = candidates.filter(item => !usedIds.includes(item.id) && !item.on)
    if (!choices.length) return false

    const item = chooseRandom(choices)
    usedIds.push(item.id)
    missions.value.push({
      title,
      detail: `${reason} Turn on ${item.name} in ${applianceRoom(item)}.`,
      action: 'on', targetId: item.id, done: false
    })
    return true
  }

  // Simulate an unnecessary appliance left running. Never do this with a fridge.
  function addOffGoal(candidates, title, reason) {
    const choices = candidates.filter(item => !usedIds.includes(item.id) && !isEssential(item))
    if (!choices.length) return false

    // Prefer a device that is already running, otherwise one has been left ON.
    const running = choices.filter(item => item.on)
    const item = chooseRandom(running.length ? running : choices)
    item.on = true
    usedIds.push(item.id)
    missions.value.push({
      title,
      detail: `${reason} Find ${item.name} in ${applianceRoom(item)} and switch it off.`,
      action: 'off', targetId: item.id, done: false
    })
    return true
  }

  // Appliance-settings missions: only choose controls that exist in this home.
  // These are gameplay controls; actual model-specific capabilities may vary.
  function addSettingGoal(candidates, title, reason, settingKey, targetValue, comparison = 'equals') {
    const choices = []
    for (const item of candidates) {
      if (usedIds.includes(item.id)) continue
      if (!item.controlType) continue
      if (item.setting[settingKey] === undefined) continue
      if (settingMatches(item.setting[settingKey], targetValue, comparison)) continue
      choices.push(item)
    }
    if (choices.length === 0) return false

    const item = chooseRandom(choices)
    usedIds.push(item.id)
    item.on = true

    let instruction = 'Set ' + settingKey + ' to ' + targetValue
    if (comparison === 'atLeast') instruction = 'Set ' + settingKey + ' to at least ' + targetValue
    if (comparison === 'atMost') instruction = 'Set ' + settingKey + ' to at most ' + targetValue
    if (settingKey === 'temperature') instruction = instruction + '°C'
    if (settingKey === 'brightness') instruction = instruction + '%'

    missions.value.push({
      title: title,
      detail: reason + ' Open Settings for ' + item.name + ' in ' + applianceRoom(item) + '. ' + instruction + '.',
      action: 'setting',
      targetId: item.id,
      settingKey: settingKey,
      targetValue: targetValue,
      comparison: comparison,
      done: false
    })
    return true
  }

  // An exploration goal is always possible even in a household with no devices.
  if (rooms.value.length) {
    const otherRooms = rooms.value.filter(room => room.id !== selectedRoomId.value)
    const room = chooseRandom(otherRooms.length ? otherRooms : rooms.value)
    missions.value.push({
      title: currentSituation.value.roomGoal,
      detail: `Visit ${room.name} to check the situation.`,
      action: 'visit', targetId: room.id, done: false
    })
  }

  // Each situation has its own preferred appliance tasks. A missing device
  // means that task is skipped or replaced, never assigned to the player.
  const situation = currentSituation.value.key

  // Prefer a setting-based challenge during each situation. Fall back to ON/OFF
  // missions if the household does not have a suitable adjustable appliance.
  if (situation === 'sunny') {
    if (!addSettingGoal(devices.filter(item => item.controlType === 'light'), 'Dim lights for daylight', 'Natural sunlight is available.', 'brightness', 50, 'atMost')) {
      addSettingGoal(devices.filter(item => item.controlType === 'fan'), 'Use a gentle breeze', 'Comfortable weather means maximum fan speed is unnecessary.', 'speed', '1')
    }
  }
  if (situation === 'heat') {
    if (!addSettingGoal(devices.filter(item => item.controlType === 'aircon'), 'Raise aircon temperature', 'Save cooling energy while staying comfortable.', 'temperature', 26, 'atLeast')) {
      addSettingGoal(devices.filter(item => item.controlType === 'fan'), 'Choose an efficient fan speed', 'Use a moderate fan setting.', 'speed', '2')
    }
  }
  if (situation === 'rain') {
    if (!addSettingGoal(devices.filter(item => item.controlType === 'washer'), 'Choose a cold wash', 'Save water-heating energy on laundry.', 'water', 'Cold')) {
      addSettingGoal(devices.filter(item => item.controlType === 'light'), 'Use moderate lighting', 'Cloudy skies do not always require full brightness.', 'brightness', 60, 'atMost')
    }
  }
  if (situation === 'haze') {
    if (!addSettingGoal(devices.filter(item => item.controlType === 'aircon'), 'Use moderate cooling', 'Keep indoor cooling energy-conscious.', 'temperature', 26, 'atLeast')) {
      addSettingGoal(devices.filter(item => item.controlType === 'fan'), 'Lower the fan speed', 'Avoid unnecessary high fan power.', 'speed', '1')
    }
  }
  if (situation === 'peak') {
    if (!addSettingGoal(devices.filter(item => item.controlType === 'washer' || item.controlType === 'dryer'), 'Select Eco cycle', 'Reduce simulated electricity consumption during peak demand.', 'mode', 'Eco')) {
      if (!addSettingGoal(devices.filter(item => item.controlType === 'aircon'), 'Reduce cooling demand', 'Raise the cooling setpoint.', 'temperature', 27, 'atLeast')) {
        addSettingGoal(devices.filter(item => item.controlType === 'light'), 'Dim household lights', 'Reduce avoidable lighting demand.', 'brightness', 40, 'atMost')
      }
    }
  }
  if (situation === 'night') {
    if (!addSettingGoal(devices.filter(item => item.controlType === 'light'), 'Dim evening lights', 'Use softer lighting before bedtime.', 'brightness', 30, 'atMost')) {
      addSettingGoal(devices.filter(item => item.controlType === 'aircon'), 'Set a gentler night temperature', 'Avoid excessive cooling overnight.', 'temperature', 26, 'atLeast')
    }
  }

  if (situation === 'sunny') {
    // Sunlight is available: lights and unused entertainment are wasteful.
    addOffGoal(lights, 'Use natural daylight', 'It is sunny outside, so extra lighting is not needed.')
    addOffGoal(televisions, 'Avoid unnecessary screen time', 'The television has been left running.') ||
      addOffGoal([...cooking, ...laundry], 'Switch off an unused appliance', 'Nobody is using this device.')
  }

  if (situation === 'heat') {
    // Cooling can be useful, but heat-producing devices should not run unused.
    addOnGoal(cooling, 'Cool the room', 'Temperatures are climbing. Use the available cooling appliance if needed.')
    addOffGoal([...cooking, ...laundry], 'Reduce unnecessary indoor heat', 'An unattended cooking or laundry appliance adds heat.') ||
      addOffGoal(lights, 'Avoid extra heat from lighting', 'Daylight is bright enough without unnecessary lights.')
  }

  if (situation === 'rain') {
    // Dark clouds may require lighting; unused entertainment still wastes power.
    addOnGoal(lights, 'Light up a gloomy room', 'Rain clouds have darkened the home.')
    addOffGoal(televisions, 'Switch off unused entertainment', 'The television was left on during the storm.') ||
      addOffGoal([...cooking, ...laundry], 'Avoid wasting electricity', 'The appliance is running even though it is not being used.')
  }

  if (situation === 'haze') {
    // A cooking device can produce indoor particles; do not claim AC filters haze.
    addOffGoal(cooking, 'Reduce avoidable indoor fumes', 'During haze, avoid running unnecessary cooking equipment.')
    addOnGoal(cooling, 'Stay comfortable indoors', 'The room is warm while you are staying inside.') ||
      addOffGoal(televisions, 'Switch off unused entertainment', 'Keep your indoor activities energy-conscious.')
  }

  if (situation === 'peak') {
    // Prioritise power-hungry appliance types without inventing live wattage.
    addOffGoal([...cooling, ...laundry], 'Reduce peak-hour demand', 'Avoid using unnecessary cooling or laundry equipment during peak hours.') ||
      addOffGoal(cooking, 'Avoid unnecessary peak-hour cooking', 'This cooking appliance is running needlessly.')
    addOffGoal([...televisions, ...lights], 'Cut standby-time waste', 'Turn off an unnecessary screen or light.') ||
      addOffGoal(cooking, 'Switch off another unused appliance', 'Every avoidable device adds to demand.')
  }

  if (situation === 'night') {
    // Evening wind-down: fewer lights and entertainment devices should run.
    addOffGoal(lights, 'Turn off unused lights', 'It is bedtime, and this room no longer needs lighting.')
    addOffGoal(televisions, 'Switch off the television', 'The television has been left on before bedtime.') ||
      addOffGoal([...cooking, ...laundry], 'Shut down the evening appliances', 'Nobody is using this device anymore.')
  }

  // If none of the situation-specific appliance tasks are available, use one
  // safe, achievable energy-saving task from another non-essential device.
  if (missions.value.length < 2 && devices.length) {
    const fallbackText = {
      sunny: 'Sunlight is plentiful, so avoid unnecessary electricity use.',
      heat: 'The household is already hot. Avoid adding waste heat from idle devices.',
      rain: 'During the rainy spell, avoid leaving devices on unnecessarily.',
      haze: 'While staying indoors during the haze, minimise unnecessary electricity use.',
      peak: 'Electricity demand is high. Switch off devices that are not needed.',
      night: 'Before bedtime, make sure idle appliances are turned off.'
    }
    addOffGoal(devices, 'Switch off an unused appliance', fallbackText[situation])
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
function checkSettingGoals(item) {
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
  cost.value = cost.value + energyThisTick * electricityRate

  // Every 3 game hours the old checklist is archived and replaced.
  if (minute.value >= 1380) {
    finishGame()
  } else if (minute.value >= nextChangeMinute.value) {
    recordGoals()
    startSituation(periodIndex.value + 1)
  }
}
function startGame() {
  if (finished.value || playing.value || !rooms.value.length) return
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
          <button v-if="!playing && !finished" class="game-button primary" @click="startGame" :disabled="!rooms.length">▶ {{ minute === 480 ? 'START DAY' : 'RESUME' }}</button>
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
        <div class="stat-card">
          <div class="stat-label">⚡ ENERGY USED</div>
          <div class="stat-number">{{ energy.toFixed(3) }} <small>kWh</small></div>
          <div class="stat-foot">SIMULATED POWER {{ currentPower.toFixed(3) }} kW</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">💳 ELECTRICITY COST</div>
          <div class="stat-number">S${{ cost.toFixed(2) }}</div>
          <div class="stat-foot">DEMO TARIFF · S${{ electricityRate.toFixed(2) }}/kWh</div>
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
                <div v-for="item in selectedRoom.appliances" :key="item.id" class="device-wrapper">
                  <button type="button" class="device-tile" :class="{ powered: item.on }" :disabled="!playing || finished" @click="toggleAppliance(item)">
                    <span class="device-emoji">{{ item.icon }}</span>
                    <strong>{{ item.name }}</strong>
                    <span class="device-power">{{ item.annualKwh != null ? item.annualKwh + ' kWh/year' : 'Annual kWh unavailable' }}</span>
                    <span class="switch" :class="{ on: item.on }"><span></span></span>
                  </button>
                  <button v-if="item.controlType" type="button" class="settings-button" :disabled="!playing || finished" @click="openSettings(item)">
                    ⚙️ {{ settingsApplianceId === item.id ? 'Close settings' : 'Settings' }}
                  </button>
                </div>
                <div v-for="item in settingAppliances" :key="'settings-' + item.id" class="appliance-settings">
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
                  <div v-if="item.controlType === 'washer' || item.controlType === 'dryer'" class="setting-row"><label>Cycle</label><select @change="checkSettingGoals(item)" v-model="item.setting.mode"><option>Eco</option><option>Normal</option><option v-if="item.controlType === 'washer'">Intensive</option><option v-else>Quick</option></select></div>
                  <div v-if="item.controlType === 'washer'" class="setting-row"><label>Water</label><select @change="checkSettingGoals(item)" v-model="item.setting.water"><option>Cold</option><option>Warm</option></select></div>
                  <div v-if="item.controlType === 'microwave'" class="setting-row"><label>Power level</label><select @change="checkSettingGoals(item)" v-model="item.setting.level"><option>Low</option><option>Medium</option><option>High</option></select></div>
                  <small class="settings-note">The game spreads each appliance’s annual kWh across 365 days and 15 game hours. Settings use illustrative multipliers; these are not measured power ratings. Oscillation does not change this estimate.</small>
                </div>
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
                <div><strong>{{ mission.title }}</strong><p>{{ mission.detail }}</p></div>
              </div>
              <p v-if="!missions.length" class="mission-intro">No missions for this household yet.</p>
            </div>
            <div class="mission-bottom">{{ playing ? '⏳ Time is running — complete the checklist!' : finished ? '✅ Day complete' : '▶ Start the day to work on these goals.' }}</div>
          </section>
        </aside>
      </div>
      <p class="calculation-note">⚡ Simplified energy model: annual kWh ÷ 365 ÷ 15, counted only while each appliance is ON. This is a gameplay estimate, not a measured electricity bill.
        <span v-if="estimatedRatingCount"> {{ estimatedRatingCount }} appliance(s) had no saved efficiency tick, so their middle catalogue rating was used.</span>
        <span v-if="unknownAnnualCount"> ⚠ {{ unknownAnnualCount }} appliance(s) have no annual kWh data and cannot be counted.</span>
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
.stat-card, .missions, .house-panel, .event-panel, .tips-panel {
  background: var(--panel); border: 1px solid var(--border); border-radius: 20px;
  box-shadow: 0 12px 35px #1a69421c; backdrop-filter: blur(16px);
  transition: background 2s ease, border-color 2s ease, box-shadow .3s;
}
.stat-card { padding: 18px; min-height: 137px; }
.stat-card:hover, .mission:hover { box-shadow: 0 14px 32px #235c4129; }
.stat-number { font-size: 29px; font-weight: 900; margin: 18px 0 10px; }
.stat-number small { font-size: 13px; color: var(--muted); }
.stat-number.green { color: var(--accent-strong); }
.stat-number.blue { color: #3698c1; }
.sky-night .stat-number.blue { color: #8ad6f4; }
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
  .stat-card { padding: 13px; }
  .clock { font-size: 28px; }
  .sky-sun { right: 9%; width: 85px; height: 85px; }
  .sky-moon { right: 9%; width: 68px; height: 68px; }
  .cloud-four { display: none; }
}
@media (max-width: 450px) {
  .mission-grid { grid-template-columns: 1fr; }
  .stat-number { font-size: 24px; }
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
</style>