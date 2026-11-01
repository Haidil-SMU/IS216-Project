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
const plans = ref([])
const flatTypes = ref([])

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

const fallbackFlatTypes = [
  { id: '2-room', name: '2-room HDB' },
  { id: '3-room', name: '3-room HDB' },
  { id: '4-room', name: '4-room HDB' },
  { id: '5-room', name: '5-room HDB' },
  { id: 'executive', name: 'Executive HDB' }
]

const propertyMode = ref('saved')
const selectedHouseholdId = ref('')

// Optional: the saved energy plan whose 3D layout the contractor should see (empty = current home layout).
const selectedPlanId = ref('')
const planChoices = computed(() => {
  return plans.value.filter(
    plan => plan.householdId === selectedHouseholdId.value && Array.isArray(plan.layout) && plan.layout.length
  )
})

// Keep the original quotation's property details when editing.
const originalHouseholdId = ref('')
const originalHouseholdSnapshot = ref(null)

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

function getId(value) {
  return value == null ? '' : String(value?.$oid || value)
}

const savedHousehold = computed(() => {
  // Do not silently choose a household for historical accounts
  // that still contain multiple households.
  return households.value.length === 1
    ? households.value[0]
    : null
})

const canUseSavedHousehold = computed(() => {
  return Boolean(
    savedHousehold.value && getId(savedHousehold.value.id)
  )
})

const householdNotice = computed(() => {
  if (households.value.length === 0) {
    return 'No saved household was found. Complete your household setup in My Profile. You can also enter property details manually here.'
  }

  if (households.value.length > 1) {
    return 'Your account still has multiple saved households. Review them in My Profile. Enter property details manually for this request.'
  }

  if (!canUseSavedHousehold.value) {
    return 'Your saved household could not be identified. Review it in My Profile or enter property details manually.'
  }

  return ''
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

const flatTypeOptions = computed(() => {
  const catalogue = flatTypes.value
    .filter(item => item && item.id != null)
    .map(item => ({
      id: String(item.id),
      name: String(item.name || item.id)
    }))

  const options = catalogue.length
    ? [...catalogue]
    : [...fallbackFlatTypes]

  // Keep older quotation values visible even if they no longer
  // appear in the current catalogue.
  const currentValue = String(form.value.flatType || '')

  if (
    currentValue &&
    !options.some(option => option.id === currentValue)
  ) {
    options.push({
      id: currentValue,
      name: currentValue
    })
  }

  return options
})

function normalizeFlatType(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''

  const catalogue = flatTypes.value.length
    ? flatTypes.value
    : fallbackFlatTypes

  const normalizedValue = rawValue.toLowerCase()

  const match = catalogue.find(item => {
    return (
      String(item.id || '').toLowerCase() === normalizedValue ||
      String(item.name || '').toLowerCase() === normalizedValue
    )
  })

  return match ? String(match.id) : rawValue
}

// Use the user's local calendar date.
const currentDate = new Date()
const today = [
  currentDate.getFullYear(),
  String(currentDate.getMonth() + 1).padStart(2, '0'),
  String(currentDate.getDate()).padStart(2, '0')
].join('-')

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
      item => getId(item._id) === contractorId
    )

    if (!contractor.value) {
      throw new Error('Contractor not found.')
    }

    households.value = Array.isArray(plannerResponse.data.users)
      ? plannerResponse.data.users
      : []

    plans.value = Array.isArray(plannerResponse.data.plans)
      ? plannerResponse.data.plans
      : []

    flatTypes.value = Array.isArray(plannerResponse.data.flatTypes)
      ? plannerResponse.data.flatTypes
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

      if (canUseSavedHousehold.value) {
        propertyMode.value = 'saved'
        populateSavedHousehold()
      } else {
        propertyMode.value = 'manual'
        selectedHouseholdId.value = ''
      }
    }
  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      error.message ||
      'Unable to load quotation information.'

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
    request => getId(request._id) === requestId
  )

  if (!existingRequest) {
    throw new Error('Quotation request not found.')
  }

  if (getId(existingRequest.contractorId) !== contractorId) {
    throw new Error('Quotation request does not belong to this contractor.')
  }

  if (existingRequest.status !== 'pending') {
    throw new Error('Only pending quotation requests can be updated.')
  }

  originalHouseholdId.value = getId(existingRequest.householdId)
  const originalPlanId = getId(existingRequest.planId)

  originalHouseholdSnapshot.value = {
    householdName: existingRequest.household?.name || '',
    flatType: normalizeFlatType(existingRequest.household?.flatType),
    occupants: existingRequest.household?.occupants ?? 1,
    bedrooms: existingRequest.household?.bedrooms ?? 1
  }

  form.value = {
    ...originalHouseholdSnapshot.value,
    services: [...(existingRequest.services || [])],
    description: existingRequest.description || '',
    budget: existingRequest.budget ?? null,
    preferredStartDate: existingRequest.preferredStartDate
      ? String(existingRequest.preferredStartDate).slice(0, 10)
      : ''
  }

  const matchesSavedHousehold =
    canUseSavedHousehold.value &&
    originalHouseholdId.value &&
    getId(savedHousehold.value.id) === originalHouseholdId.value

  if (matchesSavedHousehold) {
    propertyMode.value = 'saved'
    selectedHouseholdId.value = originalHouseholdId.value
    // A plan that has since been deleted can't be attached any more.
    selectedPlanId.value = plans.value.some(plan => plan.id === originalPlanId)
      ? originalPlanId
      : ''

    // Preserve the quotation snapshot instead of replacing it
    // with the household's current profile values.
  } else {
    propertyMode.value = 'manual'
    selectedHouseholdId.value = ''
  }
}

// ============================================================
// PROPERTY INFORMATION
// ============================================================

function populateSavedHousehold() {
  if (!canUseSavedHousehold.value) return

  const household = savedHousehold.value
  const householdId = getId(household.id)

  selectedHouseholdId.value = householdId

  if (
    isEditMode &&
    originalHouseholdSnapshot.value &&
    originalHouseholdId.value === householdId
  ) {
    Object.assign(form.value, originalHouseholdSnapshot.value)
    return
  }

  form.value.householdName = household.name || ''
  form.value.flatType = normalizeFlatType(
    household.flatType || household.flatTypeId
  )
  form.value.occupants = household.occupants ?? 1
  form.value.bedrooms = household.bedrooms ?? 1
}

function changePropertyMode() {
  errorMessage.value = ''

  if (propertyMode.value === 'saved') {
    if (!canUseSavedHousehold.value) {
      propertyMode.value = 'manual'
      selectedHouseholdId.value = ''
      return
    }

    populateSavedHousehold()
    return
  }

  // Keep the displayed details available for manual editing.
  selectedHouseholdId.value = ''
  selectedPlanId.value = ''
}

// ============================================================
// SUBMIT OR UPDATE
// ============================================================

async function submitRequest() {
  if (submitting.value) return

  errorMessage.value = ''
  successMessage.value = ''

  if (
    propertyMode.value === 'saved' &&
    (
      !canUseSavedHousehold.value ||
      !selectedHouseholdId.value ||
      selectedHouseholdId.value !== getId(savedHousehold.value?.id)
    )
  ) {
    errorMessage.value =
      'Your saved household is unavailable. Please enter your property details manually.'
    return
  }

  if (!form.value.householdName.trim() || !form.value.flatType) {
    errorMessage.value = 'Please complete your property information.'
    return
  }

  if (
    !Number.isInteger(Number(form.value.occupants)) ||
    Number(form.value.occupants) < 1 ||
    form.value.bedrooms === '' ||
    form.value.bedrooms === null ||
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

    planId: propertyMode.value === 'saved' && selectedPlanId.value
      ? selectedPlanId.value
      : null,

    household: {
      name: form.value.householdName.trim(),
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
        type="button"
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
      <div
        class="spinner-border text-success"
        role="status"
        aria-label="Loading quotation form"
      ></div>

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
          type="button"
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
              Use your saved household from My Profile or enter
              your property information manually.
            </p>

            <div
              v-if="householdNotice"
              class="alert alert-warning"
              role="status"
            >
              {{ householdNotice }}
            </div>

            <!-- PROPERTY MODE -->
            <div class="d-flex flex-wrap gap-4 mb-4">
              <label class="form-check">
                <input
                  type="radio"
                  name="propertyMode"
                  class="form-check-input"
                  value="saved"
                  v-model="propertyMode"
                  :disabled="!canUseSavedHousehold"
                  @change="changePropertyMode"
                />

                <span class="form-check-label">
                  Use Saved Household
                </span>
              </label>

              <label class="form-check">
                <input
                  type="radio"
                  name="propertyMode"
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

            <!-- SAVED HOUSEHOLD INFORMATION -->
            <div
              v-if="propertyMode === 'saved'"
              class="bg-light rounded-3 p-3 mb-4"
            >
              <p class="fw-semibold mb-1">
                {{
                  isEditMode
                    ? 'Saved Household Details'
                    : 'Saved Household Loaded'
                }}
              </p>

              <p class="small text-muted mb-0">
                {{
                  isEditMode
                    ? 'These are the property details stored with this quotation. Choose Enter Manually to change them.'
                    : 'Your saved household details have been filled in automatically. Choose Enter Manually to use different property details.'
                }}
              </p>

              <div v-if="planChoices.length || selectedPlanId" class="mt-3">
                <label for="layoutPlan" class="form-label fw-semibold small mb-1">
                  3D layout the contractor will see
                </label>

                <select
                  id="layoutPlan"
                  class="form-select form-select-sm"
                  v-model="selectedPlanId"
                >
                  <option value="">My current home layout</option>
                  <option
                    v-for="plan in planChoices"
                    :key="plan.id"
                    :value="plan.id"
                  >
                    Plan: {{ plan.name }}
                  </option>
                </select>
              </div>
            </div>

            <!-- PROPERTY FIELDS -->
            <div class="row g-3">
              <div class="col-md-6">
                <label
                  for="householdName"
                  class="form-label fw-semibold"
                >
                  Household Name
                </label>

                <input
                  id="householdName"
                  type="text"
                  class="form-control"
                  v-model="form.householdName"
                  :readonly="propertyMode === 'saved'"
                  placeholder="e.g. My HDB Flat"
                  required
                />
              </div>

              <div class="col-md-6">
                <label
                  for="flatType"
                  class="form-label fw-semibold"
                >
                  HDB Flat Type
                </label>

                <select
                  id="flatType"
                  class="form-select"
                  v-model="form.flatType"
                  :disabled="propertyMode === 'saved'"
                  required
                >
                  <option value="">Select flat type</option>

                  <option
                    v-for="flatType in flatTypeOptions"
                    :key="flatType.id"
                    :value="flatType.id"
                  >
                    {{ flatType.name }}
                  </option>
                </select>
              </div>

              <div class="col-md-6">
                <label
                  for="occupants"
                  class="form-label fw-semibold"
                >
                  Number of Occupants
                </label>

                <input
                  id="occupants"
                  type="number"
                  class="form-control"
                  min="1"
                  step="1"
                  v-model.number="form.occupants"
                  :readonly="propertyMode === 'saved'"
                  required
                />
              </div>

              <div class="col-md-6">
                <label
                  for="bedrooms"
                  class="form-label fw-semibold"
                >
                  Number of Bedrooms
                </label>

                <input
                  id="bedrooms"
                  type="number"
                  class="form-control"
                  min="0"
                  step="1"
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
              <label
                for="description"
                class="form-label fw-semibold"
              >
                Renovation Description
              </label>

              <textarea
                id="description"
                class="form-control"
                rows="4"
                v-model="form.description"
                placeholder="Describe what you want renovated, including the rooms involved and any specific requirements."
                required
              ></textarea>
            </div>

            <!-- BUDGET -->
            <div class="mb-4">
              <label
                for="budget"
                class="form-label fw-semibold"
              >
                Estimated Budget (S$)
              </label>

              <div class="input-group">
                <span class="input-group-text">S$</span>

                <input
                  id="budget"
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
              <label
                for="preferredStartDate"
                class="form-label fw-semibold"
              >
                Preferred Start Date (Optional)
              </label>

              <input
                id="preferredStartDate"
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

            <div
              v-if="errorMessage"
              class="alert alert-danger"
              role="alert"
            >
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
    <div v-else class="alert alert-danger" role="alert">
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