<script setup>
import { ref } from 'vue'
import axios from 'axios'
import workheads from '@/data/workheads.json'

// Data
const contractors = ref([])
const selectedServices = ref([])
const showResults = ref(false)
const loading = ref(false)
const errorMessage = ref('')

// Services shown in the questionnaire
const services = [
  { code: 'CR06', name: 'Interior Design & Renovation' },
  { code: 'ME05', name: 'Electrical Works' },
  { code: 'ME12', name: 'Plumbing & Sanitary Works' },
  { code: 'ME01', name: 'Air-conditioning' },
  { code: 'TR07', name: 'Tiles & Marble Flooring' },
  { code: 'TR08', name: 'Timber & Vinyl Flooring' },
  { code: 'CR09', name: 'Painting & Redecoration' },
  { code: 'CR13', name: 'Waterproofing' },
  { code: 'CR17', name: 'Windows' },
  { code: 'CR18', name: 'Doors' }
]

// Fetch contractors based on selected services
async function getContractors() {
  loading.value = true
  errorMessage.value = ''
  showResults.value = false
  contractors.value = []

  try {
    const response = await axios.get(
      'https://data.gov.sg/api/action/datastore_search',
      {
        params: {
          resource_id: 'd_dcda79be4aded5f9e769b8e23ff69b47',
          filters: JSON.stringify({
            workhead: selectedServices.value
          }),
          limit: 100
        }
      }
    )

    contractors.value = response.data.result.records
    showResults.value = true

  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="container py-5">

    <!-- PAGE HEADER -->
    <div class="mb-5">
      <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-3">HDB EcoHome Services</span>

      <h1 class="fw-bold mb-3">
        Find Your Perfect <span class="text-success">Renovation Contractor</span>
      </h1>

      <p class="text-muted fs-5">
        Planning a home renovation? Select the services you need,
        and we'll help you find matching registered contractors.
      </p>
    </div>

    <!-- QUESTIONNAIRE -->
    <div class="card border-0 shadow-sm rounded-4 mb-5">
      <div class="card-body p-4 p-md-5">

        <div class="mb-4">
          <h3 class="fw-bold mb-2">What are you planning to renovate?</h3>
          <p class="text-muted mb-0">Select one or more services to get started.</p>
        </div>

        <!-- SERVICE CHECKBOXES -->
        <div class="row g-3">
          <div v-for="service in services" :key="service.code" class="col-md-6 col-lg-4">

            <label
              class="d-flex align-items-center gap-3 border rounded-3 p-3 h-100 service-option"
              :class="selectedServices.includes(service.code) ? 'border-success bg-success-subtle' : ''"
              :for="service.code"
            >
              <input class="form-check-input mt-0" type="checkbox" :id="service.code" :value="service.code" v-model="selectedServices" @change="showResults = false" />
              <span class="fw-medium">{{ service.name }}</span>
            </label>

          </div>
        </div>

        <!-- SELECTED SERVICES COUNT -->
        <div class="mt-4 mb-3">
          <span class="text-muted small">{{ selectedServices.length }} service(s) selected</span>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-success px-4 py-2 fw-semibold" :disabled="selectedServices.length === 0 || loading" @click="getContractors">Find Matching Contractors →</button>
          <button class="btn btn-outline-secondary px-4 py-2" :disabled="loading" @click="selectedServices = []; showResults = false">Clear Selection</button>
        </div>

      </div>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-success mb-3" role="status"></div>
      <p class="text-muted">Finding renovation contractors...</p>
    </div>

    <!-- ERROR -->
    <div v-else-if="errorMessage" class="alert alert-danger rounded-3">
      {{ errorMessage }}
    </div>

    <!-- RESULTS -->
    <div v-else-if="showResults">

      <!-- RESULTS HEADER -->
      <div class="mb-4">
        <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-2">Your Results</span>
        <h2 class="fw-bold mb-2">Matching Contractors</h2>
        <p class="text-muted">Here are contractors whose registered services match your renovation needs.</p>
      </div>

      <!-- NO RESULTS -->
      <div v-if="contractors.length === 0" class="alert alert-light border rounded-3">
        No matching contractors found. Try selecting different renovation services.
      </div>

      <!-- CONTRACTOR CARDS -->
      <div class="row g-4">
        <div v-for="contractor in contractors" :key="contractor._id" class="col-md-6 col-lg-4">

          <div class="card h-100 border-0 shadow-sm rounded-4 contractor-card">

            <div class="card-body p-4">

              <!-- COMPANY NAME -->
              <div class="mb-3">
                <span class="badge bg-success-subtle text-success-emphasis mb-3">{{ contractor.workhead }}</span>
                <h5 class="fw-bold mb-2">{{ contractor.company_name }}</h5>
                <p class="small text-muted mb-0">UEN: {{ contractor.uen_no }}</p>
              </div>

              <hr class="text-muted" />

              <!-- SERVICE -->
              <div class="mb-3">
                <p class="small text-muted mb-1">Renovation Service</p>
                <p class="fw-semibold mb-0">{{ workheads[contractor.workhead] || contractor.workhead }}</p>
              </div>

              <!-- ADDRESS -->
              <div class="mb-3">
                <p class="small text-muted mb-1">Address</p>
                <p class="mb-0">
                  {{ contractor.building_no }} {{ contractor.street_name }}<br />
                  {{ contractor.unit_no }}<br />
                  Singapore {{ contractor.postal_code }}
                </p>
              </div>

              <!-- CONTACT -->
              <div class="mb-3">
                <p class="small text-muted mb-1">Contact Number</p>
                <p class="fw-semibold mb-0">{{ contractor.tel_no || 'Not available' }}</p>
              </div>

              <!-- REGISTRATION -->
              <div class="bg-light rounded-3 p-3">
                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted small">Registration Grade</span>
                  <span class="fw-semibold small">{{ contractor.grade }}</span>
                </div>

                <div class="d-flex justify-content-between">
                  <span class="text-muted small">Expiry Date</span>
                  <span class="fw-semibold small">{{ contractor.expiry_date }}</span>
                </div>
              </div>

            </div>

            <!-- CARD FOOTER -->
            <div class="card-footer bg-white border-0 px-4 pb-4">

              <a
                v-if="contractor.tel_no && !['na', 'n/a'].includes(String(contractor.tel_no).toLowerCase())"
                :href="'tel:' + contractor.tel_no"
                class="btn btn-outline-success w-100 fw-semibold"
              >Contact Contractor →</a>

              <button v-else class="btn btn-outline-secondary w-100" disabled>Contact Unavailable</button>

            </div>

          </div>

        </div>
      </div>

      <!-- DISCLAIMER -->
      <div class="mt-5 p-3 bg-light rounded-3">
        <p class="small text-muted mb-0">
          <strong>Note:</strong> Contractor information is sourced from data.gov.sg.
          Results show up to 100 matching registration records.
          Please verify current registration and HDB renovation requirements
          before engaging a contractor.
        </p>
      </div>

    </div>

  </div>
</template>

<style scoped>
.service-option {
  cursor: pointer;
  transition: all 0.2s ease;
}

.service-option:hover {
  border-color: #198754 !important;
  background-color: #f0faf4;
}

.contractor-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.contractor-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}
</style>