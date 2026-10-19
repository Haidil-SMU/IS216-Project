<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

const API = '/api'

const contractors = ref([])
const requests = ref([])
const selectedContractorId = ref('')

const loading = ref(true)
const errorMessage = ref('')
const savingId = ref('')

function getCurrentContractorId() {
  return selectedContractorId.value
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
    const [contractorRes, requestRes] = await Promise.all([
      axios.get(`${API}/contractors`),
      axios.get(`${API}/quotation-requests`)
    ])

    contractors.value = Array.isArray(contractorRes.data)
      ? contractorRes.data
      : contractorRes.data.contractors || []

    const data = Array.isArray(requestRes.data)
      ? requestRes.data
      : requestRes.data.requests || []

    requests.value = data.map(request => ({
      ...request,
      pdfFile: null,
      pdfText: '',
      uploading: false,
      generating: false,
      aiDraft: null
    }))

    if (
      !contractors.value.some(
        contractor => getId(contractor) === selectedContractorId.value
      )
    ) {
      selectedContractorId.value = contractors.value.length
        ? getId(contractors.value[0])
        : ''
    }

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

    <!-- CONTRACTOR SELECTOR -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
      <div class="card-body p-4">

        <label class="form-label fw-semibold">
          Viewing as Contractor
        </label>

        <select v-model="selectedContractorId" class="form-select">
          <option
            v-for="contractor in contractors"
            :key="getId(contractor)"
            :value="getId(contractor)"
          >
            {{ contractor.companyName }}
          </option>
        </select>

        <p class="small text-muted mt-2 mb-0">
          Temporary selector for testing. Authentication will replace this.
        </p>

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

    <template v-else>

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
</style>