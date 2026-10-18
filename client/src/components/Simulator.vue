<script setup>

import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import NavBar from './NavBar.vue'

const API_URL = 'http://127.0.0.1:8000/api'
const TEMPERATURE_URL = "https://api-open.data.gov.sg/v2/real-time/api/air-temperature"
const RAINFALL_URL = "https://api-open.data.gov.sg/v2/real-time/api/rainfall"
const PSI_URL = "https://api-open.data.gov.sg/v2/real-time/api/psi"




const electricityRate = 0.32
const simulated = ref(false)

const scenarios = ref([])
const appliances = ref([])

const selectedScenario = ref(null)
const selectedAppliance = ref(null)

const acTemperature = ref(25)
const temperature = ref(0)
const psiReadings = ref({})

const selectedRegion = ref('central')
const rainfallAreas = ref({})
const selectedStation = ref('')

async function getExternalAPIs() {
  try { //loading from APIs

    let totalTemp = 0
    let averageTemperature = 0
    let totalRainfall = 0
    let averageRainfall = 0
    let totalPSI = 0

    //RETRIEVE ALL DATA ACRROSS ALL APIS FIRST
    const weatherData = await axios.get(TEMPERATURE_URL)
    const rainfallData = await axios.get(RAINFALL_URL)
    const PSIData = await axios.get(PSI_URL)
    console.log(PSIData)
    console.log(rainfallData)


    //assign the response to the respective variables
    let weatherReadings = weatherData.data.data.readings[0].data //gets the weather accross all stations
    let rainfallReadings = rainfallData.data.data.readings[0].data
    let rainfallStations = rainfallData.data.data.stations
    psiReadings.value = PSIData.data.data.items[0].readings.psi_twenty_four_hourly

    for (const station of rainfallStations) {
      const reading = rainfallReadings.find(
        item => item.stationId === station.id
      )

      if (reading) {
        rainfallAreas.value[station.name] = reading.value
      }
    }

    console.log(rainfallAreas.value)


    //we calculate the average accross all stations in singapore, to  get the current weather
    for (const reading of weatherReadings) {
      totalTemp += reading.value

    }

    for (const reading of rainfallReadings) {
      totalRainfall += reading.value
    }

    averageTemperature = totalTemp / (weatherReadings.length)
    temperature.value = Number(averageTemperature.toFixed(2))
    averageRainfall = totalRainfall / (rainfallReadings.length)
    rainfall.value = Number(averageRainfall.toFixed(2))

  } catch (error) {

    console.log(error)

  }
}

async function loadData() {

  try { //loading from local JSON Files

    const response = await axios.get(API_URL)

    console.log(response.data)
    scenarios.value = response.data.scenarios
    appliances.value = response.data.appliances

    selectedScenario.value = scenarios.value[0]
    console.log(selectedScenario.value)

    for (const appliance of appliances.value) {
      appliance.on = false
      appliance.hours = 0
    }

  } catch (error) {

    console.log(error)

  }

}

onMounted(() => {
  loadData()
  getExternalAPIs()
})

const totalEnergy = computed(() => {

  let total = 0

  for (const appliance of appliances.value) {

    if (appliance.on) {
      total += appliance.power * appliance.hours
    }

  }

  return total

})

const totalCost = computed(() => {

  return totalEnergy.value * electricityRate

})




const ecoScore = computed(() => {

  if (totalEnergy.value <= 4) {
    return 100
  }

  if (totalEnergy.value <= 7) {
    return 85
  }

  if (totalEnergy.value <= 10) {
    return 70
  }

  if (totalEnergy.value <= 13) {
    return 55
  }

  if (totalEnergy.value <= 16) {
    return 40
  }

  if (totalEnergy.value <= 20) {
    return 25
  }

  return 10

})


const comfortScore = computed(() => {
  let score = 60

  const aircon = appliances.value.find(
    appliance => appliance.name === 'Air Conditioner'
  )

  const fan = appliances.value.find(
    appliance => appliance.name === 'Ceiling Fan'
  )

  const lights = appliances.value.find(
    appliance => appliance.name === 'Lights'
  )

  const tv = appliances.value.find(
    appliance => appliance.name === 'TV'
  )

  const waterHeater = appliances.value.find(
    appliance => appliance.name === 'Water Heater'
  )


  // Comfort from appliances
  if (aircon?.on) {
    score += 15
  }

  if (fan?.on) {
    score += 5
  }

  if (lights?.on) {
    score += 5
  }

  if (tv?.on) {
    score += 5
  }

  if (waterHeater?.on) {
    score += 10
  }


  // AC provides less comfort if temperature is too high
  if (aircon?.on && acTemperature.value >= 27) {
    score -= 5
  }


  return Math.min(100, Math.max(0, score))
})

const scenarioDescription = computed(() => {

  return selectedScenario.value.description
    .replace('{temperature}', temperature.value)
    .replace('{rainfall}', rainfall.value)
    .replace('{psi}', psi.value)

})

function simulateDay() {

  simulated.value = true

}

function selectAppliance(appliance) {
  selectedAppliance.value = appliance
}



function getRoomAppliances(room) {

  return appliances.value.filter(
    appliance => appliance.room === room
  )

}

const psi = computed(() => {
  return psiReadings.value[selectedRegion.value] ?? 0
})

const hazeGoals = computed(() => {
  if (psi.value <= 100) {
    return {
      maxCost: 2.50,
      minEcoScore: 85,
      minComfortScore: 85
    }
  } else if (psi.value <= 130) {
    return {
      maxCost: 3.00,
      minEcoScore: 85,
      minComfortScore: 80
    }
  } else if (psi.value <= 160) {
    return {
      maxCost: 3.50,
      minEcoScore: 70,
      minComfortScore: 75
    }
  } else if (psi.value <= 200) {
    return {
      maxCost: 4.00,
      minEcoScore: 70,
      minComfortScore: 70
    }
  } else {
    return {
      maxCost: 4.50,
      minEcoScore: 70,
      minComfortScore: 65
    }
  }
})

const rainGoals = computed(() => {
    if (rainfall.value === null) {
        return null
    }

    if (rainfall.value === 0) {
        return { maxCost: 3.50, minEcoScore: 85, minComfortScore: 85 }
    }
    else if (rainfall.value <= 1) {
        return { maxCost: 3.00, minEcoScore: 85, minComfortScore: 85 }
    }
    else if (rainfall.value <= 2.5) {
        return { maxCost: 2.50, minEcoScore: 85, minComfortScore: 85 }
    }
    else {
        return { maxCost: 2.00, minEcoScore: 85, minComfortScore: 85 }
    } 
})

const currentGoals = computed(() => {
  if (!selectedScenario.value) {
    return null
  }

  if (selectedScenario.value.name === 'Haze Alert') {
    return hazeGoals.value
  }

  if (selectedScenario.value.name === 'Rainy Day') {
    return rainGoals.value
  }

  return selectedScenario.value.goals
})

const rainfall = computed(() => {
  return rainfallAreas.value[selectedStation.value] ?? null
})

</script>


<template>

  <div>

    <!-- <nav class="navbar navbar-expand-lg navbar-dark bg-success">

      <div class="container">

        <RouterLink class="navbar-brand fw-bold" to="/">
          🏠 HDB EcoHome
        </RouterLink>

        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar">
          <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="navbar">

          <div class="navbar-nav ms-auto">

            <RouterLink class="nav-link" to="/">
              Home
            </RouterLink>

            <RouterLink class="nav-link active" to="/hdb">
              My HDB
            </RouterLink>

          </div>

        </div>

      </div>

    </nav> -->



    <main class="container py-4">




      <div class="mb-4">

        <h1 class="fw-bold">
          🏠 My HDB
        </h1>

        <p class="text-secondary">
          Manage your appliances, complete the challenge and keep your household efficient.
        </p>

      </div>


      <div class="mb-4">

        <label class="form-label fw-bold">
          🎮 Select Challenge
        </label>

        <select class="form-select" v-model="selectedScenario">

          <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario">
            {{ scenario.name }}
          </option>

        </select>



        <div v-if="selectedScenario" class="card mt-3 scenario-card">

          <div class="card-body">

            <div class="d-flex justify-content-between align-items-center mb-2">

              <h4 class="card-title mb-0">
                {{ selectedScenario.name }}
              </h4>

              <span class="badge bg-success">
                {{ selectedScenario.difficulty }}
              </span>

            </div>

            <p class="card-text">
              {{ scenarioDescription }}
            </p>




            <div v-if="selectedScenario?.name === 'Heatwave'" class="alert alert-light border mt-3 mb-3">

              <small class="text-secondary d-block">
                LIVE SINGAPORE WEATHER
              </small>

              <strong class="fs-5">
                🌡️ {{ temperature }}°C
              </strong>

            </div>


            <div v-else-if="selectedScenario?.name === 'Rainy Day'" class="alert alert-light border mt-3 mb-3">

              <small class="text-secondary d-block">
                LIVE SINGAPORE RAINFALL
              </small>

              <select v-model="selectedStation" class="form-select">
                <option value="" disabled>Select a station</option>

                <option v-for="(rainfall, name) in rainfallAreas" :key="name" :value="name">
                  {{ name }}
                </option>
              </select>

              <strong v-if="selectedStation" class="fs-5">
                Rainfall: 🌧️ {{ rainfall }} mm
              </strong>

            </div>


            <div v-else-if="selectedScenario?.name === 'Haze Alert'" class="alert alert-light border mt-3 mb-3">

              <small class="text-secondary d-block">
                SINGAPORE 24-HOUR PSI
              </small>

              <label class="form-label fw-semibold">
                Choose Your Area
              </label>

              <select v-model="selectedRegion" class="form-select my-2">
                <option value="north">North</option>
                <option value="south">South</option>
                <option value="east">East</option>
                <option value="west">West</option>
                <option value="central">Central</option>
              </select>

              <strong class="fs-5">
                Current Region PSI:{{ psiReadings[selectedRegion] }}
              </strong>


            </div>


            <hr>


            <h5 class="mb-3">
              🎯 Mission Objectives
            </h5>


            <div v-if="currentGoals" class="scenario-goals">



              <div class="goal-item">

                <span class="goal-icon">
                  💰
                </span>

                <div>

                  <small>
                    KEEP COST BELOW
                  </small>

                  <div v-if="currentGoals" class="goal-value">
                    ${{ currentGoals.maxCost }}
                  </div>

                </div>

              </div>

              <div v-if="currentGoals" class="goal-item">

                <span class="goal-icon">
                  🌱
                </span>

                <div>

                  <small>
                    ECO SCORE
                  </small>

                  <div v-if="currentGoals" class="goal-value">
                    {{ currentGoals.minEcoScore }}+
                  </div>

                </div>

              </div>

              <div class="goal-item">

                <span class="goal-icon">
                  ❤️
                </span>

                <div>

                  <small>
                    COMFORT SCORE
                  </small>

                  <div v-if="currentGoals" class="goal-value">
                    {{ currentGoals.minComfortScore }}+
                  </div>

                </div>

              </div>


            </div>

          </div>

        </div>

      </div>


      <h5 class="fw-bold mb-3">
        ⚡ Current Household Status
      </h5>


      <div class="row g-3 mb-4">


        <!-- ENERGY -->

        <div class="col-6 col-lg-3">

          <div class="card h-100 stat-card">

            <div class="card-body">

              <small class="text-secondary fw-bold">
                ⚡ ENERGY
              </small>

              <h3>
                {{ totalEnergy.toFixed(1) }}
                <small class="fs-6">
                  kWh
                </small>
              </h3>

            </div>

          </div>

        </div>

        <div class="col-6 col-lg-3">

          <div class="card h-100 stat-card">

            <div class="card-body">

              <small class="text-secondary fw-bold">
                💰 COST
              </small>

              <h3>
                ${{ totalCost.toFixed(2) }}
              </h3>

            </div>

          </div>

        </div>

        <div class="col-6 col-lg-3">

          <div class="card h-100 stat-card">

            <div class="card-body">

              <small class="text-secondary fw-bold">
                ❤️ COMFORT
              </small>

              <h3>
                {{ comfortScore }}%
              </h3>

            </div>

          </div>

        </div>

        <div class="col-6 col-lg-3">

          <div class="card h-100 stat-card">

            <div class="card-body">

              <small class="text-secondary fw-bold">
                🌱 ECO SCORE
              </small>

              <h3>
                {{ ecoScore }}
              </h3>

            </div>

          </div>

        </div>


      </div>



      <div class="row g-4">

        <div class="col-lg-8">

          <div class="card">

            <div class="card-header">

              <strong>
                🏠 Interactive HDB
              </strong>

            </div>


            <div class="card-body">


              <div class="hdb-floorplan">



                <div class="room bedroom">

                  <h5>
                    🛏️ Bedroom
                  </h5>

                  <div v-for="appliance in getRoomAppliances('Bedroom')" :key="appliance.id" class="appliance" :class="{
                    'appliance-on': appliance.on,
                    'appliance-selected': selectedAppliance?.id === appliance.id
                  }" @click="selectAppliance(appliance)">

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span v-if="appliance.on" class="badge bg-success">
                      ON
                    </span>

                    <span v-else class="badge bg-secondary">
                      OFF
                    </span>

                  </div>

                </div>



                <div class="room living-room">

                  <h5>
                    🛋️ Living Room
                  </h5>

                  <div v-for="appliance in getRoomAppliances('Living Room')" :key="appliance.id" class="appliance"
                    :class="{
                      'appliance-on': appliance.on,
                      'appliance-selected': selectedAppliance?.id === appliance.id
                    }" @click="selectAppliance(appliance)">

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span v-if="appliance.on" class="badge bg-success">
                      ON
                    </span>

                    <span v-else class="badge bg-secondary">
                      OFF
                    </span>

                  </div>

                </div>




                <div class="room kitchen">

                  <h5>
                    🍳 Kitchen
                  </h5>

                  <div v-for="appliance in getRoomAppliances('Kitchen')" :key="appliance.id" class="appliance" :class="{
                    'appliance-on': appliance.on,
                    'appliance-selected': selectedAppliance?.id === appliance.id
                  }" @click="selectAppliance(appliance)">

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span v-if="appliance.on" class="badge bg-success">
                      ON
                    </span>

                    <span v-else class="badge bg-secondary">
                      OFF
                    </span>

                  </div>

                </div>

                <div class="room bathroom">

                  <h5>
                    🚿 Bathroom
                  </h5>

                  <div v-for="appliance in getRoomAppliances('Bathroom')" :key="appliance.id" class="appliance" :class="{
                    'appliance-on': appliance.on,
                    'appliance-selected': selectedAppliance?.id === appliance.id
                  }" @click="selectAppliance(appliance)">

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span v-if="appliance.on" class="badge bg-success">
                      ON
                    </span>

                    <span v-else class="badge bg-secondary">
                      OFF
                    </span>

                  </div>

                </div>


              </div>

            </div>

          </div>

        </div>

        <div class="col-lg-4">

          <div class="card">

            <div class="card-header game-card-header">

              <strong>
                🎮 Appliance Controls
              </strong>

              <small class="d-block text-secondary mt-1">
                Select an appliance in your HDB.
              </small>

            </div>


            <div class="card-body">


              <div v-if="!selectedAppliance" class="text-center text-secondary py-4">

                <div class="fs-1 mb-2">
                  👆
                </div>

                <p class="mb-0">
                  Click an appliance in your HDB to control it.
                </p>

              </div>


              <div v-else>


                <!-- NAME -->

                <h5 class="fw-bold">
                  {{ selectedAppliance.name }}
                </h5>

                <p class="text-secondary">
                  {{ selectedAppliance.room }}
                </p>

                <hr>


                <div class="d-flex justify-content-between align-items-center mb-3">

                  <strong>
                    Power
                  </strong>

                  <div class="form-check form-switch">

                    <input class="form-check-input" type="checkbox" v-model="selectedAppliance.on">

                  </div>

                </div>

                <div v-if="selectedAppliance.on">


                  <label class="form-label">

                    Usage:

                    <strong>
                      {{ selectedAppliance.hours }} hours
                    </strong>

                  </label>


                  <input type="range" class="form-range" min="0" max="24" step="0.5"
                    v-model.number="selectedAppliance.hours">

                  <div v-if="selectedAppliance.name === 'Air Conditioner'" class="mt-4">

                    <label class="form-label">

                      Temperature:

                      <strong>
                        {{ acTemperature }}°C
                      </strong>

                    </label>


                    <select class="form-select" v-model.number="acTemperature">

                      <option value="20">20°C</option>
                      <option value="21">21°C</option>
                      <option value="22">22°C</option>
                      <option value="23">23°C</option>
                      <option value="24">24°C</option>
                      <option value="25">25°C</option>
                      <option value="26">26°C</option>
                      <option value="27">27°C</option>
                      <option value="28">28°C</option>

                    </select>

                  </div>


                </div>


              </div>


            </div>

          </div>

        </div>


      </div>


      <div class="text-center my-5">

        <p class="text-secondary mb-2">
          Ready with your household setup?
        </p>

        <button class="btn btn-success btn-lg px-5 simulate-btn" @click="simulateDay">
          ▶ SIMULATE DAY
        </button>

      </div>


      <div v-if="simulated && selectedScenario" class="card result-card mb-5">

        <div class="card-body">


          <div class="text-center mb-4">

            <h3 class="fw-bold">
              🏁 Day Complete!
            </h3>

            <p class="text-secondary mb-0">
              Here's how your household performed.
            </p>

          </div>



          <div class="row g-3 mb-4">


            <div class="col-6 col-lg-3">

              <div class="result-item">

                <small>
                  ⚡ ENERGY
                </small>

                <h4>
                  {{ totalEnergy.toFixed(1) }} kWh
                </h4>

              </div>

            </div>



            <div class="col-6 col-lg-3">

              <div class="result-item">

                <small>
                  💰 COST
                </small>

                <h4>
                  ${{ totalCost.toFixed(2) }}
                </h4>

              </div>

            </div>



            <div class="col-6 col-lg-3">

              <div class="result-item">

                <small>
                  ❤️ COMFORT
                </small>

                <h4>
                  {{ comfortScore }}%
                </h4>

              </div>

            </div>



            <div class="col-6 col-lg-3">

              <div class="result-item">

                <small>
                  🌱 ECO
                </small>

                <h4>
                  {{ ecoScore }}
                </h4>

              </div>

            </div>


          </div>



          <hr>


          <h5 class="fw-bold mt-4">
            🎯 Mission Results
          </h5>

          <div class="mission-result">

            <span>
              💰 Keep Cost Below ${{ currentGoals.maxCost }}
            </span>

            <span v-if="totalCost <= currentGoals.maxCost" class="badge bg-success">
              ✓ PASSED
            </span>

            <span v-else class="badge bg-danger">
              ✕ FAILED
            </span>

          </div>


          <div class="mission-result">

            <span>
              🌱 Eco Score {{ currentGoals.minEcoScore }}+
            </span>

            <span v-if="ecoScore >= currentGoals.minEcoScore" class="badge bg-success">
              ✓ PASSED
            </span>

            <span v-else class="badge bg-danger">
              ✕ FAILED
            </span>

          </div>




          <div class="mission-result">

            <span>
              ❤️ Comfort Score {{ currentGoals.minComfortScore }}+
            </span>

            <span v-if="comfortScore >= currentGoals.minComfortScore" class="badge bg-success">
              ✓ PASSED
            </span>

            <span v-else class="badge bg-danger">
              ✕ FAILED
            </span>

          </div>

          <div v-if="
            totalCost <= selectedScenario.goals.maxCost &&
            ecoScore >= selectedScenario.goals.minEcoScore &&
            comfortScore >= selectedScenario.goals.minComfortScore
          " class="alert alert-success text-center mt-4 mb-0">

            <h5 class="fw-bold">
              🏆 Challenge Complete!
            </h5>

            <p class="mb-0">
              You achieved all mission objectives.
            </p>

          </div>

          <div v-else class="alert alert-warning text-center mt-4 mb-0">

            <h5 class="fw-bold">
              ⚠️ Challenge Incomplete
            </h5>

            <p class="mb-0">
              Adjust your household setup and try again.
            </p>

          </div>


        </div>

      </div>


    </main>

  </div>

</template>


<style scoped>
.scenario-card {
  border: none;
  border-radius: 14px;

  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.08);
}



.scenario-goals {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 12px;
}


.goal-item {
  display: flex;

  align-items: center;

  gap: 12px;

  padding: 14px;

  background-color:
    #f8f9fa;

  border:
    1px solid #dee2e6;

  border-radius:
    12px;
}


.goal-icon {
  font-size:
    28px;
}


.goal-item small {
  display: block;

  font-size:
    11px;

  font-weight:
    700;

  color:
    #6c757d;
}


.goal-value {
  font-size:
    20px;

  font-weight:
    700;
}



.stat-card {
  border: none;

  border-radius:
    12px;

  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08);
}


.stat-card h3 {
  font-weight:
    700;

  margin-top:
    5px;

  margin-bottom:
    0;
}

.hdb-floorplan {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  min-height:
    520px;

  border:
    2px solid #343a40;

  border-radius:
    12px;

  overflow:
    hidden;
}


.room {
  border:
    1px solid #ced4da;

  padding:
    24px;

  transition:
    0.2s;
}


.room h5 {
  font-weight:
    700;

  margin-bottom:
    16px;
}


.room:hover {
  background-color:
    #f1f8f4;
}



/* Room colours */

.bedroom {
  background-color:
    #f8f9fa;
}


.living-room {
  background-color:
    #ffffff;
}


.kitchen {
  background-color:
    #fffdf5;
}


.bathroom {
  background-color:
    #f4faff;
}


.appliance {
  display: flex;

  justify-content:
    space-between;

  align-items:
    center;

  background-color:
    white;

  border:
    1px solid #dee2e6;

  border-radius:
    10px;

  padding:
    12px 14px;

  margin-top:
    10px;

  cursor:
    pointer;

  transition:
    0.2s;
}


/* Hover over appliance */

.appliance:hover {
  border-color:
    #198754;

  background-color:
    #f8fff9;
}


/* Appliance is turned ON */

.appliance-on {
  background-color:
    #f0fff6;

  border-color:
    #198754;
}


/* Appliance currently selected by player */

.appliance-selected {
  border:
    2px solid #198754;
}



.appliance-control {
  margin-bottom:
    10px;
}


.game-card-header {
  background-color:
    white;

  padding:
    16px;
}



.simulate-btn {
  font-weight:
    700;

  border-radius:
    12px;

  min-width:
    240px;

  padding-top:
    12px;

  padding-bottom:
    12px;

  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.15);
}




.result-card {
  border:
    2px solid #198754;

  border-radius:
    14px;

  box-shadow:
    0 3px 12px rgba(0, 0, 0, 0.1);
}



.result-item {
  height:
    100%;

  text-align:
    center;

  padding:
    16px;

  background-color:
    #f8f9fa;

  border-radius:
    10px;
}


.result-item small {
  font-size:
    11px;

  font-weight:
    700;

  color:
    #6c757d;
}


.result-item h4 {
  font-weight:
    700;

  margin-top:
    6px;

  margin-bottom:
    0;
}



/* Mission pass/fail rows */

.mission-result {
  display: flex;

  justify-content:
    space-between;

  align-items:
    center;

  gap:
    10px;

  padding:
    12px 0;

  border-bottom:
    1px solid #dee2e6;
}




@media (max-width: 768px) {

  /* Stack rooms */

  .hdb-floorplan {
    grid-template-columns:
      1fr;
  }


  /* Stack mission goals */

  .scenario-goals {
    grid-template-columns:
      1fr;
  }


  .room {
    padding:
      18px;
  }


  .mission-result {
    align-items:
      flex-start;

    flex-direction:
      column;
  }

}
</style>