<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

// Temporary MongoDB test household. Login integration will be added later.
const householdId = '6ad87c2fc94ce19dabd47120'

const rooms = ref([])
const selectedRoomId = ref('')
const loading = ref(false)
const error = ref('')
const playing = ref(false)
const finished = ref(false)
const minute = ref(7 * 60)
const energy = ref(0)
const cost = ref(0)
const comfort = ref(80)
const eco = ref(100)
const electricityRate = 0.32 // Demo rate: change to your electricity tariff (SGD/kWh)
const gameSpeed = 1000 // 1 real second = 5 game minutes
const events = ref([])
const currentEvent = ref(null)
const nextEventMinute = ref(8 * 60)
const toast = ref('')
const weather = ref('Sunny')
const priceMultiplier = ref(1)
const missionCount = ref(0)
const missions = ref([])
let timer = null
let toastTimer = null

// Catalogue is loaded from MongoDB through the Express API.
const catalogue = ref([])
const allowedCategories = ['kitchen', 'living', 'television', 'laundry', 'lights']

function getCatalogueItem(key) {
  return catalogue.value.find(item => item.typeKey === key)
}

function getAnnualEnergy(details, tick) {
  if (!details) return null
  const tickValue = details.ticks?.[tick]?.kwhYear
  const value = tickValue ?? details.kwhYear
  return value == null ? null : Number(value)
}

function prettyName(key) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
function iconFor(key) {
  const text = key.toLowerCase()
  if (text.includes('air') || text.includes('ac')) return '❄️'
  if (text.includes('fan')) return '🌀'
  if (text.includes('light') || text.includes('lamp')) return '💡'
  if (text.includes('fridge') || text.includes('refrigerator')) return '🧊'
  if (text.includes('tv') || text.includes('television') || text.includes('inch')) return '📺'
  if (text.includes('heater')) return '🚿'
  if (text.includes('system')) return '🎛️'
  return '🔌'
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
  toastTimer = setTimeout(() => { toast.value = '' }, 2600)
}

async function loadRooms() {
  pauseGame()
  rooms.value = []
  selectedRoomId.value = ''
  loading.value = true
  error.value = ''
  try {
    // One temporary API route gets rooms and appliances from MongoDB without login.
    // The backend uses the same hardcoded household ID shown above.
    const response = await axios.get('/api/dev/simulator')
    const records = response.data.rooms
    const items = response.data.items
    if (!Array.isArray(records) || !Array.isArray(items)) throw new Error('Invalid rooms or catalogue response')
    catalogue.value = items
    rooms.value = records.map(room => ({
      id: typeof room._id === 'object' ? (room._id.$oid || String(room._id)) : String(room._id),
      name: room.name || prettyName(room.type || 'room'),
      type: room.type || 'other',
      order: room.order ?? 0,
      appliances: (room.placements || [])
        .filter(item => {
          const details = getCatalogueItem(item.applianceTypeKey)
          return details && allowedCategories.includes(details.category)
        })
        .map(item => {
          const key = item.applianceTypeKey
          const details = getCatalogueItem(key)
          // powerKw is actual rated power. Annual kWh is NOT interchangeable with kW.
          const power = item.powerKw ?? details.powerKw
          return {
            id: typeof item._id === 'object' ? (item._id.$oid || String(item._id)) : String(item._id),
            key,
            name: details.name,
            category: details.category,
            tick: item.tick || '',
            annualKwh: getAnnualEnergy(details, item.tick),
            power: power == null ? 0 : Number(power),
            icon: iconFor(details.name + ' ' + key),
            on: false,
            knownPower: power != null
          }
        })
    })).sort((a, b) => a.order - b.order)
    selectedRoomId.value = rooms.value[0]?.id || ''
    resetGame()
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Could not load test household'
  } finally {
    loading.value = false
  }
}

const selectedRoom = computed(() => rooms.value.find(room => room.id === selectedRoomId.value))
const allAppliances = computed(() => rooms.value.flatMap(room => room.appliances))
const activeAppliances = computed(() => allAppliances.value.filter(item => item.on))
const currentPower = computed(() => activeAppliances.value.reduce((sum, item) => sum + item.power, 0))
const unknownPowerCount = computed(() => allAppliances.value.filter(item => !item.knownPower).length)
const progress = computed(() => Math.min(100, (minute.value - 420) / 960 * 100))
const timeText = computed(() => {
  const h = Math.floor(minute.value / 60)
  const m = minute.value % 60
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
})
const nextEventText = computed(() => {
  if (finished.value) return 'DAY COMPLETE'
  const remaining = Math.max(0, nextEventMinute.value - minute.value)
  return `${remaining} game min`
})

function switchRoom(room) {
  selectedRoomId.value = room.id
  showToast(`Entered ${room.name}`)
}
function toggleAppliance(item) {
  if (!playing.value || finished.value || currentEvent.value) return
  item.on = !item.on
  showToast(`${item.name} switched ${item.on ? 'ON' : 'OFF'}`)
  checkMissions()
}
function resetGame() {
  clearInterval(timer)
  timer = null
  playing.value = false
  finished.value = false
  minute.value = 420
  energy.value = 0
  cost.value = 0
  comfort.value = 80
  eco.value = 100
  priceMultiplier.value = 1
  weather.value = 'Sunny'
  events.value = []
  currentEvent.value = null
  nextEventMinute.value = 480 + Math.floor(Math.random() * 60)
  missionCount.value = 0
  missions.value = [
    { title: 'Start your household', detail: 'Turn on one appliance', done: false },
    { title: 'Energy saver', detail: 'Turn all appliances off at least once', done: false },
    { title: 'Stay comfortable', detail: 'Keep comfort above 50', done: false },
    { title: 'Finish the day', detail: 'Reach 11 PM', done: false }
  ]
  for (const item of allAppliances.value) item.on = false
}
function checkMissions() {
  if (activeAppliances.value.length > 0) missions.value[0].done = true
  if (missions.value[0].done && activeAppliances.value.length === 0) missions.value[1].done = true
  if (playing.value && comfort.value >= 50 && minute.value >= 540) missions.value[2].done = true
  missionCount.value = missions.value.filter(item => item.done).length
}

const eventPool = [
  { icon: '🔥', title: 'HEATWAVE WARNING', detail: 'The temperature has climbed. How will you respond?', choices: [
    { label: 'Use natural ventilation', comfort: -12, eco: 8, note: 'Less energy, but the house gets warmer.' },
    { label: 'Cool the home', comfort: 12, eco: -8, note: 'More comfortable, but energy demand increases.' }
  ] },
  { icon: '⛈️', title: 'THUNDERSTORM', detail: 'A sudden storm is approaching your HDB.', choices: [
    { label: 'Close windows and stay inside', comfort: 3, eco: 4, note: 'The household is protected.' },
    { label: 'Ignore the storm', comfort: -12, eco: -4, note: 'The household becomes uncomfortable.' }
  ] },
  { icon: '🌫️', title: 'HAZE ALERT', detail: 'Air quality is worsening outside.', choices: [
    { label: 'Keep outdoor air out', comfort: 7, eco: 3, note: 'Indoor comfort improves.' },
    { label: 'Leave windows open', comfort: -15, eco: 1, note: 'Poor air quality affects comfort.' }
  ] },
  { icon: '💸', title: 'PEAK PRICE ALERT', detail: 'Electricity is temporarily more expensive!', choices: [
    { label: 'Reduce non-essential usage', comfort: -4, eco: 10, price: 1, note: 'You avoided the price surge.' },
    { label: 'Keep normal usage', comfort: 5, eco: -8, price: 1.5, note: 'The electricity rate increased.' }
  ] },
  { icon: '👥', title: 'UNEXPECTED VISITORS', detail: 'Guests have arrived at your home.', choices: [
    { label: 'Welcome guests efficiently', comfort: 4, eco: 6, note: 'You made guests comfortable without waste.' },
    { label: 'Prioritise maximum comfort', comfort: 12, eco: -6, note: 'Guests are happy, but energy efficiency falls.' }
  ] }
]
function triggerEvent() {
  const event = eventPool[Math.floor(Math.random() * eventPool.length)]
  currentEvent.value = event
  events.value.unshift({ icon: event.icon, title: event.title, time: timeText.value })
  if (events.value.length > 5) events.value.pop()
  playing.value = false
  clearInterval(timer)
  timer = null
}
function chooseEvent(choice) {
  comfort.value = Math.max(0, Math.min(100, comfort.value + choice.comfort))
  eco.value = Math.max(0, Math.min(100, eco.value + choice.eco))
  if (choice.price) priceMultiplier.value = choice.price
  showToast(choice.note)
  currentEvent.value = null
  nextEventMinute.value = Math.min(1300, minute.value + 70 + Math.floor(Math.random() * 70))
  startGame()
}
function gameTick() {
  if (minute.value >= 1380) {
    finishGame()
    return
  }
  const step = Math.min(5, 1380 - minute.value)
  minute.value += step
  const added = currentPower.value * (step / 60)
  energy.value += added
  cost.value += added * electricityRate * priceMultiplier.value
  if (currentPower.value > 1.5) eco.value = Math.max(0, eco.value - 0.3)
  else if (activeAppliances.value.length === 0) eco.value = Math.min(100, eco.value + 0.1)
  if (activeAppliances.value.length === 0) comfort.value = Math.max(0, comfort.value - 0.12)
  else comfort.value = Math.min(100, comfort.value + 0.05)
  checkMissions()
  if (minute.value >= nextEventMinute.value && minute.value < 1350) triggerEvent()
  if (minute.value >= 1380) finishGame()
}
function startGame() {
  if (finished.value || currentEvent.value || playing.value) return
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
  finished.value = true
  missions.value[3].done = true
  checkMissions()
}
onMounted(loadRooms)
onUnmounted(() => { clearInterval(timer); clearTimeout(toastTimer) })
</script>

<template>
  <div class="quest-page">
    <div class="quest-glow"></div>
    <main class="game-shell">
      <header class="game-header">
        <div><div class="eyebrow">HDB ECOHOME / INTERACTIVE SIMULATION</div><h1>ENERGY <span>QUEST</span><small> // HOME OPS</small></h1><p>Manage your real household. Survive unexpected events. Save energy.</p></div>
        <div class="header-actions"><span class="live-dot"></span><span>{{ playing ? 'SIMULATION LIVE' : finished ? 'DAY COMPLETE' : 'STANDBY' }}</span><button v-if="!playing && !finished && !currentEvent" class="game-button primary" @click="startGame" :disabled="!rooms.length">▶ {{ minute === 420 ? 'START GAME' : 'RESUME' }}</button><button v-if="playing" class="game-button" @click="pauseGame">Ⅱ PAUSE</button><button class="game-button" @click="resetGame">↻ RESET</button></div>
      </header>

      <div v-if="loading" class="notice">Loading household from MongoDB...</div>
      <div v-if="error" class="notice error">{{ error }} <button class="game-button" @click="loadRooms">Retry</button></div>

      <section class="top-stats">
        <div class="stat-card clock-card"><div class="stat-label">◷ IN-GAME TIME</div><div class="clock">{{ timeText }}</div><div class="time-track"><div :style="{ width: progress + '%' }"></div></div><div class="stat-foot"><span>7:00 AM</span><span>11:00 PM</span></div></div>
        <div class="stat-card"><div class="stat-label">⚡ ENERGY USED</div><div class="stat-number">{{ energy.toFixed(2) }} <small>kWh</small></div><div class="stat-foot">LIVE POWER {{ currentPower.toFixed(2) }} kW</div></div>
        <div class="stat-card"><div class="stat-label">💳 ELECTRICITY COST</div><div class="stat-number">${{ cost.toFixed(2) }}</div><div class="stat-foot">DEMO TARIFF · ${{ electricityRate.toFixed(2) }}/kWh</div></div>
        <div class="stat-card"><div class="stat-label">🌱 ECO SCORE</div><div class="stat-number green">{{ Math.round(eco) }} <small>/ 100</small></div><div class="meter"><div :style="{width: eco + '%'}"></div></div></div>
        <div class="stat-card"><div class="stat-label">♥ COMFORT</div><div class="stat-number blue">{{ Math.round(comfort) }}<small>%</small></div><div class="meter blue-meter"><div :style="{width: comfort + '%'}"></div></div></div>
      </section>

      <section class="missions"><div class="section-heading"><div><div class="eyebrow">YOUR OBJECTIVES</div><h2>Daily missions <span>{{ missionCount }}/4</span></h2></div><span class="small-muted">Complete objectives before the day ends</span></div><div class="mission-grid"><div v-for="(mission, i) in missions" :key="i" class="mission" :class="{completed: mission.done}"><div class="mission-icon">{{ mission.done ? '✓' : String(i+1).padStart(2,'0') }}</div><div><strong>{{ mission.title }}</strong><p>{{ mission.detail }}</p></div></div></div></section>

      <div class="main-grid">
        <section class="house-panel"><div class="section-heading"><div><div class="eyebrow">HOUSEHOLD CONTROL CENTER</div><h2>Explore your home</h2></div><span class="room-count">{{ rooms.length }} ROOMS</span></div><div class="room-tabs"><button v-for="room in rooms" :key="room.id" class="room-tab" :class="{active:selectedRoomId===room.id}" @click="switchRoom(room)"><span>{{ roomIcon(room.type) }}</span><strong>{{ room.name }}</strong><small>{{ room.appliances.length }} devices</small></button></div>
          <Transition name="room-swap" mode="out-in"><div v-if="selectedRoom" :key="selectedRoom.id" class="room-stage" :class="'room-' + selectedRoom.type"><div class="stage-shine"></div><div class="room-stage-top"><span class="stage-tag">● CURRENT ROOM</span><span>{{ selectedRoom.type.toUpperCase() }}</span></div><div class="room-art">{{ roomIcon(selectedRoom.type) }}</div><h3>{{ selectedRoom.name }}</h3><p>Tap a device below to switch it on or off</p><div class="room-devices"><div v-for="item in selectedRoom.appliances" :key="item.id" class="device-tile" :class="{powered:item.on}" @click="toggleAppliance(item)"><span class="device-emoji">{{ item.icon }}</span><strong>{{ item.name }}</strong><span class="device-power">{{ item.knownPower ? item.power + ' kW' : (item.annualKwh != null ? item.annualKwh + ' kWh/year · power unknown' : 'Power unknown') }}</span><span class="switch" :class="{on:item.on}"><span></span></span></div><div v-if="!selectedRoom.appliances.length" class="empty-devices">No electrical appliances placed in this room yet.</div></div></div></Transition>
          <div class="house-footer"><span>● {{ activeAppliances.length }} APPLIANCES RUNNING</span><span>{{ 'HOUSEHOLD · ' + householdId.slice(-8) }}</span></div>
        </section>
        <aside class="side-panel"><div class="event-panel"><div class="section-heading"><div><div class="eyebrow">LIVE INCIDENT NETWORK</div><h2>Event radar</h2></div><div class="radar"><span></span></div></div><div class="event-countdown"><span>NEXT UNEXPECTED EVENT</span><strong>{{ nextEventText }}</strong></div><div class="event-feed"><div v-if="!events.length" class="feed-empty">No incidents yet. Stay alert as the day progresses.</div><div v-for="(event,i) in events" :key="i" class="feed-item"><span>{{ event.icon }}</span><div><strong>{{ event.title }}</strong><small>{{ event.time }}</small></div></div></div></div><div class="tips-panel"><div class="eyebrow">SYSTEM STATUS</div><h3>Household insights</h3><p>{{ activeAppliances.length }} of {{ allAppliances.length }} appliances are currently switched on.</p><p v-if="unknownPowerCount">⚠ {{ unknownPowerCount }} device(s) have annual energy estimates but no rated power (kW). Live cost excludes those devices until powerKw is provided.</p><p>Energy calculations use placed electrical devices only. Doors and windows are excluded.</p><p>Weather and event outcomes are simulated for gameplay.</p></div></aside>
      </div>
      <footer class="game-footer">HDB ECOHOME · ENERGY QUEST <span>POWERED BY YOUR HOUSEHOLD DATA</span></footer>
    </main>

    <Transition name="modal"><div v-if="currentEvent" class="event-overlay"><div class="event-modal"><div class="eyebrow">⚠ INCOMING LIVE EVENT</div><div class="event-hero">{{ currentEvent.icon }}</div><h2>{{ currentEvent.title }}</h2><p>{{ currentEvent.detail }}</p><div class="choice-list"><button v-for="(choice,i) in currentEvent.choices" :key="i" @click="chooseEvent(choice)"><strong>{{ choice.label }}</strong><small>{{ choice.note }}</small><span>→</span></button></div><div class="modal-note">THE CLOCK IS PAUSED WHILE YOU DECIDE</div></div></div></Transition>
    <Transition name="modal"><div v-if="finished" class="event-overlay"><div class="event-modal results"><div class="eyebrow">MISSION COMPLETE</div><div class="event-hero">🏆</div><h2>DAY COMPLETE!</h2><p>Your household made it from 7 AM to 11 PM.</p><div class="results-grid"><div><strong>{{ energy.toFixed(2) }}</strong><small>kWh used</small></div><div><strong>${{ cost.toFixed(2) }}</strong><small>Total cost</small></div><div><strong>{{ Math.round(eco) }}</strong><small>Eco score</small></div><div><strong>{{ missionCount }}/4</strong><small>Missions</small></div></div><button class="game-button primary" @click="resetGame">↻ PLAY AGAIN</button></div></div></Transition>
    <Transition name="toast"><div v-if="toast" class="toast-message">{{ toast }}</div></Transition>
  </div>
</template>

<style scoped>
*{box-sizing:border-box}.quest-page{min-height:100vh;background:#080f1b;color:#f3f8ff;font-family:Inter,system-ui,Arial,sans-serif;position:relative;overflow:hidden}.quest-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 12% 0%,#153e3940,transparent 45%),radial-gradient(ellipse at 92% 30%,#143c6740,transparent 45%)}.game-shell{max-width:1480px;margin:auto;padding:35px 24px;position:relative}.game-header,.header-actions,.section-heading,.stat-foot,.house-footer,.game-footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.game-header{margin-bottom:25px;flex-wrap:wrap}.eyebrow,.stat-label,.small-muted,.stat-foot,.stage-tag,.house-footer,.game-footer,.room-count,.modal-note{font-size:11px;letter-spacing:1.5px;color:#849bb4;font-weight:700}.eyebrow{color:#55e8b0}.game-header h1{font-size:clamp(30px,4vw,54px);margin:8px 0 3px;font-weight:900;letter-spacing:-2px}.game-header h1 span{color:#59e7ad}.game-header h1 small{font-size:14px;letter-spacing:1px;color:#8298ae}.game-header p,.room-stage p,.tips-panel p{color:#91a6bd;font-size:13px}.header-actions{font-size:11px;font-weight:800;color:#78e3b8;flex-wrap:wrap}.live-dot{width:9px;height:9px;background:#48e7a1;border-radius:50%;box-shadow:0 0 16px #48e7a1;animation:pulse 1.5s infinite}.game-button{background:#16273a;border:1px solid #38516b;border-radius:10px;padding:12px 17px;color:#d6e8fa;font-weight:800;cursor:pointer;transition:.2s}.game-button:hover{transform:translateY(-2px);border-color:#68e3b7}.game-button.primary{background:linear-gradient(110deg,#52edb3,#25bb97);border:none;color:#071c1a}.game-button:disabled{opacity:.4;cursor:not-allowed}.top-stats{display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:12px;margin-bottom:18px}.stat-card,.missions,.house-panel,.event-panel,.tips-panel{background:#101d2c;border:1px solid #25394d;border-radius:17px;box-shadow:0 12px 35px #0002}.stat-card{padding:18px;min-height:137px}.stat-number{font-size:29px;font-weight:900;margin:18px 0 10px}.stat-number small{font-size:13px;color:#8da2b9}.stat-number.green{color:#60e6ae}.stat-number.blue{color:#7bc7ff}.clock{font-size:35px;font-weight:900;letter-spacing:-1px;margin:12px 0}.time-track,.meter{height:7px;background:#23364b;border-radius:20px;overflow:hidden}.time-track>div,.meter>div{height:100%;background:linear-gradient(90deg,#24b88f,#79f8c6);transition:width .6s}.blue-meter>div{background:linear-gradient(90deg,#3694e7,#7cc9ff)}.stat-foot{margin-top:12px;font-size:9px}.missions{padding:22px;margin-bottom:18px}.section-heading{margin-bottom:17px}.section-heading h2{font-size:21px;margin:4px 0 0;font-weight:850}.section-heading h2 span{color:#66e5af;font-size:14px}.mission-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.mission{display:flex;align-items:center;gap:12px;border:1px solid #304257;background:#142437;border-radius:12px;padding:15px;min-height:77px;transition:.3s}.mission.completed{background:#12392f;border-color:#2c9f7d}.mission-icon{font-weight:900;font-size:19px;color:#5de1aa}.mission strong{font-size:12px}.mission p{font-size:11px;color:#8ea4ba;margin:4px 0 0}.main-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(270px,1fr);gap:18px}.house-panel,.event-panel,.tips-panel{padding:23px}.room-tabs{display:flex;gap:9px;overflow-x:auto;padding-bottom:12px}.room-tab{min-width:125px;flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;background:#15263a;color:#b7c8dc;border:1px solid #2d4055;border-radius:12px;padding:14px 8px;cursor:pointer;transition:.25s}.room-tab:hover{transform:translateY(-3px);border-color:#6de7bd}.room-tab.active{background:#163f39;border-color:#51e2ad;box-shadow:0 0 18px #34dba41b}.room-tab span{font-size:27px}.room-tab strong{font-size:12px}.room-tab small{font-size:10px;color:#8da4ba}.room-stage{position:relative;overflow:hidden;min-height:425px;background:linear-gradient(145deg,#172e42,#0c1928);border:1px solid #2d5263;border-radius:16px;text-align:center;padding:18px 22px 25px}.room-bedroom{background:linear-gradient(145deg,#27304e,#101b2e)}.room-kitchen{background:linear-gradient(145deg,#21423e,#101e2b)}.room-bathroom{background:linear-gradient(145deg,#173f51,#101d30)}.stage-shine{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 18%,#5ef4b61a,transparent 55%);pointer-events:none}.room-stage-top{display:flex;justify-content:space-between;font-size:10px;letter-spacing:2px;color:#94adc5}.room-art{font-size:95px;margin:8px auto 0;filter:drop-shadow(0 14px 30px #49e7c12a);animation:float 4s ease-in-out infinite}.room-stage h3{font-size:27px;margin:0;font-weight:900}.room-stage p{margin:5px 0 20px}.room-devices{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}.device-tile{width:155px;min-height:155px;border-radius:14px;border:1px solid #365069;background:#0d1b2bd9;padding:16px 12px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:.25s}.device-tile:hover{transform:translateY(-5px)}.device-tile.powered{border-color:#4cebb0;background:#124339;box-shadow:0 0 22px #29d9a22a}.device-emoji{font-size:31px}.device-tile strong{font-size:12px}.device-power{font-size:10px;color:#a0b7c9}.switch{margin-top:auto;width:40px;height:21px;background:#405167;border-radius:20px;padding:3px;transition:.2s}.switch span{display:block;width:15px;height:15px;border-radius:50%;background:white;transition:.2s}.switch.on{background:#3cdda5}.switch.on span{transform:translateX(19px)}.empty-devices{color:#93a9bf;font-size:13px;padding:35px}.house-footer{margin-top:16px;font-size:10px}.side-panel{display:flex;flex-direction:column;gap:18px}.radar{width:37px;height:37px;border:1px solid #48e2ab;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 16px #2fe3a33d;animation:pulse 2s infinite}.radar span{width:10px;height:10px;background:#59e7b5;border-radius:50%}.event-countdown{border-radius:12px;background:linear-gradient(110deg,#183e3c,#142b41);padding:19px;display:flex;flex-direction:column;gap:8px}.event-countdown span{font-size:10px;color:#a5b9ca;letter-spacing:1px}.event-countdown strong{font-size:27px;color:#64e9b7}.event-feed{min-height:180px}.feed-empty{font-size:12px;color:#8ea5ba;padding:24px 8px}.feed-item{display:flex;gap:12px;border-bottom:1px solid #263b4e;padding:14px 0}.feed-item>span{font-size:23px}.feed-item strong{display:block;font-size:12px}.feed-item small{color:#88a0b5;font-size:11px}.tips-panel h3{font-size:18px}.tips-panel p{line-height:1.6}.game-footer{padding:25px 0}.notice{background:#1a3543;padding:16px;border-radius:10px;margin-bottom:16px}.notice.error{color:#ffb3b3}.event-overlay{position:fixed;inset:0;background:#020710dd;backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}.event-modal{background:linear-gradient(145deg,#16283e,#0b1625);border:1px solid #4ce7b0;border-radius:22px;max-width:510px;width:100%;text-align:center;padding:35px;box-shadow:0 0 90px #39e9b128}.event-hero{font-size:70px;margin:12px 0}.event-modal h2{font-size:29px;font-weight:900}.event-modal>p{color:#a5bad0;font-size:14px}.choice-list{display:grid;gap:12px;margin:28px 0}.choice-list button{position:relative;text-align:left;padding:18px 45px 18px 18px;background:#193149;border:1px solid #345570;border-radius:12px;color:white;cursor:pointer;transition:.2s}.choice-list button:hover{background:#205444;border-color:#65e9b6;transform:translateX(4px)}.choice-list strong,.choice-list small{display:block}.choice-list small{color:#a0b5ca;margin-top:5px}.choice-list button span{position:absolute;right:17px;top:25px;font-size:22px}.results-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}.results-grid>div{background:#182d40;border-radius:12px;padding:17px}.results-grid strong,.results-grid small{display:block}.results-grid strong{font-size:24px;color:#65e7b6}.results-grid small{font-size:11px;color:#9ab0c5}.toast-message{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2bdfab;color:#09241f;padding:14px 24px;border-radius:10px;font-weight:800;z-index:1100;box-shadow:0 10px 30px #0005}.room-swap-enter-active,.room-swap-leave-active,.modal-enter-active,.modal-leave-active,.toast-enter-active,.toast-leave-active{transition:all .28s}.room-swap-enter-from{opacity:0;transform:translateX(24px)}.room-swap-leave-to{opacity:0;transform:translateX(-24px)}.modal-enter-from,.modal-leave-to{opacity:0;transform:scale(.94)}.toast-enter-from,.toast-leave-to{opacity:0;transform:translate(-50%,20px)}@keyframes pulse{50%{opacity:.4;box-shadow:0 0 28px #3bf2ae}}@keyframes float{50%{transform:translateY(-9px)}}@media(max-width:1100px){.top-stats{grid-template-columns:repeat(3,1fr)}.mission-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:780px){.main-grid{grid-template-columns:1fr}.top-stats{grid-template-columns:repeat(2,1fr)}.mission-grid{grid-template-columns:1fr 1fr}.game-shell{padding:18px 12px}.game-header h1{font-size:33px}.room-tab{min-width:110px}.stat-card{padding:13px}.clock{font-size:28px}}@media(max-width:450px){.mission-grid{grid-template-columns:1fr}.stat-number{font-size:24px}.game-header h1 small{display:none}}
</style>
