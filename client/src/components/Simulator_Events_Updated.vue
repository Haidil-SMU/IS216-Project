<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import householdData from '../data/dummyHousehold.json'

// Uses the same rooms and spawnedAppliances format as the 3D spatial feature.
const appliances = ref([])
const selectedAppliance = ref(null)
const selectedRoom = ref('Living Room')
const acTemperature = ref(25)
const electricityRate = 0.32

const gameMinute = ref(7 * 60)
const gameStarted = ref(false)
const paused = ref(false)
const gameFinished = ref(false)
const totalEnergy = ref(0)
const comfort = ref(75)
const ecoScore = ref(100)
const event = ref(null)
const eventTimeLeft = ref(0)
const eventCount = ref(0)
const nextEventMinute = ref(9 * 60)
const eventHistory = ref([])
const messages = ref([])
const completedTasks = ref([])
const missedTasks = ref([])
const weather = ref('Sunny')
const currentTemperature = ref(31)
const activeTab = ref('appliances')
let timer = null

const rooms = householdData.rooms.map(room => ({
  name: room.name,
  icon: room.name === 'Bedroom' ? '🛏️' : room.name === 'Living Room' ? '🛋️' : room.name === 'Kitchen' ? '🍳' : '🚿',
  color: room.name === 'Bedroom' ? 'bedroom' : room.name === 'Living Room' ? 'living' : room.name === 'Kitchen' ? 'kitchen' : 'bathroom'
}))

const tasks = [
  { id: 1, title: 'Morning Fresh Start', icon: '💡', start: 7 * 60 + 30, end: 9 * 60, appliance: 'Lights', description: 'Switch on the bedroom lights to get ready for the day.' },
  { id: 2, title: 'Kitchen Check', icon: '🥗', start: 12 * 60, end: 14 * 60, appliance: 'Refrigerator', description: 'Keep food fresh by running the refrigerator.' },
  { id: 3, title: 'Evening Wind Down', icon: '📺', start: 18 * 60, end: 20 * 60, appliance: 'Television', description: 'Enjoy some family time in the living room.' },
  { id: 4, title: 'Night Shower', icon: '🚿', start: 20 * 60, end: 22 * 60, appliance: 'Water Heater', description: 'Get ready for bed before the day ends.' }
]

const randomEvents = [
  { title: 'HEATWAVE ALERT', icon: '🔥', description: 'It is unusually hot! Keep the home comfortable without wasting electricity.', effect: 'heat', options: ['Use a fan', 'Cool with air-con'] },
  { title: 'THUNDERSTORM', icon: '⛈️', description: 'Heavy rain cools the air. Do you really need the air-con?', effect: 'rain', options: ['Switch off air-con', 'Keep current setup'] },
  { title: 'PEAK HOUR SURGE', icon: '⚡', description: 'Electricity now costs more for a short period. Reduce unnecessary usage.', effect: 'peak', options: ['Save power', 'Keep appliances running'] },
  { title: 'UNEXPECTED GUESTS', icon: '🚪', description: 'Guests arrive! Keep them comfortable without turning on everything.', effect: 'guests', options: ['Turn on living fan', 'Turn on air-con'] },
  { title: 'HAZE ADVISORY', icon: '🌫️', description: 'Hazy conditions outside. Think carefully about cooling and ventilation.', effect: 'haze', options: ['Use air-con', 'Use fan'] }
]

const clock = computed(() => {
  let hours = Math.floor(gameMinute.value / 60)
  let minutes = gameMinute.value % 60
  let suffix = hours >= 12 ? 'PM' : 'AM'
  let displayHour = hours % 12
  if (displayHour === 0) displayHour = 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
})
const dayProgress = computed(() => Math.min(100, ((gameMinute.value - 420) / 960) * 100))
const totalCost = computed(() => totalEnergy.value * electricityRate)
const activePower = computed(() => {
  let power = 0
  for (const appliance of appliances.value) {
    if (appliance.on) power += appliance.power
  }
  return power
})
const activeCount = computed(() => appliances.value.filter(appliance => appliance.on).length)
const currentTask = computed(() => tasks.find(task => gameMinute.value >= task.start && gameMinute.value < task.end && !completedTasks.value.includes(task.id) && !missedTasks.value.includes(task.id)))
const taskProgress = computed(() => Math.round((completedTasks.value.length / tasks.length) * 100))
const roomAppliances = computed(() => appliances.value.filter(appliance => appliance.room === selectedRoom.value))
const isNight = computed(() => gameMinute.value >= 18 * 60 || gameMinute.value < 8 * 60)
const minutesToEvent = computed(() => Math.max(0, nextEventMinute.value - gameMinute.value))
const nextEventClock = computed(() => {
  let hours = Math.floor(nextEventMinute.value / 60)
  let minutes = nextEventMinute.value % 60
  let suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`
})
const passed = computed(() => totalCost.value <= 5 && ecoScore.value >= 60 && comfort.value >= 65 && completedTasks.value.length === 4)

function addMessage(message) {
  messages.value.unshift({ id: Date.now() + Math.random(), time: clock.value, text: message })
  if (messages.value.length > 5) messages.value.pop()
}
function loadHousehold() {
  appliances.value = []
  for (const room of householdData.rooms) {
    for (const item of room.spawnedAppliances) {
      appliances.value.push({
        id: item.id,
        name: item.name,
        room: room.name,
        power: item.power,
        kwhYear: item.kwhYear,
        on: false,
        hours: 0
      })
    }
  }
  selectedRoom.value = householdData.rooms[0].name
  selectedAppliance.value = null
}
function toggleAppliance(appliance) {
  if (!gameStarted.value || paused.value || gameFinished.value || event.value) return
  appliance.on = !appliance.on
  selectedAppliance.value = appliance
  addMessage(`${appliance.name} switched ${appliance.on ? 'ON' : 'OFF'}`)
}
function setAppliance(name, on) {
  const appliance = appliances.value.find(item => item.name === name)
  if (appliance) appliance.on = on
}
function finishTask() {
  if (!currentTask.value || !gameStarted.value || paused.value || event.value) return
  const task = currentTask.value
  const appliance = appliances.value.find(item => item.name === task.appliance)
  if (!appliance || !appliance.on) {
    addMessage(`Turn on ${task.appliance} first to complete this task!`)
    return
  }
  completedTasks.value.push(task.id)
  ecoScore.value = Math.min(100, ecoScore.value + 4)
  addMessage(`MISSION COMPLETE: ${task.title} +4 eco points`)
}
function launchEvent() {
  const choice = randomEvents[Math.floor(Math.random() * randomEvents.length)]
  event.value = choice
  eventTimeLeft.value = 30
  eventCount.value++
  eventHistory.value.unshift({ title: choice.title, icon: choice.icon, time: clock.value, status: 'ACTIVE' })
  if (eventHistory.value.length > 4) eventHistory.value.pop()
  // Schedule another surprise 90–180 game minutes from now.
  nextEventMinute.value = gameMinute.value + (9 + Math.floor(Math.random() * 10)) * 10
  addMessage(`ALERT: ${choice.title}`)
}
function answerEvent(index) {
  if (!event.value) return
  const type = event.value.effect
  if (type === 'heat') {
    currentTemperature.value = 35
    if (index === 0) setAppliance('Ceiling Fan', true)
    else setAppliance('Air Conditioner', true)
  }
  if (type === 'rain') {
    weather.value = 'Rainy'
    currentTemperature.value = 27
    if (index === 0) setAppliance('Air Conditioner', false)
  }
  if (type === 'peak') {
    if (index === 0) {
      setAppliance('Television', false)
      setAppliance('Lights', false)
    }
  }
  if (type === 'guests') {
    if (index === 0) setAppliance('Ceiling Fan', true)
    else setAppliance('Air Conditioner', true)
  }
  if (type === 'haze') {
    weather.value = 'Hazy'
    if (index === 0) setAppliance('Air Conditioner', true)
    else setAppliance('Ceiling Fan', true)
  }
  if (index === 0) {
    ecoScore.value = Math.min(100, ecoScore.value + 6)
    addMessage('Smart decision! +6 eco points')
  } else {
    ecoScore.value = Math.max(0, ecoScore.value - 4)
    addMessage('Decision made. Watch your energy and comfort.')
  }
  if (eventHistory.value.length) eventHistory.value[0].status = 'RESOLVED'
  event.value = null
}
function updateGame() {
  if (!gameStarted.value || paused.value || gameFinished.value) return
  // 10 in-game minutes per 5 real seconds.
  gameMinute.value += 10
  for (const appliance of appliances.value) {
    if (appliance.on) {
      totalEnergy.value += appliance.power / 6
      appliance.hours += 1 / 6
    }
  }
  // Comfort changes gradually based on household conditions.
  let comfortChange = -0.7
  const aircon = appliances.value.find(item => item.name === 'Air Conditioner')
  const fan = appliances.value.find(item => item.name === 'Ceiling Fan')
  if (aircon?.on) comfortChange += acTemperature.value <= 25 ? 1.4 : 0.9
  if (fan?.on) comfortChange += 0.9
  if (currentTemperature.value >= 34 && !aircon?.on && !fan?.on) comfortChange -= 0.8
  comfort.value = Math.max(0, Math.min(100, Math.round((comfort.value + comfortChange) * 10) / 10))
  if (activePower.value > 2.5) ecoScore.value = Math.max(0, ecoScore.value - 1)
  if (activePower.value < 0.5) ecoScore.value = Math.min(100, ecoScore.value + 0.3)
  for (const task of tasks) {
    if (gameMinute.value >= task.end && !completedTasks.value.includes(task.id) && !missedTasks.value.includes(task.id)) {
      missedTasks.value.push(task.id)
      ecoScore.value = Math.max(0, ecoScore.value - 12)
      addMessage(`MISSED: ${task.title} (-12 eco points)`)
    }
  }
  if (event.value) {
    eventTimeLeft.value -= 5
    if (eventTimeLeft.value <= 0) {
      ecoScore.value = Math.max(0, ecoScore.value - 8)
      addMessage('Event timed out! -8 eco points')
      if (eventHistory.value.length) eventHistory.value[0].status = 'MISSED'
      event.value = null
    }
  } else if (gameMinute.value >= nextEventMinute.value && gameMinute.value < 22 * 60) {
    launchEvent()
  }
  if (gameMinute.value >= 23 * 60) {
    gameMinute.value = 23 * 60
    gameFinished.value = true
    gameStarted.value = false
    addMessage('Day complete! Check your results.')
  }
}
function startGame() {
  if (gameFinished.value) restartGame()
  gameStarted.value = true
  paused.value = false
  addMessage('DAY STARTED! Manage your household and complete all 4 missions.')
}
function restartGame() {
  loadHousehold()
  gameMinute.value = 420
  gameStarted.value = false
  paused.value = false
  gameFinished.value = false
  totalEnergy.value = 0
  comfort.value = 75
  ecoScore.value = 100
  event.value = null
  eventCount.value = 0
  nextEventMinute.value = 8 * 60 + 30 + Math.floor(Math.random() * 10) * 10
  eventHistory.value = []
  completedTasks.value = []
  missedTasks.value = []
  messages.value = []
  weather.value = 'Sunny'
  currentTemperature.value = 31
  acTemperature.value = 25
}
function formatTaskTime(minute) {
  const hour = Math.floor(minute / 60)
  return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`
}
onMounted(() => {
  restartGame()
  timer = setInterval(updateGame, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="game-page">
    <div class="game-container">
      <header class="game-topbar">
        <div class="brand"><span class="brand-symbol">⬡</span><div><small>HDB ECOHOME / INTERACTIVE EXPERIENCE</small><h1>ENERGY <span>QUEST</span></h1></div></div>
        <div class="top-right"><span class="live-indicator"><span class="live-dot"></span>{{ gameFinished ? 'DAY ENDED' : gameStarted && !paused ? 'SIMULATION LIVE' : 'READY TO PLAY' }}</span><button class="outline-button" @click="restartGame">↻ RESTART</button></div>
      </header>

      <section class="hero-panel">
        <div class="hero-copy"><span class="eyebrow">◈ LEVEL 01 / TAMPINES ECOHOME</span><h2>RUN YOUR HOME.<br><em>SAVE THE PLANET.</em></h2><p>One household. One day. Every decision matters. Balance your family's comfort, complete missions, and keep the electricity bill low.</p><div class="hero-actions"><button v-if="!gameStarted && !gameFinished" class="primary-button" @click="startGame">▶ {{ paused ? 'RESUME GAME' : 'START GAME' }}</button><button v-if="gameStarted" class="primary-button" @click="paused = !paused">{{ paused ? '▶ RESUME' : 'Ⅱ PAUSE' }}</button><button v-if="gameFinished" class="primary-button" @click="restartGame">↻ PLAY AGAIN</button><span class="hero-tip">{{ gameStarted ? 'The clock runs automatically' : '16 in-game hours · 8 minutes to play' }}</span></div></div>
        <div class="hero-visual"><div class="orb orb-one"></div><div class="orb orb-two"></div><div class="house-emoji">🏙️</div><div class="floating-label label-top">⚡ SMART ENERGY</div><div class="floating-label label-bottom">🌱 LOW CARBON LIVING</div></div>
      </section>

      <section class="hud-row">
        <div class="hud-card time-hud"><div class="hud-heading">◷ DAY PROGRESS <span>07:00 → 23:00</span></div><div class="clock-display">{{ clock }} <span>DAY 01</span></div><div class="time-track"><div class="time-fill" :style="{width: dayProgress + '%'}"></div><span class="time-marker" style="left:25%"></span><span class="time-marker" style="left:50%"></span><span class="time-marker" style="left:75%"></span></div><div class="time-labels"><span>7 AM</span><span>11 AM</span><span>3 PM</span><span>7 PM</span><span>11 PM</span></div></div>
        <div class="hud-card"><div class="hud-heading">⚡ ENERGY USED</div><div class="hud-value cyan">{{ totalEnergy.toFixed(2) }} <small>kWh</small></div><div class="hud-sub">{{ activePower.toFixed(2) }} kW currently running</div></div>
        <div class="hud-card"><div class="hud-heading">💳 ELECTRICITY BILL</div><div class="hud-value">${{ totalCost.toFixed(2) }}</div><div class="hud-sub">Target: below $5.00</div></div>
        <div class="hud-card"><div class="hud-heading">💚 COMFORT</div><div class="hud-value pink">{{ Math.round(comfort) }}<small>%</small></div><div class="mini-track"><div :style="{width: comfort + '%'}"></div></div></div>
        <div class="hud-card"><div class="hud-heading">🌿 ECO SCORE</div><div class="hud-value green">{{ Math.round(ecoScore) }}<small>/100</small></div><div class="mini-track eco-track"><div :style="{width: ecoScore + '%'}"></div></div></div>
      </section>

      <section class="game-panel live-events-panel">
        <div class="panel-title"><div><span class="eyebrow">DYNAMIC WORLD / LIVE ALERT SYSTEM</span><h3>⚡ LIVE EVENTS</h3></div><span class="feed-live">● {{ gameStarted && !paused ? 'LIVE' : 'STANDBY' }}</span></div>
        <div class="events-dashboard">
          <div class="event-radar"><div class="radar-circle">{{ event ? event.icon : '📡' }}</div><strong>{{ event ? event.title : gameFinished ? 'DAY COMPLETE' : 'NEXT SURPRISE INCOMING' }}</strong><p>{{ event ? event.description : 'Unexpected household challenges can appear at any moment. Be ready to make a smart choice.' }}</p></div>
          <div class="event-next"><small>⚠ NEXT EVENT</small><strong>{{ gameFinished ? 'FINISHED' : event ? 'HAPPENING NOW' : !gameStarted ? 'START TO UNLOCK' : nextEventClock }}</strong><span>{{ event ? eventTimeLeft + ' seconds to respond' : gameStarted ? minutesToEvent + ' in-game minutes remaining' : 'The countdown begins when you start' }}</span><div class="event-count-track"><div :style="{width: event ? '100%' : Math.max(0, 100 - minutesToEvent / 180 * 100) + '%'}"></div></div><small>{{ eventCount }} EVENTS ENCOUNTERED</small></div>
          <div class="event-history"><small>RECENT ALERTS</small><div v-if="eventHistory.length === 0" class="event-history-empty">No alerts yet. Your first surprise is coming!</div><div v-for="(item,index) in eventHistory" :key="index" class="event-history-item"><span>{{ item.icon }}</span><div><strong>{{ item.title }}</strong><small>{{ item.time }} · {{ item.status }}</small></div></div></div>
        </div>
      </section>

                <section class="game-panel mission-panel"><div class="panel-title"><div><span class="eyebrow">YOUR DAILY OBJECTIVES</span><h3>🎯 MISSION BOARD</h3></div><span class="mission-counter">{{ completedTasks.length }}/4 COMPLETE</span></div><div class="mission-progress"><div :style="{width: taskProgress + '%'}"></div></div><div class="mission-grid"><div v-for="task in tasks" :key="task.id" class="mission-item" :class="{'mission-done':completedTasks.includes(task.id),'mission-missed':missedTasks.includes(task.id),'mission-active':currentTask?.id === task.id}"><div class="mission-icon">{{ task.icon }}</div><div class="mission-details"><small>{{ formatTaskTime(task.start) }} — {{ formatTaskTime(task.end) }}</small><strong>{{ task.title }}</strong><p>{{ task.description }}</p><span v-if="completedTasks.includes(task.id)" class="task-success">✓ COMPLETED</span><span v-else-if="missedTasks.includes(task.id)" class="task-fail">✕ MISSED</span><span v-else-if="currentTask?.id === task.id" class="task-active">● ACTIVE NOW</span><span v-else class="task-upcoming">◷ UPCOMING</span></div><button v-if="currentTask?.id === task.id && gameStarted && !paused" class="task-button" @click="finishTask">COMPLETE →</button></div></div></section>

      <div class="game-layout">
        <div class="main-column">
          <section class="game-panel house-panel"><div class="panel-title"><div><span class="eyebrow">INTERACTIVE HOUSEHOLD</span><h3>🏠 YOUR HDB HOME</h3></div><div class="status-pill">{{ activeCount }} DEVICES ACTIVE <span class="status-dot"></span></div></div>
            <div class="house-scene" :class="{'night-scene': isNight}"><div class="scene-stars">✦ &nbsp; ✧ &nbsp; ✦</div><div class="house-grid"><button v-for="room in rooms" :key="room.name" class="room-tile" :class="[room.color, {'room-selected': selectedRoom === room.name}]" @click="selectedRoom = room.name; activeTab = 'appliances'"><span class="room-corner">{{ room.icon }}</span><div class="room-center">{{ room.icon }}</div><strong>{{ room.name }}</strong><small>{{ appliances.filter(item => item.room === room.name && item.on).length }} devices running</small><div class="room-lights"><span v-for="item in appliances.filter(item => item.room === room.name)" :key="item.id" :class="{'light-on':item.on}"></span></div></button></div><div class="scene-caption">✦ SELECT A ROOM TO MANAGE ITS APPLIANCES ✦</div></div>
            <div class="weather-strip"><span>☀️ {{ weather.toUpperCase() }} · {{ currentTemperature }}°C</span><span>🏡 {{ householdData.flatType }} HDB · {{ householdData.rooms.length }} ROOMS</span><span>⚡ ${{ electricityRate }}/kWh</span></div>
          </section>


        </div>

        <aside class="side-column"><section class="game-panel controls-panel"><div class="panel-title"><div><span class="eyebrow">CONTROL CENTER</span><h3>🎮 HOUSE SYSTEMS</h3></div></div><div class="room-selector"><button v-for="room in rooms" :key="room.name" :class="{'room-tab-active': selectedRoom === room.name}" @click="selectedRoom = room.name">{{ room.icon }} <span>{{ room.name }}</span></button></div><div class="selected-room-heading"><span>{{ selectedRoom.toUpperCase() }}</span><small>{{ roomAppliances.length }} APPLIANCES</small></div><div class="device-list"><div v-for="appliance in roomAppliances" :key="appliance.id" class="device" :class="{'device-on':appliance.on}"><div class="device-icon">{{ appliance.icon }}</div><div class="device-name"><strong>{{ appliance.name }}</strong><small>{{ Math.round(appliance.power * 1000) }} W · {{ appliance.on ? 'RUNNING' : 'STANDBY' }}</small></div><button class="power-switch" :class="{'switch-on':appliance.on}" :disabled="!gameStarted || paused || gameFinished || !!event" @click="toggleAppliance(appliance)"><span></span></button></div></div><div v-if="selectedRoom === 'Bedroom'" class="temperature-control"><div><strong>❄️ AIR-CON TEMPERATURE</strong><span>{{ acTemperature }}°C</span></div><input v-model.number="acTemperature" type="range" min="20" max="28" :disabled="!gameStarted || paused || !!event"><small>Tip: Setting your air-con to 25°C or higher can save energy.</small></div><div class="controls-hint">{{ !gameStarted ? '▶ Start the game to use your appliances.' : paused ? 'Ⅱ Game paused.' : '💡 Only power devices when you need them.' }}</div></section>
        <section class="game-panel activity-panel"><div class="panel-title"><div><span class="eyebrow">LIVE ACTIVITY</span><h3>📡 EVENT FEED</h3></div><span class="feed-live">● LIVE</span></div><div v-if="messages.length === 0" class="empty-feed">No activity yet. Start the game to begin your day.</div><div v-for="message in messages" :key="message.id" class="feed-item"><small>{{ message.time }}</small><p>{{ message.text }}</p></div></section></aside>
      </div>

      <section class="bottom-banner"><div><span class="eyebrow">THE ULTIMATE CHALLENGE</span><h3>CAN YOU RUN A SMARTER HOME?</h3><p>Complete all 4 missions · Keep the bill under $5 · Maintain 65% comfort · Earn at least 60 Eco Score.</p></div><div class="banner-stamp">🌎<span>EVERY WATT<br>COUNTS</span></div></section>
    </div>

    <div v-if="event && gameStarted && !paused" class="event-overlay"><div class="event-modal"><div class="event-warning">⚠ RANDOM EVENT TRIGGERED</div><div class="event-emoji">{{ event.icon }}</div><h2>{{ event.title }}</h2><p>{{ event.description }}</p><div class="event-countdown">⏳ {{ eventTimeLeft }} SECONDS TO DECIDE</div><div class="event-choices"><button v-for="(option,index) in event.options" :key="option" @click="answerEvent(index)">{{ option }} <span>→</span></button></div><small>Events happen automatically. Your choices affect the final score.</small></div></div>
    <div v-if="gameFinished" class="event-overlay"><div class="event-modal result-modal"><div class="event-warning">DAY 01 / COMPLETE</div><div class="event-emoji">{{ passed ? '🏆' : '🎮' }}</div><h2>{{ passed ? 'ECOHOME CHAMPION!' : 'DAY COMPLETE!' }}</h2><p>{{ passed ? 'You successfully balanced household needs and energy conservation.' : 'Your day is over. Try again to improve your results!' }}</p><div class="result-grid"><div><small>ENERGY</small><strong>{{ totalEnergy.toFixed(2) }} kWh</strong></div><div><small>COST</small><strong>${{ totalCost.toFixed(2) }}</strong></div><div><small>COMFORT</small><strong>{{ Math.round(comfort) }}%</strong></div><div><small>ECO SCORE</small><strong>{{ Math.round(ecoScore) }}</strong></div><div><small>MISSIONS</small><strong>{{ completedTasks.length }}/4</strong></div><div><small>EVENTS</small><strong>{{ eventCount }}</strong></div></div><button class="primary-button" @click="restartGame">↻ PLAY AGAIN</button></div></div>
  </div>
</template>

<style scoped>
*{box-sizing:border-box}.game-page{min-height:100vh;background:#08131c;color:#f1f8fa;font-family:Inter,system-ui,-apple-system,sans-serif;padding:26px 22px 60px;background-image:radial-gradient(circle at 85% 5%,rgba(0,210,166,.13),transparent 32%),radial-gradient(circle at 8% 45%,rgba(44,100,194,.1),transparent 38%)}.game-container{max-width:1460px;margin:auto}.game-topbar,.brand,.top-right,.hero-actions,.panel-title,.hud-heading,.weather-strip,.selected-room-heading,.device,.temperature-control>div,.bottom-banner{display:flex;align-items:center;justify-content:space-between}.game-topbar{margin-bottom:24px}.brand{justify-content:flex-start;gap:13px}.brand-symbol{font-size:42px;color:#51f1bb}.brand small,.eyebrow{font-size:10px;letter-spacing:2px;font-weight:800;color:#69dbbc}.brand h1{font-size:25px;letter-spacing:2px;margin:3px 0 0;font-weight:900}.brand h1 span{color:#52edb6}.top-right{gap:18px}.live-indicator{font-size:11px;color:#a8bec7;font-weight:800;letter-spacing:1px}.live-dot,.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ef2ac;margin-right:7px;box-shadow:0 0 12px #40e4a0}.outline-button{border:1px solid #365061;background:#132633;color:#d8ebee;border-radius:9px;padding:11px 18px;font-size:12px;font-weight:800;cursor:pointer}.hero-panel{display:grid;grid-template-columns:1.35fr 1fr;overflow:hidden;border:1px solid #265c63;border-radius:22px;min-height:315px;background:linear-gradient(115deg,#102f35 0%,#103d3d 58%,#14504b 100%);position:relative;margin-bottom:20px}.hero-copy{padding:39px 44px;position:relative;z-index:2}.hero-copy h2{font-size:clamp(30px,3.3vw,53px);line-height:1.08;letter-spacing:-1.7px;font-weight:950;margin:15px 0}.hero-copy h2 em{font-style:normal;color:#63f3b8}.hero-copy p{color:#bdd8d4;font-size:14px;line-height:1.7;max-width:540px}.hero-actions{justify-content:flex-start;gap:20px;margin-top:24px;flex-wrap:wrap}.primary-button{background:#65f3b7;border:0;border-radius:10px;color:#06251e;padding:14px 24px;font-weight:950;font-size:12px;letter-spacing:.8px;cursor:pointer;box-shadow:0 8px 28px #42e3a33b}.primary-button:hover{background:#a0ffd4}.hero-tip{color:#a8d0c8;font-size:12px}.hero-visual{position:relative;display:grid;place-items:center;overflow:hidden}.orb{position:absolute;border-radius:50%;border:1px solid #8effd243}.orb-one{width:310px;height:310px;background:radial-gradient(circle,#5df3a22a,transparent 68%)}.orb-two{width:430px;height:430px}.house-emoji{font-size:150px;filter:drop-shadow(0 20px 30px #0007);z-index:1}.floating-label{position:absolute;background:#082a2dcf;border:1px solid #55b99c;border-radius:8px;padding:10px 14px;color:#c5ffe8;font-size:10px;letter-spacing:1px;font-weight:900;z-index:2}.label-top{top:22%;right:6%}.label-bottom{bottom:16%;left:3%}.hud-row{display:grid;grid-template-columns:1.7fr repeat(4,1fr);gap:12px;margin-bottom:18px}.hud-card,.game-panel{border:1px solid #263a49;border-radius:15px;background:#111f2b;box-shadow:0 12px 32px #00000018}.hud-card{padding:19px;min-width:0}.hud-heading{color:#8da7b5;font-size:10px;font-weight:900;letter-spacing:1px;gap:8px}.hud-heading span{font-size:9px;color:#557e88}.clock-display{font-size:34px;font-weight:950;letter-spacing:-1px;margin:10px 0}.clock-display span{font-size:10px;background:#1d3e41;color:#74efc0;padding:5px 8px;border-radius:6px;vertical-align:middle;letter-spacing:1px}.time-track,.mini-track,.mission-progress{height:7px;border-radius:20px;background:#273b48;overflow:hidden;position:relative}.time-fill,.mission-progress>div{height:100%;background:linear-gradient(90deg,#25c8bc,#80f9ae);border-radius:20px;transition:width .4s}.time-marker{position:absolute;width:2px;height:100%;background:#08131c}.time-labels{display:flex;justify-content:space-between;color:#6f8a97;font-size:9px;margin-top:9px}.hud-value{font-size:32px;font-weight:950;letter-spacing:-1px;margin:13px 0 5px}.hud-value small{font-size:13px;color:#829eab}.hud-value.cyan{color:#57dfff}.hud-value.pink{color:#ff99a7}.hud-value.green{color:#62eeb3}.hud-sub{font-size:11px;color:#819baa}.mini-track{margin-top:13px}.mini-track>div{height:100%;background:#f391a7;border-radius:20px;transition:width .3s}.eco-track>div{background:#62eeb3}.game-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(330px,1fr);gap:18px}.main-column,.side-column{display:flex;flex-direction:column;gap:18px;min-width:0}.game-panel{padding:23px}.panel-title{margin-bottom:19px;gap:12px}.panel-title h3{font-size:18px;font-weight:950;letter-spacing:.5px;margin:6px 0 0}.status-pill,.mission-counter{font-size:10px;letter-spacing:1px;color:#8eeacb;background:#183a3b;border:1px solid #2b6a60;padding:9px 11px;border-radius:8px;font-weight:900;white-space:nowrap}.status-dot{margin:0 0 0 5px}.house-scene{border:1px solid #3d5961;border-radius:15px;padding:26px;background:linear-gradient(180deg,#25465b,#1b3544 40%,#152e35);position:relative;overflow:hidden;transition:background 1s}.night-scene{background:linear-gradient(180deg,#15203c,#182b42 50%,#10282c)}.scene-stars{position:absolute;right:20px;top:12px;color:#f8e6ad;opacity:.7}.house-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:620px;margin:auto;position:relative;z-index:1}.room-tile{border:2px solid #ffffff28;border-radius:12px;min-height:165px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;cursor:pointer;color:white;transition:transform .2s,border-color .2s;background:#365e6b}.room-tile:hover{transform:translateY(-3px);border-color:#86ffca}.room-selected{border-color:#70ffbc;box-shadow:0 0 0 2px #6fffb32b,0 0 30px #44f5a220}.room-tile.bedroom{background:linear-gradient(135deg,#54456c,#343954)}.room-tile.living{background:linear-gradient(135deg,#38636b,#2b454c)}.room-tile.kitchen{background:linear-gradient(135deg,#69604d,#46453c)}.room-tile.bathroom{background:linear-gradient(135deg,#3e6178,#2b485f)}.room-corner{position:absolute;top:10px;left:13px;font-size:15px}.room-center{font-size:48px;filter:drop-shadow(0 8px 10px #0005);margin-bottom:5px}.room-tile strong{font-size:15px}.room-tile small{font-size:11px;color:#e1e7e8a9;margin-top:4px}.room-lights{display:flex;gap:5px;margin-top:11px}.room-lights span{width:7px;height:7px;border-radius:50%;background:#72878b}.room-lights span.light-on{background:#77ffc4;box-shadow:0 0 10px #77ffc4}.scene-caption{text-align:center;color:#93b4b5;font-size:9px;font-weight:900;letter-spacing:2px;margin-top:20px}.weather-strip{gap:12px;flex-wrap:wrap;border-top:1px solid #263e4a;margin-top:17px;padding-top:16px;font-size:10px;color:#9dbac3;font-weight:800}.room-selector{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:20px}.room-selector button{background:#1b3040;border:1px solid #304957;border-radius:9px;padding:10px 4px;color:#a5bac6;font-size:19px;cursor:pointer}.room-selector button span{display:block;font-size:9px;margin-top:6px}.room-selector button.room-tab-active{background:#214d47;border-color:#54d5a4;color:#92fbd0}.selected-room-heading{color:#b3cbd3;font-size:11px;font-weight:950;letter-spacing:1px;margin-bottom:12px}.selected-room-heading small{font-size:10px;color:#718e9e}.device-list{display:flex;flex-direction:column;gap:9px}.device{background:#192d3b;border:1px solid #2b4351;border-radius:11px;padding:12px;gap:11px}.device-on{border-color:#368c74;background:#1b393c}.device-icon{width:39px;height:39px;background:#2b4651;border-radius:9px;display:grid;place-items:center;font-size:20px;flex-shrink:0}.device-name{flex:1;min-width:0}.device-name strong{display:block;font-size:12px}.device-name small{display:block;color:#7899a6;font-size:10px;margin-top:4px}.power-switch{border:0;width:44px;height:25px;background:#405460;border-radius:30px;padding:3px;cursor:pointer;flex-shrink:0}.power-switch span{display:block;background:#a5b6bf;width:19px;height:19px;border-radius:50%;transition:transform .2s}.power-switch.switch-on{background:#48dca5}.power-switch.switch-on span{background:#06392d;transform:translateX(19px)}.power-switch:disabled{opacity:.55;cursor:not-allowed}.temperature-control{margin-top:18px;padding:15px;background:#1a303d;border-radius:11px}.temperature-control strong{font-size:10px}.temperature-control span{font-size:18px;font-weight:900;color:#69f3c2}.temperature-control input{width:100%;accent-color:#69f3c2;margin:12px 0}.temperature-control small,.controls-hint{font-size:10px;color:#829faa}.controls-hint{margin-top:15px}.mission-progress{margin-bottom:15px}.mission-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mission-item{display:flex;align-items:flex-start;gap:12px;background:#192b38;border:1px solid #2d4350;border-radius:11px;padding:15px;min-width:0;position:relative}.mission-active{border-color:#58d9ac;box-shadow:0 0 18px #45ffb01a}.mission-done{border-color:#276f57}.mission-missed{opacity:.55}.mission-icon{font-size:25px;background:#2c4350;padding:8px;border-radius:10px}.mission-details{flex:1;min-width:0}.mission-details small{font-size:9px;color:#78a1b0;font-weight:800}.mission-details strong{display:block;font-size:12px;margin:5px 0}.mission-details p{font-size:10px;color:#96abb5;margin:0 0 10px;line-height:1.5}.task-success,.task-fail,.task-active,.task-upcoming{font-size:9px;font-weight:900;letter-spacing:.6px}.task-success{color:#67efae}.task-fail{color:#ff929a}.task-active{color:#ffdc82}.task-upcoming{color:#6e95a3}.task-button{position:absolute;right:8px;bottom:9px;border:0;border-radius:6px;background:#69eeb7;color:#063a2a;font-size:9px;font-weight:950;padding:6px 8px;cursor:pointer}.feed-live{color:#68f0b6;font-size:10px;font-weight:900}.feed-item{border-left:2px solid #4fd3a5;padding:3px 0 5px 12px;margin-bottom:13px}.feed-item small{font-size:10px;color:#6dbba5}.feed-item p{font-size:11px;color:#c4d9df;margin:5px 0}.empty-feed{color:#7b9ba7;font-size:12px;padding:15px 0}.bottom-banner{margin-top:18px;border:1px solid #265b57;background:linear-gradient(90deg,#103a3a,#122b35);border-radius:15px;padding:25px 32px}.bottom-banner h3{font-size:22px;font-weight:950;margin:8px 0}.bottom-banner p{color:#a7c6c9;font-size:12px;margin:0}.banner-stamp{font-size:35px;display:flex;align-items:center;gap:10px}.banner-stamp span{font-size:12px;font-weight:950;line-height:1.4;color:#7bf4c2}.event-overlay{position:fixed;inset:0;background:#020c12db;backdrop-filter:blur(9px);z-index:9999;display:grid;place-items:center;padding:20px}.event-modal{width:min(100%,530px);text-align:center;border:1px solid #58b69b;border-radius:22px;background:linear-gradient(150deg,#173840,#10202f);padding:34px;box-shadow:0 0 90px #40e9a028}.event-warning{color:#ffca75;font-size:11px;letter-spacing:2px;font-weight:950}.event-emoji{font-size:65px;margin:18px 0}.event-modal h2{font-size:31px;font-weight:950;letter-spacing:1px}.event-modal p{color:#b5d2d3;font-size:14px;line-height:1.6}.event-countdown{background:#4e3427;border:1px solid #ba7e4e;border-radius:9px;padding:12px;color:#ffd298;font-weight:950;font-size:12px;margin:20px 0}.event-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.event-choices button{border:1px solid #50b698;border-radius:10px;padding:17px 10px;background:#24534c;color:#d8fff1;font-weight:900;cursor:pointer}.event-choices button:hover{background:#2e8069}.event-choices button span{margin-left:7px}.event-modal>small{color:#7699a1}.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:20px 0}.result-grid>div{background:#1d3943;border-radius:10px;padding:15px 7px}.result-grid small{display:block;font-size:10px;color:#9ab4bc}.result-grid strong{display:block;margin-top:6px;font-size:17px;color:#77f4c1}@media(max-width:1150px){.hud-row{grid-template-columns:repeat(4,1fr)}.time-hud{grid-column:1/-1}.game-layout{grid-template-columns:1fr}.side-column{display:grid;grid-template-columns:1fr 1fr;align-items:start}}@media(max-width:750px){.game-page{padding:15px 10px}.hero-panel{grid-template-columns:1fr}.hero-copy{padding:30px 24px}.hero-visual{display:none}.hud-row{grid-template-columns:repeat(2,1fr)}.time-hud{grid-column:1/-1}.hud-card{padding:15px}.hud-value{font-size:27px}.game-panel{padding:16px}.side-column{display:flex}.mission-grid{grid-template-columns:1fr}.game-topbar{align-items:flex-start;gap:10px}.brand h1{font-size:19px}.brand small{font-size:8px}.top-right{flex-direction:column;gap:7px;align-items:flex-end}.live-indicator{font-size:9px}.room-tile{min-height:145px}.room-center{font-size:35px}.room-selector button span{font-size:8px}.bottom-banner{padding:22px}.banner-stamp{display:none}.event-choices{grid-template-columns:1fr}}

/* Visible game alerts and mission board */
.live-events-panel{margin-bottom:18px;border-color:#398e83;background:linear-gradient(125deg,#142b36,#10252d 65%,#173c3d)}
.events-dashboard{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:14px}
.event-radar,.event-next,.event-history{background:#0c1b27;border:1px solid #31525c;border-radius:13px;padding:20px;min-width:0}
.event-radar{position:relative;overflow:hidden}
.radar-circle{width:70px;height:70px;border-radius:50%;display:grid;place-items:center;font-size:32px;background:#164c4b;border:2px solid #54e6bb;box-shadow:0 0 0 10px #48dcb510,0 0 35px #48dcb52a;margin-bottom:18px;animation:radarPulse 2.5s infinite}
.event-radar strong{display:block;color:#d5fff1;font-size:15px;letter-spacing:1px}
.event-radar p{color:#95b8c1;font-size:12px;line-height:1.6;margin:9px 0 0}
.event-next>small,.event-history>small{color:#77d7bb;font-size:10px;font-weight:900;letter-spacing:1.5px}
.event-next>strong{display:block;font-size:24px;margin:16px 0 6px;color:#f8d38a}
.event-next>span{display:block;color:#a7c1c8;font-size:11px;margin-bottom:18px}
.event-count-track{height:9px;border-radius:30px;background:#2b414d;overflow:hidden;margin-bottom:15px}
.event-count-track>div{height:100%;background:linear-gradient(90deg,#36c9bd,#ffd078);border-radius:30px;transition:width .4s}
.event-history-item{display:flex;align-items:center;gap:10px;border-bottom:1px solid #28414b;padding:11px 0}
.event-history-item>span{font-size:23px}.event-history-item strong{display:block;font-size:11px}.event-history-item small{display:block;color:#85a5af;font-size:9px;margin-top:5px}
.event-history-empty{font-size:12px;color:#89a7b0;margin-top:20px;line-height:1.6}
.mission-panel{margin-bottom:18px;border-color:#3e7770}
@keyframes radarPulse{50%{box-shadow:0 0 0 19px #48dcb506,0 0 50px #48dcb54a}}
@media(max-width:850px){.events-dashboard{grid-template-columns:1fr}.event-radar,.event-next,.event-history{padding:16px}}
</style>
