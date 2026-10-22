<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

const CONTRACTORS_API = '/api/contractors'
const PLANNER_API = '/api/planner'
const QUOTATION_API = '/api/quotation-requests'

const contractorId = String(route.query.contractorId || '')
const requestId = String(route.query.requestId || '')
const isEditMode = Boolean(requestId)

const selectedServiceCodes = String(route.query.services || '')
  .split(',')
  .filter(Boolean)

const contractor = ref(null)
const households = ref([])

const loading = ref(true)
const submitting = ref(false)

const errorMessage = ref('')
const successMessage = ref('')

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

const propertyMode = ref('saved')
const selectedHouseholdId = ref('')

const form = ref({
  householdName: '',
  flatType: '',
  occupants: 1,
  bedrooms: 1,
  services: [],
  description: '',
  budget: null,
  preferredStartDate: ''
})

const contractorServices = computed(() => {
  if (!contractor.value) return []

  return (contractor.value.services || []).map(service => {
    const value = typeof service === 'string'
      ? service
      : service.name || service.code

    return services.find(item => item.code === value)?.name || value
  })
})

const today = new Date().toLocaleDateString('en-CA')

// ============================================================
// LOAD DATA
// ============================================================

async function getData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [contractorResponse, plannerResponse] = await Promise.all([
      axios.get(CONTRACTORS_API),
      axios.get(PLANNER_API)
    ])

    const contractorData = contractorResponse.data

    const contractors = Array.isArray(contractorData)
      ? contractorData
      : contractorData.contractors || []

    contractor.value = contractors.find(
      item => String(item._id) === contractorId
    )

    if (!contractor.value) {
      throw new Error('Contractor not found.')
    }

    households.value = Array.isArray(plannerResponse.data.users)
      ? plannerResponse.data.users
      : []

    if (isEditMode) {
      await loadExistingRequest()
    } else {
      form.value.services = services
        .filter(service =>
          selectedServiceCodes.includes(service.code) &&
          contractorServices.value.includes(service.name)
        )
        .map(service => service.name)

      if (households.value.length === 0) {
        propertyMode.value = 'manual'
      }
    }

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.message || 'Unable to load quotation information.'

    contractor.value = null

  } finally {
    loading.value = false
  }
}

// ============================================================
// LOAD EXISTING QUOTATION REQUEST
// ============================================================

async function loadExistingRequest() {
  const response = await axios.get(QUOTATION_API)

  const requests = Array.isArray(response.data)
    ? response.data
    : response.data.requests || []

  const existingRequest = requests.find(
    request => String(request._id?.$oid || request._id) === requestId
  )

  if (!existingRequest) {
    throw new Error('Quotation request not found.')
  }

  const existingContractorId =
    existingRequest.contractorId?.$oid ||
    existingRequest.contractorId

  if (String(existingContractorId) !== contractorId) {
    throw new Error('Quotation request does not belong to this contractor.')
  }

  if (existingRequest.status !== 'pending') {
    throw new Error('Only pending quotation requests can be updated.')
  }

  // Restore previously submitted information
  form.value = {
    householdName: existingRequest.household?.name || '',
    flatType: existingRequest.household?.flatType || '',
    occupants: existingRequest.household?.occupants ?? 1,
    bedrooms: existingRequest.household?.bedrooms ?? 1,
    services: [...(existingRequest.services || [])],
    description: existingRequest.description || '',
    budget: existingRequest.budget ?? null,
    preferredStartDate: existingRequest.preferredStartDate
      ? String(existingRequest.preferredStartDate).slice(0, 10)
      : ''
  }

  // Restore saved household selection, if it still exists
  const savedHousehold = households.value.find(
    household =>
      String(household.id) === String(existingRequest.householdId)
  )

  if (savedHousehold) {
    propertyMode.value = 'saved'
    selectedHouseholdId.value = String(savedHousehold.id)
  } else {
    propertyMode.value = 'manual'
    selectedHouseholdId.value = ''
  }
}

// ============================================================
// HOUSEHOLD SELECTION
// ============================================================

function selectHousehold() {
  const household = households.value.find(
    item => String(item.id) === selectedHouseholdId.value
  )

  if (!household) return

  form.value.householdName = household.name
  form.value.flatType = household.flatType
  form.value.occupants = household.occupants
  form.value.bedrooms = household.bedrooms
}

function changePropertyMode() {
  selectedHouseholdId.value = ''

  form.value.householdName = ''
  form.value.flatType = ''
  form.value.occupants = 1
  form.value.bedrooms = 1
}

// ============================================================
// SUBMIT OR UPDATE
// ============================================================

async function submitRequest() {
  errorMessage.value = ''
  successMessage.value = ''

  if (propertyMode.value === 'saved' && !selectedHouseholdId.value) {
    errorMessage.value = 'Please select a saved household.'
    return
  }

  if (!form.value.householdName.trim() || !form.value.flatType) {
    errorMessage.value = 'Please complete your property information.'
    return
  }

  if (
    !Number.isInteger(Number(form.value.occupants)) ||
    Number(form.value.occupants) < 1 ||
    !Number.isInteger(Number(form.value.bedrooms)) ||
    Number(form.value.bedrooms) < 0
  ) {
    errorMessage.value = 'Please enter valid property details.'
    return
  }

  if (form.value.services.length === 0) {
    errorMessage.value = 'Please select at least one renovation service.'
    return
  }

  if (!form.value.description.trim()) {
    errorMessage.value = 'Please describe your renovation requirements.'
    return
  }

  if (
    form.value.budget === null ||
    form.value.budget === '' ||
    !Number.isFinite(Number(form.value.budget)) ||
    Number(form.value.budget) <= 0
  ) {
    errorMessage.value = 'Please enter a valid budget.'
    return
  }

  const requestData = {
    contractorId,

    householdId: propertyMode.value === 'saved'
      ? selectedHouseholdId.value
      : null,

    household: {
      name: form.value.householdName,
      flatType: form.value.flatType,
      occupants: Number(form.value.occupants),
      bedrooms: Number(form.value.bedrooms)
    },

    services: [...form.value.services],
    description: form.value.description.trim(),
    budget: Number(form.value.budget),
    preferredStartDate: form.value.preferredStartDate || null
  }

  submitting.value = true

  try {
    if (isEditMode) {
      await axios.put(
        `${QUOTATION_API}/${encodeURIComponent(requestId)}`,
        requestData
      )

      successMessage.value =
        'Your quotation request has been updated successfully!'

    } else {
      await axios.post(QUOTATION_API, requestData)

      successMessage.value =
        'Your quotation request has been submitted successfully!'
    }

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to save quotation request.'

  } finally {
    submitting.value = false
  }
}

onMounted(getData)
</script>

<template>
  <div class="container py-5">

    <!-- PAGE HEADER -->
    <div class="mb-4">
      <button
        class="btn btn-link text-success text-decoration-none p-0 mb-3"
        @click="router.back()"
      >
        ← Back to Contractors
      </button>

      <h1 class="fw-bold">
        {{ isEditMode ? 'Update' : 'Request a' }}
        <span class="text-success">Quotation</span>
      </h1>

      <p class="text-muted">
        {{
          isEditMode
            ? 'Review and update your previously submitted renovation requirements.'
            : 'Tell the contractor about your renovation requirements.'
        }}
      </p>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-success"></div>
      <p class="text-muted mt-3">Loading quotation form...</p>
    </div>

    <!-- SUCCESS -->
    <div
      v-else-if="successMessage"
      class="card border-0 shadow-sm rounded-4"
    >
      <div class="card-body p-5 text-center">
        <h3 class="fw-bold text-success mb-3">
          {{ isEditMode ? 'Request Updated!' : 'Request Submitted!' }}
        </h3>

        <p>{{ successMessage }}</p>

<button
  class="btn btn-success mt-3"
  @click="router.push('/MyQuotations')"
>
  View My Quotations →
</button>
      </div>
    </div>

    <!-- FORM -->
    <div v-else-if="contractor">

      <!-- CONTRACTOR INFORMATION -->
      <div class="card border-0 shadow-sm rounded-4 mb-4">
        <div class="card-body p-4">
          <span class="badge bg-success-subtle text-success-emphasis mb-2">
            Selected Contractor
          </span>

          <h4 class="fw-bold mb-2">
            {{ contractor.companyName }}
          </h4>

          <p class="text-muted mb-2">
            Location: {{ contractor.location }}
          </p>

          <p class="mb-0">
            {{ contractor.description }}
          </p>
        </div>
      </div>

      <form @submit.prevent="submitRequest">

        <!-- SECTION 1: PROPERTY INFORMATION -->
        <div class="card border-0 shadow-sm rounded-4 mb-4">
          <div class="card-body p-4">
            <h4 class="fw-bold mb-3">
              1. Property Information
            </h4>

            <p class="text-muted">
              Select an existing household from your Energy Planner
              or enter your property information manually.
            </p>

            <!-- PROPERTY MODE -->
            <div class="d-flex flex-wrap gap-4 mb-4">
              <label class="form-check">
                <input
                  type="radio"
                  class="form-check-input"
                  value="saved"
                  v-model="propertyMode"
                  @change="changePropertyMode"
                />
                <span class="form-check-label">
                  Use Saved Household
                </span>
              </label>

              <label class="form-check">
                <input
                  type="radio"
                  class="form-check-input"
                  value="manual"
                  v-model="propertyMode"
                  @change="changePropertyMode"
                />
                <span class="form-check-label">
                  Enter Manually
                </span>
              </label>
            </div>

            <!-- SAVED HOUSEHOLD -->
            <div v-if="propertyMode === 'saved'" class="mb-4">
              <label class="form-label fw-semibold">
                Select Household
              </label>

              <select
                class="form-select"
                v-model="selectedHouseholdId"
                @change="selectHousehold"
                required
              >
                <option value="">Select a household</option>

                <option
                  v-for="household in households"
                  :key="household.id"
                  :value="String(household.id)"
                >
                  {{ household.name }}
                </option>
              </select>

              <p
                v-if="households.length === 0"
                class="small text-muted mt-2"
              >
                No saved households found.
                Please enter your property details manually.
              </p>
            </div>

            <!-- PROPERTY FIELDS -->
            <div class="row g-3">

              <div class="col-md-6">
                <label class="form-label fw-semibold">
                  Household Name
                </label>

                <input
                  type="text"
                  class="form-control"
                  v-model="form.householdName"
                  :readonly="propertyMode === 'saved'"
                  placeholder="e.g. My HDB Flat"
                  required
                />
              </div>

              <div class="col-md-6">
                <label class="form-label fw-semibold">
                  HDB Flat Type
                </label>

                <select
                  class="form-select"
                  v-model="form.flatType"
                  :disabled="propertyMode === 'saved'"
                  required
                >
                  <option value="">Select flat type</option>
                  <option value="2-room HDB">2-room HDB</option>
                  <option value="3-room HDB">3-room HDB</option>
                  <option value="4-room HDB">4-room HDB</option>
                  <option value="5-room HDB">5-room HDB</option>
                  <option value="Executive HDB">Executive HDB</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label fw-semibold">
                  Number of Occupants
                </label>

                <input
                  type="number"
                  class="form-control"
                  min="1"
                  v-model.number="form.occupants"
                  :readonly="propertyMode === 'saved'"
                  required
                />
              </div>

              <div class="col-md-6">
                <label class="form-label fw-semibold">
                  Number of Bedrooms
                </label>

                <input
                  type="number"
                  class="form-control"
                  min="0"
                  v-model.number="form.bedrooms"
                  :readonly="propertyMode === 'saved'"
                  required
                />
              </div>

            </div>
          </div>
        </div>

        <!-- SECTION 2: RENOVATION REQUIREMENTS -->
        <div class="card border-0 shadow-sm rounded-4 mb-4">
          <div class="card-body p-4">
            <h4 class="fw-bold mb-3">
              2. Renovation Requirements
            </h4>

            <!-- SERVICES -->
            <div class="mb-4">
              <label class="form-label fw-semibold">
                Services Required
              </label>

              <p class="small text-muted">
                Select the renovation services you would like
                this contractor to provide.
              </p>

              <div class="row g-3">
                <div
                  v-for="service in contractorServices"
                  :key="service"
                  class="col-md-6"
                >
                  <label
                    class="d-flex align-items-center gap-3 border rounded-3 p-3 service-option"
                  >
                    <input
                      type="checkbox"
                      class="form-check-input mt-0"
                      :value="service"
                      v-model="form.services"
                    />

                    <span>{{ service }}</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- DESCRIPTION -->
            <div class="mb-4">
              <label class="form-label fw-semibold">
                Renovation Description
              </label>

              <textarea
                class="form-control"
                rows="4"
                v-model="form.description"
                placeholder="Describe what you want renovated, including the rooms involved and any specific requirements."
                required
              ></textarea>
            </div>

            <!-- BUDGET -->
            <div class="mb-4">
              <label class="form-label fw-semibold">
                Estimated Budget (S$)
              </label>

              <div class="input-group">
                <span class="input-group-text">S$</span>

                <input
                  type="number"
                  class="form-control"
                  min="1"
                  step="0.01"
                  v-model.number="form.budget"
                  placeholder="e.g. 5000"
                  required
                />
              </div>
            </div>

            <!-- PREFERRED START DATE -->
            <div class="mb-3">
              <label class="form-label fw-semibold">
                Preferred Start Date (Optional)
              </label>

              <input
                type="date"
                class="form-control"
                v-model="form.preferredStartDate"
                :min="today"
              />
            </div>
          </div>
        </div>

        <!-- SECTION 3: SUBMIT -->
        <div class="card border-0 shadow-sm rounded-4">
          <div class="card-body p-4">

            <h4 class="fw-bold mb-3">
              3. {{ isEditMode ? 'Save Changes' : 'Submit Request' }}
            </h4>

            <div class="bg-light rounded-3 p-3 mb-4">
              <p class="small text-muted mb-1">
                Your request will be sent to:
              </p>

              <p class="fw-bold mb-0">
                {{ contractor.companyName }}
              </p>
            </div>

            <div v-if="errorMessage" class="alert alert-danger">
              {{ errorMessage }}
            </div>

            <div class="d-flex flex-wrap gap-3">
              <button
                type="submit"
                class="btn btn-success px-4 py-2 fw-semibold"
                :disabled="submitting"
              >
                {{
                  submitting
                    ? 'Saving...'
                    : isEditMode
                      ? 'Save Changes →'
                      : 'Submit Quotation Request →'
                }}
              </button>

              <button
                type="button"
                class="btn btn-outline-secondary px-4 py-2"
                @click="router.back()"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>

      </form>
    </div>

    <!-- ERROR LOADING DATA -->
    <div v-else class="alert alert-danger">
      {{ errorMessage || 'Contractor not found.' }}
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
</style>