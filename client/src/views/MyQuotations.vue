<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const API = '/api'

// ============================================================
// STATE
// ============================================================

const quotationRequests = ref([])
const contractors = ref([])

const loading = ref(true)
const errorMessage = ref('')
const removingRequestId = ref('')

// New: quotation breakdown and comparison
const expandedQuotations = ref([])
const selectedQuotationIds = ref([])

// ============================================================
// FETCH DATA FROM MONGODB
// ============================================================

async function getData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [requestResponse, contractorResponse] = await Promise.all([
      axios.get(`${API}/quotation-requests`),
      axios.get(`${API}/contractors`)
    ])

    quotationRequests.value = Array.isArray(requestResponse.data)
      ? requestResponse.data
      : requestResponse.data.requests || []

    contractors.value = Array.isArray(contractorResponse.data)
      ? contractorResponse.data
      : contractorResponse.data.contractors || []

    // Keep only selections that still exist and are quoted.
    const availableIds = quotationRequests.value
      .filter(request =>
        request.status === 'quoted' &&
        request.quotation
      )
      .map(request => getRequestId(request))

    selectedQuotationIds.value = selectedQuotationIds.value.filter(
      id => availableIds.includes(id)
    )

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to load quotation requests.'

  } finally {
    loading.value = false
  }
}

// ============================================================
// HELPERS
// ============================================================

function getId(value) {
  if (!value) return ''

  return String(value.$oid || value)
}

function getRequestId(request) {
  return getId(request._id)
}

function getContractor(request) {
  return contractors.value.find(
    contractor =>
      getId(contractor._id) === getId(request.contractorId)
  )
}

function getContractorName(request) {
  const contractor = getContractor(request)

  return contractor?.companyName || 'Unknown Contractor'
}

function getContractorLocation(request) {
  const contractor = getContractor(request)

  return contractor?.location || 'Not available'
}

function getContractorPhone(request) {
  const contractor = getContractor(request)

  return contractor?.contactNumber || ''
}

const pendingCount = computed(() =>
  quotationRequests.value.filter(
    request => request.status === 'pending'
  ).length
)

const quotedCount = computed(() =>
  quotationRequests.value.filter(
    request => request.status === 'quoted'
  ).length
)

const rejectedCount = computed(() =>
  quotationRequests.value.filter(
    request => request.status === 'rejected'
  ).length
)

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
    case 'pending':
      return 'Pending Response'

    case 'accepted':
      return 'Accepted'

    case 'rejected':
      return 'Rejected'

    case 'quoted':
      return 'Quotation Received'

    default:
      return 'Unknown'
  }
}

function formatDate(date) {
  if (!date) return 'Not specified'

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Not specified'
  }

  return parsedDate.toLocaleDateString('en-SG')
}

function formatMoney(amount) {
  return `S$${Number(amount || 0).toLocaleString('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

// ============================================================
// NEW: QUOTATION BREAKDOWN
// ============================================================

function toggleBreakdown(request) {
  const requestId = getRequestId(request)

  if (expandedQuotations.value.includes(requestId)) {
    expandedQuotations.value = expandedQuotations.value.filter(
      id => id !== requestId
    )
  } else {
    expandedQuotations.value.push(requestId)
  }
}

function isBreakdownExpanded(request) {
  return expandedQuotations.value.includes(getRequestId(request))
}

function getQuotationItems(request) {
  return Array.isArray(request.quotation?.items)
    ? request.quotation.items
    : []
}

function getQuotationWarnings(request) {
  return Array.isArray(request.quotation?.warnings)
    ? request.quotation.warnings
    : []
}

function getItemAmount(item) {
  if (item.amount !== null && item.amount !== undefined) {
    return Number(item.amount)
  }

  if (
    item.unitPrice !== null &&
    item.unitPrice !== undefined &&
    item.quantity !== null &&
    item.quantity !== undefined
  ) {
    return Number(item.unitPrice) * Number(item.quantity)
  }

  return null
}

function isOverBudget(request) {
  return (
    Number(request.quotation?.total) >
    Number(request.budget)
  )
}

function getBudgetDifference(request) {
  return (
    Number(request.quotation?.total || 0) -
    Number(request.budget || 0)
  )
}

// ============================================================
// NEW: SELECT QUOTATIONS FOR COMPARISON
// ============================================================

const selectedQuotations = computed(() =>
  quotationRequests.value.filter(request =>
    selectedQuotationIds.value.includes(getRequestId(request)) &&
    request.status === 'quoted' &&
    request.quotation
  )
)

const canCompare = computed(() =>
  selectedQuotations.value.length >= 2
)

function toggleQuotationSelection(request) {
  if (
    request.status !== 'quoted' ||
    !request.quotation
  ) {
    return
  }

  const requestId = getRequestId(request)

  if (selectedQuotationIds.value.includes(requestId)) {
    selectedQuotationIds.value = selectedQuotationIds.value.filter(
      id => id !== requestId
    )
  } else {
    selectedQuotationIds.value.push(requestId)
  }
}

function isQuotationSelected(request) {
  return selectedQuotationIds.value.includes(getRequestId(request))
}

function clearComparisonSelection() {
  selectedQuotationIds.value = []
}

// ============================================================
// ACTIONS
// ============================================================

function updateQuotation(request) {
  router.push({
    path: '/QuotationRequest',
    query: {
      contractorId: getId(request.contractorId),
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
      `${API}/quotation-requests/${encodeURIComponent(requestId)}`
    )

    quotationRequests.value = quotationRequests.value.filter(
      item => getRequestId(item) !== requestId
    )

    selectedQuotationIds.value = selectedQuotationIds.value.filter(
      id => id !== requestId
    )

    expandedQuotations.value = expandedQuotations.value.filter(
      id => id !== requestId
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

onMounted(() => {
  getData()
})
</script>

<template>
  <div class="container py-5">

    <!-- HEADER -->
    <div class="mb-5">

      <span
        class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-3"
      >
        HDB EcoHome Services
      </span>

      <h1 class="fw-bold mb-3">
        My <span class="text-success">Quotations</span>
      </h1>

      <p class="text-muted fs-5">
        Track your renovation quotation requests,
        review contractor responses and compare quotations.
      </p>

      <RouterLink
        to="/Contractors"
        class="btn btn-outline-success"
      >
        ← Find Contractors
      </RouterLink>

    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-5">

      <div class="spinner-border text-success mb-3"></div>

      <p class="text-muted">
        Loading quotation requests...
      </p>

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

    <template v-if="!loading">

      <!-- SUMMARY -->
      <div class="row g-3 mb-5">

        <div class="col-md-3">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">

            <p class="text-muted mb-1">
              Total Requests
            </p>

            <h2 class="fw-bold mb-0">
              {{ quotationRequests.length }}
            </h2>

          </div>
        </div>

        <div class="col-md-3">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">

            <p class="text-muted mb-1">
              Pending
            </p>

            <h2 class="fw-bold text-warning mb-0">
              {{ pendingCount }}
            </h2>

          </div>
        </div>

        <div class="col-md-3">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">

            <p class="text-muted mb-1">
              Quotations Received
            </p>

            <h2 class="fw-bold text-success mb-0">
              {{ quotedCount }}
            </h2>

          </div>
        </div>

        <div class="col-md-3">
          <div class="card border-0 shadow-sm rounded-4 p-4 h-100">

            <p class="text-muted mb-1">
              Rejected
            </p>

            <h2 class="fw-bold text-danger mb-0">
              {{ rejectedCount }}
            </h2>

          </div>
        </div>

      </div>

      <!-- NEW: COMPARISON SELECTION PANEL -->
      <div
        v-if="quotedCount > 0"
        class="card border-0 shadow-sm rounded-4 mb-5 comparison-panel"
      >
        <div class="card-body p-4">

          <div
            class="d-flex justify-content-between align-items-start flex-wrap gap-3"
          >

            <div>
              <h4 class="fw-bold mb-2">
                Compare Contractor Quotations
              </h4>

              <p class="text-muted mb-2">
                Select at least two received quotations to compare
                their prices, renovation services and scope of work.
              </p>

              <span
                class="badge bg-success-subtle text-success-emphasis px-3 py-2"
              >
                {{ selectedQuotations.length }} quotation(s) selected
              </span>
            </div>

            <button
              v-if="selectedQuotationIds.length > 0"
              class="btn btn-outline-secondary"
              @click="clearComparisonSelection"
            >
              Clear Selection
            </button>

          </div>

          <!-- SELECTED CONTRACTORS -->
          <div
            v-if="selectedQuotations.length > 0"
            class="mt-4"
          >

            <h6 class="fw-semibold mb-3">
              Selected Quotations
            </h6>

            <div
              v-for="request in selectedQuotations"
              :key="getRequestId(request)"
              class="selected-quotation d-flex justify-content-between align-items-center gap-3 mb-2"
            >

              <div>
                <strong>
                  {{ getContractorName(request) }}
                </strong>

                <p class="small text-muted mb-0">
                  {{ request.household?.flatType || 'HDB Flat' }}
                </p>
              </div>

              <div class="text-end">
                <strong class="text-success">
                  {{ formatMoney(request.quotation.total) }}
                </strong>

                <button
                  class="btn btn-sm btn-link text-danger d-block ms-auto p-0"
                  @click="toggleQuotationSelection(request)"
                >
                  Remove
                </button>
              </div>

            </div>

          </div>

          <!-- COMPARISON READINESS -->
          <div
            v-if="!canCompare"
            class="alert alert-light border mt-4 mb-0"
          >
            Select at least two quotations below to enable comparison.
          </div>

          <div
            v-else
            class="alert alert-success mt-4 mb-0"
          >
            <strong>
              Ready for Comparison
            </strong>

            <p class="mb-0 mt-1">
              {{ selectedQuotations.length }} quotations selected.
              The Gemini AI comparison feature will be connected next.
            </p>
          </div>

          <p class="small text-muted mt-3 mb-0">
            For meaningful results, select quotations covering
            comparable renovation requirements and scope of work.
          </p>

        </div>
      </div>

      <!-- SECTION HEADER -->
      <div
        class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4"
      >

        <div>
          <h3 class="fw-bold mb-1">
            Quotation Requests
          </h3>

          <p class="text-muted mb-0">
            {{ quotationRequests.length }} request(s) submitted
          </p>
        </div>

        <button
          class="btn btn-outline-success"
          @click="getData"
        >
          Refresh
        </button>

      </div>

      <!-- EMPTY STATE -->
      <div
        v-if="quotationRequests.length === 0 && !errorMessage"
        class="card border-0 shadow-sm rounded-4"
      >

        <div class="card-body text-center p-5">

          <h5 class="fw-bold">
            No Quotation Requests Yet
          </h5>

          <p class="text-muted">
            Find a renovation contractor and submit
            your first quotation request.
          </p>

          <RouterLink
            to="/Contractors"
            class="btn btn-success"
          >
            Find Contractors →
          </RouterLink>

        </div>

      </div>

      <!-- QUOTATION REQUEST CARDS -->
      <div class="row g-4">

        <div
          v-for="request in quotationRequests"
          :key="getRequestId(request)"
          class="col-md-6 col-lg-4"
        >

          <div
            class="card h-100 border-0 shadow-sm rounded-4 quotation-card"
            :class="{
              'selected-card': isQuotationSelected(request)
            }"
          >

            <div class="card-body p-4">

              <!-- STATUS -->
              <span
                class="badge mb-3"
                :class="getStatusClass(request.status)"
              >
                {{ getStatusText(request.status) }}
              </span>

              <!-- CONTRACTOR -->
              <h5 class="fw-bold mb-1">
                {{ getContractorName(request) }}
              </h5>

              <p class="text-muted small mb-3">
                {{ getContractorLocation(request) }}
              </p>

              <hr />

              <!-- HOUSEHOLD -->
              <p class="small text-muted mb-1">
                Household
              </p>

              <p class="fw-semibold mb-3">
                {{ request.household?.name || 'Not specified' }}
              </p>

              <!-- FLAT TYPE -->
              <p class="small text-muted mb-1">
                HDB Flat Type
              </p>

              <p class="fw-semibold mb-3">
                {{ request.household?.flatType || 'Not specified' }}
              </p>

              <!-- SERVICES -->
              <p class="small text-muted mb-2">
                Renovation Services
              </p>

              <div class="d-flex flex-wrap gap-2 mb-3">

                <span
                  v-for="service in request.services || []"
                  :key="service"
                  class="badge bg-success-subtle text-success-emphasis"
                >
                  {{ service }}
                </span>

                <span
                  v-if="!request.services?.length"
                  class="text-muted small"
                >
                  No services specified
                </span>

              </div>

              <!-- DESCRIPTION -->
              <template v-if="request.description">

                <p class="small text-muted mb-1">
                  Renovation Description
                </p>

                <p class="small mb-3">
                  {{ request.description }}
                </p>

              </template>

              <!-- BUDGET -->
              <p class="small mb-1">
                <strong>Budget:</strong>
                {{ formatMoney(request.budget) }}
              </p>

              <!-- PREFERRED START -->
              <p class="small mb-1">
                <strong>Preferred Start:</strong>
                {{ formatDate(request.preferredStartDate) }}
              </p>

              <!-- REQUEST DATE -->
              <p class="small mb-2">
                <strong>Requested:</strong>
                {{ formatDate(request.createdAt) }}
              </p>

              <!-- QUOTATION RECEIVED -->
              <div
                v-if="request.status === 'quoted' && request.quotation"
                class="bg-success-subtle rounded-3 p-3 mt-4"
              >

                <h6 class="fw-bold text-success mb-3">
                  Contractor Quotation
                </h6>

                <p class="small text-muted mb-1">
                  Total Quotation Amount
                </p>

                <h4 class="fw-bold mb-2">
                  {{ formatMoney(request.quotation.total) }}
                </h4>

                <!-- BUDGET COMPARISON -->
                <div
                  v-if="isOverBudget(request)"
                  class="alert alert-warning small py-2 px-3 mb-3"
                >
                  <strong>Over Budget</strong>

                  <div class="mt-1">
                    This quotation exceeds your budget by
                    {{ formatMoney(getBudgetDifference(request)) }}.
                  </div>
                </div>

                <div
                  v-else
                  class="small text-success-emphasis mb-3"
                >
                  This quotation is within your stated budget.
                </div>

                <!-- NEW: EXPAND BREAKDOWN -->
                <button
                  class="btn btn-outline-success btn-sm w-100 mb-3"
                  @click="toggleBreakdown(request)"
                >
                  {{
                    isBreakdownExpanded(request)
                      ? 'Hide Quotation Breakdown ↑'
                      : 'View Quotation Breakdown ↓'
                  }}
                </button>

                <!-- NEW: FULL QUOTATION BREAKDOWN -->
                <div
                  v-if="isBreakdownExpanded(request)"
                  class="quotation-breakdown bg-white rounded-3 p-3 mb-3"
                >

                  <h6 class="fw-bold mb-3">
                    Itemised Quotation Breakdown
                  </h6>

                  <div
                    v-if="getQuotationItems(request).length === 0"
                    class="small text-muted"
                  >
                    No itemised breakdown was provided.
                  </div>

                  <div
                    v-for="(item, index) in getQuotationItems(request)"
                    :key="index"
                    class="quotation-item pb-3 mb-3"
                  >

                    <div
                      class="d-flex justify-content-between gap-2 mb-1"
                    >
                      <strong class="small">
                        {{ item.service || 'Unnamed Service' }}
                      </strong>

                      <strong class="small text-success text-nowrap">
                        {{
                          getItemAmount(item) === null
                            ? 'Price unavailable'
                            : formatMoney(getItemAmount(item))
                        }}
                      </strong>
                    </div>

                    <p class="small text-muted mb-2">
                      {{ item.description || 'No description provided' }}
                    </p>

                    <p class="small mb-2">
                      <strong>Quantity:</strong>
                      {{ item.quantity ?? 'N/A' }}

                      <br />

                      <strong>Unit Price:</strong>
                      {{
                        item.unitPrice == null
                          ? 'Not specified'
                          : formatMoney(item.unitPrice)
                      }}
                    </p>

                    <!-- PDF SOURCE -->
                    <div
                      v-if="item.source"
                      class="source-box rounded-2 p-2"
                    >
                      <p class="small text-muted mb-1">
                        <strong>Price List Reference</strong>
                      </p>

                      <p class="small mb-0">
                        {{ item.source }}
                      </p>
                    </div>

                    <p
                      v-if="item.needsReview"
                      class="small text-warning-emphasis mt-2 mb-0"
                    >
                      This item was flagged for review.
                    </p>

                  </div>

                  <!-- BREAKDOWN TOTAL -->
                  <div
                    class="d-flex justify-content-between align-items-center pt-2"
                  >
                    <strong>
                      Total
                    </strong>

                    <strong class="text-success">
                      {{ formatMoney(request.quotation.total) }}
                    </strong>
                  </div>

                  <!-- WARNINGS -->
                  <div
                    v-if="getQuotationWarnings(request).length > 0"
                    class="alert alert-warning mt-3 mb-0"
                  >

                    <strong class="small">
                      Quotation Warnings
                    </strong>

                    <ul class="small mt-2 mb-0 ps-3">
                      <li
                        v-for="(warning, index) in getQuotationWarnings(request)"
                        :key="index"
                      >
                        {{ warning }}
                      </li>
                    </ul>

                  </div>

                </div>

                <!-- NOTES -->
                <p
                  v-if="request.quotation.notes"
                  class="small mb-3"
                >
                  <strong>Notes:</strong>
                  {{ request.quotation.notes }}
                </p>

                <!-- NEW: SELECT FOR COMPARISON -->
                <div class="comparison-checkbox rounded-3 p-3">

                  <label
                    class="d-flex align-items-center gap-2 mb-0"
                  >
                    <input
                      type="checkbox"
                      class="form-check-input mt-0"
                      :checked="isQuotationSelected(request)"
                      @change="toggleQuotationSelection(request)"
                    />

                    <span class="fw-semibold small">
                      Select for AI Comparison
                    </span>
                  </label>

                </div>

              </div>

              <!-- REJECTED -->
              <div
                v-if="request.status === 'rejected'"
                class="alert alert-danger mt-4 mb-0"
              >
                This contractor has rejected your quotation request.
              </div>

              <!-- PENDING -->
              <div
                v-if="request.status === 'pending'"
                class="alert alert-warning mt-4 mb-0"
              >
                Waiting for the contractor to respond.
              </div>

            </div>

            <!-- ACTIONS -->
            <div class="card-footer bg-white border-0 px-4 pb-4">

              <!-- UPDATE / REMOVE PENDING REQUEST -->
              <div
                v-if="canEditRequest(request)"
                class="d-flex gap-2 mb-2"
              >

                <button
                  class="btn btn-outline-success flex-fill"
                  @click="updateQuotation(request)"
                >
                  Update Request
                </button>

                <button
                  class="btn btn-outline-danger flex-fill"
                  :disabled="removingRequestId === getRequestId(request)"
                  @click="removeQuotation(request)"
                >
                  {{
                    removingRequestId === getRequestId(request)
                      ? 'Removing...'
                      : 'Remove Request'
                  }}
                </button>

              </div>

              <!-- CONTACT CONTRACTOR -->
              <a
                v-if="getContractorPhone(request)"
                :href="'tel:' + getContractorPhone(request)"
                class="btn btn-outline-success w-100"
              >
                Contact Contractor →
              </a>

              <button
                v-else
                class="btn btn-outline-secondary w-100"
                disabled
              >
                Contact Unavailable
              </button>

            </div>

          </div>

        </div>

      </div>

      <!-- DISCLAIMER -->
      <div
        v-if="quotationRequests.length > 0"
        class="mt-5 p-3 bg-light rounded-3"
      >

        <p class="small text-muted mb-0">
          <strong>Note:</strong>
          Quotations are provided by website-registered contractors.
          AI-generated quotation details should be independently verified
          against the contractor's original price list.
          Please verify contractor credentials, quotation details
          and applicable HDB renovation requirements before
          engaging a contractor.
        </p>

      </div>

    </template>

  </div>
</template>

<style scoped>
.quotation-card {
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.quotation-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}

.selected-card {
  outline: 2px solid #198754;
  outline-offset: -2px;
}

.comparison-panel {
  border-left: 4px solid #198754 !important;
}

.selected-quotation {
  background: #f8faf9;
  border: 1px solid #e2e8e5;
  border-radius: 10px;
  padding: 12px 16px;
}

.quotation-breakdown {
  border: 1px solid #e2e8e5;
}

.quotation-item {
  border-bottom: 1px solid #dee2e6;
}

.quotation-item:last-of-type {
  border-bottom: none;
}

.source-box {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  overflow-wrap: anywhere;
}

.comparison-checkbox {
  background: white;
  border: 1px solid #c3e6cb;
  cursor: pointer;
}

.comparison-checkbox:hover {
  background: #f0faf4;
}

.form-check-input {
  cursor: pointer;
}

.form-check-input:checked {
  background-color: #198754;
  border-color: #198754;
}

@media (max-width: 576px) {
  .quotation-card {
    margin-bottom: 8px;
  }
}
</style>