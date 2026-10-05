<script setup>

import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const API_URL = 'http://127.0.0.1:8000/api'

const electricityRate = 0.32
const simulated = ref(false)

const scenarios = ref([])
const appliances = ref([])

const selectedScenarioId = ref(null)

const acTemperature = ref(25)


async function loadData() {

  try {

    const response = await axios.get(API_URL)

    console.log(response.data)
    scenarios.value = response.data.scenarios
    appliances.value = response.data.appliances

    //console.log(scenarios.value)
    //console.log(appliances.value)

    for (const appliance of appliances.value) {
      appliance.on = false
      appliance.hours = 0
    }

  } catch (error) {

    console.log(error)

  }

}

onMounted(loadData)

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

    <!-- NAVBAR -->

    <nav class="navbar navbar-expand-lg navbar-dark bg-success">

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

            <!-- <RouterLink
              class="nav-link"
              to="/challenges"
            >
              Challenges
            </RouterLink>

            <RouterLink
              class="nav-link"
              to="/dashboard"
            >
              Dashboard
            </RouterLink> -->

          </div>

        </div>

      </div>

    </nav>



    <main class="container py-4">

      <!-- PAGE TITLE -->

      <div class="mb-4">

        <h1 class="fw-bold">
          My HDB
        </h1>

        <p class="text-secondary">
          Manage your appliances and reduce your household energy usage.
        </p>

      </div>

      <div class="mb-4">

        <label class="form-label">
          Scenario
        </label>

        <select class="form-select" v-model.number="selectedScenarioId">

          <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">
            {{ scenario.name }}
          </option>

        </select>

      </div>



      <!-- TOP STATISTICS -->

      <div class="row g-3 mb-4">


        <!-- ENERGY -->

        <div class="col-6 col-lg-3">

          <div class="card h-100">

            <div class="card-body">

              <small class="text-secondary">
                ⚡ Energy
              </small>

              <h3>
                {{ totalEnergy.toFixed(1) }}
                <small class="fs-6">kWh</small>
              </h3>

            </div>

          </div>

        </div>



        <!-- COST -->

        <div class="col-6 col-lg-3">

          <div class="card h-100">

            <div class="card-body">

              <small class="text-secondary">
                💰 Cost
              </small>

              <h3>
                ${{ totalCost.toFixed(2) }}
              </h3>

            </div>

          </div>

        </div>



        <!-- COMFORT -->

        <div class="col-6 col-lg-3">

          <div class="card h-100">

            <div class="card-body">

              <small class="text-secondary">
                ❤️ Comfort
              </small>

              <h3>
                {{ comfortScore }}%
              </h3>

            </div>

          </div>

        </div>



        <!-- ECO SCORE -->

        <div class="col-6 col-lg-3">

          <div class="card h-100">

            <div class="card-body">

              <small class="text-secondary">
                🌱 Eco Score
              </small>

              <h3>
                {{ ecoScore }}
              </h3>

            </div>

          </div>

        </div>


      </div>



      <div class="row g-4">


        <!-- ========================= -->
        <!-- HDB FLOOR PLAN -->
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


                  <div v-for="appliance in getRoomAppliances('Bedroom')" :key="appliance.id" class="appliance">

                    {{ appliance.icon }}
                    {{ appliance.name }}

                  </div>

                </div>



                <!-- LIVING ROOM -->

                <div class="room living-room">

                  <h5>
                    🛋️ Living Room
                  </h5>


                  <div v-for="appliance in getRoomAppliances('Living Room')" :key="appliance.id" class="appliance">

                    {{ appliance.icon }}
                    {{ appliance.name }}

                  </div>

                </div>



                <!-- KITCHEN -->

                <div class="room kitchen">

                  <h5>
                    🍳 Kitchen
                  </h5>


                  <div v-for="appliance in getRoomAppliances('Kitchen')" :key="appliance.id" class="appliance">

                    {{ appliance.icon }}
                    {{ appliance.name }}

                  </div>

                </div>



                <!-- BATHROOM -->

                <div class="room bathroom">

                  <h5>
                    🚿 Bathroom
                  </h5>


                  <div v-for="appliance in getRoomAppliances('Bathroom')" :key="appliance.id" class="appliance">

                    {{ appliance.icon }}
                    {{ appliance.name }}

                  </div>

                </div>


              </div>

            </div>

          </div>

        </div>



        <!-- ========================= -->
        <!-- APPLIANCE CONTROLS -->
        <!-- ========================= -->

        <div class="col-lg-4">

          <div class="card">

            <div class="card-header">

              <strong>
                ⚡ Appliance Controls
              </strong>

            </div>


            <div class="card-body">


              <div v-for="appliance in appliances" :key="appliance.id" class="appliance-control">


                <!-- NAME + SWITCH -->

                <div class="d-flex justify-content-between align-items-center">

                  <strong>

                    {{ appliance.icon }}
                    {{ appliance.name }}

                  </strong>


                  <div class="form-check form-switch">

                    <input class="form-check-input" type="checkbox" v-model="appliance.on">

                  </div>

                </div>



                <!-- HOURS -->

                <div v-if="appliance.on" class="mt-2">

                  <label class="form-label">

                    Usage:

                    <strong>
                      {{ appliance.hours }} hours
                    </strong>

                  </label>


                  <input type="range" class="form-range" min="0" max="24" step="0.5" v-model.number="appliance.hours">


                  <!-- AC TEMPERATURE -->

                  <div v-if="appliance.name === 'Air Conditioner'" class="mt-2">

                    <label class="form-label">
                      Temperature
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


                <hr>

              </div>


            </div>

          </div>

        </div>


      </div>



      <!-- ========================= -->
      <!-- SIMULATE BUTTON -->
      <!-- ========================= -->

      <div class="text-center my-4">

        <button class="btn btn-success btn-lg px-5" @click="simulateDay">

          ▶ Simulate Day

        </button>

      </div>



      <!-- ========================= -->
      <!-- RESULTS -->
      <!-- ========================= -->

      <div v-if="simulated" class="card border-success">

        <div class="card-body">

          <h4 class="fw-bold">
            📊 Today's Results
          </h4>


          <div class="row mt-4">


            <div class="col-md-3">

              <p class="text-secondary mb-1">
                Energy Used
              </p>

              <h4>
                {{ totalEnergy.toFixed(1) }} kWh
              </h4>

            </div>


            <div class="col-md-3">

              <p class="text-secondary mb-1">
                Estimated Cost
              </p>

              <h4>
                ${{ totalCost.toFixed(2) }}
              </h4>

            </div>


            <div class="col-md-3">

              <p class="text-secondary mb-1">
                Comfort
              </p>

              <h4>
                {{ comfortScore }}%
              </h4>

            </div>


            <div class="col-md-3">

              <p class="text-secondary mb-1">
                Eco Score
              </p>

              <h4>
                {{ ecoScore }}
              </h4>

            </div>


          </div>


          <!-- FEEDBACK -->

          <div v-if="totalEnergy > 15" class="alert alert-warning mt-3 mb-0">

            ⚡ Your household used a lot of energy today.
            Try reducing appliance usage.

          </div>


          <div v-else class="alert alert-success mt-3 mb-0">

            🌱 Great job! Your household kept its energy
            consumption relatively low.

          </div>


        </div>

      </div>


    </main>

  </div>

</template>


<style scoped>
/* ============================= */
/* FLOOR PLAN */
/* ============================= */

.hdb-floorplan {

  display: grid;

  grid-template-columns:
    1fr 1fr;

  min-height: 520px;

  border:
    5px solid #343a40;

}


.room {

  border:
    2px solid #6c757d;

  padding: 20px;

  transition:
    0.2s;

}


.room:hover {

  background-color:
    #f1f8f4;

}


.bedroom {

  background-color:
    #f8f9fa;

}


.living-room {

  background-color:
    #fff;

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
/* APPLIANCES */
/* ============================= */

.appliance {

  background-color:
    white;

  border:
    1px solid #dee2e6;

  border-radius:
    8px;

  padding:
    8px 10px;

  margin-top:
    10px;

}


.appliance-control {

  margin-bottom:
    10px;

}


/* ============================= */
/* MOBILE */
/* ============================= */

@media (max-width: 768px) {

  .hdb-floorplan {

    grid-template-columns:
      1fr;

  }

}
</style>