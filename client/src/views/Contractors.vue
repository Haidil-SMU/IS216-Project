<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import workheads from '@/data/workheads.json'

const router = useRouter()

const CONTRACTORS_API = 'http://localhost:8000/api/contractors'
const SAVED_API = 'http://localhost:8000/api/saved-contractors'
const DATA_GOV_API = 'https://data.gov.sg/api/action/datastore_search'

const websiteContractors = ref([])
const apiContractors = ref([])
const savedContractors = ref([])

const selectedServices = ref([])
const activeTab = ref('website')
const showResults = ref(false)
const loading = ref(false)
const savingId = ref('')
const errorMessage = ref('')
const saveError = ref('')

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

const selectedServiceNames = computed(() =>
  services
    .filter(service => selectedServices.value.includes(service.code))
    .map(service => service.name)
)

const matchingWebsiteContractors = computed(() =>
  websiteContractors.value.filter(contractor =>
    contractor.services?.some(service => {
      const name = typeof service === 'string'
        ? service
        : service.name || service.code

      return selectedServices.value.includes(name) ||
        selectedServiceNames.value.some(
          selected => selected.toLowerCase() === String(name).toLowerCase()
        )
    })
  )
)

const displayedContractors = computed(() =>
  activeTab.value === 'website'
    ? matchingWebsiteContractors.value
    : apiContractors.value
)

// ============================================================
// MONGODB SAVED CONTRACTORS
// ============================================================

async function getSavedContractors() {
  const response = await axios.get(SAVED_API)

  savedContractors.value = Array.isArray(response.data)
    ? response.data
    : response.data.contractors || []
}

function getContractorId(contractor, source) {
  return source === 'website'
    ? `website-${contractor._id}`
    : `api-${contractor.uen_no}`
}

function isSaved(contractor, source) {
  const id = getContractorId(contractor, source)

  return savedContractors.value.some(saved =>
    saved.savedId === id
  )
}

async function saveContractor(contractor, source) {
  if (isSaved(contractor, source)) return

  const savedId = getContractorId(contractor, source)

  savingId.value = savedId
  saveError.value = ''

  try {
    await axios.post(SAVED_API, {
      ...contractor,
      savedId,
      source
    })

    await getSavedContractors()

  } catch (error) {
    console.error(error)
    saveError.value = error.response?.data?.error ||
      'Unable to save contractor.'
  } finally {
    savingId.value = ''
  }
}

// ============================================================
// FETCH CONTRACTORS
// ============================================================

async function getWebsiteContractors() {
  const response = await axios.get(CONTRACTORS_API)

  websiteContractors.value = Array.isArray(response.data)
    ? response.data
    : response.data.contractors || []
}

async function getApiContractors() {
  const response = await axios.get(DATA_GOV_API, {
    params: {
      resource_id: 'd_dcda79be4aded5f9e769b8e23ff69b47',
      filters: JSON.stringify({
        workhead: selectedServices.value
      }),
      limit: 100
    }
  })

  const companies = {}

  for (const contractor of response.data.result.records) {
    const uen = contractor.uen_no

    if (!companies[uen]) {
      companies[uen] = {
        ...contractor,
        registrations: []
      }
    }

    if (!companies[uen].registrations.some(
      registration => registration.workhead === contractor.workhead
    )) {
      companies[uen].registrations.push({
        workhead: contractor.workhead,
        grade: contractor.grade,
        expiry_date: contractor.expiry_date
      })
    }
  }

  apiContractors.value = Object.values(companies)
}

async function getContractors() {
  loading.value = true
  errorMessage.value = ''
  showResults.value = false

  websiteContractors.value = []
  apiContractors.value = []

  const results = await Promise.allSettled([
    getWebsiteContractors(),
    getApiContractors()
  ])

  const websiteFailed = results[0].status === 'rejected'
  const apiFailed = results[1].status === 'rejected'

  if (websiteFailed && apiFailed) {
    errorMessage.value = 'Unable to retrieve contractors.'
  } else {
    showResults.value = true

    if (websiteFailed) {
      activeTab.value = 'api'
      errorMessage.value = 'Website contractors could not be loaded.'
    } else if (apiFailed) {
      activeTab.value = 'website'
      errorMessage.value = 'Government contractors could not be loaded.'
    }
  }

  loading.value = false
}

function clearSelection() {
  selectedServices.value = []
  showResults.value = false
  errorMessage.value = ''
  websiteContractors.value = []
  apiContractors.value = []
}

function getServiceName(service) {
  const value = typeof service === 'string'
    ? service
    : service.name || service.code

  return services.find(item => item.code === value)?.name || value
}

function requestQuotation(contractor) {
  router.push({
    path: '/QuotationRequest',
    query: {
      contractorId: contractor._id,
      services: selectedServices.value.join(',')
    }
  })
}

onMounted(async () => {
  try {
    await getSavedContractors()
  } catch (error) {
    console.error(error)
    saveError.value = 'Unable to load saved contractors.'
  }
})
</script>

<template>
  <div class="container py-5">

    <!-- HEADER -->
    <div class="mb-5">
      <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-3">
        HDB EcoHome Services
      </span>

      <h1 class="fw-bold mb-3">
        Find Your Perfect
        <span class="text-success">Renovation Contractor</span>
      </h1>

      <p class="text-muted fs-5">
        Planning a home renovation? Select the services you need,
        and we'll help you find matching contractors.
      </p>
    </div>

    <!-- QUESTIONNAIRE -->
    <div class="card border-0 shadow-sm rounded-4 mb-5">
      <div class="card-body p-4 p-md-5">

        <h3 class="fw-bold mb-2">
          What are you planning to renovate?
        </h3>

        <p class="text-muted mb-4">
          Select one or more services to get started.
        </p>

        <div class="row g-3">
          <div
            v-for="service in services"
            :key="service.code"
            class="col-md-6 col-lg-4"
          >
            <label
              class="d-flex align-items-center gap-3 border rounded-3 p-3 h-100 service-option"
              :class="selectedServices.includes(service.code)
                ? 'border-success bg-success-subtle'
                : ''"
            >
              <input
                type="checkbox"
                class="form-check-input mt-0"
                :value="service.code"
                v-model="selectedServices"
                @change="showResults = false"
              />

              <span class="fw-medium">{{ service.name }}</span>
            </label>
          </div>
        </div>

        <p class="text-muted small mt-4 mb-3">
          {{ selectedServices.length }} service(s) selected
        </p>

        <div class="d-flex flex-wrap gap-2">
          <button
            class="btn btn-success px-4 py-2 fw-semibold"
            :disabled="selectedServices.length === 0 || loading"
            @click="getContractors"
          >
            Find Matching Contractors →
          </button>

          <button
            class="btn btn-outline-secondary px-4 py-2"
            :disabled="loading"
            @click="clearSelection"
          >
            Clear Selection
          </button>

          <RouterLink
            to="/SavedContractors"
            class="btn btn-outline-success px-4 py-2 fw-semibold"
          >
            View Saved Contractors →
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- SAVE ERROR -->
    <div v-if="saveError" class="alert alert-warning">
      {{ saveError }}
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-success mb-3"></div>
      <p class="text-muted">Finding renovation contractors...</p>
    </div>

    <!-- RESULTS -->
    <div v-else-if="showResults">

      <div class="mb-4">
        <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-2">
          Your Results
        </span>

        <h2 class="fw-bold">Matching Contractors</h2>

        <p class="text-muted">
          Browse contractors from our website or the government dataset.
        </p>
      </div>

      <!-- TABS -->
      <div class="contractor-tabs mb-4">
        <button
          class="contractor-tab"
          :class="{ active: activeTab === 'website' }"
          @click="activeTab = 'website'"
        >
          Website-Registered Contractors
          <span class="tab-count">
            {{ matchingWebsiteContractors.length }}
          </span>
        </button>

        <button
          class="contractor-tab"
          :class="{ active: activeTab === 'api' }"
          @click="activeTab = 'api'"
        >
          Government Dataset Contractors
          <span class="tab-count">{{ apiContractors.length }}</span>
        </button>
      </div>

      <div v-if="errorMessage" class="alert alert-warning">
        {{ errorMessage }}
      </div>

      <div
        v-if="displayedContractors.length === 0"
        class="alert alert-light border"
      >
        No matching contractors found in this category.
        Try selecting different renovation services.
      </div>

      <!-- WEBSITE CONTRACTORS -->
      <div v-if="activeTab === 'website'" class="row g-4">
        <div
          v-for="contractor in matchingWebsiteContractors"
          :key="contractor._id"
          class="col-md-6 col-lg-4"
        >
          <div class="card h-100 border-0 shadow-sm rounded-4 contractor-card">

            <div class="card-body p-4">
              <span class="badge bg-success-subtle text-success-emphasis mb-3">
                Website-Registered
              </span>

              <h5 class="fw-bold">{{ contractor.companyName }}</h5>

              <p class="text-muted small">
                {{ contractor.location }}
              </p>

              <hr />

              <p class="small text-muted mb-2">
                Renovation Services
              </p>

              <div class="d-flex flex-wrap gap-2 mb-3">
                <span
                  v-for="service in contractor.services || []"
                  :key="typeof service === 'string' ? service : service.code || service.name"
                  class="badge bg-success-subtle text-success-emphasis"
                >
                  {{ getServiceName(service) }}
                </span>
              </div>

              <p class="small text-muted mb-1">
                About Contractor
              </p>

              <p>{{ contractor.description }}</p>

              <p class="small text-muted mb-1">
                Contact Number
              </p>

              <p class="fw-semibold">
                {{ contractor.contactNumber || 'Not available' }}
              </p>
            </div>

            <div class="card-footer bg-white border-0 px-4 pb-4">
              <button
                class="btn btn-success w-100 fw-semibold mb-2"
                @click="requestQuotation(contractor)"
              >
                Request Quotation →
              </button>

              <div class="d-flex gap-2">
                <button
                  class="btn btn-outline-success flex-fill fw-semibold"
                  :disabled="isSaved(contractor, 'website') ||
                    savingId === getContractorId(contractor, 'website')"
                  @click="saveContractor(contractor, 'website')"
                >
                  {{ isSaved(contractor, 'website')
                    ? '✓ Saved'
                    : '♡ Save Contractor' }}
                </button>

                <a
                  v-if="contractor.contactNumber"
                  :href="'tel:' + contractor.contactNumber"
                  class="btn btn-outline-success flex-fill fw-semibold"
                >
                  Contact →
                </a>

                <button
                  v-else
                  class="btn btn-outline-secondary flex-fill"
                  disabled
                >
                  Unavailable
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- GOVERNMENT CONTRACTORS -->
      <div v-else class="row g-4">
        <div
          v-for="contractor in apiContractors"
          :key="contractor.uen_no"
          class="col-md-6 col-lg-4"
        >
          <div class="card h-100 border-0 shadow-sm rounded-4 contractor-card">

            <div class="card-body p-4">
              <span class="badge bg-success-subtle text-success-emphasis mb-3">
                {{ contractor.registrations.length }} Matching Service(s)
              </span>

              <h5 class="fw-bold">{{ contractor.company_name }}</h5>

              <p class="small text-muted">
                UEN: {{ contractor.uen_no }}
              </p>

              <hr />

              <p class="small text-muted mb-2">
                Renovation Services
              </p>

              <div
                v-for="registration in contractor.registrations"
                :key="registration.workhead"
                class="mb-2"
              >
                <span class="badge bg-success-subtle text-success-emphasis me-2">
                  {{ registration.workhead }}
                </span>

                <span class="fw-semibold">
                  {{ workheads[registration.workhead] || registration.workhead }}
                </span>
              </div>

              <div class="mt-3">
                <p class="small text-muted mb-1">Address</p>

                <p>
                  {{ contractor.building_no }}
                  {{ contractor.street_name }}
                  <br />
                  {{ contractor.unit_no }}
                  <br />
                  Singapore {{ contractor.postal_code }}
                </p>
              </div>

              <p class="small text-muted mb-1">
                Contact Number
              </p>

              <p class="fw-semibold">
                {{ contractor.tel_no || 'Not available' }}
              </p>

              <div class="bg-light rounded-3 p-3">
                <div
                  v-for="registration in contractor.registrations"
                  :key="registration.workhead"
                  class="mb-3"
                >
                  <p class="fw-semibold small mb-1">
                    {{ registration.workhead }}
                  </p>

                  <div class="d-flex justify-content-between small">
                    <span class="text-muted">Registration Grade</span>
                    <strong>{{ registration.grade }}</strong>
                  </div>

                  <div class="d-flex justify-content-between small">
                    <span class="text-muted">Expiry Date</span>
                    <strong>{{ registration.expiry_date }}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div class="card-footer bg-white border-0 px-4 pb-4">
              <div class="d-flex gap-2">
                <button
                  class="btn btn-success flex-fill fw-semibold"
                  :disabled="isSaved(contractor, 'api') ||
                    savingId === getContractorId(contractor, 'api')"
                  @click="saveContractor(contractor, 'api')"
                >
                  {{ isSaved(contractor, 'api')
                    ? '✓ Saved'
                    : '♡ Save Contractor' }}
                </button>

                <a
                  v-if="contractor.tel_no &&
                    !['na', 'n/a'].includes(String(contractor.tel_no).toLowerCase())"
                  :href="'tel:' + contractor.tel_no"
                  class="btn btn-outline-success flex-fill fw-semibold"
                >
                  Contact →
                </a>

                <button
                  v-else
                  class="btn btn-outline-secondary flex-fill"
                  disabled
                >
                  Unavailable
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- DISCLAIMER -->
      <div class="mt-5 p-3 bg-light rounded-3">
        <p class="small text-muted mb-0">
          <strong>Note:</strong>
          Website-registered contractors are user-submitted listings.
          Government dataset contractors are retrieved from data.gov.sg.
          Results include up to 100 matching registration records,
          grouped by company. Please independently verify contractor
          credentials and applicable HDB renovation requirements.
        </p>
      </div>

    </div>

    <div v-else-if="errorMessage" class="alert alert-danger">
      {{ errorMessage }}
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

.contractor-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 12px;
}

.contractor-tab {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 10px;
  padding: 12px 20px;
  font-weight: 600;
  color: #6c757d;
  cursor: pointer;
}

.contractor-tab:hover {
  border-color: #198754;
  color: #198754;
}

.contractor-tab.active {
  background: #198754;
  border-color: #198754;
  color: white;
}

.tab-count {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 20px;
  background: #e9ecef;
  color: #495057;
  font-size: 12px;
}

.contractor-tab.active .tab-count {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

@media (max-width: 576px) {
  .contractor-tabs {
    flex-direction: column;
  }

  .contractor-tab {
    width: 100%;
    text-align: center;
  }
}
</style>