<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import FloorPlan3D from '@/components/FloorPlan3D.vue'

const API = '/api'
const auth = useAuthStore()

const requests = ref([])

// The logged-in contractor's business profile (set up after Corppass sign-up).
const profile = ref(null)
const needsSetup = ref(false)
const serviceOptions = ref([])
const editingProfile = ref(false)
const savingProfile = ref(false)
const profileError = ref('')
const profileNotice = ref('')
const profileTouched = ref(false)
const uenLookup = ref(null)
const profileForm = ref({
  companyName: '',
  location: '',
  services: [],
  description: '',
  contactNumber: ''
})

const loading = ref(true)
const errorMessage = ref('')
const savingId = ref('')

function getCurrentContractorId() {
  return profile.value ? getId(profile.value) : ''
}

// Same rules as the server (server/contractor.js).
const profileErrors = computed(() => {
  const f = profileForm.value
  const result = {}
  const name = f.companyName.trim()
  if (name.length < 2 || name.length > 100) result.companyName = 'Enter your company name (2 to 100 characters).'
  if (!f.location.trim() || f.location.trim().length > 60) result.location = 'Enter your location or service area.'
  if (!f.services.length) result.services = 'Choose at least one renovation service.'
  const about = f.description.trim()
  if (about.length < 20 || about.length > 500) result.description = 'Describe your company in 20 to 500 characters.'
  if (!/^[689]\d{7}$/.test(f.contactNumber.replace(/\s+/g, ''))) {
    result.contactNumber = 'Enter an 8-digit Singapore number.'
  }
  return result
})

function profileFieldError(field) {
  return profileTouched.value ? profileErrors.value[field] : ''
}

function fillProfileForm(source) {
  profileForm.value = {
    companyName: source?.companyName || '',
    location: source?.location || '',
    services: [...(source?.services || [])],
    description: source?.description || '',
    contactNumber: source?.contactNumber || ''
  }
  profileTouched.value = false
  profileError.value = ''
}

// Corppass gives us the UEN but not the company name: suggest it (and services)
// from BCA's register of contractors. Anything the user typed is left alone.
async function suggestFromRegister() {
  uenLookup.value = { loading: true }
  try {
    const { data } = await axios.get(`${API}/contractor/uen-lookup`)
    uenLookup.value = data
    if (data.found) {
      if (!profileForm.value.companyName) profileForm.value.companyName = data.companyName
      if (!profileForm.value.services.length) profileForm.value.services = [...data.services]
    }
  } catch {
    uenLookup.value = { found: false, unavailable: true }
  }
}

function startEditProfile() {
  fillProfileForm(profile.value)
  profileNotice.value = ''
  editingProfile.value = true
}

// POST on first set-up, PUT when editing.
async function saveProfile() {
  profileTouched.value = true
  profileError.value = ''
  if (Object.keys(profileErrors.value).length) return

  savingProfile.value = true
  try {
    const response = await axios({
      method: needsSetup.value ? 'post' : 'put',
      url: `${API}/contractor/profile`,
      data: profileForm.value
    })
    const firstTime = needsSetup.value
    profile.value = response.data.profile
    // The account name is now the company name; refresh the navbar.
    auth.fetchMe(true)
    needsSetup.value = false
    editingProfile.value = false
    profileNotice.value = firstTime
      ? "You're now listed in Find Contractors. Homeowners can request quotations from you."
      : 'Profile saved.'
    if (firstTime) await loadData()
  } catch (error) {
    profileError.value = error.response?.data?.error || 'Unable to save your profile.'
  } finally {
    savingProfile.value = false
  }
}

function normalizeId(value) {
  if (!value) return ''
  return String(value.$oid || value)
}

function getId(item) {
  return normalizeId(item._id)
}

const myRequests = computed(() =>
  requests.value.filter(request =>
    normalizeId(request.contractorId) === getCurrentContractorId()
  )
)

const pendingCount = computed(() =>
  myRequests.value.filter(request => request.status === 'pending').length
)

const quotedCount = computed(() =>
  myRequests.value.filter(request => request.status === 'quoted').length
)

function formatDate(date) {
  return date
    ? new Date(date).toLocaleDateString('en-SG')
    : 'Not specified'
}

function formatMoney(amount) {
  return `S$${Number(amount || 0).toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

function statusClass(status) {
  return {
    pending: 'bg-warning-subtle text-warning-emphasis',
    quoted: 'bg-success-subtle text-success-emphasis',
    rejected: 'bg-danger-subtle text-danger-emphasis',
    accepted: 'bg-info-subtle text-info-emphasis'
  }[status] || 'bg-secondary-subtle'
}

// ============================================================
// LOAD DATA
// ============================================================

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [profileRes, requestRes] = await Promise.all([
      axios.get(`${API}/contractor/profile`),
      axios.get(`${API}/quotation-requests`)
    ])

    serviceOptions.value = profileRes.data.services || []
    if (profileRes.data.needsSetup) {
      needsSetup.value = true
      profile.value = null
      fillProfileForm(null)
      suggestFromRegister()
    } else {
      needsSetup.value = false
      profile.value = profileRes.data.profile
    }

    const data = Array.isArray(requestRes.data)
      ? requestRes.data
      : requestRes.data.requests || []

    requests.value = data.map(request => ({
      ...request,
      pdfFile: null,
      pdfText: '',
      uploading: false,
      generating: false,
      aiDraft: null,
      showLayout: false,
      plan: null,
      layoutLoading: false,
      layoutError: ''
    }))


  } catch (error) {
    console.error(error)
    errorMessage.value = 'Unable to load quotation requests.'
  } finally {
    loading.value = false
  }
}

// ============================================================
// PDF UPLOAD
// ============================================================

function selectPDF(event, request) {
  const file = event.target.files?.[0]

  request.pdfFile = null
  request.pdfText = ''
  request.aiDraft = null

  if (!file) return

  if (
    file.type !== 'application/pdf' ||
    file.size > 5 * 1024 * 1024
  ) {
    errorMessage.value = 'Please select a PDF smaller than 5 MB.'
    event.target.value = ''
    return
  }

  errorMessage.value = ''
  request.pdfFile = file
}

async function extractPDF(request) {
  if (!request.pdfFile) return

  request.uploading = true
  request.pdfText = ''
  request.aiDraft = null
  errorMessage.value = ''

  try {
    const formData = new FormData()
    formData.append('file', request.pdfFile)

    const response = await axios.post(
      `${API}/extract-pdf`,
      formData
    )

    request.pdfText = response.data.text || ''

    if (!request.pdfText.trim()) {
      errorMessage.value = 'No readable text was found in this PDF.'
    }

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to extract PDF text.'

  } finally {
    request.uploading = false
  }
}

// ============================================================
// GENERATE AI QUOTATION
// ============================================================

async function generateAIQuotation(request) {
  if (!request.pdfText.trim()) {
    errorMessage.value = 'Extract PDF text first.'
    return
  }

  request.generating = true
  request.aiDraft = null
  errorMessage.value = ''

  try {
    const response = await axios.post(
      `${API}/generate-quotation`,
      {
        requestId: getId(request),
        contractorId: getCurrentContractorId(),
        pdfText: request.pdfText
      }
    )

    const draft = response.data.draft

    if (!draft || !Array.isArray(draft.items)) {
      throw new Error('Invalid AI response.')
    }

    request.aiDraft = {
      items: draft.items.map(item => ({
        service: String(item.service || ''),
        description: String(item.description || ''),
        quantity: Number(item.quantity) || 1,
        unitPrice: item.unitPrice == null
          ? null
          : Number(item.unitPrice),
        source: String(item.source || ''),
        needsReview: Boolean(item.needsReview)
      })),
      notes: String(draft.notes || ''),
      warnings: Array.isArray(draft.warnings)
        ? draft.warnings
        : []
    }

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to generate AI quotation.'

  } finally {
    request.generating = false
  }
}

// ============================================================
// QUOTATION CALCULATIONS
// ============================================================

function getItemAmount(item) {
  if (
    item.unitPrice === null ||
    item.unitPrice === '' ||
    !Number.isFinite(Number(item.unitPrice)) ||
    !Number.isFinite(Number(item.quantity))
  ) {
    return null
  }

  return Math.round(
    Number(item.quantity) * Number(item.unitPrice) * 100
  ) / 100
}

function getDraftTotal(request) {
  if (!request.aiDraft) return 0

  return Math.round(
    request.aiDraft.items.reduce(
      (total, item) => total + (getItemAmount(item) || 0),
      0
    ) * 100
  ) / 100
}

function hasMissingPrices(request) {
  if (!request.aiDraft) return true

  return request.aiDraft.items.some(item =>
    item.unitPrice === null ||
    item.unitPrice === '' ||
    !Number.isFinite(Number(item.unitPrice)) ||
    Number(item.unitPrice) < 0 ||
    !Number.isFinite(Number(item.quantity)) ||
    Number(item.quantity) <= 0
  )
}

function addQuotationItem(request) {
  if (!request.aiDraft) return

  request.aiDraft.items.push({
    service: '',
    description: '',
    quantity: 1,
    unitPrice: null,
    source: 'Manually added by contractor',
    needsReview: true
  })
}

function removeQuotationItem(request, index) {
  request.aiDraft.items.splice(index, 1)
}

// ============================================================
// APPROVE AND SEND QUOTATION
// ============================================================

async function submitQuotation(request) {
  if (!request.aiDraft) return

  const items = request.aiDraft.items

  if (!items.length) {
    errorMessage.value = 'Add at least one quotation item.'
    return
  }

  if (hasMissingPrices(request)) {
    errorMessage.value =
      'Please review all items and fill in missing prices.'
    return
  }

  if (items.some(item => !String(item.service || '').trim())) {
    errorMessage.value = 'Every quotation item needs a service name.'
    return
  }

  const total = getDraftTotal(request)

  if (!Number.isFinite(total) || total <= 0) {
    errorMessage.value = 'Quotation total must be greater than zero.'
    return
  }

  const confirmed = confirm(
    `Submit quotation of ${formatMoney(total)}?\n\n` +
    'Please confirm that you have reviewed all prices and services.'
  )

  if (!confirmed) return

  const requestId = getId(request)

  savingId.value = requestId
  errorMessage.value = ''

  try {
    const quotation = {
      total,
      notes: request.aiDraft.notes,
      warnings: request.aiDraft.warnings,
      items: items.map(item => ({
        service: item.service.trim(),
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: getItemAmount(item),
        source: item.source,
        needsReview: item.needsReview
      }))
    }

    await axios.patch(
      `${API}/quotation-requests/${requestId}/respond`,
      {
        contractorId: getCurrentContractorId(),
        status: 'quoted',
        quotation
      }
    )

    request.status = 'quoted'
    request.quotation = quotation
    request.aiDraft = null
    request.pdfFile = null
    request.pdfText = ''

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to submit quotation.'

  } finally {
    savingId.value = ''
  }
}

// ============================================================
// REJECT REQUEST
// ============================================================

async function rejectRequest(request) {
  if (!confirm('Are you sure you want to reject this request?')) {
    return
  }

  const requestId = getId(request)

  savingId.value = requestId
  errorMessage.value = ''

  try {
    await axios.patch(
      `${API}/quotation-requests/${requestId}/respond`,
      {
        contractorId: getCurrentContractorId(),
        status: 'rejected',
        quotation: null
      }
    )

    request.status = 'rejected'
    request.quotation = null
    request.aiDraft = null

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to reject request.'

  } finally {
    savingId.value = ''
  }
}

async function toggleLayout(request) {
  if (request.showLayout) {
    request.showLayout = false
    return
  }
  requests.value.forEach(r => { r.showLayout = false })

  request.layoutError = ''
  if (!request.plan) {
    request.layoutLoading = true
    try {
      const { data } = await axios.get(`${API}/quotation-requests/${getId(request)}/floorplan`)
      request.plan = data
    } catch (error) {
      request.layoutError = error.response?.data?.error || 'Unable to load the 3D layout.'
      return
    } finally {
      request.layoutLoading = false
    }
  }
  request.showLayout = true
}

onMounted(loadData)
</script>

<template>
  <div class="container py-5">

    <!-- HEADER -->
    <div class="mb-4">
      <span class="badge bg-success-subtle text-success-emphasis mb-3">
        HDB EcoHome Services
      </span>

      <h1 class="fw-bold">
        Contractor <span class="text-success">Dashboard</span>
      </h1>

      <p class="text-muted">
        Review renovation requests and prepare AI-assisted quotations.
      </p>
    </div>

    <!-- BUSINESS PROFILE: set up after Corppass sign-up, then shown as a card -->
    <div v-if="profileNotice" class="alert alert-success" role="status">
      {{ profileNotice }}
    </div>

    <div
      v-if="!loading && (needsSetup || editingProfile)"
      class="card border-0 shadow-sm rounded-4 mb-4"
    >
      <div class="card-body p-4 p-md-5">
        <span class="badge bg-warning-subtle text-warning-emphasis mb-2">
          {{ needsSetup ? 'Step 2 of 2' : 'Edit profile' }}
        </span>
        <h2 class="h4 fw-bold mb-1">
          {{ needsSetup ? 'Set up your business profile' : 'Edit your business profile' }}
        </h2>
        <p class="text-muted mb-4">
          This is the card homeowners see in <strong>Find Contractors</strong>. Every field is required.
        </p>

        <div class="row g-4">
          <!-- FORM -->
          <form class="col-lg-7" novalidate @submit.prevent="saveProfile">
            <fieldset :disabled="savingProfile">
              <legend class="visually-hidden">Business profile</legend>

              <div class="mb-3">
                <label class="form-label fw-semibold small mb-1">UEN</label>
                <div class="d-flex align-items-center gap-2">
                  <input class="form-control" :value="auth.user?.uen" readonly />
                  <span class="badge bg-success-subtle text-success-emphasis text-nowrap">
                    ✓ Verified by Corppass
                  </span>
                </div>
                <p v-if="needsSetup && uenLookup" class="small mt-1 mb-0" role="status">
                  <span v-if="uenLookup.loading" class="text-muted">
                    Looking up your UEN in BCA's register of contractors…
                  </span>
                  <span v-else-if="uenLookup.found" class="text-success">
                    ✓ Found in BCA's register of contractors. Company name<template v-if="uenLookup.services?.length">
                    and matching services</template> filled in; you can edit them.
                  </span>
                  <span v-else-if="uenLookup.unavailable" class="text-muted">
                    Couldn't reach BCA's register right now. Please type your company name.
                  </span>
                  <span v-else class="text-muted">
                    This UEN isn't in BCA's register of contractors. Please type your company name.
                  </span>
                </p>
              </div>

              <div class="mb-3">
                <label for="cp-name" class="form-label fw-semibold small mb-1">Company name</label>
                <input
                  id="cp-name"
                  v-model="profileForm.companyName"
                  class="form-control"
                  :class="{ 'is-invalid': profileFieldError('companyName') }"
                  maxlength="100"
                  placeholder="e.g. Sarah Home Solutions"
                />
                <div class="invalid-feedback">{{ profileFieldError('companyName') }}</div>
              </div>

              <div class="mb-3">
                <label for="cp-location" class="form-label fw-semibold small mb-1">Location / service area</label>
                <input
                  id="cp-location"
                  v-model="profileForm.location"
                  class="form-control"
                  :class="{ 'is-invalid': profileFieldError('location') }"
                  maxlength="60"
                  placeholder="e.g. Woodlands"
                />
                <div class="invalid-feedback">{{ profileFieldError('location') }}</div>
              </div>

              <fieldset class="mb-3">
                <legend class="form-label fw-semibold small mb-1">Renovation services</legend>
                <div class="d-flex flex-wrap gap-2">
                  <template v-for="service in serviceOptions" :key="service">
                    <input
                      :id="'cp-service-' + service"
                      v-model="profileForm.services"
                      class="btn-check"
                      type="checkbox"
                      :value="service"
                    />
                    <label class="btn btn-sm btn-outline-success rounded-pill" :for="'cp-service-' + service">
                      {{ service }}
                    </label>
                  </template>
                </div>
                <div v-if="profileFieldError('services')" class="small text-danger mt-1">
                  {{ profileFieldError('services') }}
                </div>
              </fieldset>

              <div class="mb-3">
                <label for="cp-about" class="form-label fw-semibold small mb-1">About your company</label>
                <textarea
                  id="cp-about"
                  v-model="profileForm.description"
                  class="form-control"
                  :class="{ 'is-invalid': profileFieldError('description') }"
                  rows="3"
                  maxlength="500"
                  placeholder="What you specialise in, experience, warranties…"
                ></textarea>
                <div class="d-flex justify-content-between">
                  <div class="invalid-feedback d-block">{{ profileFieldError('description') }}</div>
                  <small class="text-muted">{{ profileForm.description.trim().length }}/500</small>
                </div>
              </div>

              <div class="mb-4">
                <label for="cp-phone" class="form-label fw-semibold small mb-1">Contact number</label>
                <input
                  id="cp-phone"
                  v-model="profileForm.contactNumber"
                  class="form-control"
                  :class="{ 'is-invalid': profileFieldError('contactNumber') }"
                  inputmode="tel"
                  maxlength="9"
                  placeholder="e.g. 92345678"
                />
                <div class="invalid-feedback">{{ profileFieldError('contactNumber') }}</div>
              </div>

              <div v-if="profileError" class="alert alert-danger py-2 small" role="alert">
                {{ profileError }}
              </div>

              <div class="d-flex gap-2">
                <button class="btn btn-success fw-semibold px-4" type="submit">
                  <span v-if="savingProfile" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  {{ needsSetup ? 'Save and get listed' : 'Save profile' }}
                </button>
                <button
                  v-if="!needsSetup"
                  class="btn btn-outline-secondary"
                  type="button"
                  @click="editingProfile = false"
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>

          <!-- LIVE PREVIEW: same card as Find Contractors -->
          <div class="col-lg-5">
            <p class="small text-muted fw-semibold mb-2">Preview: what homeowners see</p>
            <div class="card h-100 border-0 shadow-sm rounded-4 contractor-card preview-card">
              <div class="card-body p-4">
                <span class="badge bg-success-subtle text-success-emphasis mb-3">Website-Registered</span>
                <h5 class="fw-bold">{{ profileForm.companyName || 'Your company name' }}</h5>
                <p class="text-muted small">{{ profileForm.location || 'Your location' }}</p>
                <hr />
                <p class="small text-muted mb-2">Renovation Services</p>
                <div class="d-flex flex-wrap gap-2 mb-3">
                  <span
                    v-for="service in profileForm.services"
                    :key="service"
                    class="badge bg-success-subtle text-success-emphasis"
                  >
                    {{ service }}
                  </span>
                  <span v-if="!profileForm.services.length" class="small text-muted">No services chosen yet</span>
                </div>
                <p class="small text-muted mb-1">About Contractor</p>
                <p>{{ profileForm.description || 'Tell homeowners about your company.' }}</p>
                <p class="small text-muted mb-1">Contact Number</p>
                <p class="fw-semibold">{{ profileForm.contactNumber || 'Not available' }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="!loading && profile"
      class="card border-0 shadow-sm rounded-4 mb-4"
    >
      <div class="card-body p-4 d-flex flex-wrap gap-3 align-items-start justify-content-between">
        <div>
          <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
            <h2 class="h5 fw-bold mb-0">{{ profile.companyName }}</h2>
            <span class="badge bg-success-subtle text-success-emphasis">
              ✓ UEN {{ profile.uenNo }} · Corppass verified
            </span>
          </div>
          <p class="text-muted small mb-2">
            📍 {{ profile.location }} · 📞 {{ profile.contactNumber }}
          </p>
          <div class="d-flex flex-wrap gap-2">
            <span
              v-for="service in profile.services"
              :key="service"
              class="badge bg-success-subtle text-success-emphasis"
            >
              {{ service }}
            </span>
          </div>
        </div>
        <button class="btn btn-outline-success btn-sm fw-semibold" type="button" @click="startEditProfile">
          Edit profile
        </button>
      </div>
    </div>

    <!-- ERROR -->
    <div v-if="errorMessage" class="alert alert-danger">
      {{ errorMessage }}
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-success"></div>
      <p class="text-muted mt-2">Loading requests...</p>
    </div>

    <template v-else-if="!needsSetup">

      <!-- SUMMARY -->
      <div class="row g-3 mb-4">

        <div class="col-md-4">
          <div class="card border-0 shadow-sm rounded-4 p-4">
            <p class="text-muted mb-1">Total Requests</p>
            <h2 class="fw-bold mb-0">{{ myRequests.length }}</h2>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card border-0 shadow-sm rounded-4 p-4">
            <p class="text-muted mb-1">Pending Requests</p>
            <h2 class="fw-bold text-warning mb-0">
              {{ pendingCount }}
            </h2>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card border-0 shadow-sm rounded-4 p-4">
            <p class="text-muted mb-1">Quotations Sent</p>
            <h2 class="fw-bold text-success mb-0">
              {{ quotedCount }}
            </h2>
          </div>
        </div>

      </div>

      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="fw-bold mb-0">Quotation Requests</h4>

        <button class="btn btn-outline-success" @click="loadData">
          Refresh
        </button>
      </div>

      <!-- EMPTY STATE -->
      <div
        v-if="myRequests.length === 0"
        class="card border-0 shadow-sm rounded-4 p-5 text-center text-muted"
      >
        No quotation requests received yet.
      </div>

      <!-- REQUEST CARDS -->
      <div
        v-for="request in myRequests"
        :key="getId(request)"
        class="card border-0 shadow-sm rounded-4 mb-4"
      >
        <div class="card-body p-4">

          <!-- REQUEST HEADER -->
          <div class="d-flex justify-content-between flex-wrap gap-2 mb-3">

            <div>
              <h5 class="fw-bold mb-1">
                {{ request.household?.name || 'Unnamed Household' }}
              </h5>

              <small class="text-muted">
                Requested: {{ formatDate(request.createdAt) }}
              </small>
            </div>

            <span
              class="badge align-self-start"
              :class="statusClass(request.status)"
            >
              {{
                request.status === 'pending'
                  ? 'Pending Response'
                  : request.status === 'quoted'
                    ? 'Quotation Sent'
                    : request.status
              }}
            </span>

          </div>

          <!-- PROPERTY INFORMATION -->
          <div class="row g-3 mb-3">

            <div class="col-md-6">
              <p class="mb-1">
                <strong>Flat Type:</strong>
                {{ request.household?.flatType }}
              </p>

              <p class="mb-1">
                <strong>Occupants:</strong>
                {{ request.household?.occupants }}
              </p>

              <p class="mb-1">
                <strong>Bedrooms:</strong>
                {{ request.household?.bedrooms }}
              </p>
            </div>

            <div class="col-md-6">
              <p class="mb-1">
                <strong>Budget:</strong>
                {{ formatMoney(request.budget) }}
              </p>

              <p class="mb-1">
                <strong>Preferred Start:</strong>
                {{ formatDate(request.preferredStartDate) }}
              </p>
            </div>

                 </div>

        <!-- 3D SPATIAL LAYOUT PLACEHOLDER -->
        <!-- TODO: Connect this to the customer's saved 3D floor plan.
             The contractor should eventually be able to view the
             submitted household's 3D layout in read-only mode.
             Do not allow contractors to edit the customer's layout. -->
        <div class="border rounded-3 p-3 mb-3 bg-light">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <p class="fw-semibold mb-1">Customer's 3D Property Layout</p>
              <p class="small text-muted mb-0">
                View the customer's room layout and appliance placements.
              </p>
            </div>

            <button
              type="button"
              class="btn btn-outline-success fw-semibold"
              :disabled="request.layoutLoading"
              @click="toggleLayout(request)"
            >
              {{ request.layoutLoading ? 'Loading...' : request.showLayout ? 'Hide 3D Layout' : 'View 3D Layout' }}
            </button>
          </div>

          <p v-if="request.layoutError" class="small text-danger mt-3 mb-0">
            {{ request.layoutError }}
          </p>

          <div v-if="request.showLayout && request.plan" class="layout-view mt-3">
            <FloorPlan3D
              :rooms="request.plan.rooms"
              :footprint="request.plan.footprint"
              :overlays="{ sun: false, heat: false, air: false }"
              readonly
            />
          </div>
        </div>

        <!-- SERVICES -->
        <p class="fw-semibold mb-1">Services Required</p>

          <div class="d-flex flex-wrap gap-2 mb-3">
            <span
              v-for="service in request.services || []"
              :key="service"
              class="badge bg-success-subtle text-success-emphasis"
            >
              {{ service }}
            </span>
          </div>

          <!-- DESCRIPTION -->
          <p class="fw-semibold mb-1">Renovation Description</p>
          <p class="text-muted">{{ request.description }}</p>

          <!-- PENDING REQUEST -->
          <div
            v-if="request.status === 'pending'"
            class="bg-light rounded-3 p-3 mt-4"
          >

            <h6 class="fw-bold mb-3">
              Prepare Quotation
            </h6>

            <!-- STEP 1 -->
            <h6 class="fw-semibold">
              Step 1: Upload Contractor Price List
            </h6>

            <label class="form-label">
              Renovation Price List (PDF)
            </label>

            <input
              type="file"
              accept=".pdf,application/pdf"
              class="form-control mb-2"
              @change="selectPDF($event, request)"
            />

            <p class="small text-muted">
              Upload a text-based PDF containing renovation prices.
              Maximum file size: 5 MB.
            </p>

            <button
              class="btn btn-success mb-3"
              :disabled="!request.pdfFile || request.uploading"
              @click="extractPDF(request)"
            >
              {{
                request.uploading
                  ? 'Extracting...'
                  : 'Extract PDF Text'
              }}
            </button>

            <!-- EXTRACTION RESULT -->
            <div
              v-if="request.pdfText"
              class="border rounded-3 p-3 bg-white mb-4"
            >

              <h6 class="fw-bold text-success">
                PDF Text Extracted Successfully
              </h6>

              <details>
                <summary class="small text-success">
                  View Extracted PDF Text
                </summary>

                <pre class="pdf-preview mt-3 mb-0">{{
                  request.pdfText
                }}</pre>
              </details>

            </div>

            <!-- STEP 2 -->
            <div v-if="request.pdfText">

              <hr />

              <h6 class="fw-semibold">
                Step 2: Generate AI Quotation
              </h6>

              <p class="small text-muted">
                Gemini will match the homeowner's renovation requirements
                against your uploaded price list and prepare a draft.
              </p>

              <button
                class="btn btn-success mb-4"
                :disabled="request.generating || request.uploading"
                @click="generateAIQuotation(request)"
              >
                {{
                  request.generating
                    ? 'Generating AI Quotation...'
                    : 'Generate AI Quotation Draft'
                }}
              </button>

            </div>

            <!-- STEP 3: REVIEW AI DRAFT -->
            <div
              v-if="request.aiDraft"
              class="bg-white border rounded-3 p-3 mb-4"
            >

              <h5 class="fw-bold text-success mb-2">
                Step 3: Review AI Quotation
              </h5>

              <p class="text-muted small">
                AI-generated prices may be incorrect.
                Verify each item against your original price list.
                You can edit prices, quantities and descriptions
                before sending the quotation.
              </p>

              <!-- AI WARNINGS -->
              <div
                v-if="request.aiDraft.warnings.length"
                class="alert alert-warning"
              >
                <strong>AI Warnings</strong>

                <ul class="mb-0 mt-2">
                  <li
                    v-for="(warning, index) in request.aiDraft.warnings"
                    :key="index"
                  >
                    {{ warning }}
                  </li>
                </ul>
              </div>

              <!-- ITEMS -->
              <div
                v-for="(item, index) in request.aiDraft.items"
                :key="index"
                class="border rounded-3 p-3 mb-3"
              >

                <div class="d-flex justify-content-between mb-3">
                  <h6 class="fw-bold mb-0">
                    Item {{ index + 1 }}
                  </h6>

                  <button
                    class="btn btn-sm btn-outline-danger"
                    @click="removeQuotationItem(request, index)"
                  >
                    Remove
                  </button>
                </div>

                <div class="row g-3">

                  <div class="col-md-6">
                    <label class="form-label small">
                      Service
                    </label>

                    <input
                      v-model="item.service"
                      type="text"
                      class="form-control"
                    />
                  </div>

                  <div class="col-md-6">
                    <label class="form-label small">
                      Description
                    </label>

                    <input
                      v-model="item.description"
                      type="text"
                      class="form-control"
                    />
                  </div>

                  <div class="col-md-4">
                    <label class="form-label small">
                      Quantity
                    </label>

                    <input
                      v-model.number="item.quantity"
                      type="number"
                      min="0.01"
                      step="any"
                      class="form-control"
                    />
                  </div>

                  <div class="col-md-4">
                    <label class="form-label small">
                      Unit Price (S$)
                    </label>

                    <input
                      v-model.number="item.unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control"
                      placeholder="Enter price"
                    />
                  </div>

                  <div class="col-md-4">
                    <label class="form-label small">
                      Item Total
                    </label>

                    <input
                      class="form-control"
                      :value="
                        getItemAmount(item) === null
                          ? 'Price missing'
                          : formatMoney(getItemAmount(item))
                      "
                      disabled
                    />
                  </div>

                </div>

                <p class="small text-muted mt-3 mb-0">
                  <strong>Price List Evidence:</strong>
                  {{ item.source || 'No supporting excerpt provided' }}
                </p>

                <p
                  v-if="item.needsReview"
                  class="small text-warning-emphasis mt-2 mb-0"
                >
                  This item requires manual verification.
                </p>

              </div>

              <button
                class="btn btn-outline-success mb-4"
                @click="addQuotationItem(request)"
              >
                + Add Quotation Item
              </button>

              <!-- TOTAL -->
              <div class="bg-success-subtle rounded-3 p-3 mb-4">

                <p class="mb-1 text-muted">
                  Draft Quotation Total
                </p>

                <h3 class="fw-bold text-success mb-0">
                  {{ formatMoney(getDraftTotal(request)) }}
                </h3>

                <p
                  v-if="hasMissingPrices(request)"
                  class="small text-warning-emphasis mt-2 mb-0"
                >
                  Some prices are missing or invalid.
                  The total is incomplete.
                </p>

              </div>

              <!-- NOTES -->
              <label class="form-label fw-semibold">
                Quotation Notes
              </label>

              <textarea
                v-model="request.aiDraft.notes"
                class="form-control mb-4"
                rows="4"
                placeholder="Add exclusions, assumptions or important notes"
              ></textarea>

              <!-- APPROVAL -->
              <button
                class="btn btn-success w-100 fw-semibold"
                :disabled="
                  savingId === getId(request) ||
                  hasMissingPrices(request) ||
                  request.aiDraft.items.length === 0
                "
                @click="submitQuotation(request)"
              >
                {{
                  savingId === getId(request)
                    ? 'Submitting Quotation...'
                    : 'Approve & Send Quotation'
                }}
              </button>

            </div>

            <hr />

            <!-- REJECT -->
            <button
              class="btn btn-outline-danger"
              :disabled="savingId === getId(request)"
              @click="rejectRequest(request)"
            >
              {{
                savingId === getId(request)
                  ? 'Processing...'
                  : 'Reject Request'
              }}
            </button>

          </div>

          <!-- PREVIOUSLY SUBMITTED QUOTATION -->
          <div
            v-if="request.status === 'quoted' && request.quotation"
            class="bg-success-subtle rounded-3 p-3 mt-4"
          >

            <h6 class="fw-bold">
              Quotation Submitted
            </h6>

            <p class="mb-3">
              <strong>Total:</strong>
              {{ formatMoney(request.quotation.total) }}
            </p>

            <!-- ITEMISED BREAKDOWN -->
            <div
              v-if="request.quotation.items?.length"
              class="bg-white rounded-3 p-3 mb-3"
            >

              <h6 class="fw-bold mb-3">
                Quotation Breakdown
              </h6>

              <div
                v-for="(item, index) in request.quotation.items"
                :key="index"
                class="border-bottom pb-2 mb-2"
              >

                <div class="d-flex justify-content-between gap-3">
                  <span>
                    {{ item.service }}
                  </span>

                  <strong>
                    {{ formatMoney(item.amount) }}
                  </strong>
                </div>

                <p class="small text-muted mb-0">
                  {{ item.description }}
                </p>

                <p class="small text-muted mb-0">
                  {{ item.quantity }} ×
                  {{ formatMoney(item.unitPrice) }}
                </p>

              </div>

            </div>

            <p class="mb-0">
              <strong>Notes:</strong>
              {{ request.quotation.notes || 'None' }}
            </p>

          </div>

          <!-- REJECTED -->
          <div
            v-if="request.status === 'rejected'"
            class="alert alert-danger mt-3 mb-0"
          >
            This quotation request has been rejected.
          </div>

        </div>
      </div>

    </template>

  </div>
</template>

<style scoped>
.pdf-preview {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 250px;
  overflow-y: auto;
  font-size: 13px;
}

.layout-view {
  height: 420px;
  border-radius: 0.75rem;
  overflow: hidden;
}
</style>