<script setup>

import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:8000/api'
const NEA_URL = "https://api-open.data.gov.sg/v2/real-time/api/air-temperature"


const electricityRate = 0.32
const simulated = ref(false)

const scenarios = ref([])
const appliances = ref([])

const selectedScenario = ref(null)
const selectedAppliance = ref(null)

const acTemperature = ref(25)
const temperature = ref(0)



async function getWeatherData() {
  try {
    let total = 0
    let average = 0
    const weatherData = await axios.get(NEA_URL)
    console.log(weatherData)
    let readings = weatherData.data.data.readings[0].data //gets the weather accross all stations
    console.log(readings)
    //we calculate the average accross all stations in singapore, to  get the current weather
    for (const reading of readings) {
      total += reading.value

    }
    average = total / (readings.length)
    temperature.value = Number(average.toFixed(2))
    console.log(temperature.value)
  } catch (error) {

    console.log(error)

  }
}

async function loadData() {

  try {

    const response = await axios.get(API_URL)

    console.log(response.data)
    scenarios.value = response.data.scenarios
    appliances.value = response.data.appliances

    //console.log(scenarios.value)
    //console.log(appliances.value)
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
  getWeatherData()
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


// =========================
// TOTAL COST
// =========================

const totalCost = computed(() => {

  return totalEnergy.value * electricityRate

})


// =========================
// ECO SCORE
// =========================

const ecoScore = computed(() => {

  if (totalEnergy.value <= 8) {
    return 100
  }

  if (totalEnergy.value <= 12) {
    return 85
  }

  if (totalEnergy.value <= 16) {
    return 70
  }

  return 50

})


// =========================
// COMFORT SCORE
// =========================

const comfortScore = computed(() => {

  let score = 70

  const aircon = appliances.value.find(
    appliance => appliance.name === 'Air Conditioner'
  )

  const fan = appliances.value.find(
    appliance => appliance.name === 'Ceiling Fan'
  )

  if (aircon?.on) {
    score += 15
  }

  if (fan?.on) {
    score += 5
  }

  if (aircon?.on && acTemperature.value >= 27) {
    score -= 5
  }

  return Math.min(100, score)

})


// =========================
// SIMULATE DAY
// =========================

function simulateDay() {

  simulated.value = true

}

function selectAppliance(appliance) {
  selectedAppliance.value = appliance
}

// =========================
// GET APPLIANCES BY ROOM
// =========================

function getRoomAppliances(room) {

  return appliances.value.filter(
    appliance => appliance.room === room
  )

}


</script>


<template>

  <div>

    <!-- ========================= -->
    <!-- NAVBAR -->
    <!-- ========================= -->

    <nav class="navbar navbar-expand-lg navbar-dark bg-success">

      <div class="container">

        <RouterLink class="navbar-brand fw-bold" to="/">
          🏠 HDB EcoHome
        </RouterLink>

        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbar"
        >
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

    </nav>



    <main class="container py-4">


      <!-- ========================= -->
      <!-- PAGE TITLE -->
      <!-- ========================= -->

      <div class="mb-4">

        <h1 class="fw-bold">
          🏠 My HDB
        </h1>

        <p class="text-secondary">
          Manage your appliances, complete the challenge and keep your household efficient.
        </p>

      </div>



      <!-- ========================= -->
      <!-- SCENARIO SELECT -->
      <!-- ========================= -->

      <div class="mb-4">

        <label class="form-label fw-bold">
          🎮 Select Challenge
        </label>

        <select
          class="form-select"
          v-model="selectedScenario"
        >

          <option
            v-for="scenario in scenarios"
            :key="scenario.id"
            :value="scenario"
          >
            {{ scenario.name }}
          </option>

        </select>



        <!-- SCENARIO INFORMATION -->

        <div
          v-if="selectedScenario"
          class="card mt-3 scenario-card"
        >

          <div class="card-body">

            <div class="d-flex justify-content-between align-items-center mb-2">

              <h4 class="card-title mb-0">
                {{ selectedScenario.name }}
              </h4>

              <span class="badge bg-success">
                {{ selectedScenario.difficulty }}
              </span>

            </div>


            <!-- NORMAL DESCRIPTION -->

            <p
              v-if="selectedScenario.name !== 'Heatwave'"
              class="card-text"
            >
              {{ selectedScenario.description }}
            </p>


            <!-- HEATWAVE DESCRIPTION -->

            <p
              v-else
              class="card-text"
            >
              Singapore's current average temperature is
              <strong>{{ temperature }}°C</strong>.
              Keep your household comfortable while controlling electricity usage.
            </p>



            <!-- LIVE WEATHER -->

            <div class="alert alert-light border mt-3 mb-3">

              <small class="text-secondary d-block">
                LIVE SINGAPORE WEATHER
              </small>

              <strong class="fs-5">
                🌡️ {{ temperature }}°C
              </strong>

              <small class="text-secondary ms-2">
                Average across NEA stations
              </small>

            </div>


            <hr>


            <!-- MISSION OBJECTIVES -->

            <h5 class="mb-3">
              🎯 Mission Objectives
            </h5>


            <div class="scenario-goals">


              <!-- COST GOAL -->

              <div class="goal-item">

                <span class="goal-icon">
                  💰
                </span>

                <div>

                  <small>
                    KEEP COST BELOW
                  </small>

                  <div class="goal-value">
                    ${{ selectedScenario.goals.maxCost }}
                  </div>

                </div>

              </div>



              <!-- ECO GOAL -->

              <div class="goal-item">

                <span class="goal-icon">
                  🌱
                </span>

                <div>

                  <small>
                    ECO SCORE
                  </small>

                  <div class="goal-value">
                    {{ selectedScenario.goals.minEcoScore }}+
                  </div>

                </div>

              </div>



              <!-- COMFORT GOAL -->

              <div class="goal-item">

                <span class="goal-icon">
                  ❤️
                </span>

                <div>

                  <small>
                    COMFORT SCORE
                  </small>

                  <div class="goal-value">
                    {{ selectedScenario.goals.minComfortScore }}+
                  </div>

                </div>

              </div>


            </div>

          </div>

        </div>

      </div>



      <!-- ========================= -->
      <!-- CURRENT HOUSEHOLD STATUS -->
      <!-- ========================= -->

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



        <!-- COST -->

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



        <!-- COMFORT -->

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



        <!-- ECO SCORE -->

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



      <!-- ========================= -->
      <!-- HDB + CONTROLS -->
      <!-- ========================= -->

      <div class="row g-4">


        <!-- ========================= -->
        <!-- INTERACTIVE HDB -->
        <!-- ========================= -->

        <div class="col-lg-8">

          <div class="card">

            <div class="card-header">

              <strong>
                🏠 Interactive HDB
              </strong>

            </div>


            <div class="card-body">


              <div class="hdb-floorplan">


                <!-- BEDROOM -->

                <div class="room bedroom">

                  <h5>
                    🛏️ Bedroom
                  </h5>

                  <div
                    v-for="appliance in getRoomAppliances('Bedroom')"
                    :key="appliance.id"
                    class="appliance"
                    :class="{
                      'appliance-on': appliance.on,
                      'appliance-selected': selectedAppliance?.id === appliance.id
                    }"
                    @click="selectAppliance(appliance)"
                  >

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span
                      v-if="appliance.on"
                      class="badge bg-success"
                    >
                      ON
                    </span>

                    <span
                      v-else
                      class="badge bg-secondary"
                    >
                      OFF
                    </span>

                  </div>

                </div>



                <!-- LIVING ROOM -->

                <div class="room living-room">

                  <h5>
                    🛋️ Living Room
                  </h5>

                  <div
                    v-for="appliance in getRoomAppliances('Living Room')"
                    :key="appliance.id"
                    class="appliance"
                    :class="{
                      'appliance-on': appliance.on,
                      'appliance-selected': selectedAppliance?.id === appliance.id
                    }"
                    @click="selectAppliance(appliance)"
                  >

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span
                      v-if="appliance.on"
                      class="badge bg-success"
                    >
                      ON
                    </span>

                    <span
                      v-else
                      class="badge bg-secondary"
                    >
                      OFF
                    </span>

                  </div>

                </div>



                <!-- KITCHEN -->

                <div class="room kitchen">

                  <h5>
                    🍳 Kitchen
                  </h5>

                  <div
                    v-for="appliance in getRoomAppliances('Kitchen')"
                    :key="appliance.id"
                    class="appliance"
                    :class="{
                      'appliance-on': appliance.on,
                      'appliance-selected': selectedAppliance?.id === appliance.id
                    }"
                    @click="selectAppliance(appliance)"
                  >

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span
                      v-if="appliance.on"
                      class="badge bg-success"
                    >
                      ON
                    </span>

                    <span
                      v-else
                      class="badge bg-secondary"
                    >
                      OFF
                    </span>

                  </div>

                </div>



                <!-- BATHROOM -->

                <div class="room bathroom">

                  <h5>
                    🚿 Bathroom
                  </h5>

                  <div
                    v-for="appliance in getRoomAppliances('Bathroom')"
                    :key="appliance.id"
                    class="appliance"
                    :class="{
                      'appliance-on': appliance.on,
                      'appliance-selected': selectedAppliance?.id === appliance.id
                    }"
                    @click="selectAppliance(appliance)"
                  >

                    <span>
                      {{ appliance.name }}
                    </span>

                    <span
                      v-if="appliance.on"
                      class="badge bg-success"
                    >
                      ON
                    </span>

                    <span
                      v-else
                      class="badge bg-secondary"
                    >
                      OFF
                    </span>

                  </div>

                </div>


              </div>

            </div>

          </div>

        </div>



        <!-- ========================= -->
        <!-- SELECTED APPLIANCE -->
        <!-- ========================= -->

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


              <!-- NOTHING SELECTED -->

              <div
                v-if="!selectedAppliance"
                class="text-center text-secondary py-4"
              >

                <div class="fs-1 mb-2">
                  👆
                </div>

                <p class="mb-0">
                  Click an appliance in your HDB to control it.
                </p>

              </div>



              <!-- APPLIANCE SELECTED -->

              <div v-else>


                <!-- NAME -->

                <h5 class="fw-bold">
                  {{ selectedAppliance.name }}
                </h5>

                <p class="text-secondary">
                  {{ selectedAppliance.room }}
                </p>

                <hr>



                <!-- POWER -->

                <div class="d-flex justify-content-between align-items-center mb-3">

                  <strong>
                    Power
                  </strong>

                  <div class="form-check form-switch">

                    <input
                      class="form-check-input"
                      type="checkbox"
                      v-model="selectedAppliance.on"
                    >

                  </div>

                </div>



                <!-- CONTROLS WHEN ON -->

                <div v-if="selectedAppliance.on">


                  <!-- USAGE -->

                  <label class="form-label">

                    Usage:

                    <strong>
                      {{ selectedAppliance.hours }} hours
                    </strong>

                  </label>


                  <input
                    type="range"
                    class="form-range"
                    min="0"
                    max="24"
                    step="0.5"
                    v-model.number="selectedAppliance.hours"
                  >



                  <!-- AC TEMPERATURE -->

                  <div
                    v-if="selectedAppliance.name === 'Air Conditioner'"
                    class="mt-4"
                  >

                    <label class="form-label">

                      Temperature:

                      <strong>
                        {{ acTemperature }}°C
                      </strong>

                    </label>


                    <select
                      class="form-select"
                      v-model.number="acTemperature"
                    >

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



      <!-- ========================= -->
      <!-- SIMULATE DAY -->
      <!-- ========================= -->

      <div class="text-center my-5">

        <p class="text-secondary mb-2">
          Ready with your household setup?
        </p>

        <button
          class="btn btn-success btn-lg px-5 simulate-btn"
          @click="simulateDay"
        >
          ▶ SIMULATE DAY
        </button>

      </div>



      <!-- ========================= -->
      <!-- RESULTS -->
      <!-- ========================= -->

      <div
        v-if="simulated && selectedScenario"
        class="card result-card mb-5"
      >

        <div class="card-body">


          <div class="text-center mb-4">

            <h3 class="fw-bold">
              🏁 Day Complete!
            </h3>

            <p class="text-secondary mb-0">
              Here's how your household performed.
            </p>

          </div>



          <!-- RESULT VALUES -->

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


          <!-- MISSION RESULTS -->

          <h5 class="fw-bold mt-4">
            🎯 Mission Results
          </h5>



          <!-- COST -->

          <div class="mission-result">

            <span>
              💰 Keep Cost Below ${{ selectedScenario.goals.maxCost }}
            </span>

            <span
              v-if="totalCost <= selectedScenario.goals.maxCost"
              class="badge bg-success"
            >
              ✓ PASSED
            </span>

            <span
              v-else
              class="badge bg-danger"
            >
              ✕ FAILED
            </span>

          </div>



          <!-- ECO -->

          <div class="mission-result">

            <span>
              🌱 Eco Score {{ selectedScenario.goals.minEcoScore }}+
            </span>

            <span
              v-if="ecoScore >= selectedScenario.goals.minEcoScore"
              class="badge bg-success"
            >
              ✓ PASSED
            </span>

            <span
              v-else
              class="badge bg-danger"
            >
              ✕ FAILED
            </span>

          </div>



          <!-- COMFORT -->

          <div class="mission-result">

            <span>
              ❤️ Comfort Score {{ selectedScenario.goals.minComfortScore }}+
            </span>

            <span
              v-if="comfortScore >= selectedScenario.goals.minComfortScore"
              class="badge bg-success"
            >
              ✓ PASSED
            </span>

            <span
              v-else
              class="badge bg-danger"
            >
              ✕ FAILED
            </span>

          </div>



          <!-- ALL GOALS PASSED -->

          <div
            v-if="
              totalCost <= selectedScenario.goals.maxCost &&
              ecoScore >= selectedScenario.goals.minEcoScore &&
              comfortScore >= selectedScenario.goals.minComfortScore
            "
            class="alert alert-success text-center mt-4 mb-0"
          >

            <h5 class="fw-bold">
              🏆 Challenge Complete!
            </h5>

            <p class="mb-0">
              You achieved all mission objectives.
            </p>

          </div>



          <!-- NOT ALL GOALS PASSED -->

          <div
            v-else
            class="alert alert-warning text-center mt-4 mb-0"
          >

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

/* ============================= */
/* SCENARIO */
/* ============================= */

.scenario-card {
  border: none;
  border-radius: 14px;

  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.08);
}


/* Mission goals */

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



/* ============================= */
/* STAT CARDS */
/* ============================= */

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



/* ============================= */
/* FLOOR PLAN */
/* ============================= */

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



/* ============================= */
/* ROOMS */
/* ============================= */

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



/* ============================= */
/* APPLIANCES INSIDE ROOMS */
/* ============================= */

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



/* ============================= */
/* APPLIANCE CONTROL PANEL */
/* ============================= */

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



/* ============================= */
/* SIMULATE BUTTON */
/* ============================= */

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



/* ============================= */
/* RESULTS */
/* ============================= */

.result-card {
  border:
    2px solid #198754;

  border-radius:
    14px;

  box-shadow:
    0 3px 12px rgba(0, 0, 0, 0.1);
}



/* Individual result boxes */

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



/* ============================= */
/* MOBILE */
/* ============================= */

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