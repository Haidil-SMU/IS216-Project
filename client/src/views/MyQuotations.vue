<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import ContractorProfile from '@/components/ContractorProfile.vue'

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
const decisionRequestId = ref('')
const profileContractor = ref(null)
let profileOpener = null

function openProfile(request, event) {
  const contractor = getContractor(request)
  if (!contractor) return
  profileOpener = event.currentTarget
  profileContractor.value = contractor
}

async function closeProfile() {
  profileContractor.value = null
  await nextTick()
  if (profileOpener?.isConnected) profileOpener.focus()
  profileOpener = null
}

async function decideQuotation(request, status) {
  if (decisionRequestId.value || request.status !== 'quoted') return
  if (status === 'accepted' && (!request.quotation?.startDate || request.quotation.startDate < calendarToday)) { errorMessage.value = 'Ask the contractor to propose an upcoming start date before accepting.'; return }
  const verb = status === 'accepted' ? 'accept' : 'decline'
  if (!confirm(`Are you sure you want to ${verb} this quotation? ${status === 'accepted' ? `You accept the price, scope and start date of ${formatDate(request.quotation.startDate)}. ` : ''}This decision cannot be changed here.`)) return
  decisionRequestId.value = getRequestId(request)
  errorMessage.value = ''
  try {
    await axios.patch(`${API}/quotation-requests/${encodeURIComponent(getRequestId(request))}/decision`, { status })
    request.status = status
  } catch (error) {
    const message = error.response?.data?.error || 'Unable to save your decision.'
    if (error.response?.status === 409) await getData()
    errorMessage.value = message
  } finally {
    decisionRequestId.value = ''
  }
}

function hasQuotation(request) {
  return ['quoted', 'accepted', 'declined'].includes(request.status) && Boolean(request.quotation)
}


// Quotation breakdown
const expandedQuotations = ref([])

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

const activeFilter = ref('total')
const receivedCount = computed(() => quotationRequests.value.filter(request => request.status === 'quoted' && request.quotation).length)
const acceptedCount = computed(() => quotationRequests.value.filter(request => request.status === 'accepted').length)
const quotationFilters = computed(() => [
  { key: 'total', label: 'Total', count: quotationRequests.value.length },
  { key: 'pending', label: 'Pending', count: pendingCount.value },
  { key: 'received', label: 'Received', count: receivedCount.value },
  { key: 'accepted', label: 'Accepted', count: acceptedCount.value },
  { key: 'rejected', label: 'Rejected', count: rejectedCount.value }
])
const filteredRequests = computed(() => quotationRequests.value.filter(request => {
  if (activeFilter.value === 'pending') return request.status === 'pending'
  if (activeFilter.value === 'received') return request.status === 'quoted' && Boolean(request.quotation)
  if (activeFilter.value === 'accepted') return request.status === 'accepted'
  if (activeFilter.value === 'rejected') return request.status === 'rejected'
  return true
}))
const activeFilterLabel = computed(() => quotationFilters.value.find(filter => filter.key === activeFilter.value)?.label || 'Total')

function canEditRequest(request) {
  return request.status === 'pending'
}

function getStatusClass(status) {
  switch (status) {
    case 'pending':
      return 'bg-warning-subtle text-warning-emphasis'

    case 'accepted':
      return 'bg-info-subtle text-info-emphasis'

    case 'declined':
    case 'withdrawn':
    case 'cancelled':
      return 'bg-secondary-subtle text-secondary-emphasis'

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
      return 'Accepted by You'

    case 'declined':
      return 'Declined by You'
    case 'withdrawn':
      return 'Withdrawn by Contractor'
    case 'cancelled':
      return 'Cancelled by You'
    case 'rejected':
      return 'Rejected by Contractor'

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

function getQuotationClarifications(request) {
  const warnings = getQuotationWarnings(request)
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)
  const notes = typeof request.quotation?.notes === 'string'
    ? request.quotation.notes.trim() : ''
  const unique = new Map()
  for (const point of [...warnings, ...(notes ? [notes] : [])]) {
    const key = point.replace(/\s+/g, ' ').toLowerCase()
    if (!unique.has(key)) unique.set(key, point)
  }
  return [...unique.values()]
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

  if (!confirm('Cancel this pending request? The contractor will see that you cancelled it, and it will remain in your history.')) {
    return
  }

  removingRequestId.value = requestId
  errorMessage.value = ''

  try {
    await axios.delete(
      `${API}/quotation-requests/${encodeURIComponent(requestId)}`
    )

    request.status = 'cancelled'

    expandedQuotations.value = expandedQuotations.value.filter(
      id => id !== requestId
    )

  } catch (error) {
    console.error(error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to cancel quotation request.'

    if (error.response?.status === 409) {
      const message = errorMessage.value
      await getData()
      errorMessage.value = message
    }

  } finally {
    removingRequestId.value = ''
  }
}

onMounted(() => {
  getData()
})

const animatedFilterStyle = computed(() => {
  const index = quotationFilters.value.findIndex(option => option.key === activeFilter.value)
  const colours = { total: '#475569', all: '#475569', pending: '#ad620c', received: '#168854', sent: '#168854', accepted: '#2563d9', rejected: '#bf3446' }
  return { '--pill-index': Math.max(0, index), '--pill-count': quotationFilters.value.length, '--pill-colour': colours[activeFilter.value] || colours.total }
})

// Accepted dates come from the agreed quotation, never the homeowner's preference.
const calendarToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const calendarDay = ref(calendarToday)
const calendarMonth = ref(calendarToday.slice(0, 7))
function calendarDate(value) { return new Date(value + 'T12:00:00') }
function calendarKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` }
const calendarTitle = computed(() => calendarDate(calendarMonth.value + '-01').toLocaleDateString('en-SG', { month: 'long', year: 'numeric' }))
const calendarCells = computed(() => {
  const first = calendarDate(calendarMonth.value + '-01')
  const offset = (first.getDay() + 6) % 7
  const count = new Date(first.getFullYear(), first.getMonth()+1, 0).getDate()
  return Array.from({ length: Math.ceil((offset + count)/7)*7 }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), i-offset+1, 12)
    const key = calendarKey(date)
    return { key, number: date.getDate(), current: key.startsWith(calendarMonth.value), count: calendarEvents.value.filter(event => event.date === key).length }
  })
})
const calendarSelectedEvents = computed(() => calendarEvents.value.filter(event => event.date === calendarDay.value))
const calendarUndated = computed(() => quotationRequests.value.filter(request => request.status === 'accepted' && !request.quotation?.startDate).length)
function moveCalendarMonth(step) {
  const date = calendarDate(calendarMonth.value + '-01')
  date.setMonth(date.getMonth() + step)
  calendarMonth.value = calendarKey(date).slice(0,7)
  calendarDay.value = calendarKey(date)
}
function resetCalendar() { calendarMonth.value = calendarToday.slice(0,7); calendarDay.value = calendarToday }
const calendarEvents = computed(() => quotationRequests.value.filter(request => request.status === 'accepted' && /^\d{4}-\d{2}-\d{2}$/.test(request.quotation?.startDate || '')).map(request => ({
  id: getRequestId(request), date: request.quotation.startDate,
  name: getContractor(request)?.companyName || 'Contractor', household: request.household?.name || 'Household', total: request.quotation.total
})))


async function openCalendarQuotation(event) {
  activeFilter.value = 'accepted'
  if (!expandedQuotations.value.includes(event.id)) expandedQuotations.value.push(event.id)
  await nextTick()
  const target = document.getElementById(`calendar-quotation-${event.id}`)
  if (!target) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

</script>

<template>
  <div class="my-quotations-page">

    <!-- HEADER -->
    <div class="mb-4">

      <p class="text-muted">
        Track your renovation quotation requests,
        view contractor portfolios and review quotation prices before deciding.
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

      <!-- SUMMARY FILTERS -->
      <div class="status-pill-scroll mb-4">
      <div class="quotation-filter-bar animated-filter-track" :style="animatedFilterStyle" role="group" aria-label="Filter quotation requests">
        <button v-for="filter in quotationFilters" :key="filter.key" type="button"
          class="quotation-filter" :class="['filter-' + filter.key, { 'is-active': activeFilter === filter.key }]"
          :aria-pressed="activeFilter === filter.key" @click="activeFilter = filter.key">
          <span>{{ filter.label }}</span><strong>{{ filter.count }}</strong>
        </button>
      </div>
      </div>

        <section class="renovation-calendar mb-4" aria-label="Accepted renovation calendar">
          <div class="rc-heading"><div><span class="rc-eyebrow">YOUR AGREED DATES</span><h3>Renovation calendar</h3><p>Accepted quotations only · start dates, not project durations</p></div><button type="button" class="rc-today" @click="resetCalendar">Today</button></div>
          <div class="rc-layout">
            <div class="rc-month"><div class="rc-navigation"><button type="button" aria-label="Previous month" @click="moveCalendarMonth(-1)">‹</button><strong aria-live="polite">{{ calendarTitle }}</strong><button type="button" aria-label="Next month" @click="moveCalendarMonth(1)">›</button></div>
              <div class="rc-weekdays"><span v-for="day in ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']" :key="day">{{ day }}</span></div>
              <Transition name="calendar-slide" mode="out-in"><div :key="calendarMonth" class="rc-grid"><button v-for="day in calendarCells" :key="day.key" type="button" class="rc-day" :class="{ selected: calendarDay === day.key, muted: !day.current, 'has-events': day.count > 0, today: day.key === calendarToday }" :aria-pressed="calendarDay === day.key" :aria-label="`${day.key}: ${day.count} renovation starts`" @click="calendarDay = day.key"><span>{{ day.number }}</span><small v-if="day.count" class="rc-event-badge">{{ day.count }}<span class="visually-hidden"> renovation starts</span><span aria-hidden="true"> booked</span></small></button></div></Transition>
              <p class="rc-legend"><span class="rc-legend-dot" aria-hidden="true"></span>Blue dates have accepted renovation starts</p>
            </div>
            <div class="rc-agenda"><span class="rc-eyebrow">RENOVATION STARTS</span><h4>{{ calendarDate(calendarDay).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</h4>
              <Transition name="calendar-slide" mode="out-in"><div :key="calendarDay" aria-live="polite"><button v-for="event in calendarSelectedEvents" :key="event.id" type="button" class="rc-event" @click="openCalendarQuotation(event)" :aria-label="`View quotation for ${event.name}, ${event.household}`"><span class="rc-confirmed">Accepted · agreed start</span><h5>{{ event.name }}</h5><p>{{ event.household }}</p><strong>{{ formatMoney(event.total) }}</strong><span class="rc-event-link">View quotation <span aria-hidden="true">↗</span></span></button><p v-if="!calendarSelectedEvents.length" class="rc-empty">No accepted renovations start on this day.</p></div></Transition>
              <p v-if="calendarUndated" class="small text-muted mt-3">{{ calendarUndated }} older accepted quotation(s) have no agreed date and cannot appear on this calendar.</p>
            </div>
          </div>
        </section>

      <!-- SECTION HEADER -->
      <div
        class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4"
      >



        <div>
          <h3 class="fw-bold mb-1">
            Quotation Requests
          </h3>

          <p class="text-muted mb-0">
            Showing {{ filteredRequests.length }} of {{ quotationRequests.length }} requests · {{ activeFilterLabel }}
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

      <div v-if="quotationRequests.length > 0 && filteredRequests.length === 0" class="filter-empty text-center py-5" role="status">
        <h4 class="h6 fw-bold">No {{ activeFilterLabel.toLowerCase() }} requests</h4>
        <p class="small text-muted">Try another filter to view your other requests.</p>
        <button type="button" class="btn btn-sm btn-outline-success" @click="activeFilter = 'total'">Show all requests</button>
      </div>

      <!-- QUOTATION REQUEST CARDS -->
      <div class="row g-4">

        <div
          v-for="request in filteredRequests"
          :key="getRequestId(request)"
          :id="`calendar-quotation-${getRequestId(request)}`" tabindex="-1"
          class="col-12 calendar-quotation-target"
        >

          <div
            class="card h-100 border-0 shadow-sm rounded-4 quotation-card"
          >

            <div class="card-body p-3 p-md-4">

              <div class="quote-card-heading">
                <div>
                  <span class="badge mb-2" :class="getStatusClass(request.status)">{{ getStatusText(request.status) }}</span>
                  <h4 class="h5 fw-bold mb-1">{{ getContractorName(request) }}</h4>
                  <p class="small text-muted mb-0">{{ getContractorLocation(request) }}</p>
                </div>
                <button v-if="getContractor(request)" type="button" class="portfolio-shortcut" aria-haspopup="dialog" :aria-label="`View portfolio and photos for ${getContractorName(request)}`" @click="openProfile(request, $event)">Portfolio &amp; photos ↗</button>
              </div>

              <div class="quote-facts">
                <div><span>Home</span><strong>{{ request.household?.flatType || 'Not specified' }}</strong></div>
                <div><span>Your budget</span><strong>{{ formatMoney(request.budget) }}</strong></div>
                <div><span>Preferred start</span><strong>{{ formatDate(request.preferredStartDate) }}</strong></div>
                <div><span>Requested</span><strong>{{ formatDate(request.createdAt) }}</strong></div>
              </div>

              <details class="scope-disclosure unified-disclosure">
                <summary><span class="expand-copy"><strong>Your request details</strong><small>Selected items, additional work and renovation notes</small></span><span class="expand-affordance"><span class="expand-word" aria-hidden="true"></span><svg class="expand-chevron" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
                <div class="scope-content">
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

              <section class="border rounded-3 p-3 mb-3">
                <h6 class="fw-bold">Items requested for quotation</h6>
                <ul v-if="request.selectedLayoutItems?.length" class="small mb-0">
                  <li v-for="item in request.selectedLayoutItems" :key="item.id">{{ item.room }} — {{ String(item.item).replace(/[_-]/g, ' ') }} × {{ item.quantity }}</li>
                </ul>
                <p v-else-if="request.scopeVersion === 1" class="small text-muted mb-0">No layout items selected. See additional work below.</p>
                <p v-else class="small text-muted mb-0">This older request has no explicit item selection. The homeowner must update it before a new AI draft can be generated.</p>
              </section>
              <div v-if="request.workDetails?.length" class="bg-light rounded-3 p-3 mb-3">
                <h6 class="fw-bold small">Additional renovation work</h6>
                <p v-for="work in request.workDetails" :key="work.service" class="small mb-2">
                  <strong>{{ work.service }}</strong> — {{ work.scope === 'whole' ? 'Whole flat' : work.scope === 'rooms' ? work.rooms.join(', ') : 'Contractor to assess' }}
                  <span v-if="work.quantity"> · {{ work.quantity }} {{ work.unit }}</span>
                  <span v-if="work.notes" class="d-block text-muted">{{ work.notes }}</span>
                </p>
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

                </div>
              </details>

              <!-- QUOTATION RECEIVED -->
              <div
                v-if="hasQuotation(request)"
                class="received-quote p-3 p-md-4 mt-3"
              >

                <div class="received-quote-heading mb-3">
                  <div><span class="quote-eyebrow">CONTRACTOR QUOTATION</span><h5 class="fw-bold mb-0">{{ formatMoney(request.quotation.total) }}</h5></div>
                  <span class="small text-muted">{{ request.quotation.items?.length || 0 }} line items</span>
                </div>

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

                <!-- Same disclosure row used throughout the page -->
                <button type="button" class="unified-expand-button mb-3"
                  :class="{ 'is-expanded': isBreakdownExpanded(request) }"
                  :aria-expanded="isBreakdownExpanded(request)"
                  :aria-controls="'quotation-breakdown-' + getRequestId(request)"
                  @click="toggleBreakdown(request)">
                  <span class="expand-copy"><strong>Quotation breakdown</strong><small>{{ getQuotationItems(request).length }} line items, prices and review notes</small></span>
                  <span class="expand-affordance"><span>{{ isBreakdownExpanded(request) ? 'Hide' : 'View' }}</span><svg class="expand-chevron" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span>
                </button>

                <!-- NEW: FULL QUOTATION BREAKDOWN -->
                <div
                  v-if="isBreakdownExpanded(request)"
                  class="quotation-breakdown bg-white rounded-3 p-3 mb-3"
                  :id="'quotation-breakdown-' + getRequestId(request)"
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
                    <details
                      v-if="item.source"
                      class="source-box unified-disclosure evidence-disclosure rounded-2"
                    >
                      <summary><span class="expand-copy"><strong>Price-list reference</strong></span><span class="expand-affordance"><span class="expand-word" aria-hidden="true"></span><svg class="expand-chevron" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>

                      <p class="small mb-0">
                        {{ item.source }}
                      </p>
                    </details>

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

                </div>

                <!-- One visible section for clarification flags and contractor conditions. -->
                <section v-if="getQuotationClarifications(request).length" class="clarification-panel mt-3 mb-2" aria-label="Clarifications and conditions">
                  <h6 class="fw-bold mb-2">Points to confirm with the contractor</h6>
                  <p class="small mb-2">The contractor may need to confirm these items or add prices manually. Contact them before accepting if scope or pricing is still unclear. After agreement, they should send a revised quotation with updated prices and conditions.</p>
                  <ul class="small mb-0 ps-3">
                    <li v-for="(point, index) in getQuotationClarifications(request)" :key="index" class="clarification-point">{{ point }}</li>
                  </ul>
                </section>



              </div>

              <div v-if="request.quotation && ['quoted','accepted'].includes(request.status)" class="alert alert-info mt-3"><strong>{{ request.status === 'accepted' ? 'Agreed' : 'Proposed' }} renovation start:</strong> {{ request.quotation.startDate ? formatDate(request.quotation.startDate) : 'Not set — ask the contractor to revise the quotation with a start date.' }}</div>
              <div v-if="request.status === 'quoted' && request.quotation" class="mt-3">
                <p class="small text-muted">Accepting confirms this quotation’s price, scope and proposed start date. Discuss any changes with the contractor before accepting.</p>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-success flex-fill" :disabled="Boolean(decisionRequestId) || !request.quotation.startDate || request.quotation.startDate < calendarToday" @click="decideQuotation(request, 'accepted')">Accept Quotation</button>
                  <button type="button" class="btn btn-outline-secondary flex-fill" :disabled="Boolean(decisionRequestId)" @click="decideQuotation(request, 'declined')">Decline</button>
                </div>
                <p v-if="decisionRequestId === getRequestId(request)" class="small text-muted mt-2" role="status">Saving your decision...</p>
              </div>
              <div v-if="request.status === 'withdrawn'" class="alert alert-secondary mt-3">The contractor withdrew the previous offer. They need to reopen this request to prepare a replacement; do not accept the old quotation.</div>
              <div v-if="request.status === 'accepted'" class="alert alert-success mt-3 mb-0">You accepted this quotation. Contact the contractor to arrange the next steps.</div>
              <div v-if="request.status === 'declined'" class="alert alert-secondary mt-3 mb-0">You declined this quotation. It remains here for your records.</div>
              <div v-if="request.status === 'cancelled'" class="alert alert-secondary mt-3 mb-0">You cancelled this request. The contractor can no longer respond.</div>

              <!-- REJECTED -->
              <div
                v-if="request.status === 'rejected'"
                class="alert alert-danger mt-4 mb-0"
              >
                This contractor has rejected your quotation request.
              </div>

              <p v-if="request.status === 'pending' && request.lastWithdrawnAt" class="alert alert-info small mt-3">The contractor withdrew the previous quotation and is preparing an updated offer. This request is Pending again.</p>
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
                      ? 'Cancelling...'
                      : 'Cancel Request'
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

    <Teleport to="body">
      <ContractorProfile
        v-if="profileContractor"
        :key="getId(profileContractor._id)"
        :contractor="profileContractor"
        @close="closeProfile"
      />
    </Teleport>
  </div>
</template>

<style scoped>

/* Booked dates stay distinct from the currently selected day. */
.rc-day.has-events:not(.selected){background:linear-gradient(140deg,#edf3ff,#dce9ff);color:#244b92;box-shadow:inset 0 0 0 1px #b8cff3,0 3px 8px #244b9210;font-weight:800}
.rc-day.has-events:not(.selected):hover{background:#d1e2ff;box-shadow:inset 0 0 0 1px #86ade6,0 5px 12px #244b9220}
.rc-day.has-events.today:not(.selected){box-shadow:inset 0 0 0 2px #20a66a}
.rc-day .rc-event-badge{display:table;margin:3px auto 0;padding:2px 7px;border-radius:20px;background:#315da5;color:white;font-size:.58rem;line-height:1.25;letter-spacing:.01em;font-weight:800;white-space:nowrap}
.rc-day.selected .rc-event-badge{background:#ffffffed;color:#147547}
.rc-legend{display:flex;align-items:center;gap:7px;font-size:.73rem;color:#617487;margin:12px 0 0}.rc-legend-dot{height:9px;width:9px;border-radius:50%;background:#4471b5;box-shadow:0 0 0 3px #e1ebfd;margin:0 3px}
button.rc-event{display:block;width:100%;text-align:left;color:inherit;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s}
button.rc-event:hover{transform:translateY(-3px);border-color:#6bb891;box-shadow:0 8px 20px #1a70451a}
button.rc-event:focus-visible{outline:3px solid #75b99a;outline-offset:3px}.rc-event-link{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:10px;border-top:1px solid #e4eee8;color:#168453;font-size:.8rem;font-weight:750}
.calendar-quotation-target{scroll-margin-top:110px}.calendar-quotation-target:focus{outline:3px solid #77bc98;outline-offset:5px}
@media(prefers-reduced-motion:reduce){button.rc-event{transition:none}button.rc-event:hover{transform:none}}


.renovation-calendar{border:1px solid #d7e7df;border-radius:26px;padding:24px;background:linear-gradient(135deg,#fff,#f3faf6);margin-top:24px;color:#203d30}
.rc-heading,.rc-navigation{display:flex;align-items:center;justify-content:space-between;gap:16px}.rc-heading h3{font-size:1.3rem;font-weight:750;margin:5px 0}.rc-heading p,.rc-agenda p{color:#67796f;font-size:.9rem}.rc-eyebrow{font-size:.68rem;letter-spacing:.13em;font-weight:800;color:#38805a}.rc-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:28px;margin-top:20px}.rc-navigation{margin-bottom:16px}.rc-navigation button,.rc-today{border:1px solid #d3e5d9;border-radius:24px;background:white;color:#197348;padding:7px 16px;transition:background .2s,transform .2s}.rc-navigation button:hover,.rc-today:hover{background:#e3f4e9;transform:translateY(-2px)}.rc-weekdays,.rc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.rc-weekdays{text-align:center;font-size:.72rem;color:#78887e;margin-bottom:8px}.rc-day{position:relative;border:0;border-radius:16px;min-height:48px;background:transparent;color:#284c39;transition:background .25s,box-shadow .25s,transform .25s;color-scheme:light}.rc-day:hover{background:#e4f4e9;transform:translateY(-2px)}.rc-day.selected{background:linear-gradient(120deg,#168553,#27bc70);color:white;box-shadow:0 5px 12px #18865330;transform:translateY(-2px)}.rc-day.muted:not(.selected){color:#adbab2}.rc-day.today:not(.selected){box-shadow:inset 0 0 0 1px #24a76a}.rc-day small{display:block;font-size:.6rem;font-weight:800}.rc-agenda{border-left:1px solid #dce9e0;padding-left:26px}.rc-agenda h4{font-size:1.05rem;font-weight:700;margin:10px 0 20px}.rc-event{padding:16px;background:white;border:1px solid #d8e9df;border-left:4px solid #23a86a;border-radius:16px;margin-bottom:12px}.rc-event h5{font-size:1rem;font-weight:750;margin:10px 0 5px}.rc-event p{margin-bottom:8px}.rc-confirmed{font-size:.7rem;color:#147c4e;font-weight:750}.rc-empty{padding:24px 12px;border:1px dashed #cbded2;border-radius:16px}.calendar-slide-enter-active,.calendar-slide-leave-active{transition:opacity .16s ease,transform .16s ease}.calendar-slide-enter-from{opacity:0;transform:translateX(10px)}.calendar-slide-leave-to{opacity:0;transform:translateX(-10px)}.rc-day:focus-visible,.rc-navigation button:focus-visible,.rc-today:focus-visible{outline:3px solid #75b99a;outline-offset:3px}
@media(max-width:650px){.rc-layout{grid-template-columns:1fr}.rc-agenda{border-left:0;border-top:1px solid #dce9e0;padding:20px 0 0}.renovation-calendar{padding:16px}.rc-day{min-height:42px}}
@media(prefers-reduced-motion:reduce){.calendar-slide-enter-active,.calendar-slide-leave-active,.rc-day,.rc-navigation button,.rc-today{transition:none!important;transform:none!important}}

.portfolio-button { display:flex; align-items:center; gap:12px; width:100%; padding:14px; border:1px solid #d5e9dc; border-radius:14px; background:linear-gradient(135deg,#f0faf4,#fafdfb); color:#146c43; text-align:left; cursor:pointer; }
.portfolio-button:hover { background:#e9f6ee; border-color:#198754; }
.portfolio-button:focus-visible { outline:3px solid #198754; outline-offset:3px; }
.portfolio-icon { display:grid; place-items:center; flex-shrink:0; width:42px; height:42px; border-radius:12px; background:white; font-size:24px; }
.portfolio-copy { display:flex; flex:1; flex-direction:column; gap:3px; }
.portfolio-copy strong { font-size:.86rem; }
.portfolio-copy small { color:#62796b; font-size:.74rem; }

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

/* Homeowner quotation list */
.my-quotations-page .quotation-card { border:1px solid #e0e8e3 !important; box-shadow:0 3px 14px rgba(21,55,39,.035) !important; }
.my-quotations-page .quotation-card:hover { transform:none; box-shadow:0 3px 14px rgba(21,55,39,.035) !important; }
.quote-card-heading { display:flex; justify-content:space-between; align-items:center; gap:18px; margin-bottom:18px; }
.portfolio-shortcut { background:white; border:1px solid #d8e5dc; border-radius:10px; padding:9px 13px; font-size:.8rem; font-weight:600; color:#167344; white-space:nowrap; }
.portfolio-shortcut:hover { background:#f1f8f4; }
.portfolio-shortcut:focus-visible { outline:3px solid #198754; outline-offset:3px; }
.quote-facts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; padding:16px 18px; margin-bottom:16px; border-radius:12px; background:#f6f9f7; }
.quote-facts > div { display:flex; flex-direction:column; gap:5px; min-width:0; }
.quote-facts span { color:#6b7c72; font-size:.73rem; }
.quote-facts strong { font-size:.86rem; overflow-wrap:anywhere; }
.scope-disclosure{ border:1px solid #dfe8e2; border-radius:12px; background:white; }
.scope-disclosure > summary{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:15px 18px; cursor:pointer; list-style:none; }
.scope-disclosure > summary::-webkit-details-marker{ display:none; }
.scope-disclosure > summary > span:first-child{ display:flex; flex-direction:column; gap:4px; }
.scope-disclosure summary strong{ font-size:.9rem; }
.scope-disclosure summary small{ font-size:.76rem; color:#6b7c72; }
.scope-disclosure > summary:focus-visible{ outline:3px solid #198754; outline-offset:3px; border-radius:12px; }
.scope-content { border-top:1px solid #e6ede8; padding:18px; }
.quote-chevron { color:#648170; font-size:1.2rem; }
.scope-disclosure[open] > summary .quote-chevron { transform:rotate(180deg); }

.received-quote { background:#f0f8f3; border:1px solid #d4e8da; border-radius:12px; }
.received-quote-heading { display:flex; align-items:center; justify-content:space-between; gap:15px; }
.received-quote-heading h5 { font-size:1.6rem; color:#146c43; }
.quote-eyebrow { display:block; font-size:.65rem; letter-spacing:.08em; font-weight:700; color:#41805b; margin-bottom:5px; }
.my-quotations-page .card-footer { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:10px; border-radius:0 0 16px 16px; }
.my-quotations-page .card-footer > .w-100 { width:auto !important; }
.my-quotations-page .card-footer > .d-flex { margin-bottom:0 !important; }
.my-quotations-page 
@media(max-width:767px) { .quote-facts { grid-template-columns:repeat(2,minmax(0,1fr)); padding:14px; } .quote-card-heading { align-items:flex-start; flex-wrap:wrap; } .scope-content { padding:14px; } .my-quotations-page .card-footer { justify-content:flex-start; } }
@media(max-width:420px) {  .my-quotations-page .card-footer > .d-flex { width:100%; flex-wrap:wrap; } }


.quotation-filter-bar { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; padding:6px; border:1px solid #e0e8e3; border-radius:14px; background:#f3f6f4; }
.quotation-filter { display:flex; align-items:center; justify-content:center; gap:10px; padding:14px 10px; border:1px solid transparent; border-radius:10px; background:transparent; color:#617167; font-size:.88rem; font-weight:600; }
.quotation-filter strong { display:inline-flex; align-items:center; justify-content:center; min-width:25px; padding:3px 7px; border-radius:7px; background:#e6ece8; font-size:.75rem; }
.quotation-filter:hover { background:#e9f0eb; color:#166c43; }
.quotation-filter.is-active { background:white; border-color:#dce6df; color:#146c43; box-shadow:0 2px 5px rgba(20,70,42,.06); }
.quotation-filter.is-active strong { background:#def0e4; }
.quotation-filter:focus-visible { outline:3px solid #198754; outline-offset:2px; }
@media(max-width:480px) { .quotation-filter-bar { grid-template-columns:repeat(2,minmax(0,1fr)); } .quotation-filter { padding:12px 8px; } }

/* Status colour accents; text labels and pressed state also identify each filter. */
.quotation-filter-bar { background:#f7f9f8; gap:8px; padding:8px; }
.quotation-filter { --filter-ink:#475569; --filter-soft:#edf1f5; --filter-line:#cbd5e1; position:relative; padding:15px 12px; color:var(--filter-ink); background:#fff; border-color:#e5ebe7; transition:background .16s ease,border-color .16s ease,box-shadow .16s ease; }
.quotation-filter::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--filter-ink); flex-shrink:0; }
.quotation-filter.filter-pending { --filter-ink:#92400e; --filter-soft:#fff5da; --filter-line:#e9bc58; }
.quotation-filter.filter-received { --filter-ink:#146c43; --filter-soft:#eaf6ee; --filter-line:#81b99a; }
.quotation-filter.filter-rejected { --filter-ink:#b42332; --filter-soft:#fff0f1; --filter-line:#e8a2aa; }
.quotation-filter strong { background:var(--filter-soft); color:var(--filter-ink); min-width:28px; padding:4px 8px; border-radius:8px; }
.quotation-filter:hover { color:var(--filter-ink); background:var(--filter-soft); border-color:var(--filter-line); }
.quotation-filter.is-active { color:var(--filter-ink); background:var(--filter-soft); border-color:var(--filter-line); box-shadow:inset 0 -3px 0 var(--filter-ink),0 2px 6px rgba(20,40,30,.04); }
.quotation-filter.is-active strong { color:#fff; background:var(--filter-ink); }
.quotation-filter:focus-visible { outline:3px solid var(--filter-ink); outline-offset:3px; }
@media(prefers-reduced-motion:reduce) { .quotation-filter { transition:none; } }


/* Consistent request detail, breakdown and evidence controls. */
.my-quotations-page .unified-disclosure { border:1px solid #cadfd1 !important; border-radius:12px; overflow:hidden; }
.my-quotations-page .unified-disclosure > summary,
.my-quotations-page .unified-expand-button { display:flex; align-items:center; justify-content:space-between; flex-wrap:nowrap; gap:16px; width:100%; margin:0; padding:16px 18px; border:0; border-radius:11px; background:#f0f7f3; color:#194f35; text-align:left; cursor:pointer; list-style:none; font:inherit; }
.my-quotations-page .unified-expand-button { border:1px solid #cadfd1; }
.my-quotations-page .unified-disclosure > summary::-webkit-details-marker { display:none; }
.my-quotations-page .unified-disclosure > summary::marker { content:''; }
.my-quotations-page .unified-disclosure > summary:hover,
.my-quotations-page .unified-expand-button:hover { background:#e3f0e8; }
.my-quotations-page .unified-disclosure > summary:focus-visible,
.my-quotations-page .unified-expand-button:focus-visible { outline:3px solid #198754; outline-offset:-3px; }
.my-quotations-page .expand-copy { display:flex; flex:1; flex-direction:column; gap:4px; min-width:0; }
.my-quotations-page .expand-copy strong { font-size:.88rem; font-weight:650; }
.my-quotations-page .expand-copy small { font-size:.75rem; color:#61776a; }
.my-quotations-page .expand-affordance { display:inline-flex; flex-direction:row; align-items:center; gap:8px; flex-shrink:0; padding:6px 10px; border:1px solid #c6dccd; border-radius:8px; background:#fff; color:#146c43; font-size:.75rem; font-weight:650; }
.my-quotations-page .expand-word::before { content:'View'; }
.my-quotations-page .unified-disclosure[open] > summary .expand-word::before { content:'Hide'; }
.my-quotations-page .expand-chevron { display:block; flex-shrink:0; transition:transform .15s ease; }
.my-quotations-page .unified-disclosure[open] > summary .expand-chevron,
.my-quotations-page .unified-expand-button.is-expanded .expand-chevron { transform:rotate(180deg); }

.my-quotations-page .evidence-disclosure > p { padding:12px 16px; border-top:1px solid #dce8df; }
.my-quotations-page .evidence-disclosure > summary { padding:12px 14px; }
@media(max-width:480px) { .my-quotations-page .unified-disclosure > summary, .my-quotations-page .unified-expand-button { padding:13px; gap:10px; } .my-quotations-page .expand-affordance { padding:5px 7px; } }
@media(prefers-reduced-motion:reduce) { .my-quotations-page .expand-chevron { transition:none; } }


.quotation-filter-bar { grid-template-columns:repeat(5,minmax(0,1fr)); }
.quotation-filter.filter-accepted { --filter-ink:#1d4ed8; --filter-soft:#eff6ff; --filter-line:#93b4ed; }
@media(max-width:700px) { .quotation-filter-bar { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media(max-width:480px) { .quotation-filter-bar { grid-template-columns:repeat(2,minmax(0,1fr)); } }

/* Animated status pills: one sliding highlight, with a colour for each status. */
.status-pill-scroll { width:100%; overflow-x:auto; padding:4px 3px 9px; scrollbar-width:thin; -webkit-overflow-scrolling:touch; }
.quotation-filter-bar.animated-filter-track { position:relative; isolation:isolate; display:grid; grid-template-columns:repeat(var(--pill-count,5),minmax(0,1fr)); gap:0; width:100%; min-width:560px; margin:0; padding:6px; border:1px solid #dce7df; border-radius:999px; background:#fff; box-shadow:0 5px 16px rgba(28,65,43,.055); }
.quotation-filter-bar.animated-filter-track::before { content:''; position:absolute; z-index:0; top:6px; bottom:6px; left:6px; width:calc((100% - 12px) / var(--pill-count,5)); border-radius:999px; background-color:var(--pill-colour); background-image:linear-gradient(110deg,rgba(255,255,255,.09),rgba(0,0,0,.06)); box-shadow:0 4px 10px rgba(25,50,35,.17); transform:translateX(calc(var(--pill-index,0) * 100%)); transition:transform .34s cubic-bezier(.22,.8,.25,1),background-color .28s ease; pointer-events:none; }
.animated-filter-track .quotation-filter { position:relative; z-index:1; display:flex; align-items:center; justify-content:center; gap:9px; min-height:52px; padding:12px 10px; border:0; border-radius:999px; background:transparent; box-shadow:none; color:#5b6c61; white-space:nowrap; font-size:.88rem; font-weight:650; transition:color .18s ease; }
.animated-filter-track .quotation-filter::before { width:6px; height:6px; background:currentColor; opacity:.8; }
.animated-filter-track .quotation-filter:hover { background:transparent; color:var(--filter-ink,#146c43); box-shadow:none; }
.animated-filter-track .quotation-filter.is-active,.animated-filter-track .quotation-filter.is-active:hover { background:transparent; border:0; color:#fff; box-shadow:none; }
.animated-filter-track .quotation-filter strong { min-width:25px; padding:3px 7px; border-radius:999px; background:#eef3f0; color:inherit; font-size:.73rem; }
.animated-filter-track .quotation-filter.is-active strong { background:rgba(255,255,255,.23); color:white; }
.animated-filter-track .quotation-filter:focus-visible { outline:3px solid #153c2a; outline-offset:-3px; }
@media(max-width:600px) { .quotation-filter-bar.animated-filter-track { min-width:530px; } .animated-filter-track .quotation-filter { min-height:48px; font-size:.81rem; gap:7px; } }
@media(prefers-reduced-motion:reduce) { .quotation-filter-bar.animated-filter-track::before,.animated-filter-track .quotation-filter { transition:none; } }


.clarification-panel { padding:17px 18px; background:#fff6dd; border:1px solid #eed491; border-left:4px solid #c18a20; border-radius:12px; color:#705018; }
.clarification-point { margin-top:8px; white-space:pre-wrap; overflow-wrap:anywhere; }
</style>