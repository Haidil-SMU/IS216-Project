<script setup>
// Keep optional project notes separate from a generated scope summary.
const scopeSummaryPrefix = '[Selected scope summary]\n'

function serviceInstructions(service) {
  const labels = {
    'Painting & Redecoration': ['Painting instructions', 'e.g. Paint the living room walls only; keep the ceiling unchanged.'],
    'Electrical Works': ['Electrical work instructions', 'e.g. Add two power sockets beside the study desk.'],
    'Plumbing & Sanitary Works': ['Plumbing instructions', 'e.g. Replace the leaking kitchen tap; keep the existing sink.'],
    'Waterproofing': ['Waterproofing instructions', 'e.g. Waterproof the common bathroom floor.'],
    'Air-conditioning': ['Air-conditioning instructions', 'e.g. Service the existing bedroom units; no replacement needed.'],
    'Doors': ['Door work instructions', 'e.g. Replace the bedroom door and retain the existing frame.'],
    'Windows': ['Window work instructions', 'e.g. Replace the kitchen window and check the existing frame.'],
    'Tiles & Marble Flooring': ['Flooring instructions', 'e.g. Replace the kitchen floor tiles.'],
    'Timber & Vinyl Flooring': ['Flooring instructions', 'e.g. Install vinyl flooring in the bedrooms.']
  }
  return labels[service] || ['Instructions for this work', 'Describe the work needed, including anything to keep unchanged.']
}

function requestDescription() {
  if (form.value.description.trim()) return form.value.description.trim()
  const items = selectedItems.value.map(item => {
    const instructions = String(selectedItemWork.value[item.id] || '').trim()
    return `${item.room} — ${item.displayName || formatLayoutItem(item.item)} × ${item.quantity}${instructions ? ': ' + instructions : ''}`
  })
  const work = workDetails.value.map(entry => {
    const area = entry.scope === 'whole' ? 'Whole flat' : entry.scope === 'rooms' ? entry.rooms.join(', ') : 'Contractor to assess'
    const quantity = entry.quantity != null && entry.quantity !== '' ? `; ${entry.quantity} ${entry.unit || 'units'}` : ''
    return `${entry.service} — ${area}${quantity}${String(entry.notes || '').trim() ? ': ' + entry.notes.trim() : ''}`
  })
  return scopeSummaryPrefix + [...items, ...work].join('\n')
}


import { ref, computed, watch, onMounted } from 'vue'
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
const blockedMessage = ref('')

const errorMessage = ref('')
const successMessage = ref('')
const contact = ref({ name: '', phone: '', email: '' })
const workDetails = ref([])
const layoutRooms = ref([])
const roomLoading = ref(false)
const roomNotice = ref('')
let layoutLoadVersion = 0

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

const layoutPreview = ref([])
const selectedItemIds = ref([])
const selectedItemWork = ref({})
let selectionLayoutKey = ''
const selectedItems = computed(() => layoutPreview.value.flatMap(room => room.items || []).filter(item => item.eligible && selectedItemIds.value.includes(item.id)))
const eligibleRooms = computed(() => layoutPreview.value.map(room => ({ ...room, items: (room.items || []).filter(item => item.eligible) })).filter(room => room.items.length))
const referenceRooms = computed(() => layoutPreview.value.map(room => ({ ...room, items: (room.items || []).filter(item => !item.eligible) })).filter(room => room.items.length))
function formatLayoutItem(value) {
  return String(value || 'Unnamed item').replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}
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
    return 'No saved household was found. Complete your household setup in My Profile.'
  }

  if (households.value.length > 1) {
    return 'Your account still has multiple saved households. Review them in My Profile.'
  }

  if (!canUseSavedHousehold.value) {
    return 'Your saved household could not be identified. Review it in My Profile.'
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

// Room choices follow the selected household layout. No design changes are made here.
async function loadRoomChoices() {
  const version = ++layoutLoadVersion
  const layoutKey = `${selectedHouseholdId.value}:${selectedPlanId.value}`
  if (selectionLayoutKey && selectionLayoutKey !== layoutKey) { selectedItemIds.value = []; selectedItemWork.value = {} }
  selectionLayoutKey = layoutKey
  layoutRooms.value = []
  roomNotice.value = ''
  roomLoading.value = false
  layoutPreview.value = []
  if (!selectedHouseholdId.value) return
  roomLoading.value = true
  try {
    const { data } = await axios.get('/api/quotation-layout', {
      params: { contractorId, householdId: selectedHouseholdId.value, planId: selectedPlanId.value || undefined }
    })
    if (version !== layoutLoadVersion) return
    layoutPreview.value = Array.isArray(data.rooms) ? data.rooms : []
    const eligibleIds = layoutPreview.value.flatMap(room => room.items || []).filter(item => item.eligible).map(item => item.id)
    const removed = selectedItemIds.value.some(id => !eligibleIds.includes(id))
    selectedItemIds.value = selectedItemIds.value.filter(id => eligibleIds.includes(id))
    if (removed) errorMessage.value = 'Some previously selected items changed or are no longer offered. Review your selection before saving.'
    layoutRooms.value = [...new Set((data.rooms || []).map(room => String(room.name || room.type || '').trim()).filter(Boolean))]
  } catch {
    if (version === layoutLoadVersion) roomNotice.value = 'The selected layout could not be loaded. Retry before checking its items; you can still describe work areas below.'
  } finally {
    if (version === layoutLoadVersion) roomLoading.value = false
  }
}

watch([selectedHouseholdId, selectedPlanId], loadRoomChoices)
watch(() => form.value.services, selected => {
  workDetails.value = selected.map(service => workDetails.value.find(work => work.service === service) || {
    service, scope: 'assess', rooms: [], quantity: null, unit: 'points', notes: ''
  })
}, { deep: true })

// ============================================================
// LOAD DATA
// ============================================================

async function getData() {
  loading.value = true
  errorMessage.value = ''
  blockedMessage.value = ''

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

    if (!canUseSavedHousehold.value) throw new Error(householdNotice.value || 'Set up your household in My Profile first.')

    try {
      const { data } = await axios.get('/api/auth/me')
      contact.value = { name: String(data.user?.name || ''), phone: '', email: String(data.user?.email || '') }
    } catch { /* Contact details can be entered directly if account prefill is unavailable. */ }

    if (isEditMode) {
      await loadExistingRequest()
    } else {
      await checkActiveRequest()
      form.value.services = services
        .filter(service =>
          selectedServiceCodes.includes(service.code) &&
          contractorServices.value.includes(service.name)
        )
        .map(service => service.name)

      populateSavedHousehold()
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

  if (existingRequest.contact) {
    contact.value = { name: String(existingRequest.contact.name || ''), phone: String(existingRequest.contact.phone || ''), email: String(existingRequest.contact.email || '') }
  }

  workDetails.value = Array.isArray(existingRequest.workDetails) ? existingRequest.workDetails.map(work => ({ ...work, rooms: [...(work.rooms || [])] })) : []

  selectedItemIds.value = (existingRequest.selectedLayoutItems || []).map(item => item.id)
  selectedItemWork.value = Object.fromEntries((existingRequest.selectedLayoutItems || []).map(item => [item.id, item.workDescription || '']))

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
    description: String(existingRequest.description || '').startsWith(scopeSummaryPrefix) ? '' : (existingRequest.description || ''),
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
    selectedHouseholdId.value = originalHouseholdId.value
    // A plan that has since been deleted can't be attached any more.
    selectedPlanId.value = plans.value.some(plan => plan.id === originalPlanId)
      ? originalPlanId
      : ''

    // Preserve the quotation snapshot instead of replacing it
    // with the household's current profile values.
  } else {
    populateSavedHousehold()
    selectedPlanId.value = ''
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

// ============================================================
// SUBMIT OR UPDATE
// ============================================================

async function checkActiveRequest() {
  const { data } = await axios.get(QUOTATION_API)
  const requests = Array.isArray(data) ? data : data.requests || []
  const active = requests.find(request =>
    getId(request.contractorId) === contractorId &&
    ['pending', 'quoted', 'accepted'].includes(request.status)
  )
  blockedMessage.value = active
    ? 'You already have an active request with this contractor. Review it in My Quotations.'
    : ''
  return Boolean(active)
}

async function submitRequest() {
  if (submitting.value || successMessage.value || blockedMessage.value) return

  errorMessage.value = ''
  successMessage.value = ''

  if (
    (
      !canUseSavedHousehold.value ||
      !selectedHouseholdId.value ||
      selectedHouseholdId.value !== getId(savedHousehold.value?.id)
    )
  ) {
    errorMessage.value =
      'Your saved household is unavailable. Please update it in My Profile.'
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

  if (
    form.value.budget === null ||
    form.value.budget === '' ||
    !Number.isFinite(Number(form.value.budget)) ||
    Number(form.value.budget) <= 0
  ) {
    errorMessage.value = 'Please enter a valid budget.'
    return
  }

  for (const work of workDetails.value) {
    if (work.scope === 'rooms' && !work.rooms.length) {
      errorMessage.value = `Choose rooms for ${work.service}, or select contractor to assess.`
      return
    }
    if (work.quantity != null && work.quantity !== '' && (!Number.isFinite(Number(work.quantity)) || Number(work.quantity) <= 0)) {
      errorMessage.value = `Enter a positive quantity for ${work.service}, or leave it blank.`
      return
    }
  }

  if (roomLoading.value || roomNotice.value) {
    errorMessage.value = 'Load the layout successfully before submitting.'
    return
  }
  if (!selectedItems.value.length && !form.value.services.length) {
    errorMessage.value = 'Select at least one layout item or additional renovation requirement.'
    return
  }
  const contactPhone = contact.value.phone.replace(/[\s()-]/g, '')
  if (contact.value.name.trim().length < 2 || contact.value.name.trim().length > 100) {
    errorMessage.value = 'Enter a contact name between 2 and 100 characters.'
    return
  }
  if (!/^\+?[1-9]\d{7,14}$/.test(contactPhone)) {
    errorMessage.value = 'Enter a valid contact number (8 to 15 digits, with optional + country code).'
    return
  }
  const contactEmail = contact.value.email.trim()
  if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
    errorMessage.value = 'Enter a valid email address or leave it blank.'
    return
  }
  for (const item of selectedItems.value) {
    if (item.requiresExplicitWorkRequest && String(selectedItemWork.value[item.id] || '').trim().length < 5) {
      errorMessage.value = `Describe the specific work for ${item.displayName || formatLayoutItem(item.item)}. Selecting an appliance does not request its purchase.`
      return
    }
  }
  const requestData = {
    selectedItemWork: Object.fromEntries(selectedItems.value.map(item => [item.id, String(selectedItemWork.value[item.id] || '').trim()])),
    contact: { name: contact.value.name.trim(), phone: contactPhone, email: contactEmail },
    selectedItemIds: [...selectedItemIds.value],
    workDetails: workDetails.value.map(work => ({
      service: work.service, scope: work.scope,
      rooms: work.scope === 'rooms' ? [...work.rooms] : [],
      quantity: work.quantity === '' || work.quantity == null ? null : Number(work.quantity),
      unit: work.unit || 'points', notes: String(work.notes || '').trim()
    })),
    contractorId,

    householdId: selectedHouseholdId.value,

    planId: selectedPlanId.value || null,

    household: {
      name: form.value.householdName.trim(),
      flatType: form.value.flatType,
      occupants: Number(form.value.occupants),
      bedrooms: Number(form.value.bedrooms)
    },

    services: [...form.value.services],
    description: requestDescription(),
    budget: Number(form.value.budget),
    preferredStartDate: form.value.preferredStartDate || null
  }

  submitting.value = true

  try {
    if (!isEditMode && await checkActiveRequest()) return

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

    if (error.response?.status === 409) {
      blockedMessage.value = errorMessage.value
    }
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

    <div v-else-if="blockedMessage" class="alert alert-info" role="status">
      <p>{{ blockedMessage }}</p>
      <RouterLink to="/MyQuotations" class="btn btn-success">View My Quotations →</RouterLink>
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
              Your property details come from My Profile. Choose a layout below and review the items it contains.
            </p>

            <div
              v-if="householdNotice"
              class="alert alert-warning"
              role="status"
            >
              {{ householdNotice }}
            </div>

            <!-- SAVED HOUSEHOLD INFORMATION -->
            <div
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
                    ? 'These are the saved property details attached to this request.'
                    : 'Your saved household details have been filled in automatically. Update property details in My Profile.'
                }}
              </p>

              <div v-if="canUseSavedHousehold" class="mt-3">
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

            <section class="layout-inventory mb-4" aria-labelledby="layout-items-title" aria-live="polite">
              <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                <h5 id="layout-items-title" class="fw-bold mb-0">Items to quote for</h5>
                <span class="small text-muted">{{ selectedPlanId ? planChoices.find(plan => plan.id === selectedPlanId)?.name || 'Saved plan' : 'Current home layout' }}</span>
              </div>
              <p class="small text-muted">Select the items you want installed, replaced or worked on. Nothing is selected automatically. Quantities come from your layout; clarify partial quantities in your description.</p>
              <p v-if="roomLoading" class="small text-muted" role="status">Loading items…</p>
              <div v-else-if="roomNotice" class="alert alert-warning">{{ roomNotice }} <button type="button" class="btn btn-sm btn-outline-secondary" @click="loadRoomChoices">Retry</button></div>
              <template v-else>
                <div class="row g-3">
                  <div v-for="(room, index) in eligibleRooms" :key="index" class="col-md-6">
                    <div class="border rounded-3 bg-white p-3 h-100">
                      <h6 class="fw-bold">{{ room.name }}</h6>
                      <div v-for="item in room.items" :key="item.id" class="mapped-item-row">
                        <label class="d-flex align-items-start gap-2 py-2">
                          <input v-model="selectedItemIds" type="checkbox" class="form-check-input mt-1" :value="item.id" />
                          <span class="small flex-grow-1"><strong>{{ item.displayName || formatLayoutItem(item.item) }}</strong><span class="d-block text-muted mt-1">{{ item.matchingServices?.join(' · ') }}</span></span>
                          <span class="badge bg-success-subtle text-success-emphasis">× {{ item.quantity }}</span>
                        </label>
                        <div v-if="selectedItemIds.includes(item.id)" class="mapped-item-work">
                          <p class="small text-muted mb-2">{{ item.scope }}</p>
                          <label :for="'item-work-' + item.id" class="form-label small fw-semibold">Work requested <span class="text-muted">{{ item.requiresExplicitWorkRequest ? '(required)' : '(optional)' }}</span></label>
                          <textarea :id="'item-work-' + item.id" v-model="selectedItemWork[item.id]" class="form-control form-control-sm" rows="2" maxlength="600" :required="item.requiresExplicitWorkRequest" placeholder="Describe what this contractor should do, e.g. add a power point or install a water connection"></textarea>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <p v-if="!eligibleRooms.length" class="small text-muted">No recognised layout items match this contractor’s services. You can request additional work below.</p>
                <p class="small text-success mt-3 mb-0">{{ selectedItems.length }} item group(s) selected</p>
                <details v-if="referenceRooms.length" class="mt-3 border-top pt-3">
                  <summary class="small text-muted">Other layout items — for reference only</summary>
                  <div v-for="(room, index) in referenceRooms" :key="index" class="small text-muted mt-3">
                    <strong>{{ room.name }}</strong>
                    <p v-for="item in room.items" :key="item.id" class="mb-1">{{ item.displayName || formatLayoutItem(item.item) }} × {{ item.quantity }} — {{ item.serviceCategories?.length ? 'Outside this contractor’s services' : 'No service mapping configured' }}</p>
                  </div>
                </details>
              </template>
            </section>

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
                  readonly
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
                  disabled
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
                  readonly
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
                  readonly
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <section class="card border-0 shadow-sm rounded-4 mb-4" aria-labelledby="quotation-contact-title">
          <div class="card-body p-4">
            <h4 id="quotation-contact-title" class="fw-bold mb-2">Contact details</h4>
            <p class="small text-muted mb-4">Confirm who the contractor should contact about this request. These details are shared with the contractor you chose. Changing them here does not change your account profile.</p>
            <div class="row g-3">
              <div class="col-md-6"><label for="quotation-contact-name" class="form-label fw-semibold">Contact name</label><input id="quotation-contact-name" v-model="contact.name" class="form-control" type="text" autocomplete="name" minlength="2" maxlength="100" required placeholder="Your full name" /></div>
              <div class="col-md-6"><label for="quotation-contact-phone" class="form-label fw-semibold">Contact number</label><input id="quotation-contact-phone" v-model="contact.phone" class="form-control" type="tel" autocomplete="tel" maxlength="30" required placeholder="e.g. +65 9123 4567" /><p class="small text-muted mt-1 mb-0">Include the country code for overseas numbers.</p></div>
              <div class="col-12"><label for="quotation-contact-email" class="form-label fw-semibold">Email <span class="text-muted fw-normal">(optional)</span></label><input id="quotation-contact-email" v-model="contact.email" class="form-control" type="email" autocomplete="email" maxlength="254" /></div>
            </div>
          </div>
        </section>

        <!-- SECTION 2: RENOVATION REQUIREMENTS -->
        <div class="card border-0 shadow-sm rounded-4 mb-4">
          <div class="card-body p-4">
            <h4 class="fw-bold mb-3">
              2. Additional Renovation Requirements
            </h4>

            <!-- SERVICES -->
            <div class="mb-4">
              <label class="form-label fw-semibold">
                Additional work (optional)
              </label>

              <p class="small text-muted">
                Select extra work such as painting or waterproofing. This is optional when you have selected items above. Only your selected items and additional work will be requested.
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

            <div class="mb-4">
              <h5 v-if="workDetails.length" class="fw-bold">Additional work details and areas</h5>
              <p class="small text-muted">Describe the extra work and affected rooms. For work that overlaps a layout item, explain the change needed; it should be quoted once. Leave quantities blank if unsure.</p>
              <p v-if="roomLoading" class="small text-muted" role="status">Loading rooms…</p>
              <p v-if="roomNotice" class="small text-warning-emphasis">{{ roomNotice }}</p>
              <div v-for="(work, index) in workDetails" :key="work.service" class="border rounded-4 p-3 mb-3 bg-light">
                <h6 class="fw-bold">{{ work.service }}</h6>
                <label :for="`scope-${index}`" class="form-label small">Work area</label>
                <select :id="`scope-${index}`" v-model="work.scope" class="form-select mb-3">
                  <option value="assess">Not sure — contractor to assess</option>
                  <option value="whole">Whole flat</option>
                  <option value="rooms">Selected rooms / areas</option>
                </select>
                <div v-if="work.scope === 'rooms'" class="mb-3">
                  <div v-if="layoutRooms.length" class="d-flex flex-wrap gap-3">
                    <label v-for="room in layoutRooms" :key="room" class="d-flex gap-2 align-items-center">
                      <input v-model="work.rooms" type="checkbox" class="form-check-input mt-0" :value="room" />{{ room }}
                    </label>
                  </div>
                  <input v-else :value="work.rooms.join(', ')" @input="work.rooms = $event.target.value.split(',').map(value => value.trim()).filter(Boolean)" class="form-control" :aria-label="`Areas for ${work.service}`" placeholder="e.g. Kitchen, Bathroom" />
                </div>
                <div class="row g-2 mb-3">
                  <div class="col-6"><label :for="`quantity-${index}`" class="form-label small">Quantity ({{ work.unit || 'units' }}) <span class="text-muted">— optional</span></label><input :id="`quantity-${index}`" v-model.number="work.quantity" type="number" min="0.01" step="any" class="form-control" placeholder="Optional" /></div>
                  <div class="col-6"><label :for="`unit-${index}`" class="form-label small">Quantity unit</label><select :id="`unit-${index}`" v-model="work.unit" class="form-select"><option value="points">Points (e.g. sockets)</option><option value="units">Units (individual items)</option><option value="m²">m² (area)</option><option value="m">Metres (length)</option></select></div>
                </div>
                <p class="small text-muted mb-3">Enter the amount in the selected unit, for example 2 units, 3 points, 20 m² or 4 metres. Leave it blank if unsure. For a whole job or package, describe the work below and let the contractor confirm its pricing basis.</p>
                <label :for="`work-notes-${index}`" class="form-label small">{{ serviceInstructions(work.service)[0] }}</label>
                <textarea :id="`work-notes-${index}`" v-model="work.notes" class="form-control" maxlength="600" rows="2" :placeholder="serviceInstructions(work.service)[1]"></textarea>
              </div>
            </div>

          </div>
        </div>

        <!-- SECTION 3: PROJECT PREFERENCES -->
        <section class="card border-0 shadow-sm rounded-4 mb-4" aria-labelledby="project-preferences-heading">
          <div class="card-body p-4">
            <h4 id="project-preferences-heading" class="fw-bold mb-2">3. Project Preferences</h4>
            <p class="small text-muted mb-4">Set your budget and preferred timing. Work instructions belong with the selected items or services above.</p>

            <!-- BUDGET -->
            <div class="mb-4">
              <label
                for="budget"
                class="form-label fw-semibold"
              >
                Your renovation budget (S$)
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
            <details class="project-notes border rounded-3 mt-4" :open="Boolean(form.description.trim())">
              <summary class="fw-semibold p-3">Anything else the contractor should know? <span class="small text-muted fw-normal">(optional)</span></summary>
              <div class="px-3 pb-3">
                <label for="description" class="form-label small text-muted">Share overall preferences or constraints. No need to repeat the work listed above.</label>
                <textarea id="description" class="form-control" rows="3" v-model="form.description" placeholder="e.g. Prefer a minimalist style. Please arrange noisy work on weekdays only."></textarea>
              </div>
            </details>
          </div>
        </section>

        <!-- SECTION 4: SUBMIT -->
        <div class="card border-0 shadow-sm rounded-4">
          <div class="card-body p-4">
            <h4 class="fw-bold mb-3">
              4. {{ isEditMode ? 'Save Changes' : 'Submit Request' }}
            </h4>

            <div class="border rounded-3 p-3 mb-4">
              <h5 class="fw-bold">Your selected scope</h5><p class="small text-muted">Contact: {{ contact.name || 'Not provided' }} · {{ contact.phone || 'Number not provided' }}</p>
              <p v-if="!selectedItems.length && !form.services.length" class="small text-muted">Select an item or additional work before submitting.</p>
              <ul v-if="selectedItems.length" class="small mb-2"><li v-for="item in selectedItems" :key="item.id">{{ item.room }} — {{ item.displayName || formatLayoutItem(item.item) }} × {{ item.quantity }}</li></ul>
              <p v-for="work in workDetails" :key="work.service" class="small mb-1"><strong>{{ work.service }}</strong> — {{ work.scope === 'whole' ? 'Whole flat' : work.scope === 'rooms' ? work.rooms.join(', ') : 'Contractor to assess' }}</p>
              <p class="small text-muted mt-2 mb-0">Unselected layout items are for reference and will not be included automatically.</p>
            </div>

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
                :disabled="submitting || roomLoading || Boolean(roomNotice)"
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
.layout-inventory { padding:20px; border:1px solid #dcebe2; border-radius:16px; background:#f4faf6; }
.service-option {
  cursor: pointer;
  transition: all 0.2s ease;
}

.service-option:hover {
  border-color: #198754 !important;
  background-color: #f0faf4;
}

.mapped-item-row + .mapped-item-row { border-top:1px solid #edf1ee; margin-top:6px; padding-top:6px; }
.mapped-item-work { margin:0 0 12px 22px; padding:12px; border-radius:10px; background:#f5f9f6; }
</style>