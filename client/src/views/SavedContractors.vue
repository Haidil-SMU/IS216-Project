<script setup>
import { ref,computed } from 'vue'
import axios from 'axios'
import workheads from '@/data/workheads.json'

// Load saved contractors from localStorage
const savedContractors = ref(JSON.parse(localStorage.getItem('savedContractors') || '[]'))

// Load saved quotations from localStorage
const quotations = ref(JSON.parse(localStorage.getItem('contractorQuotations') || '{}'))

// Load quotation descriptions from localStorage
const descriptions = ref(JSON.parse(localStorage.getItem('quotationDescriptions') || '{}'))

const requiredServices = computed(() => {
    const services = new Set();

    savedContractors.value.forEach(contractor => {
        contractor.registrations.forEach(registration => {
            const price =
                quotations.value[contractor.uen_no]?.[registration.workhead];

            if (price !== '' && price !== null && price !== undefined) {
                services.add(
                    workheads[registration.workhead] || registration.workhead
                );
            }
        });
    });

    return [...services];
});

for (const contractor of savedContractors.value) {
  if (!quotations.value[contractor.uen_no]) {
    quotations.value[contractor.uen_no] = {}
  }

  if (!descriptions.value[contractor.uen_no]) {
    descriptions.value[contractor.uen_no] = ''
  }
}

// AI results
const aiAnalysis = ref('')
const aiLoading = ref(false)
const aiError = ref('')

// Remove a saved contractor
function removeContractor(uen) {
  savedContractors.value = savedContractors.value.filter(c => c.uen_no !== uen)
  localStorage.setItem('savedContractors', JSON.stringify(savedContractors.value))
}

// Save quotations
function saveQuotations() {
  localStorage.setItem('contractorQuotations', JSON.stringify(quotations.value))
  localStorage.setItem('quotationDescriptions', JSON.stringify(descriptions.value))
}

// Calculate total quotation for a contractor
function getTotal(uen) {
  let total = 0

  for (const price of Object.values(quotations.value[uen] || {})) {
    total += Number(price) || 0
  }

  return total
}

// Analyze quotations using Gemini AI
async function analyzeQuotations() {
  aiLoading.value = true
  aiError.value = ''
  aiAnalysis.value = ''

  saveQuotations()

  try {
    const contractors = savedContractors.value.map(contractor => ({
      company_name: contractor.company_name,
      uen_no: contractor.uen_no,
      services: contractor.registrations.map(registration => ({
        workhead: registration.workhead,
        service: workheads[registration.workhead] || registration.workhead,
        price: quotations.value[contractor.uen_no][registration.workhead] || null
      })),
      total: getTotal(contractor.uen_no),
      description: descriptions.value[contractor.uen_no]
    }))

    const response = await axios.post(
      'http://127.0.0.1:8000/api/analyze-quotations',
      { contractors }
    )

    aiAnalysis.value = response.data.analysis

  } catch (error) {
    aiError.value = error.response?.data?.error || error.message
  } finally {
    aiLoading.value = false
  }
}
</script>

<template>
  <div class="container py-5">

    <!-- PAGE HEADER -->
    <div class="mb-5">
      <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-3">HDB EcoHome Services</span>

      <h1 class="fw-bold mb-3">
        Your <span class="text-success">Saved Contractors</span>
      </h1>

      <p class="text-muted fs-5">
        View and manage your shortlisted renovation contractors.
      </p>

      <RouterLink to="/Contractors" class="btn btn-outline-success px-4 py-2 fw-semibold">
        ← Find More Contractors
      </RouterLink>
    </div>

    <!-- SAVED COUNT -->
    <div class="mb-4">
      <h3 class="fw-bold mb-2">Your Shortlist</h3>
      <p class="text-muted">{{ savedContractors.length }} contractor(s) saved</p>
    </div>

    <!-- NO SAVED CONTRACTORS -->
    <div v-if="savedContractors.length === 0" class="card border-0 shadow-sm rounded-4">
      <div class="card-body text-center p-5">
        <h5 class="fw-bold mb-3">No Saved Contractors Yet</h5>
        <p class="text-muted">Start exploring renovation contractors and save the ones you're interested in.</p>
        <RouterLink to="/Contractors" class="btn btn-success px-4 py-2 fw-semibold">Find Contractors →</RouterLink>
      </div>
    </div>

    <!-- CONTRACTOR CARDS -->
    <div v-else class="row g-4">

      <div v-for="contractor in savedContractors" :key="contractor.uen_no" class="col-md-6 col-lg-4">

        <div class="card h-100 border-0 shadow-sm rounded-4 contractor-card">

          <div class="card-body p-4">

            <!-- COMPANY NAME -->
            <div class="mb-3">
              <span class="badge bg-success-subtle text-success-emphasis mb-3">
                {{ contractor.registrations.length }} Registered Service(s)
              </span>

              <h5 class="fw-bold mb-2">{{ contractor.company_name }}</h5>
              <p class="small text-muted mb-0">UEN: {{ contractor.uen_no }}</p>
            </div>

            <hr class="text-muted" />

            <!-- RENOVATION SERVICES -->
            <div class="mb-3">
              <p class="small text-muted mb-2">Renovation Services</p>

              <div v-for="registration in contractor.registrations" :key="registration.workhead" class="mb-2">
                <span class="badge bg-success-subtle text-success-emphasis me-2">{{ registration.workhead }}</span>
                <span class="fw-semibold">{{ workheads[registration.workhead] || registration.workhead }}</span>
              </div>
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

              <div v-for="registration in contractor.registrations" :key="registration.workhead" class="mb-2">

                <p class="fw-semibold small mb-1">{{ registration.workhead }}</p>

                <div class="d-flex justify-content-between">
                  <span class="text-muted small">Registration Grade</span>
                  <span class="fw-semibold small">{{ registration.grade }}</span>
                </div>

                <div class="d-flex justify-content-between">
                  <span class="text-muted small">Expiry Date</span>
                  <span class="fw-semibold small">{{ registration.expiry_date }}</span>
                </div>

              </div>

            </div>

            <!-- QUOTATIONS -->
            <div class="mt-4">

              <h6 class="fw-bold mb-2">Contractor Quotations</h6>

              <p class="small text-muted">
                Enter the quotation received for each service. Leave blank if not applicable.
              </p>

              <div v-for="registration in contractor.registrations" :key="registration.workhead" class="mb-3">

                <label class="form-label small fw-semibold">
                  {{ workheads[registration.workhead] || registration.workhead }}
                </label>

                <div class="input-group">
                  <span class="input-group-text">S$</span>

                  <input
                    type="number"
                    min="0"
                    class="form-control"
                    placeholder="Enter quotation"
                    v-model.number="quotations[contractor.uen_no][registration.workhead]"
                  />
                </div>

              </div>

              <!-- QUOTATION DESCRIPTION -->
              <div class="mb-3">
                <label class="form-label small fw-semibold">Quotation Details (Optional)</label>

                <textarea
                  class="form-control"
                  rows="4"
                  placeholder="E.g. Includes installation and 1-year warranty. Electrical wiring excluded. Additional piping costs $20/metre."
                  v-model="descriptions[contractor.uen_no]"
                ></textarea>

                <p class="small text-muted mt-1">
                  Add inclusions, exclusions, warranties, materials or additional charges for AI analysis.
                </p>
              </div>

              <!-- SAVE BUTTON -->
              <button class="btn btn-success w-100 fw-semibold mb-3" @click="saveQuotations">
                Save Quotations
              </button>

              <!-- DISPLAY QUOTATIONS -->
              <div class="bg-success-subtle rounded-3 p-3">

                <p class="fw-bold small mb-2">Saved Quotation Summary</p>

                <div v-for="registration in contractor.registrations" :key="registration.workhead">

                  <div
                    v-if="quotations[contractor.uen_no][registration.workhead] > 0"
                    class="d-flex justify-content-between mb-2"
                  >
                    <span class="small">{{ registration.workhead }}</span>

                    <span class="small fw-semibold">
                      S${{ Number(quotations[contractor.uen_no][registration.workhead]).toLocaleString() }}
                    </span>
                  </div>

                </div>

                <hr />

                <div class="d-flex justify-content-between">
                  <span class="fw-bold">Total Quotation</span>
                  <span class="fw-bold text-success">
                    S${{ getTotal(contractor.uen_no).toLocaleString() }}
                  </span>
                </div>

              </div>

            </div>

          </div>

          <!-- CARD FOOTER -->
          <div class="card-footer bg-white border-0 px-4 pb-4">
            <div class="d-flex gap-2">

              <button class="btn btn-outline-danger flex-fill fw-semibold" @click="removeContractor(contractor.uen_no)">
                Remove
              </button>

              <a
                v-if="contractor.tel_no && !['na', 'n/a'].includes(String(contractor.tel_no).toLowerCase())"
                :href="'tel:' + contractor.tel_no"
                class="btn btn-outline-success flex-fill fw-semibold"
              >Contact →</a>

              <button v-else class="btn btn-outline-secondary flex-fill" disabled>Contact Unavailable</button>

            </div>
          </div>

        </div>

      </div>

    </div>

    <!-- AI QUOTATION ANALYSIS -->
    <div v-if="savedContractors.length > 0" class="card border-0 shadow-sm rounded-4 mt-5">

      <div class="card-body p-4 p-md-5">

        <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3 py-2 mb-3">
          AI-Powered Analysis
        </span>

        <h3 class="fw-bold mb-2">
          Compare Your <span class="text-success">Contractor Quotations</span>
        </h3>

        <p class="text-muted mb-4">
          Let Gemini AI compare your shortlisted contractors, identify potential hidden costs,
          and highlight important differences between quotations.
        </p>

        <button class="btn btn-success px-4 py-2 fw-semibold" :disabled="aiLoading" @click="analyzeQuotations">
          {{ aiLoading ? 'Analyzing Quotations...' : 'Analyze Quotations with AI →' }}
        </button>

        <!-- LOADING -->
        <div v-if="aiLoading" class="mt-4">
          <div class="spinner-border text-success" role="status"></div>
          <p class="text-muted mt-2">Gemini is analyzing your quotations...</p>
        </div>

        <!-- ERROR -->
        <div v-if="aiError" class="alert alert-danger mt-4">
          {{ aiError }}
        </div>

        <!-- AI RESULTS -->
       <div v-if="aiAnalysis" class="mt-4">

    <h4>🤖 AI Quotation Analysis</h4>

    <!-- Recommendation -->
    <h5 class="mt-4">⭐ AI Recommendation</h5>
    <p>{{ aiAnalysis.recommendation }}</p>

    <!-- Reasons -->
    <h5 class="mt-4">💡 Reasons</h5>
    <ul>
        <li
            v-for="(reason, index) in aiAnalysis.reasons"
            :key="index"
        >
            {{ reason }}
        </li>
    </ul>

    <!-- Required Services -->
    <h5 class="mt-4">🛠️ Required Services</h5>

    <p>{{ requiredServices.join(' • ') }}</p>

</div>

      </div>

    </div>

    <!-- DISCLAIMER -->
    <div v-if="savedContractors.length > 0" class="mt-5 p-3 bg-light rounded-3">
      <p class="small text-muted mb-0">
        <strong>Note:</strong> Contractor information is sourced from data.gov.sg.
        Please verify current registration and HDB renovation requirements
        before engaging a contractor.
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

.ai-result {
  white-space: pre-wrap;
  line-height: 1.8;
}
</style>