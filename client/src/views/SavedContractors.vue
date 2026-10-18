<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import workheads from '@/data/workheads.json'

const router = useRouter()

const SAVED_API = 'http://localhost:8000/api/saved-contractors'
const QUOTATION_API = 'http://localhost:8000/api/quotation-requests'

const savedContractors = ref([])
const quotationRequests = ref([])

const loading = ref(true)
const removingId = ref('')
const removingRequestId = ref('')
const errorMessage = ref('')

// ============================================================
// FETCH DATA FROM MONGODB
// ============================================================

async function getSavedContractors() {
  const response = await axios.get(SAVED_API)

  savedContractors.value = Array.isArray(response.data)
    ? response.data
    : response.data.contractors || []
}

async function getQuotationRequests() {
  const response = await axios.get(QUOTATION_API)

  quotationRequests.value = Array.isArray(response.data)
    ? response.data
    : response.data.requests || []
}

async function getData() {
  loading.value = true
  errorMessage.value = ''

  const results = await Promise.allSettled([
    getSavedContractors(),
    getQuotationRequests()
  ])

  if (results[0].status === 'rejected') {
    errorMessage.value = 'Unable to load saved contractors.'
  } else if (results[1].status === 'rejected') {
    errorMessage.value = 'Unable to load quotation statuses.'
  }

  loading.value = false
}

// ============================================================
// CONTRACTOR HELPERS
// ============================================================

function isWebsiteContractor(contractor) {
  return contractor.source === 'website' ||
    (!contractor.source && Boolean(contractor.companyName))
}

function getContractorId(contractor) {
  if (isWebsiteContractor(contractor)) {
    return String(contractor.savedId || '').replace(/^website-/, '')
  }

  return String(contractor.uen_no || contractor.uenNo || '')
}

function getContractorName(contractor) {
  return contractor.companyName ||
    contractor.company_name ||
    'Unknown Contractor'
}

function getContractorLocation(contractor) {
  if (isWebsiteContractor(contractor)) {
    return contractor.location || 'Not available'
  }

  return [
    contractor.building_no,
    contractor.street_name,
    contractor.unit_no,
    contractor.postal_code
      ? `Singapore ${contractor.postal_code}`
      : ''
  ].filter(Boolean).join(' ') || 'Not available'
}

function getContractorPhone(contractor) {
  return contractor.contactNumber || contractor.tel_no || ''
}

function getContractorServices(contractor) {
  if (isWebsiteContractor(contractor)) {
    return (contractor.services || []).map(service =>
      typeof service === 'string'
        ? service
        : service.name || service.code
    )
  }

  return (contractor.registrations || []).map(registration =>
    workheads[registration.workhead] || registration.workhead
  )
}

// ============================================================
// QUOTATION REQUESTS
// ============================================================

function getRequests(contractor) {
  if (!isWebsiteContractor(contractor)) return []

  const contractorId = getContractorId(contractor)

  return quotationRequests.value.filter(request => {
    const requestId = request.contractorId?.$oid ||
      request.contractorId

    return String(requestId) === contractorId
  })
}

function getRequestId(request) {
  return String(request._id?.$oid || request._id)
}

function canEditRequest(request) {
  return request.status === 'pending'
}

function getStatusClass(status) {
  switch (status) {
    case 'pending':
      return 'bg-warning-subtle text-warning-emphasis'
    case 'accepted':
      return 'bg-info-subtle text-info-emphasis'
    case 'rejected':
      return 'bg-danger-subtle text-danger-emphasis'
    case 'quoted':
      return 'bg-success-subtle text-success-emphasis'
    default:
      return 'bg-secondary-subtle text-secondary-emphasis'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'pending': return 'Pending Response'
    case 'accepted': return 'Accepted'
    case 'rejected': return 'Rejected'
    case 'quoted': return 'Quotation Received'
    default: return 'Unknown'
  }
}

function formatDate(date) {
  if (!date) return 'Not specified'

  return new Date(date).toLocaleDateString('en-SG')
}

// ============================================================
// ACTIONS
// ============================================================

function requestQuotation(contractor) {
  router.push({
    path: '/QuotationRequest',
    query: {
      contractorId: getContractorId(contractor)
    }
  })
}

function updateQuotation(contractor, request) {
  router.push({
    path: '/QuotationRequest',
    query: {
      contractorId: getContractorId(contractor),
      requestId: getRequestId(request)
    }
  })
}

async function removeQuotation(request) {
  const requestId = getRequestId(request)

  if (!confirm('Are you sure you want to remove this quotation request?')) {
    return
  }

  removingRequestId.value = requestId
  errorMessage.value = ''

  try {
    await axios.delete(
      `${QUOTATION_API}/${encodeURIComponent(requestId)}`
    )

    quotationRequests.value = quotationRequests.value.filter(
      item => getRequestId(item) !== requestId
    )

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to remove quotation request.'

  } finally {
    removingRequestId.value = ''
  }
}

async function removeContractor(contractor) {
  const savedId = contractor.savedId

  if (!savedId) {
    errorMessage.value = 'Unable to identify saved contractor.'
    return
  }

  removingId.value = savedId
  errorMessage.value = ''

  try {
    await axios.delete(
      `${SAVED_API}/${encodeURIComponent(savedId)}`
    )

    savedContractors.value = savedContractors.value.filter(
      item => item.savedId !== savedId
    )

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to remove contractor.'

  } finally {
    removingId.value = ''
  }
}

onMounted(() => {
  getData()
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
        Your <span class="text-success">Saved Contractors</span>
      </h1>

      <p class="text-muted fs-5">
        Manage your shortlisted contractors and track quotation requests.
      </p>

      <RouterLink
        to="/Contractors"
        class="btn btn-outline-success"
      >
        ← Find More Contractors
      </RouterLink>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-muted mb-4">
      <span class="spinner-border spinner-border-sm me-2"></span>
      Loading saved contractors...
    </div>

    <!-- ERROR -->
    <div v-if="errorMessage" class="alert alert-warning mb-4">
      {{ errorMessage }}

      <button
        class="btn btn-sm btn-outline-warning ms-2"
        @click="getData"
      >
        Retry
      </button>
    </div>

    <!-- SAVED COUNT -->
    <div class="mb-4">
      <h3 class="fw-bold">Your Shortlist</h3>

      <p class="text-muted">
        {{ savedContractors.length }} contractor(s) saved
      </p>
    </div>

    <!-- EMPTY STATE -->
    <div
      v-if="!loading && savedContractors.length === 0 && !errorMessage"
      class="card border-0 shadow-sm rounded-4"
    >
      <div class="card-body text-center p-5">
        <h5 class="fw-bold">No Saved Contractors Yet</h5>

        <p class="text-muted">
          Browse renovation contractors and save the ones you like.
        </p>

        <RouterLink to="/Contractors" class="btn btn-success">
          Find Contractors →
        </RouterLink>
      </div>
    </div>

    <!-- CONTRACTOR CARDS -->
    <div v-if="!loading && savedContractors.length > 0" class="row g-4">

      <div
        v-for="contractor in savedContractors"
        :key="contractor.savedId"
        class="col-md-6 col-lg-4"
      >
        <div class="card h-100 border-0 shadow-sm rounded-4 contractor-card">

          <div class="card-body p-4">

            <!-- SOURCE -->
            <span
              v-if="isWebsiteContractor(contractor)"
              class="badge bg-success-subtle text-success-emphasis mb-3"
            >
              Website-Registered
            </span>

            <span
              v-else
              class="badge bg-primary-subtle text-primary-emphasis mb-3"
            >
              Government Dataset
            </span>

            <!-- CONTRACTOR DETAILS -->
            <h5 class="fw-bold">
              {{ getContractorName(contractor) }}
            </h5>

            <p
              v-if="!isWebsiteContractor(contractor)"
              class="small text-muted"
            >
              UEN: {{ contractor.uen_no }}
            </p>

            <p class="text-muted small">
              {{ getContractorLocation(contractor) }}
            </p>

            <hr />

            <!-- SERVICES -->
            <p class="small text-muted mb-2">
              Renovation Services
            </p>

            <div class="d-flex flex-wrap gap-2 mb-3">
              <span
                v-for="service in getContractorServices(contractor)"
                :key="service"
                class="badge bg-success-subtle text-success-emphasis"
              >
                {{ service }}
              </span>

              <span
                v-if="getContractorServices(contractor).length === 0"
                class="text-muted small"
              >
                No service information available
              </span>
            </div>

            <!-- DESCRIPTION -->
            <p v-if="contractor.description" class="small">
              {{ contractor.description }}
            </p>

            <!-- PHONE -->
            <p class="small text-muted mb-1">
              Contact Number
            </p>

            <p class="fw-semibold">
              {{ getContractorPhone(contractor) || 'Not available' }}
            </p>

            <!-- GOVERNMENT REGISTRATIONS -->
            <div
              v-if="!isWebsiteContractor(contractor)"
              class="bg-light rounded-3 p-3 mb-3"
            >
              <h6 class="fw-bold">Registration Details</h6>

              <div
                v-for="registration in contractor.registrations || []"
                :key="registration.workhead"
                class="small mb-3"
              >
                <strong>{{ registration.workhead }}</strong>

                <div>
                  Grade: {{ registration.grade || 'N/A' }}
                </div>

                <div>
                  Expiry: {{ registration.expiry_date || 'N/A' }}
                </div>
              </div>
            </div>

            <!-- QUOTATION REQUESTS -->
            <div
              v-if="isWebsiteContractor(contractor)"
              class="mt-4"
            >
              <h6 class="fw-bold mb-3">
                Quotation Requests
              </h6>

              <div
                v-if="getRequests(contractor).length === 0"
                class="bg-light rounded-3 p-3"
              >
                <p class="text-muted small mb-0">
                  No quotation requests submitted yet.
                </p>
              </div>

              <div
                v-for="request in getRequests(contractor)"
                :key="getRequestId(request)"
                class="border rounded-3 p-3 mb-3"
              >
                <!-- STATUS BADGE -->
                <span
                  class="badge mb-3"
                  :class="getStatusClass(request.status)"
                >
                  {{ getStatusText(request.status) }}
                </span>

                <p class="small mb-1">
                  <strong>Household:</strong>
                  {{ request.household?.name || 'N/A' }}
                </p>

                <p class="small mb-1">
                  <strong>Services:</strong>
                  {{ (request.services || []).join(', ') }}
                </p>

                <p class="small mb-1">
                  <strong>Budget:</strong>
                  S${{ Number(request.budget).toLocaleString() }}
                </p>

                <p class="small mb-1">
                  <strong>Preferred Start:</strong>
                  {{ formatDate(request.preferredStartDate) }}
                </p>

                <p class="small mb-2">
                  <strong>Requested:</strong>
                  {{ formatDate(request.createdAt) }}
                </p>

                <!-- CONTRACTOR RESPONSE -->
                <div
                  v-if="request.status === 'quoted' && request.quotation"
                  class="bg-success-subtle rounded-3 p-3 mt-3"
                >
                  <p class="fw-bold mb-1">
                    Quotation Received
                  </p>

                  <p class="mb-0">
                    Total:
                    <strong>
                      S${{
                        Number(request.quotation.total || 0).toLocaleString()
                      }}
                    </strong>
                  </p>
                </div>

                <!-- UPDATE / REMOVE REQUEST -->
                <div
                  v-if="canEditRequest(request)"
                  class="d-flex gap-2 mt-3"
                >
                  <button
                    class="btn btn-outline-success btn-sm flex-fill"
                    @click="updateQuotation(contractor, request)"
                  >
                    Update Request
                  </button>

                  <button
                    class="btn btn-outline-danger btn-sm flex-fill"
                    :disabled="removingRequestId === getRequestId(request)"
                    @click="removeQuotation(request)"
                  >
                    {{
                      removingRequestId === getRequestId(request)
                        ? 'Removing...'
                        : 'Remove Quotation'
                    }}
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- CARD ACTIONS -->
          <div class="card-footer bg-white border-0 px-4 pb-4">

            <!-- ONLY ALLOW NEW REQUEST IF NONE EXISTS -->
            <button
              v-if="isWebsiteContractor(contractor) &&
                getRequests(contractor).length === 0"
              class="btn btn-success w-100 mb-2"
              @click="requestQuotation(contractor)"
            >
              Request Quotation →
            </button>

            <div class="d-flex gap-2">

              <button
                class="btn btn-outline-danger flex-fill"
                :disabled="removingId === contractor.savedId"
                @click="removeContractor(contractor)"
              >
                {{
                  removingId === contractor.savedId
                    ? 'Removing...'
                    : 'Remove Contractor'
                }}
              </button>

              <a
                v-if="getContractorPhone(contractor) &&
                  !['na', 'n/a'].includes(
                    String(getContractorPhone(contractor)).toLowerCase()
                  )"
                :href="'tel:' + getContractorPhone(contractor)"
                class="btn btn-outline-success flex-fill"
              >
                Contact →
              </a>

              <button
                v-else
                class="btn btn-outline-secondary flex-fill"
                disabled
              >
                Contact Unavailable
              </button>

            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- DISCLAIMER -->
    <div
      v-if="savedContractors.length > 0"
      class="mt-5 p-3 bg-light rounded-3"
    >
      <p class="small text-muted mb-0">
        <strong>Note:</strong>
        Website-registered contractor information is user-submitted.
        Government contractor information is sourced from data.gov.sg.
        Please verify contractor credentials and applicable HDB
        renovation requirements before engaging a contractor.
      </p>
    </div>

  </div>
</template>

<style scoped>
.contractor-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.contractor-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}
</style>