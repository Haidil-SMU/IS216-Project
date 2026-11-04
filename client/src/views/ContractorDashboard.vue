<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import FloorPlan3D from '@/components/FloorPlan3D.vue'
import {
  getItemAmount,
  getDraftTotal,
  hasMissingPrices
} from '@/utils/quotationCalculations'
const API = '/api'
const auth = useAuthStore()

const activeTab = ref('requests')
const requests = ref([])
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

const requestSearch = ref('')
const statusFilter = ref('all')
const dateSort = ref('newest')

const latestPriceList = ref(null)
const priceListLoaded = ref(false)
const priceListLoading = ref(false)
const priceListError = ref('')
const priceListNotice = ref('')
const pdfFile = ref(null)
const uploading = ref(false)
const fileInputKey = ref(0)
const showPriceList = ref(false)
const showUpload = ref(false)

const uploadHighlighted = ref(false)

const portfolio = ref([])
const maxProjects = ref(10)
const portfolioLoading = ref(false)
const portfolioError = ref('')
const newProjectName = ref('')
const creatingProject = ref(false)
const showNewProject = ref(false) // the popup that asks for a new collection's name
const newProjectField = ref(null)
const newProjectButton = ref(null)
const nameShake = ref(false)
const nameError = ref('') // shown in a banner under the name field
const photoInput = ref(null)
let photoTarget = null // the project whose Add Photos button was pressed
const projectToDelete = ref(null) // the project the delete popup is asking about
const deleteConfirmButton = ref(null)
let deleteOpener = null

const temporaryMessage = ref('')
let uploadHighlightTimer
let messageTimer

const profileFields = [
  {
    key: 'companyName',
    label: 'Company name',
    maxlength: 100,
    placeholder: 'e.g. Sarah Home Solutions',
    type: 'text'
  },
  {
    key: 'location',
    label: 'Location / service area',
    maxlength: 60,
    placeholder: 'e.g. Woodlands',
    type: 'text'
  },
  {
    key: 'contactNumber',
    label: 'Contact number',
    maxlength: 20,
    placeholder: 'e.g. 61234567',
    type: 'tel'
  }
]

const generatingAny = computed(() =>
  requests.value.some(request => request.generating)
)

const dashboardBusy = computed(() =>
  uploading.value ||
  generatingAny.value ||
  Boolean(savingId.value) ||
  savingProfile.value ||
  priceListLoading.value
)

function normalizeId(value) {
  return value ? String(value.$oid || value) : ''
}

function getId(item) {
  return normalizeId(item?._id)
}

function getCurrentContractorId() {
  return getId(profile.value)
}

const myRequests = computed(() =>
  requests.value.filter(request =>
    normalizeId(request.contractorId) === getCurrentContractorId()
  )
)

function isSent(request) {
  return ['quoted', 'accepted', 'declined'].includes(request.status)
}

const pendingCount = computed(() =>
  myRequests.value.filter(request => request.status === 'pending').length
)

const sentCount = computed(() =>
  myRequests.value.filter(request => request.status === 'quoted').length
)

const acceptedRequestCount = computed(() => myRequests.value.filter(request => request.status === 'accepted').length)
const rejectedRequestCount = computed(() => myRequests.value.filter(request => request.status === 'rejected').length)
const requestFilterOptions = computed(() => [
  { key: 'all', label: 'Total', count: myRequests.value.length, colour: 'total' },
  { key: 'pending', label: 'Pending', count: pendingCount.value, colour: 'pending' },
  { key: 'sent', label: 'Sent', count: sentCount.value, colour: 'received' },
  { key: 'accepted', label: 'Accepted', count: acceptedRequestCount.value, colour: 'accepted' },
  { key: 'rejected', label: 'Rejected', count: rejectedRequestCount.value, colour: 'rejected' }
])

function requestedTimestamp(request) {
  if (!request.createdAt) return null
  const timestamp = new Date(request.createdAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

const visibleRequests = computed(() => {
  const query = requestSearch.value.trim().toLowerCase()

  return myRequests.value
    .filter(request => {
      if (statusFilter.value === 'pending' && request.status !== 'pending') {
        return false
      }
      if (statusFilter.value === 'sent' && request.status !== 'quoted') {
        return false
      }
      if (statusFilter.value === 'accepted' && request.status !== 'accepted') return false
      if (statusFilter.value === 'rejected' && request.status !== 'rejected') return false
      if (!query) return true

      const searchable = [
        request.contact?.name,
        request.contact?.phone,
        request.contact?.email,
        request.household?.name,
        request.household?.flatType,
        request.description,
        ...(request.services || []),
        statusLabel(request.status)
      ].join(' ').toLowerCase()

      return searchable.includes(query)
    })
    .sort((a, b) => {
      const first = requestedTimestamp(a)
      const second = requestedTimestamp(b)

      if (first === null && second === null) return 0
      if (first === null) return 1
      if (second === null) return -1

      return dateSort.value === 'oldest'
        ? first - second
        : second - first
    })
})

function resetFilters() {
  requestSearch.value = ''
  statusFilter.value = 'all'
  dateSort.value = 'newest'
}

// PRICE LIST DISPLAY

const savedPriceListText = computed(() =>
  typeof latestPriceList.value?.extractedText === 'string'
    ? latestPriceList.value.extractedText
    : ''
)


function flatTypeLabel(value) {
  return { '2-room': '2-room HDB', '3-room': '3-room HDB', '4-room': '4-room HDB', '5-room': '5-room HDB', executive: 'Executive HDB' }[value] || value || 'Not specified'
}

// BUSINESS PROFILE

const profileErrors = computed(() => {
  const form = profileForm.value
  const errors = {}
  const name = form.companyName.trim()

  if (name.length < 2 || name.length > 100) {
    errors.companyName = 'Enter your company name (2 to 100 characters).'
  }

  if (!form.location.trim() || form.location.trim().length > 60) {
    errors.location = 'Enter your location or service area.'
  }

  if (!form.services.length) {
    errors.services = 'Choose at least one renovation service.'
  }

  const description = form.description.trim()
  if (description.length < 20 || description.length > 500) {
    errors.description = 'Describe your company in 20 to 500 characters.'
  }

  if (!/^[689]\d{7}$/.test(form.contactNumber.replace(/\s+/g, ''))) {
    errors.contactNumber = 'Enter an 8-digit Singapore number.'
  }

  return errors
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

async function suggestFromRegister() {
  uenLookup.value = { loading: true }

  try {
    const { data } = await axios.get(`${API}/contractor/uen-lookup`)
    uenLookup.value = data

    if (data.found) {
      if (!profileForm.value.companyName) {
        profileForm.value.companyName = data.companyName
      }
      if (!profileForm.value.services.length) {
        profileForm.value.services = [...(data.services || [])]
      }
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

async function saveProfile() {
  if (dashboardBusy.value) return

  profileTouched.value = true
  profileError.value = ''
  if (Object.keys(profileErrors.value).length) return

  savingProfile.value = true

  try {
    const { data } = await axios({
      method: needsSetup.value ? 'post' : 'put',
      url: `${API}/contractor/profile`,
      data: profileForm.value
    })

    const firstTime = needsSetup.value
    profile.value = data.profile
    auth.fetchMe(true)
    needsSetup.value = false
    editingProfile.value = false
    profileNotice.value = firstTime
      ? "You're now listed in Find Contractors. Homeowners can request quotations from you."
      : 'Profile saved.'

    if (firstTime) await loadData()
  } catch (error) {
    profileError.value =
      error.response?.data?.error || 'Unable to save your profile.'
  } finally {
    savingProfile.value = false
  }
}

// PAST PROJECTS

const PHOTO_MAX_SIDE = 1600

const projectsFull = computed(() =>
  portfolio.value.length >= maxProjects.value
)

// Each project and photo keeps a draft of its editable text and its own busy state.
function preparePhoto(photo) {
  return { ...photo, captionDraft: photo.caption, saving: false }
}

function prepareProject(project) {
  return {
    ...project,
    nameDraft: project.name,
    saving: false,
    uploading: 0,
    nameShake: false,
    nameError: '',
    error: '',
    photos: project.photos.map(preparePhoto)
  }
}

function projectUrl(project) {
  return `${API}/contractor/projects/${getId(project)}`
}

async function loadPortfolio() {
  portfolioLoading.value = true
  portfolioError.value = ''

  try {
    const { data } = await axios.get(`${API}/contractor/projects`)
    maxProjects.value = data.maxProjects
    portfolio.value = data.projects.map(prepareProject)
  } catch (error) {
    portfolioError.value =
      error.response?.data?.error || 'Unable to load your past projects.'
  } finally {
    portfolioLoading.value = false
  }
}

// Keep the line breaks a contractor types, but tidy spaces and drop blank lines.
function cleanProjectName(value) {
  return value
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

// Collection name fields warm to amber near the 40-character limit, turn red at it,
// and shake if the contractor keeps typing once they are full.
const NAME_MAX = 40
const NAME_WARN = 32

const nameLength = computed(() => newProjectName.value.length)

function nameFieldClass(length, shaking) {
  return {
    'near-limit': length >= NAME_WARN && length < NAME_MAX,
    'at-limit': length >= NAME_MAX,
    shake: shaking
  }
}

// The message shown under a name field that is empty or too short, or ''.
function nameProblem(name) {
  if (!name) return 'Please enter a name'
  return name.length < 2 ? 'Please enter at least 2 characters' : ''
}

// Read out by screen readers in place of a visible counter.
function charactersLeftText(length) {
  return length >= NAME_WARN ? `${NAME_MAX - length} characters left` : ''
}

// setShake(true) plays the shake; it is reset first so it restarts if already playing.
function guardNameLimit(event, setShake) {
  const field = event.target
  const replacing = field.selectionStart !== field.selectionEnd
  if (!event.inputType.startsWith('insert') || replacing || field.value.length < NAME_MAX) return

  setShake(false)
  requestAnimationFrame(() => setShake(true))
}

async function openNewProject() {
  showNewProject.value = true
  portfolioError.value = ''
  await nextTick()
  newProjectField.value?.focus()
}

// Closes the popup, with focus back on New Collection.
async function closeNewProject() {
  showNewProject.value = false
  newProjectName.value = ''
  nameError.value = ''
  portfolioError.value = ''
  await nextTick()
  newProjectButton.value?.focus()
}

async function createProject() {
  const name = cleanProjectName(newProjectName.value)
  portfolioError.value = ''
  nameError.value = nameProblem(name)

  if (nameError.value) {
    newProjectField.value?.focus()
    return
  }

  creatingProject.value = true

  try {
    const { data } = await axios.post(`${API}/contractor/projects`, { name })
    portfolio.value.unshift(prepareProject(data.project))
    closeNewProject()
  } catch (error) {
    portfolioError.value =
      error.response?.data?.error || 'Unable to add the project.'
  } finally {
    creatingProject.value = false
  }
}

// Project names save when the field loses focus.
// An empty or too-short name is not saved; the message stays until they type.
async function renameProject(project) {
  const name = cleanProjectName(project.nameDraft)
  project.nameError = nameProblem(name)
  if (project.nameError || name === project.name) return

  project.saving = true
  project.error = ''

  try {
    const { data } = await axios.patch(projectUrl(project), { name })
    project.name = data.name
    project.nameDraft = data.name
  } catch (error) {
    project.nameDraft = project.name
    project.error =
      error.response?.data?.error || 'Unable to rename the project.'
  } finally {
    project.saving = false
  }
}

// An empty or too-short name keeps focus in its field until it is fixed.
function keepNameFocus(project, event) {
  project.nameError = nameProblem(cleanProjectName(project.nameDraft))
  if (!project.nameError) return

  const field = event.target
  setTimeout(() => field.focus())
}

// The bin button asks first, in a popup with Okay and Cancel.
async function askDeleteProject(project, event) {
  deleteOpener = event.currentTarget
  projectToDelete.value = project
  await nextTick()
  deleteConfirmButton.value?.focus()
}

// Closing without deleting puts keyboard focus back on the bin button.
function cancelDeleteProject() {
  projectToDelete.value = null
  deleteOpener?.focus()
}

async function deleteProject() {
  const project = projectToDelete.value
  projectToDelete.value = null
  if (!project) return

  project.saving = true
  project.error = ''

  try {
    await axios.delete(projectUrl(project))
    portfolio.value = portfolio.value.filter(item => item !== project)
  } catch (error) {
    project.saving = false
    project.error =
      error.response?.data?.error || 'Unable to delete the project.'
  }
}

// Phone photos are often 5 MB or more, so send a JPEG no longer than 1600 px on either side.
async function shrinkPhoto(file) {
  const image = await createImageBitmap(file)
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)

  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  image.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Unable to process photo')),
      'image/jpeg',
      0.85
    )
  })
}

// One file picker serves every project; remember which project it was opened for.
function chooseProjectPhotos(project) {
  photoTarget = project
  photoInput.value.click()
}

async function uploadProjectPhotos(event) {
  const project = photoTarget
  const files = [...event.target.files]
  event.target.value = ''
  if (!project || !files.length) return

  const errors = []

  project.uploading = files.length
  project.error = ''

  for (const file of files) {
    try {
      let blob

      try {
        blob = await shrinkPhoto(file)
      } catch {
        throw new Error('Please choose a JPEG, PNG or WebP photo.')
      }

      const form = new FormData()
      form.append('photo', blob, 'photo.jpg')
      const { data } = await axios.post(`${projectUrl(project)}/photos`, form)
      project.photos.push(preparePhoto(data.photo))
    } catch (error) {
      errors.push(
        `${file.name}: ${error.response?.data?.error || error.message}`
      )
    } finally {
      project.uploading -= 1
    }
  }

  project.error = errors.join(' ')
}

// Captions save when the field loses focus or Enter is pressed.
async function saveCaption(project, photo) {
  const caption = photo.captionDraft.trim()
  if (caption === photo.caption) return

  photo.saving = true
  project.error = ''

  try {
    const { data } = await axios.patch(
      `${projectUrl(project)}/photos/${getId(photo)}`,
      { caption }
    )
    photo.caption = data.photo.caption
    photo.captionDraft = data.photo.caption
  } catch (error) {
    photo.captionDraft = photo.caption
    project.error =
      error.response?.data?.error || 'Unable to save the caption.'
  } finally {
    photo.saving = false
  }
}

async function removeProjectPhoto(project, photo) {
  photo.saving = true
  project.error = ''

  try {
    await axios.delete(`${projectUrl(project)}/photos/${getId(photo)}`)
    project.photos = project.photos.filter(item => item !== photo)
  } catch (error) {
    photo.saving = false
    project.error =
      error.response?.data?.error || 'Unable to remove the photo.'
  }
}

const emailPreview = ref(null)
const emailPreviewDialog = ref(null)
const emailCopyBusy = ref(false)
const emailCopyMessage = ref('')
function escapeEmailContent(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}
function closeEmailPreview() {
  emailPreviewDialog.value?.close()
  emailPreview.value = null
  emailCopyMessage.value = ''
}
async function copyFormattedEmailAndOpen() {
  if (!emailPreview.value || emailCopyBusy.value) return
  emailCopyBusy.value = true
  emailCopyMessage.value = ''
  const preview = emailPreview.value
  try {
    let rich = false
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([preview.html], { type: 'text/html' }),
          'text/plain': new Blob([preview.text], { type: 'text/plain' })
        })])
        rich = true
      } catch { /* Try the plain-text fallback below. */ }
    }
    if (!rich) await navigator.clipboard.writeText(preview.text)
    emailCopyMessage.value = rich
      ? 'Formatted email copied. In your mail app, click the message body and press Cmd+V (or Ctrl+V).'
      : 'Your browser only allowed plain-text copying. Paste with Cmd+V (or Ctrl+V), or copy from the preview manually for formatting.'
    // No body parameter: paste the formatted clipboard into the blank compose body.
    window.location.href = `mailto:${encodeURIComponent(preview.recipient)}?subject=${encodeURIComponent(preview.subject)}`
  } catch {
    emailCopyMessage.value = 'Copy was blocked. Select and copy the preview below manually, then use Open mail app.'
  } finally { emailCopyBusy.value = false }
}
function openEmailAppOnly() {
  const preview = emailPreview.value
  if (preview) window.location.href = `mailto:${encodeURIComponent(preview.recipient)}?subject=${encodeURIComponent(preview.subject)}`
}

// mailto opens the configured mail app with a plain-text draft.
async function emailHomeowner(request, useDraft = false) {
  const recipient = String(request.contact?.email || '').trim()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient) || /[\r\n]/.test(recipient)) {
    notify('A valid homeowner email address is required.')
    return
  }
  const isDraft = useDraft && Boolean(request.aiDraft)
  const quotation = isDraft ? {
    ...request.aiDraft,
    items: request.aiDraft.items.map(item => ({ ...item, amount: getItemAmount(item) })),
    total: getDraftTotal(request)
  } : request.quotation
  const incompleteDraft = isDraft && hasMissingPrices(request)
  const company = profile.value?.companyName || 'Your renovation contractor'
  const lines = [
    `Dear ${request.contact?.name || 'Homeowner'},`, '',
    isDraft
      ? 'We have prepared a provisional renovation draft and need your clarification on the points listed below. This is not a final quotation. Prices, quantities and scope remain subject to verification.'
      : request.status === 'accepted'
      ? 'Thank you for accepting our renovation quotation. Please let us know a convenient time to discuss the next steps and discuss preparations for the agreed start date.'
      : quotation
        ? 'Please find a summary of our renovation quotation below. Let us know if you would like to discuss any items or arrange a site visit.'
        : 'Thank you for your renovation enquiry. Below is a summary of your request for our discussion.',
    '', 'RENOVATION SUMMARY',
    `Household: ${request.household?.name || 'Not specified'}`,
    `Property: ${flatTypeLabel(request.household?.flatType)}`,
    `Budget: ${formatMoney(request.budget)}`,
    `Preferred start (not confirmed): ${formatDate(request.preferredStartDate)}`,
    `Contractor ${request.status === 'accepted' ? 'agreed' : 'proposed'} start: ${quotation?.startDate ? formatDate(quotation.startDate) : 'Not yet proposed'}`
  ]
  if (request.selectedLayoutItems?.length) {
    lines.push('', 'REQUESTED ITEMS')
    request.selectedLayoutItems.forEach(item => lines.push(`- ${item.room}: ${String(item.item).replace(/[_-]/g, ' ')} x ${item.quantity}`))
  }
  if (request.workDetails?.length) {
    lines.push('', 'ADDITIONAL WORK')
    request.workDetails.forEach(work => {
      const area = work.scope === 'whole' ? 'Whole flat' : work.scope === 'rooms' ? (work.rooms || []).join(', ') : 'Contractor to assess'
      lines.push(`- ${work.service}: ${area}${work.quantity ? `; ${work.quantity} ${work.unit || ''}` : ''}${work.notes ? `; ${work.notes}` : ''}`)
    })
  }
  if (request.description) lines.push('', 'YOUR REQUIREMENTS', request.description)
  if (quotation) {
    lines.push('', isDraft ? 'PROVISIONAL DRAFT - FOR CLARIFICATION ONLY' : `QUOTATION - VERSION ${request.quotationVersion || 1}`)
    ;(quotation.items || []).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.service}`, `   ${item.description || ''}`,
        `   Quantity: ${item.quantity ?? '-'} | Unit price: ${item.unitPrice == null ? 'To confirm' : formatMoney(item.unitPrice)} | Amount: ${item.amount == null ? 'To confirm' : formatMoney(item.amount)}`)
    })
    lines.push('', incompleteDraft ? `PRICED ITEMS SUBTOTAL: ${formatMoney(quotation.total)} (incomplete; unpriced items are excluded)` : `${isDraft ? 'PROVISIONAL TOTAL' : 'TOTAL'}: ${formatMoney(quotation.total)}`)
    if (quotation.notes) lines.push('', 'NOTES', quotation.notes)
    if (quotation.warnings?.length) lines.push('', isDraft ? 'REVIEW NOTES - PLEASE CLARIFY' : 'ITEMS TO CLARIFY', ...quotation.warnings.map(warning => '- ' + warning))
  } else {
    lines.push('', 'A quotation has not yet been issued; the above is the requested scope only.')
  }
  lines.push('', 'The preferred start date is subject to mutual confirmation.', '', 'Kind regards,', company)
  if (profile.value?.contactNumber) lines.push(profile.value.contactNumber)
  if (isDraft) lines.push('', 'Please reply with any clarifications or corrections so we can finalise the quotation. This email does not submit or approve a quotation in HDB EcoHome.')
  const subject = `${isDraft ? 'Renovation draft - clarification needed' : quotation ? 'Renovation quotation' : 'Renovation enquiry'} - ${request.household?.name || 'Your home'}`.replace(/[\r\n]/g, ' ')
  const esc = escapeEmailContent
  const heading = isDraft ? 'Renovation draft' : quotation ? 'Renovation quotation' : 'Renovation enquiry'
  const tableRows = (quotation?.items || []).map((item, index) => {
    const amount = item.amount == null ? 'To confirm' : formatMoney(item.amount)
    return `<tr><td style="padding:12px 10px;border-bottom:1px solid #e2e9e5;vertical-align:top">${index + 1}</td><td style="padding:12px 10px;border-bottom:1px solid #e2e9e5"><strong>${esc(item.service)}</strong><br><span style="color:#617469">${esc(item.description || '')}</span></td><td style="padding:12px 10px;border-bottom:1px solid #e2e9e5;vertical-align:top">${esc(item.quantity ?? '-')}</td><td style="padding:12px 10px;border-bottom:1px solid #e2e9e5;vertical-align:top;white-space:nowrap">${esc(item.unitPrice == null ? 'To confirm' : formatMoney(item.unitPrice))}</td><td style="padding:12px 10px;border-bottom:1px solid #e2e9e5;vertical-align:top;white-space:nowrap;color:${item.amount == null ? '#b42338' : '#16643e'}"><strong>${esc(amount)}</strong></td></tr>`
  }).join('')
  const table = `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:14px 0 24px" cellpadding="0" cellspacing="0"><thead><tr>${['#','Item / work','Qty','Unit price','Amount'].map(label => `<th align="left" style="padding:11px 10px;background:#eaf4ed;border-bottom:2px solid #caddd0;color:#185c39">${label}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>`
  let inQuotation = false
  let content = ''
  for (const line of lines) {
    if (line.startsWith('QUOTATION - VERSION') || line === 'PROVISIONAL DRAFT - FOR CLARIFICATION ONLY') {
      content += `<h3 style="margin:24px 0 8px;font-size:16px;color:#195f3c">${esc(line)}</h3>${table}`
      inQuotation = true
      continue
    }
    if (inQuotation && !line.startsWith('TOTAL:') && !line.startsWith('PROVISIONAL TOTAL:') && !line.startsWith('PRICED ITEMS SUBTOTAL:')) continue
    if (inQuotation) {
      inQuotation = false
      content += `<div style="background:${incompleteDraft ? '#fff2e8' : '#edf7f0'};border:1px solid ${incompleteDraft ? '#eed3bd' : '#d4e6da'};padding:14px 16px;margin-bottom:20px;border-radius:10px;font-size:16px;color:#185c39"><strong>${esc(line)}</strong></div>`
      continue
    }
    if (!line) continue
    if (/^[A-Z][A-Z /-]+$/.test(line)) {
      content += `<h3 style="font-size:14px;margin:24px 0 8px;color:#195f3c">${esc(line)}</h3>`
    } else if (line.startsWith('- ')) {
      content += `<p style="margin:6px 0;padding-left:12px">&#8226; ${esc(line.slice(2))}</p>`
    } else {
      const colon = line.indexOf(':')
      content += `<p style="margin:8px 0;white-space:pre-wrap">${colon > 0 && colon < 35 ? '<strong>' + esc(line.slice(0,colon + 1)) + '</strong>' + esc(line.slice(colon + 1)) : esc(line)}</p>`
    }
  }
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#283e30;font-size:14px;line-height:1.65;max-width:760px;margin:0 auto;background:#fff"><div style="padding:20px 24px;background:#176b43;border-radius:12px 12px 0 0;color:white"><p style="font-size:12px;margin:0 0 5px;letter-spacing:1px">${esc(company)}</p><h2 style="font-size:23px;margin:0;color:white">${heading}</h2></div><div style="padding:20px 24px;border:1px solid #e0e9e3;border-top:0;border-radius:0 0 12px 12px">${isDraft ? '<div style="background:#fff4d9;color:#805a0c;padding:12px 15px;border:1px solid #ebd59a;border-radius:8px;margin-bottom:18px"><strong>Provisional draft - clarification required</strong><br>Unconfirmed prices and review notes must be resolved before a final quotation.</div>' : ''}${content}</div></div>`
  emailCopyMessage.value = ''
  emailPreview.value = { recipient, subject, html, text: lines.join('\r\n'), isDraft }
  await nextTick()
  emailPreviewDialog.value?.showModal()

}

// FORMATTERS

function formatDate(date) {
  if (!date) return 'Not specified'
  const parsed = new Date(date)

  return Number.isNaN(parsed.getTime())
    ? 'Not specified'
    : parsed.toLocaleDateString('en-SG')
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
    accepted: 'bg-info-subtle text-info-emphasis',
    declined: 'bg-secondary-subtle text-secondary-emphasis',
    cancelled: 'bg-secondary-subtle text-secondary-emphasis'
  }[status] || 'bg-secondary-subtle'
}

function statusLabel(status) {
  return {
    pending: 'Pending Response',
    quoted: 'Quotation Sent',
    rejected: 'Rejected',
    accepted: 'Accepted by Homeowner',
    withdrawn: 'Withdrawn by Contractor',
    declined: 'Declined by Homeowner',
    cancelled: 'Cancelled by Homeowner'
  }[status] || status
}

// TABS AND NOTIFICATIONS

function dismissMessage() {
  clearTimeout(messageTimer)
  temporaryMessage.value = ''
}

function notify(message) {
  clearTimeout(messageTimer)
  temporaryMessage.value = message
  messageTimer = setTimeout(() => {
    temporaryMessage.value = ''
  }, 8000)
}

function openPriceList() {
  activeTab.value = 'priceList'
}

function clearUploadHighlight() {
  clearTimeout(uploadHighlightTimer)
  uploadHighlighted.value = false
}

async function goToPriceListUpload(message) {
  activeTab.value = 'priceList'
  showPriceList.value = false
  showUpload.value = true
  clearUploadHighlight()

  if (message) notify(message)
  await nextTick()

  uploadHighlighted.value = true

  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches

  document.getElementById('price-list-upload')?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'center'
  })

  document.getElementById('upload-heading')?.focus({
    preventScroll: true
  })

  uploadHighlightTimer = setTimeout(() => {
    uploadHighlighted.value = false
  }, 4000)
}

async function replacePriceList() {
  if (dashboardBusy.value) return
  await goToPriceListUpload()
}

const TABS = ['requests', 'priceList', 'photos']

function handleTabKey(event) {
  const index = TABS.indexOf(activeTab.value)
  const nextTab = {
    ArrowRight: TABS[(index + 1) % TABS.length],
    ArrowLeft: TABS[(index + TABS.length - 1) % TABS.length],
    Home: TABS[0],
    End: TABS[TABS.length - 1]
  }[event.key]

  if (!nextTab) return

  event.preventDefault()
  activeTab.value = nextTab
  document.getElementById(`tab-${nextTab}`)?.focus()
}

// LOAD DATA

async function loadLatestPriceList() {
  priceListLoading.value = true
  priceListLoaded.value = false
  priceListError.value = ''

  try {
    const { data } = await axios.get(`${API}/contractor/price-list/latest`)

    if (
      !data ||
      typeof data !== 'object' ||
      !Object.prototype.hasOwnProperty.call(data, 'priceList')
    ) {
      throw new Error(
        'Unexpected server response. Check that the updated backend is running.'
      )
    }

    const previousId = getId(latestPriceList.value)
    const nextId = getId(data.priceList)

    if (previousId && previousId !== nextId) {
      requests.value.forEach(request => {
        request.aiDraft = null
      })
    }

    latestPriceList.value = data.priceList || null
    priceListLoaded.value = true
    return true
  } catch (error) {
    console.error('Saved price list request failed:', error)
    const status = error.response?.status

    priceListError.value =
      error.response?.data?.error ||
      (status
        ? `Unable to load your saved price list (HTTP ${status}).`
        : error.message || 'Unable to connect to the server.')

    return false
  } finally {
    priceListLoading.value = false
  }
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  priceListNotice.value = ''
  priceListError.value = ''
  priceListLoaded.value = false
  latestPriceList.value = null
  pdfFile.value = null
  showPriceList.value = false
  showUpload.value = false
  clearUploadHighlight()

  fileInputKey.value += 1

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
      generating: false,
      aiDraft: null,
      actionError: '',
      showLayout: false,
      plan: null,
      layoutLoading: false,
      layoutError: ''
    }))

    if (!needsSetup.value && profile.value) {
      await Promise.all([loadLatestPriceList(), loadPortfolio()])
    }
  } catch (error) {
    console.error(error)
    errorMessage.value =
      error.response?.data?.error ||
      'Unable to load the contractor dashboard.'
  } finally {
    loading.value = false
  }
}

async function refreshDashboard() {
  if (dashboardBusy.value) return

  if (
    (requests.value.some(request => request.aiDraft) || pdfFile.value) &&
    !await requestConfirmation('Refreshing will discard unsent drafts and your selected PDF. Continue?')
  ) return

  loadData()
}

// TEAMMATE FEATURE: READ-ONLY CUSTOMER FLOOR PLAN

async function toggleLayout(request) {
  if (request.layoutLoading) return

  if (request.showLayout) {
    request.showLayout = false
    return
  }

  requests.value.forEach(item => {
    item.showLayout = false
  })

  request.layoutError = ''

  if (!request.plan) {
    request.layoutLoading = true

    try {
      const { data } = await axios.get(
        `${API}/quotation-requests/${getId(request)}/floorplan`
      )
      request.plan = data
    } catch (error) {
      request.layoutError =
        error.response?.data?.error || 'Unable to load the 3D layout.'
      return
    } finally {
      request.layoutLoading = false
    }
  }

  // Close other viewers again in case another layout finished loading.
  requests.value.forEach(item => {
    item.showLayout = false
  })
  request.showLayout = true
}

// PDF UPLOAD

function selectPDF(event) {
  if (dashboardBusy.value) return

  const file = event.target.files?.[0]
  pdfFile.value = null
  priceListNotice.value = ''

  if (!file) return

  if (
    file.type !== 'application/pdf' ||
    file.size > 5 * 1024 * 1024
  ) {
    priceListError.value = 'Please select a PDF no larger than 5 MB.'
    event.target.value = ''
    return
  }

  priceListError.value = ''
  pdfFile.value = file
  clearUploadHighlight()
}

function cancelPDFSelection() {
  if (dashboardBusy.value) return

  pdfFile.value = null
  fileInputKey.value += 1
  showUpload.value = false
  clearUploadHighlight()
}

async function extractPDF() {
  if (!pdfFile.value || dashboardBusy.value) return

  if (
    requests.value.some(request => request.aiDraft) &&
    !await requestConfirmation('Saving a replacement price list will clear unsent drafts on this page. Continue?')
  ) return

  uploading.value = true
  priceListError.value = ''
  priceListNotice.value = ''
  dismissMessage()
  clearUploadHighlight()

  try {
    const formData = new FormData()
    formData.append('file', pdfFile.value)

    const { data } = await axios.post(`${API}/extract-pdf`, formData)

    if (
      typeof data.text !== 'string' ||
      !data.text.trim() ||
      !data.priceListId
    ) {
      throw new Error('The server did not confirm a saved price list.')
    }

    pdfFile.value = null
    fileInputKey.value += 1
  
    showUpload.value = false
    showPriceList.value = true

    requests.value.forEach(request => {
      request.aiDraft = null
    })

    const refreshed = await loadLatestPriceList()

    priceListNotice.value = refreshed
      ? 'Price list saved. New AI drafts will use your latest list.'
      : 'Your upload was saved, but the viewer could not refresh. Retry loading your price list.'

    if (data.warning && refreshed) {
      priceListNotice.value += ` ${data.warning}`
    }
  } catch (error) {
    console.error(error)
    priceListError.value =
      error.response?.data?.error ||
      error.message ||
      'Unable to extract and save your price list.'
  } finally {
    uploading.value = false
  }
}

// AI QUOTATION GENERATION

async function generateAIQuotation(request) {
  if (dashboardBusy.value || request.status !== 'pending') return
  request.actionError = ''

  if (pdfFile.value) {
    await goToPriceListUpload(
      'Please extract and save your selected PDF, or cancel it before generating a quotation.'
    )
    return
  }

  request.generating = true

  try {
    const loaded = await loadLatestPriceList()

    if (!loaded) {
      activeTab.value = 'priceList'
      notify('We could not check your price list. Please retry loading it.')
      return
    }

    if (!latestPriceList.value) {
      await goToPriceListUpload(
        'Please upload and save your price list before generating an AI quotation draft.'
      )
      return
    }

    if (
      request.aiDraft &&
      !await requestConfirmation('Generating again will replace this unsent draft. Continue?')
    ) return

    const { data } = await axios.post(`${API}/generate-quotation`, {
      requestId: getId(request),
      contractorId: getCurrentContractorId()
    })

    const draft = data.draft

    if (!draft || !Array.isArray(draft.items)) {
      throw new Error('Invalid AI response.')
    }

    request.aiDraft = {
      startDate: '',
      items: draft.items.map(item => ({
        service: String(item.service || ''),
        description: String(item.description || ''),
        quantity: Number(item.quantity) || 1,
        unitPrice: item.unitPrice == null ? null : Number(item.unitPrice),
        source: String(item.source || ''),
        needsReview: Boolean(item.needsReview)
      })),
      notes: String(draft.notes || ''),
      warnings: Array.isArray(draft.warnings)
        ? draft.warnings.map(String)
        : []
    }
  } catch (error) {
    console.error(error)
    request.actionError =
      error.response?.data?.error ||
      error.message ||
      'Unable to generate AI quotation.'
  } finally {
    request.generating = false
  }
}

// Manual drafts use the same editor, totals and sending validation as AI drafts.
async function createManualQuotation(request) {
  if (dashboardBusy.value || request.status !== 'pending') return
  if (request.aiDraft && !await requestConfirmation(
    'Starting a manual quotation will replace this unsent draft. Continue?'
  )) return
  if (dashboardBusy.value || request.status !== 'pending') return
  request.actionError = ''
  request.aiDraft = {
    manual: true,
    startDate: '',
    items: [{
      service: '', description: '', quantity: 1, unitPrice: null,
      source: 'Manually entered by contractor', needsReview: true
    }],
    notes: '',
    warnings: []
  }
  await nextTick()
  const editor = document.getElementById(`quotation-editor-${getId(request)}`)
  editor?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  editor?.querySelector('details.draft-item')?.setAttribute('open', '')
  editor?.querySelector('input[type="text"]')?.focus({ preventScroll: true })
}

// QUOTATION CALCULATIONS

function addQuotationItem(request) {
  if (!request.aiDraft || dashboardBusy.value) return

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
  if (dashboardBusy.value) return
  request.aiDraft.items.splice(index, 1)
}

async function syncConflictedRequest(request, error) {
  if (error.response?.status !== 409) return
  try {
    const { data } = await axios.get(`${API}/quotation-requests`)
    const latest = (Array.isArray(data) ? data : data.requests || [])
      .find(item => getId(item) === getId(request))
    if (latest) {
      Object.assign(request, latest)
      if (request.status !== 'pending') { request.aiDraft = null; request.revising = false }
    }
  } catch {
    notify('The request changed. Refresh the dashboard to see its latest status.')
  }
}

async function withdrawSentQuotation(request) {
  if (dashboardBusy.value || !['quoted', 'withdrawn'].includes(request.status)) return
  if (!await requestConfirmation('Withdraw this quotation and return the request to Pending? The sent offer will move to history and cannot be accepted. You can prepare and send a replacement.')) return
  savingId.value = getId(request)
  request.actionError = ''
  try {
    const { data } = await axios.patch(`${API}/quotation-requests/${getId(request)}/withdraw`, {
      contractorId: getCurrentContractorId(), expectedVersion: request.quotationVersion || 1
    })
    Object.assign(request, data)
    request.status = 'pending'
    request.quotation = null
    request.revising = false
    request.aiDraft = null
    notify('Quotation withdrawn. The request is Pending again; prepare and send a replacement.')
  } catch (error) {
    request.actionError = error.response?.data?.error || 'Unable to withdraw quotation.'
    await syncConflictedRequest(request, error)
  } finally { savingId.value = '' }
}

function startQuotationRevision(request) {
  if (dashboardBusy.value || request.status !== 'quoted' || !request.quotation) return
  request.revising = true
  request.revisionBaseVersion = request.quotationVersion || 1
  request.actionError = ''
  request.aiDraft = {
    items: (request.quotation.items || []).map(item => ({ ...item })),
    startDate: request.quotation.startDate || '',
    notes: request.quotation.contractorNotes ?? request.quotation.notes ?? '',
    warnings: [...(request.quotation.warnings || [])]
  }
}
function cancelQuotationRevision(request) {
  if (dashboardBusy.value) return
  request.revising = false
  request.aiDraft = null
  request.actionError = ''
}

// SEND OR REJECT

async function submitQuotation(request) {
  if (
    !request.aiDraft ||
    dashboardBusy.value ||
    !(request.status === 'pending' || (request.status === 'quoted' && request.revising))
  ) return

  if (pdfFile.value && !request.aiDraft.manual) {
    await goToPriceListUpload(
      'Save or cancel your selected PDF before sending this quotation.'
    )
    return
  }

  request.actionError = ''
  if (!request.aiDraft.startDate || request.aiDraft.startDate < calendarToday) { request.actionError = 'Choose a proposed start date today or later.'; return }
  const items = request.aiDraft.items

  if (!items.length) {
    request.actionError = 'Add at least one quotation item.'
    return
  }

  if (hasMissingPrices(request)) {
    request.actionError = 'Please enter valid prices and quantities for every item.'
    return
  }

  if (items.some(item => !String(item.service || '').trim())) {
    request.actionError = 'Every quotation item needs a service name.'
    return
  }

  const total = getDraftTotal(request)

  if (!Number.isFinite(total) || total <= 0) {
    request.actionError = 'Quotation total must be greater than zero.'
    return
  }

  if (!await requestConfirmation(
    `Submit quotation of ${formatMoney(total)}?\n\n` +
    `Proposed start: ${formatDate(request.aiDraft.startDate)}. Please confirm that you have reviewed the price, scope and date.`
  )) return

  const requestId = getId(request)
  savingId.value = requestId

  try {
    const quotation = {
      startDate: request.aiDraft.startDate,
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

    const revising = request.status === 'quoted' && request.revising
    const { data } = await axios.patch(
      `${API}/quotation-requests/${requestId}/${revising ? 'revise' : 'respond'}`,
      { contractorId: getCurrentContractorId(), status: 'quoted', quotation,
        ...(revising ? { expectedVersion: request.revisionBaseVersion } : {}) }
    )
    request.status = 'quoted'
    request.quotation = data.quotation || quotation
    request.quotationVersion = data.quotationVersion || 1
    if (data.quotationHistory) request.quotationHistory = data.quotationHistory
    request.aiDraft = null
    request.revising = false
    notify(revising ? 'Revised quotation sent. The previous version is kept in history.' : 'Quotation sent successfully.')
  } catch (error) {
    console.error(error)
    request.actionError =
      error.response?.data?.error || 'Unable to submit quotation.'
    await syncConflictedRequest(request, error)
  } finally {
    savingId.value = ''
  }
}

async function rejectRequest(request) {
  if (dashboardBusy.value || request.status !== 'pending') return
  if (!await requestConfirmation('Are you sure you want to reject this request?')) return

  const requestId = getId(request)
  savingId.value = requestId
  request.actionError = ''

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
    request.actionError =
      error.response?.data?.error || 'Unable to reject request.'
    await syncConflictedRequest(request, error)
  } finally {
    savingId.value = ''
  }
}

onMounted(loadData)

onUnmounted(() => {
  clearTimeout(messageTimer)
  clearTimeout(uploadHighlightTimer)
})

const animatedFilterStyle = computed(() => {
  const index = requestFilterOptions.value.findIndex(option => option.key === statusFilter.value)
  const colours = { total: '#475569', all: '#475569', pending: '#ad620c', received: '#168854', sent: '#168854', accepted: '#2563d9', rejected: '#bf3446' }
  return { '--pill-index': Math.max(0, index), '--pill-count': requestFilterOptions.value.length, '--pill-colour': colours[statusFilter.value] || colours.total }
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
const calendarUndated = computed(() => requests.value.filter(request => request.status === 'accepted' && !request.quotation?.startDate).length)
function moveCalendarMonth(step) {
  const date = calendarDate(calendarMonth.value + '-01')
  date.setMonth(date.getMonth() + step)
  calendarMonth.value = calendarKey(date).slice(0,7)
  calendarDay.value = calendarKey(date)
}
function resetCalendar() { calendarMonth.value = calendarToday.slice(0,7); calendarDay.value = calendarToday }
const calendarEvents = computed(() => requests.value.filter(request => request.status === 'accepted' && /^\d{4}-\d{2}-\d{2}$/.test(request.quotation?.startDate || '')).map(request => ({
  id: getId(request), date: request.quotation.startDate,
  name: request.contact?.name || 'Homeowner', household: request.household?.name || 'Household', total: request.quotation.total
})))


async function openCalendarQuotation(event) {
  activeTab.value = 'requests'
  statusFilter.value = 'accepted'
  requestSearch.value = ''
  await nextTick()
  const target = document.getElementById(`calendar-quotation-${event.id}`)
  const breakdown = target?.querySelector('details.submitted-quotation')
  if (breakdown) breakdown.open = true
  if (!target) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}


// Await the homeowner or contractor decision before running the original action.
const confirmationDialog = ref(null)
const confirmation = ref({ title: '', message: '', action: 'Continue', destructive: false })
let resolveConfirmation = null
let confirmationDisposed = false

async function requestConfirmation(message) {
  if (resolveConfirmation || confirmationDisposed) return false
  const text = String(message)
  let title = 'Confirm your action'
  let action = 'Continue'
  let destructive = false
  if (text.startsWith('Refreshing')) { title = 'Refresh dashboard?'; action = 'Discard and refresh' }
  else if (text.startsWith('Saving a replacement')) { title = 'Replace price list?'; action = 'Replace price list' }
  else if (text.startsWith('Generating again')) { title = 'Replace this draft?'; action = 'Generate again' }
  else if (text.startsWith('Withdraw')) { title = 'Withdraw quotation?'; action = 'Withdraw quotation'; destructive = true }
  else if (text.startsWith('Submit quotation')) { title = 'Send quotation?'; action = 'Send quotation' }
  else if (text.includes('reject this request')) { title = 'Reject request?'; action = 'Reject request'; destructive = true }
  else if (text.includes('accept this quotation')) { title = 'Accept quotation?'; action = 'Accept quotation' }
  else if (text.includes('decline this quotation')) { title = 'Decline quotation?'; action = 'Decline quotation'; destructive = true }
  else if (text.startsWith('Cancel this pending')) { title = 'Cancel request?'; action = 'Cancel request'; destructive = true }
  confirmation.value = { title, message: text, action, destructive }
  const decision = new Promise(resolve => { resolveConfirmation = resolve })
  await nextTick()
  if (!confirmationDisposed && resolveConfirmation) {
    try { confirmationDialog.value.showModal() }
    catch { finishConfirmation(false) }
  }
  return decision
}

function finishConfirmation(accepted = false) {
  const resolve = resolveConfirmation
  resolveConfirmation = null
  if (confirmationDialog.value?.open) confirmationDialog.value.close()
  resolve?.(accepted)
}

onUnmounted(() => {
  confirmationDisposed = true
  finishConfirmation(false)
})

</script>

<template>
  <div class="container py-5 dashboard">
    <header class="mb-4">
      <span class="badge bg-success-subtle text-success-emphasis mb-3">
        HDB EcoHome Services
      </span>
      <h1 class="fw-bold">
        Contractor <span class="text-success">Dashboard</span>
      </h1>
      <p class="text-muted mb-0">
        Review requests, prepare quotations, manage your price list and show your past projects.
      </p>
    </header>

    <div class="notification-region" aria-live="polite" aria-atomic="true">
      <div v-if="temporaryMessage" class="temporary-message shadow" role="status">
        <span>{{ temporaryMessage }}</span>
        <button
          type="button"
          class="message-close"
          aria-label="Dismiss notification"
          @click="dismissMessage"
        >×</button>
      </div>
    </div>

    <div v-if="profileNotice" class="alert alert-success" role="status">
      {{ profileNotice }}
    </div>

    <!-- COMPANY SUMMARY -->
    <section
      v-if="!loading && profile && !needsSetup"
      class="card border-0 shadow-sm rounded-4 mb-4"
    >
      <div class="card-body p-3 p-md-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <h2 class="h5 fw-bold mb-1">{{ profile.companyName }}</h2>
            <p class="small text-muted mb-2">
              {{ profile.location }} · {{ profile.contactNumber }}
            </p>
            <span class="badge corppass-badge">
              ✓ UEN {{ profile.uenNo }} · Corppass verified
            </span>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-success"
              :disabled="dashboardBusy"
              :aria-expanded="editingProfile"
              aria-controls="business-profile-editor"
              @click="editingProfile ? editingProfile = false : startEditProfile()"
            >
              {{ editingProfile ? 'Close Profile' : 'Edit Profile' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- PROFILE FORM -->
    <section
      v-if="!loading && (needsSetup || editingProfile)"
      id="business-profile-editor"
      class="card border-0 shadow-sm rounded-4 mb-4"
    >
      <div class="card-body p-4">
        <h2 class="h4 fw-bold">
          {{ needsSetup ? 'Set up your business profile' : 'Edit your business profile' }}
        </h2>
        <p class="text-muted">
          Homeowners see these details in Find Contractors. Every field is required.
        </p>

        <div class="row g-4">
          <form class="col-lg-7" novalidate @submit.prevent="saveProfile">
            <fieldset :disabled="dashboardBusy">
              <legend class="visually-hidden">Business profile</legend>

              <div class="mb-3">
                <label for="cp-uen" class="form-label fw-semibold">UEN</label>
                <input
                  id="cp-uen"
                  class="form-control"
                  :value="auth.user?.uen || profile?.uenNo"
                  readonly
                />
                <p class="small text-success mt-1 mb-0">✓ Verified by Corppass</p>
                <p v-if="needsSetup && uenLookup" class="small mt-2 mb-0">
                  <span v-if="uenLookup.loading">
                    Looking up your UEN in BCA's register…
                  </span>
                  <span v-else-if="uenLookup.found" class="text-success">
                    Company details found. Review the suggested name and services.
                  </span>
                  <span v-else class="text-muted">
                    {{
                      uenLookup.unavailable
                        ? "BCA's register is unavailable. Please enter your details."
                        : 'No matching company found. Please enter your details.'
                    }}
                  </span>
                </p>
              </div>

              <div v-for="field in profileFields" :key="field.key" class="mb-3">
                <label :for="'cp-' + field.key" class="form-label fw-semibold">
                  {{ field.label }}
                </label>
                <input
                  :id="'cp-' + field.key"
                  v-model="profileForm[field.key]"
                  :type="field.type"
                  :maxlength="field.maxlength"
                  :placeholder="field.placeholder"
                  class="form-control"
                  :class="{ 'is-invalid': profileFieldError(field.key) }"
                />
                <div class="invalid-feedback">
                  {{ profileFieldError(field.key) }}
                </div>
              </div>

              <fieldset class="mb-3">
                <legend class="form-label fw-semibold fs-6">Renovation services</legend>
                <div class="d-flex flex-wrap gap-2">
                  <template v-for="service in serviceOptions" :key="service">
                    <input
                      :id="'cp-service-' + service"
                      v-model="profileForm.services"
                      type="checkbox"
                      class="btn-check"
                      :value="service"
                    />
                    <label
                      :for="'cp-service-' + service"
                      class="btn btn-sm btn-outline-success rounded-pill"
                    >{{ service }}</label>
                  </template>
                </div>
                <p v-if="profileFieldError('services')" class="small text-danger mt-2">
                  {{ profileFieldError('services') }}
                </p>
              </fieldset>

              <div class="mb-4">
                <label for="cp-about" class="form-label fw-semibold">
                  About your company
                </label>
                <textarea
                  id="cp-about"
                  v-model="profileForm.description"
                  class="form-control"
                  :class="{ 'is-invalid': profileFieldError('description') }"
                  rows="4"
                  maxlength="500"
                ></textarea>
                <div class="invalid-feedback">
                  {{ profileFieldError('description') }}
                </div>
                <p class="small text-muted text-end mt-1 mb-0">
                  {{ profileForm.description.trim().length }}/500
                </p>
              </div>

              <div v-if="profileError" class="alert alert-danger" role="alert">
                {{ profileError }}
              </div>

              <div class="d-flex flex-wrap gap-2">
                <button type="submit" class="btn btn-success">
                  {{ savingProfile ? 'Saving...' : 'Save Business Profile' }}
                </button>
                <button
                  v-if="!needsSetup"
                  type="button"
                  class="btn btn-outline-secondary"
                  @click="editingProfile = false"
                >Cancel</button>
              </div>
            </fieldset>
          </form>

          <aside class="col-lg-5">
            <div class="bg-light border rounded-4 p-4">
              <p class="small text-muted">PROFILE PREVIEW</p>
              <h3 class="h5 fw-bold">
                {{ profileForm.companyName || 'Your company name' }}
              </h3>
              <p class="small text-muted">
                {{ profileForm.location || 'Your service area' }}
              </p>
              <div class="d-flex flex-wrap gap-2 mb-3">
                <span
                  v-for="service in profileForm.services"
                  :key="service"
                  class="badge bg-success-subtle text-success-emphasis"
                >{{ service }}</span>
              </div>
              <p class="preserve-lines">
                {{ profileForm.description || 'Your company description will appear here.' }}
              </p>
              <p class="fw-semibold mb-0">
                {{ profileForm.contactNumber || 'Your contact number' }}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-success" role="status">
        <span class="visually-hidden">Loading dashboard</span>
      </div>
      <p class="text-muted mt-3">Loading your dashboard...</p>
    </div>

    <template v-else-if="!needsSetup && profile">
      <!-- TABS -->
      <div
        class="dashboard-tabs mb-4"
        :style="{ '--active-tab-index': Math.max(0, TABS.indexOf(activeTab)) }"
        role="tablist"
        aria-label="Contractor dashboard sections"
        @keydown="handleTabKey"
      >
        <button
          id="tab-requests"
          type="button"
          role="tab"
          class="dashboard-tab"
          :class="{ active: activeTab === 'requests' }"
          :aria-selected="activeTab === 'requests'"
          :tabindex="activeTab === 'requests' ? 0 : -1"
          aria-controls="panel-requests"
          @click="activeTab = 'requests'"
        >
          <span class="dashboard-tab-icon" aria-hidden="true">📋</span> <span>Quotation Requests</span> <span class="tab-count">{{ pendingCount }}</span>
        </button>
        <button
          id="tab-priceList"
          type="button"
          role="tab"
          class="dashboard-tab"
          :class="{ active: activeTab === 'priceList' }"
          :aria-selected="activeTab === 'priceList'"
          :tabindex="activeTab === 'priceList' ? 0 : -1"
          aria-controls="panel-priceList"
          @click="activeTab = 'priceList'"
        >
          <span class="dashboard-tab-icon" aria-hidden="true">📄</span> <span>Price List</span>
          <span
            class="status-dot"
            :class="{ ready: priceListLoaded && latestPriceList }"
            aria-hidden="true"
          ></span>
        </button>
        <button
          id="tab-photos"
          type="button"
          role="tab"
          class="dashboard-tab"
          :class="{ active: activeTab === 'photos' }"
          :aria-selected="activeTab === 'photos'"
          :tabindex="activeTab === 'photos' ? 0 : -1"
          aria-controls="panel-photos"
          @click="activeTab = 'photos'"
        >
          <span class="dashboard-tab-icon" aria-hidden="true">🖼️</span> <span>Portfolio</span> <span class="tab-count">{{ portfolio.length }}</span>
        </button>
      </div>

      <!-- REQUESTS TAB -->
      <div
        v-show="activeTab === 'requests'"
        id="panel-requests"
        role="tabpanel"
        aria-labelledby="tab-requests"
      >
        <div
          class="price-status mb-4"
          :class="{ warning: !priceListLoaded || !latestPriceList || pdfFile }"
        >
          <div>
            <template v-if="pdfFile">
              <p class="fw-semibold mb-1">A replacement PDF is selected</p>
              <p class="small mb-0">Save it or cancel the selection before continuing.</p>
            </template>
            <template v-else-if="priceListLoading">
              <p class="small mb-0">Checking your saved price list...</p>
            </template>
            <template v-else-if="!priceListLoaded">
              <p class="fw-semibold mb-1">Price list could not be loaded</p>
              <p class="small mb-0">Open the Price List tab to retry.</p>
            </template>
            <template v-else-if="latestPriceList">
              <p class="fw-semibold mb-1">✓ Price list ready</p>
              <p class="small mb-0 file-name">{{ latestPriceList.originalFileName }}</p>
            </template>
            <template v-else>
              <p class="fw-semibold mb-1">No price list uploaded</p>
              <p class="small mb-0">Upload one to generate AI quotation drafts.</p>
            </template>
          </div>
          <button
            type="button"
            class="btn btn-sm btn-outline-success flex-shrink-0"
            @click="openPriceList"
          >Manage Price List</button>
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
        <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
          <h2 class="h4 fw-bold mb-0">Quotation Requests</h2>
          <button
            type="button"
            class="btn btn-outline-success"
            :disabled="dashboardBusy"
            @click="refreshDashboard"
          >Refresh</button>
        </div>

        <div class="status-pill-scroll mb-4">
      <div class="dashboard-status-filters animated-filter-track" :style="animatedFilterStyle" role="group" aria-label="Filter quotation requests">
          <button v-for="filter in requestFilterOptions" :key="filter.key" type="button"
            class="dashboard-status-filter" :class="['status-' + filter.colour, { 'is-active': statusFilter === filter.key }]"
            :aria-pressed="statusFilter === filter.key" @click="statusFilter = filter.key">
            <span>{{ filter.label }}</span><strong>{{ filter.count }}</strong>
          </button>
        </div>
      </div>

        <!-- SEARCH, FILTER AND SORT -->
        <div class="requests-toolbar mb-4">
          <div class="requests-toolbar-inner">
            <div class="row g-3 align-items-end">
              <div class="col-lg-8">
                <label for="request-search" class="form-label small fw-semibold">
                  Search requests
                </label>
                <input
                  id="request-search"
                  v-model="requestSearch"
                  type="search"
                  class="form-control"
                  placeholder="Search homeowner, household, phone or service"
                />
              </div>
              <div class="col-lg-4">
                <label for="date-sort" class="form-label small fw-semibold">
                  Sort requests
                </label>
                <select id="date-sort" v-model="dateSort" class="form-select">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>

            <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3">
              <p class="small text-muted mb-0">{{ requestFilterOptions.find(filter => filter.key === statusFilter)?.label || 'Total' }} requests</p>
              <p class="small text-muted mb-0" aria-live="polite">
                Showing {{ visibleRequests.length }} of {{ myRequests.length }}
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="!visibleRequests.length"
          class="card border-0 shadow-sm rounded-4 p-5 text-center"
        >
          <h3 class="h6 fw-bold">
            {{ myRequests.length ? 'No matching requests' : 'No quotation requests yet' }}
          </h3>
          <p class="text-muted mb-0">
            {{
              myRequests.length
                ? 'Try another search or change the status filter.'
                : 'New homeowner requests will appear here.'
            }}
          </p>
          <button
            v-if="myRequests.length"
            type="button"
            class="btn btn-outline-success align-self-center mt-3"
            @click="resetFilters"
          >Clear Filters</button>
        </div>

        <!-- REQUEST CARDS -->
        <section
          v-for="request in visibleRequests"
          :key="getId(request)"
          :id="`calendar-quotation-${getId(request)}`" tabindex="-1"
          class="card request-entry mb-3 calendar-quotation-target"
        >
          <div class="card-body p-3 p-md-4">
            <div class="d-flex justify-content-between flex-wrap gap-3 mb-4">
              <div>
                <h3 class="h5 fw-bold mb-1">
                  {{ request.contact?.name || 'Homeowner' }}
                </h3>
                <p class="small text-muted mb-1">Household: {{ request.household?.name || 'Not specified' }}</p>
                <small class="text-muted">
                  Requested {{ formatDate(request.createdAt) }}
                </small>
              </div>
              <span class="badge align-self-start" :class="statusClass(request.status)">
                {{ statusLabel(request.status) }}
              </span>
            </div>

            <div class="homeowner-contact-strip mb-3">
              <div v-if="request.contact?.phone" class="contact-text"><span class="contact-caption">Homeowner contact</span><strong>{{ request.contact.name }}</strong><span>{{ request.contact.phone }}</span><span v-if="request.contact.email">{{ request.contact.email }}</span></div>
              <p v-else class="small text-muted mb-0">Contact details not provided for this older request.</p>
              <div class="d-flex flex-wrap gap-2">
                <a v-if="request.contact?.phone" :href="'tel:' + request.contact.phone" class="btn btn-success btn-sm">Call homeowner</a>
                <button v-if="request.contact?.email" type="button" class="btn btn-outline-success btn-sm" @click="emailHomeowner(request)">Preview email</button>
              </div>
            </div>

            <div class="request-facts">
              <div><span>Property</span><strong>{{ flatTypeLabel(request.household?.flatType) }}</strong></div>
              <div><span>Homeowner budget</span><strong>{{ formatMoney(request.budget) }}</strong></div>
              <div><span>Preferred start</span><strong>{{ formatDate(request.preferredStartDate) }}</strong></div>
              <div><span>{{ request.quotation && isSent(request) ? 'Quotation total' : 'Requested scope' }}</span>
                <strong :class="{ 'text-success': request.quotation && isSent(request) }">{{ request.quotation && isSent(request) ? formatMoney(request.quotation.total) : `${request.selectedLayoutItems?.length || 0} item groups · ${request.workDetails?.length || 0} additional works` }}</strong>
              </div>
            </div>

            <details class="request-disclosure request-information">
              <summary><span><strong>Request details</strong><small>Property, selected items and homeowner notes</small></span><span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
              <div class="disclosure-content">
            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <p class="mb-1">
                  <strong>Flat Type:</strong>
                  {{ flatTypeLabel(request.household?.flatType) }}
                </p>
                <p class="mb-1">
                  <strong>Occupants:</strong> {{ request.household?.occupants }}
                </p>
                <p class="mb-0">
                  <strong>Bedrooms:</strong> {{ request.household?.bedrooms }}
                </p>
              </div>
              <div class="col-md-6">
                <p class="mb-1">
                  <strong>Budget:</strong> {{ formatMoney(request.budget) }}
                </p>
                <p class="mb-0">
                  <strong>Preferred Start:</strong>
                  {{ formatDate(request.preferredStartDate) }}
                </p>
              </div>
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
              <h4 class="h6 fw-bold">Additional renovation work</h4>
              <div v-for="work in request.workDetails" :key="work.service" class="small mb-2">
                <strong>{{ work.service }}</strong> — {{ work.scope === 'whole' ? 'Whole flat' : work.scope === 'rooms' ? work.rooms.join(', ') : 'Contractor to assess' }}
                <span v-if="work.quantity"> · {{ work.quantity }} {{ work.unit }}</span>
                <p v-if="work.notes" class="mb-0 text-muted">{{ work.notes }}</p>
              </div>
            </div>
            <p v-if="!request.workDetails?.length && request.services?.length" class="fw-semibold mb-2">Additional service categories</p>
            <div v-if="!request.workDetails?.length && request.services?.length" class="d-flex flex-wrap gap-2 mb-3">
              <span
                v-for="service in request.services || []"
                :key="service"
                class="badge bg-success-subtle text-success-emphasis"
              >{{ service }}</span>
            </div>

            <p class="fw-semibold mb-1">Renovation Description</p>
            <p class="text-muted preserve-lines">{{ request.description }}</p>

              </div>
            </details>

            <!-- TEAMMATE'S READ-ONLY 3D LAYOUT VIEWER -->
            <div class="bg-light border rounded-3 p-3 mb-4">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div>
                  <p class="fw-semibold mb-1">Customer's 3D Property Layout</p>
                  <p class="small text-muted mb-0">
                    View the customer's room layout and appliance placements.
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-outline-success fw-semibold layout-expand-button"
                  :class="{ 'is-expanded': request.showLayout }"
                  :disabled="request.layoutLoading"
                  :aria-expanded="request.showLayout"
                  @click="toggleLayout(request)"
                >
                  {{
                    request.layoutLoading
                      ? 'Loading...'
                      : request.showLayout
                        ? 'Hide 3D Layout'
                        : 'View 3D Layout'
                  }}
                  <svg class="standard-chevron ms-2" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
                </button>
              </div>

              <p v-if="request.layoutError" class="small text-danger mt-3 mb-0" role="alert">
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

            <!-- PENDING REQUEST -->
            <div
              v-if="request.status === 'pending' || (request.status === 'quoted' && request.revising)"
              class="bg-light rounded-3 p-3 p-md-4 mt-4"
            >
              <h4 class="h6 fw-bold mb-2">{{ request.revising ? 'Revise quotation' : 'Prepare quotation' }}</h4>
              <p class="small text-muted">
                Generate an AI draft from your saved price list, or create a quotation manually.
                Review the selected work, prices and proposed start date before sending.
              </p>

              <button
                type="button"
                v-if="!request.revising"
                class="btn btn-success mb-3"
                :disabled="dashboardBusy"
                @click="generateAIQuotation(request)"
              >
                {{
                  request.generating
                    ? 'Preparing AI Draft...'
                    : request.aiDraft
                      ? 'Regenerate AI Draft'
                      : 'Generate AI Quotation Draft'
                }}
              </button>

              <button
                v-if="!request.revising"
                type="button"
                class="btn btn-outline-success mb-3 ms-sm-2"
                :disabled="dashboardBusy"
                @click="createManualQuotation(request)"
              >Create Quotation Manually</button>
              <p v-if="!request.revising" class="small text-muted mb-3">Manual entry does not require AI or a PDF. Enter your own verified prices for the homeowner’s selected scope.</p>

              <p v-if="request.revising" class="small text-muted">Edit the existing quotation below. Changes are sent only when you approve the revision; the previous version stays in history.</p>
              <button v-if="request.revising" type="button" class="btn btn-sm btn-outline-secondary mb-3" :disabled="dashboardBusy" @click="cancelQuotationRevision(request)">Cancel revision</button>
              <fieldset
                v-if="request.aiDraft"
                :id="`quotation-editor-${getId(request)}`"
                class="bg-white border rounded-3 p-3 p-md-4 mt-2"
                :disabled="dashboardBusy"
              >
                <legend class="visually-hidden">Review quotation</legend>
                <h4 class="h5 fw-bold text-success mb-2">{{ request.aiDraft.manual ? 'Review Manual Quotation' : 'Review Quotation' }}</h4>
                <p class="small text-muted mb-4">
                  {{ request.aiDraft.manual ? 'Enter verified prices and quantities for the selected work. No prices are filled automatically. Add any conditions and choose a proposed start date.' : 'Verify prices, quantities and conditions against your price list.' }}
                </p>

                <div class="draft-email-action mb-3">
                  <div><strong class="small">Need the homeowner to clarify something?</strong><p class="small text-muted mb-0">Email this provisional draft together with its review notes. Missing prices will be marked as unconfirmed. Ask the homeowner to confirm scope and measurements before agreeing prices and sending a revision.</p></div>
                  <button type="button" class="btn btn-outline-success btn-sm text-nowrap" :disabled="!request.contact?.email || dashboardBusy" @click="emailHomeowner(request, true)">Preview clarification email</button>
                  <p v-if="!request.contact?.email" class="small text-muted mb-0">No homeowner email is available for this request.</p>
                </div>

                <div class="alert alert-warning small">
                  <strong>Confirm first, then revise.</strong> Contact the homeowner to agree on unclear scope, measurements or missing prices before sending a revised quotation. Update the review points below once they are resolved; they are not cleared automatically.
                </div>
                <details class="request-disclosure mb-3">
                  <summary><span><strong>Edit clarification points</strong><small>Remove resolved points or write the remaining conditions clearly</small></span><span class="standard-expand">View / Hide</span></summary>
                  <div class="disclosure-content">
                    <p class="small text-muted">One point per line. These points appear to the homeowner and in clarification emails. Keep unresolved points; remove only those you have confirmed.</p>
                    <textarea class="form-control" rows="4" :value="request.aiDraft.warnings.join('\n')" @input="request.aiDraft.warnings = $event.target.value.split('\n').map(point => point.trim()).filter(Boolean)" aria-label="Clarification points"></textarea>
                  </div>
                </details>
                <details v-if="request.aiDraft.warnings.length" class="alert alert-warning draft-warnings">
                  <summary class="fw-semibold">Review notes ({{ request.aiDraft.warnings.length }})<span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
                  <ul class="mb-0 mt-2">
                    <li v-for="(warning, index) in request.aiDraft.warnings" :key="index">
                      {{ warning }}
                    </li>
                  </ul>
                </details>

                <details
                  v-for="(item, index) in request.aiDraft.items"
                  :key="index"
                  class="request-disclosure draft-item mb-3"
                  :class="{ 'draft-item-needs-price': getItemAmount(item) === null }"
                >
                  <summary>
                    <span class="draft-item-caption"><small>Item {{ index + 1 }}</small><strong>{{ item.service || 'New quotation item' }}</strong><small>{{ item.description || 'Open to edit scope, quantity and price' }}</small></span>
                    <span class="draft-item-price">{{ getItemAmount(item) === null ? 'Price needed' : formatMoney(getItemAmount(item)) }} </span>
                  <span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
                  <div class="disclosure-content">
                    <div class="d-flex justify-content-end mb-3"><button type="button" class="btn btn-sm btn-outline-danger" @click="removeQuotationItem(request, index)">Remove item</button></div>
                  <p class="quantity-help small mb-3"><strong>Quantity × price per unit = item total.</strong> A pricing unit can be one item, one point, one m², one metre or one agreed job/package. State the unit in the description, for example “20 m² of ceiling painting” or “1 ceiling-painting job”. Confirm the basis with the homeowner; do not assume quantity 1 means 1 m².</p>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label small d-block">
                        Item / Work
                        <input v-model="item.service" type="text" class="form-control mt-1" />
                      </label>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small d-block">
                        Description
                        <input v-model="item.description" type="text" class="form-control mt-1" />
                      </label>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small d-block">
                        Quantity (pricing units)
                        <input
                          v-model.number="item.quantity"
                          type="number"
                          min="0.01"
                          step="any"
                          class="form-control mt-1"
                        />
                      </label>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small d-block">
                        Unit price (S$ per unit)
                        <input
                          v-model.number="item.unitPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Enter price"
                          class="form-control mt-1"
                        />
                      </label>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small d-block">
                        Item Total
                        <input
                          class="form-control mt-1"
                          :value="getItemAmount(item) === null
                            ? 'Price missing or invalid'
                            : formatMoney(getItemAmount(item))"
                          readonly
                        />
                      </label>
                    </div>
                  </div>

                  <details class="evidence-box p-3 mt-3">
                    <summary class="small fw-semibold">Price-list evidence<span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
                    <p class="small text-muted preserve-lines mb-0">
                      {{ item.source || 'No supporting excerpt provided.' }}
                    </p>
                  </details>
                  <p v-if="item.needsReview" class="small text-warning-emphasis mt-2 mb-0">
                    This item requires manual verification.
                  </p>
                  </div>
                </details>

                <button
                  type="button"
                  class="btn btn-outline-success mb-4"
                  @click="addQuotationItem(request)"
                >+ Add Quotation Item</button>

                <div class="bg-success-subtle rounded-3 p-3 mb-4">
                  <p class="text-muted mb-1">Draft Quotation Total</p>
                  <h4 class="h3 fw-bold text-success mb-0">
                    {{ formatMoney(getDraftTotal(request)) }}
                  </h4>
                  <p v-if="hasMissingPrices(request)" class="small text-warning-emphasis mt-2 mb-0">
                    Some prices or quantities are missing or invalid. The total is incomplete.
                  </p>
                </div>

                <div v-if="Number(request.budget) > 0 && getDraftTotal(request) > Number(request.budget)" class="alert alert-warning mb-4" role="status"><strong>{{ hasMissingPrices(request) ? 'Priced items already exceed' : 'Over' }} homeowner budget by {{ formatMoney(getDraftTotal(request) - Number(request.budget)) }}</strong><p class="small mb-0 mt-1">Draft: {{ formatMoney(getDraftTotal(request)) }} · Budget: {{ formatMoney(request.budget) }}. Discuss the budget or scope with the homeowner before sending.</p></div>
                <div class="border rounded-4 p-3 mb-4 bg-light"><label :for="`proposed-start-${getId(request)}`" class="form-label fw-semibold">Proposed renovation start date <span class="text-danger">*</span></label><input :id="`proposed-start-${getId(request)}`" v-model="request.aiDraft.startDate" type="date" :min="calendarToday" class="form-control" required /><p class="small text-muted mt-2 mb-0">Homeowner’s preference: {{ request.preferredStartDate ? formatDate(request.preferredStartDate) : 'Not specified' }}. Choose a date you can offer. The homeowner accepts this date together with the price and scope.</p></div>
                <label class="form-label fw-semibold d-block">
                  Quotation Notes
                  <textarea
                    v-model="request.aiDraft.notes"
                    class="form-control mt-2 mb-4"
                    rows="4"
                    placeholder="Add exclusions, assumptions or important notes"
                  ></textarea>
                </label>

                <button
                  type="button"
                  class="btn btn-success w-100 fw-semibold"
                  :disabled="dashboardBusy || hasMissingPrices(request) || !request.aiDraft.items.length"
                  @click="submitQuotation(request)"
                >
                  {{ savingId === getId(request) ? 'Submitting...' : request.revising ? 'Approve & Send Revision' : 'Approve & Send Quotation' }}
                </button>
              </fieldset>

              <div v-if="request.actionError" class="alert alert-danger mt-3" role="alert">
                {{ request.actionError }}
              </div>

              <div v-if="request.status === 'pending'" class="border-top pt-3 mt-4">
                <button
                  type="button"
                  class="btn btn-outline-danger"
                  :disabled="dashboardBusy"
                  @click="rejectRequest(request)"
                >
                  {{ savingId === getId(request) ? 'Processing...' : 'Reject Request' }}
                </button>
              </div>
            </div>

            <p v-if="request.quotation && ['quoted','accepted'].includes(request.status)" class="alert alert-info mt-3"><strong>{{ request.status === 'accepted' ? 'Agreed' : 'Proposed' }} renovation start:</strong> {{ request.quotation.startDate ? formatDate(request.quotation.startDate) : 'Not set — revise this quotation to propose a date.' }}</p>
            <div v-if="request.status === 'quoted' && !request.revising" class="sent-quotation-actions mt-3">
              <p class="small text-muted mb-0">Awaiting homeowner decision · Version {{ request.quotationVersion || 1 }}</p>
              <div class="sent-action-buttons">
              <button type="button" class="quote-action quote-action-revise" :disabled="dashboardBusy" @click="startQuotationRevision(request)">✎ Revise quotation</button>
              <button type="button" class="quote-action quote-action-delete" :disabled="dashboardBusy" @click="withdrawSentQuotation(request)">Withdraw quotation</button>
              </div>
            </div>
            <p v-if="request.actionError && request.status !== 'pending' && !request.revising" class="alert alert-danger mt-3" role="alert">{{ request.actionError }}</p>
            <div v-if="request.status === 'withdrawn'" class="alert alert-warning mt-3"><p>This quotation was withdrawn using the previous workflow. Reopen the same request to prepare a replacement.</p><button type="button" class="quote-action quote-action-revise" :disabled="dashboardBusy" @click="withdrawSentQuotation(request)">Return to Pending</button></div>
            <p v-if="request.status === 'pending' && request.lastWithdrawnAt" class="alert alert-info small mt-3">The previous offer was withdrawn and saved in history. Prepare a replacement quotation below.</p>
            <!-- SENT QUOTATION -->
            <div
              v-if="request.quotation && isSent(request)"
              class="sent-quotation-wrap mt-3"
            >
              <details class="request-disclosure submitted-quotation">
                <summary>
                  <span><small class="sent-eyebrow">SENT TO HOMEOWNER</small><strong>Quotation submitted</strong><small>{{ request.quotation.items?.length || 0 }} line items · View breakdown and notes</small></span>
                  <span class="sent-total">{{ formatMoney(request.quotation.total) }} </span>
                <span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
                <div class="disclosure-content">
              <div v-if="request.quotation.items?.length" class="bg-white rounded-3 p-3 mb-3">
                <h5 class="h6 fw-bold mb-3">Quotation Breakdown</h5>
                <div
                  v-for="(item, index) in request.quotation.items"
                  :key="index"
                  class="quotation-line pb-3 mb-3"
                >
                  <div class="d-flex justify-content-between gap-3">
                    <span class="fw-semibold">{{ item.service }}</span>
                    <strong class="text-nowrap">{{ formatMoney(item.amount) }}</strong>
                  </div>
                  <p class="small text-muted mb-1">{{ item.description }}</p>
                  <p class="small text-muted mb-0">
                    {{ item.quantity }} × {{ formatMoney(item.unitPrice) }}
                  </p>
                </div>
              </div>
              <p class="mb-0 preserve-lines">
                <strong>Notes:</strong> {{ request.quotation.notes || 'None' }}
              </p>
                </div>
              </details>
            </div>

            <details v-if="request.quotationHistory?.length" class="request-disclosure mt-3">
              <summary><span><strong>Previous versions</strong><small>{{ request.quotationHistory.length }} saved version(s)</small></span><span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
              <div class="disclosure-content">
                <details v-for="entry in [...request.quotationHistory].reverse()" :key="entry.version" class="request-disclosure">
                  <summary><span><strong>Version {{ entry.version }} · {{ formatMoney(entry.quotation.total) }}</strong><small>Start: {{ entry.quotation.startDate ? formatDate(entry.quotation.startDate) : 'Not set' }} · Replaced {{ formatDate(entry.replacedAt) }}</small></span><span class="standard-expand"><span class="standard-expand-label" aria-hidden="true"></span><svg class="standard-chevron" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></span></summary>
                  <div class="disclosure-content"><p v-for="(item, index) in entry.quotation.items || []" :key="index" class="small">{{ item.service }} — {{ item.description }} · {{ item.quantity }} × {{ formatMoney(item.unitPrice) }}</p><p class="small preserve-lines">{{ entry.quotation.notes || 'No notes' }}</p></div>
                </details>
              </div>
            </details>
            <div v-if="request.status === 'accepted'" class="alert alert-success mt-3 mb-0">
              The homeowner accepted this quotation. Contact them to arrange the next steps.
            </div>
            <div v-if="request.status === 'declined'" class="alert alert-secondary mt-3 mb-0">
              The homeowner declined this quotation. It is kept here for your records.
            </div>
            <div v-if="request.status === 'cancelled'" class="alert alert-secondary mt-3 mb-0">
              The homeowner cancelled this request. You can no longer respond to it.
            </div>
            <div v-if="request.status === 'rejected'" class="alert alert-danger mt-3 mb-0">
              This quotation request has been rejected.
            </div>
          </div>
        </section>
      </div>

      <!-- PRICE LIST TAB -->
      <div
        v-show="activeTab === 'priceList'"
        id="panel-priceList"
        role="tabpanel"
        aria-labelledby="tab-priceList"
      >
        <section class="card border-0 shadow-sm rounded-4 price-list-card">
          <div class="card-body p-4">
            <h2 class="h4 fw-bold mb-2">Renovation Price List</h2>
            <p class="text-muted mb-4">
              View prices by category or upload a complete replacement list.
            </p>

            <div v-if="priceListError" class="alert alert-danger" role="alert">
              <p class="mb-2">{{ priceListError }}</p>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                :disabled="dashboardBusy"
                @click="loadLatestPriceList"
              >{{ priceListLoading ? 'Loading...' : 'Retry Loading' }}</button>
            </div>

            <div v-if="priceListNotice" class="alert alert-success" role="status">
              {{ priceListNotice }}
            </div>

            <div v-if="priceListLoaded && latestPriceList" class="saved-list-summary p-3 p-md-4">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div class="d-flex align-items-start gap-3 file-summary">
                  <span class="pdf-icon" aria-hidden="true">PDF</span>
                  <div class="file-details">
                    <p class="small text-success fw-semibold mb-1">CURRENT PRICE LIST</p>
                    <h3 class="h6 fw-bold file-name mb-2">
                      {{ latestPriceList.originalFileName }}
                    </h3>
                    <p class="small text-muted mb-0">
                      Uploaded {{ formatDate(latestPriceList.uploadedAt) }}
                    </p>
                  </div>
                </div>

                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-success"
                    :aria-expanded="showPriceList"
                    aria-controls="saved-price-list-viewer"
                    @click="showPriceList = !showPriceList"
                  >{{ showPriceList ? 'Hide Price List' : 'View Price List' }}</button>
                  <button
                    type="button"
                    class="btn btn-outline-success"
                    :disabled="dashboardBusy"
                    :aria-expanded="showUpload"
                    aria-controls="price-list-upload"
                    @click="replacePriceList"
                  >Replace Price List</button>
                </div>
              </div>
            </div>

            <div v-if="priceListLoaded && latestPriceList && showPriceList" id="saved-price-list-viewer" class="mt-4">
              <template v-if="latestPriceList.hasPdf">
                <a :href="`${API}/contractor/price-list/${getId(latestPriceList)}/pdf`" target="_blank" rel="noopener" class="btn btn-outline-success mb-3">Open PDF in new tab ↗</a>
                <iframe :key="getId(latestPriceList)" :src="`${API}/contractor/price-list/${getId(latestPriceList)}/pdf`" title="Saved contractor price-list PDF" style="width:100%;height:650px;border:1px solid #dce8e0;border-radius:12px"></iframe>
              </template>
              <div v-else class="alert alert-info">This older upload only contains text. Upload the PDF again to save the original file.</div>
              <details class="original-text mt-3 p-3">
                <summary class="fw-semibold text-success">Extracted text used for quotation drafts</summary>
                <pre class="pdf-preview mt-3 mb-0">{{ savedPriceListText || 'No extracted text available.' }}</pre>
              </details>
            </div>

            <div
              v-if="priceListLoaded && !latestPriceList"
              class="empty-price-list p-4 text-center"
            >
              <h3 class="h6 fw-bold">Upload your first price list</h3>
              <p class="text-muted mb-0">
                Save your prices before generating AI quotations.
              </p>
            </div>

            <!-- UPLOAD -->
            <div
              v-if="showUpload || (priceListLoaded && !latestPriceList) || !priceListLoaded"
              id="price-list-upload"
              class="upload-panel p-3 p-md-4 mt-3"
              :class="{ 'upload-highlighted': uploadHighlighted }"
              role="region"
              aria-labelledby="upload-heading"
            >
              <h3 id="upload-heading" class="h6 fw-bold mb-2" tabindex="-1">
                {{ latestPriceList ? 'Upload Replacement Price List' : 'Add Your Price List' }}
              </h3>
              <p class="small text-muted">
                Upload a complete, text-based PDF up to 5 MB.
                The original PDF is saved and its text is extracted for quotation drafts. No AI is used during upload.
              </p>

              <label for="contractor-price-list" class="form-label small fw-semibold">
                Renovation price list PDF
              </label>
              <input
                id="contractor-price-list"
                :key="fileInputKey"
                type="file"
                accept=".pdf,application/pdf"
                class="form-control"
                :disabled="dashboardBusy"
                @change="selectPDF"
              />

              <p v-if="pdfFile" class="small text-warning-emphasis mt-3 mb-0">
                Selected: {{ pdfFile.name }}.
                Extract and save it, or cancel before generating quotations.
              </p>

              <div class="d-flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  class="btn btn-success"
                  :disabled="!pdfFile || dashboardBusy"
                  @click="extractPDF"
                >
                  {{ uploading ? 'Saving PDF...' : 'Upload & Save PDF' }}
                </button>
                <button
                  v-if="latestPriceList || pdfFile"
                  type="button"
                  class="btn btn-outline-secondary"
                  :disabled="dashboardBusy"
                  @click="cancelPDFSelection"
                >Cancel</button>
              </div>
            </div>

            <p class="small text-muted mt-3 mb-0">
              New drafts use the latest saved PDF text.
              Previously sent quotations keep their original prices.
            </p>
          </div>
        </section>
      </div>

      <!-- PAST PROJECTS TAB -->
      <div
        v-show="activeTab === 'photos'"
        id="panel-photos"
        role="tabpanel"
        aria-labelledby="tab-photos"
      >
        <section class="card border-0 shadow-sm rounded-4 mb-4">
          <div class="card-body p-4">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
              <h2 class="h4 fw-bold mb-0">Past Projects</h2>
              <button
                ref="newProjectButton"
                type="button"
                class="btn btn-success"
                :disabled="portfolioLoading || projectsFull"
                @click="openNewProject"
              >
                {{ projectsFull ? 'Project Limit Reached' : 'New Collection' }}
              </button>
            </div>

            <div
              v-if="portfolioError && !showNewProject"
              class="alert alert-danger mt-3 mb-0"
              role="alert"
            >
              {{ portfolioError }}
            </div>
          </div>
        </section>

        <div v-if="portfolioLoading" class="text-center py-4">
          <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Loading past projects</span>
          </div>
        </div>

        <div
          v-else-if="!portfolio.length"
          class="photo-empty text-center text-muted rounded-4 p-5"
        >
          <p class="fw-semibold mb-1">No projects yet</p>
          <p class="small mb-0">
            Name your first project above, then add photos of the finished work.
          </p>
        </div>

        <section
          v-for="project in portfolio"
          :key="getId(project)"
          class="card border-0 rounded-4 mb-4 collection-card"
          :class="{ 'opacity-50': project.saving }"
        >
          <div class="card-body p-4">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
              <label :for="'project-' + getId(project)" class="visually-hidden">
                Project name
              </label>
              <div class="project-name-field">
                <!-- Saves when it loses focus; one row unless the name has a line break. -->
                <textarea
                  :id="'project-' + getId(project)"
                  v-model="project.nameDraft"
                  class="form-control name-field project-name-input"
                  :class="nameFieldClass(project.nameDraft.length, project.nameShake)"
                  :rows="project.nameDraft.includes('\n') ? 2 : 1"
                  :maxlength="NAME_MAX"
                  title="Click to rename"
                  :disabled="project.saving"
                  :aria-invalid="Boolean(project.nameError)"
                  :aria-describedby="project.nameError ? 'project-error-' + getId(project) : undefined"
                  @input="project.nameError = ''"
                  @change="renameProject(project)"
                  @blur="keepNameFocus(project, $event)"
                  @beforeinput="guardNameLimit($event, value => (project.nameShake = value))"
                  @animationend="project.nameShake = false"
                ></textarea>
                <span class="visually-hidden" aria-live="polite">
                  {{ charactersLeftText(project.nameDraft.length) }}
                </span>
                <p
                  v-if="project.nameError"
                  :id="'project-error-' + getId(project)"
                  class="name-error beside mb-0"
                  role="alert"
                >
                  <span class="name-error-icon" aria-hidden="true">!</span>
                  {{ project.nameError }}
                </p>
              </div>
              <span class="small text-muted text-nowrap">
                {{ project.photos.length }} photo{{ project.photos.length === 1 ? '' : 's' }}
              </span>
              <button
                type="button"
                class="btn btn-sm btn-success text-nowrap"
                :disabled="project.saving || project.uploading > 0"
                @click="chooseProjectPhotos(project)"
              >
                {{ project.uploading ? `Uploading ${project.uploading}...` : '+ Add Photos' }}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger bin-button"
                :disabled="project.saving || project.uploading > 0"
                aria-label="Delete project"
                title="Delete project"
                @click="askDeleteProject(project, $event)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <g class="bin-lid">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  </g>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>

            <div v-if="project.error" class="alert alert-danger" role="alert">
              {{ project.error }}
            </div>

            <p v-if="!project.photos.length" class="small text-muted mb-0">
              No photos yet. Homeowners only see projects that have photos.
            </p>

            <ul v-else class="photo-grid list-unstyled mb-0">
              <li
                v-for="photo in project.photos"
                :key="getId(photo)"
                class="photo-tile"
                :class="{ busy: photo.saving }"
              >
                <img
                  :src="photo.url"
                  :alt="photo.caption || project.name"
                  loading="lazy"
                />
                <div class="d-flex gap-2 p-2">
                  <label :for="'caption-' + getId(photo)" class="visually-hidden">
                    Photo caption
                  </label>
                  <input
                    :id="'caption-' + getId(photo)"
                    v-model="photo.captionDraft"
                    class="form-control form-control-sm"
                    maxlength="100"
                    placeholder="Add a caption"
                    :disabled="photo.saving"
                    @change="saveCaption(project, photo)"
                    @keydown.enter.prevent="$event.target.blur()"
                  />
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    :disabled="photo.saving"
                    aria-label="Remove photo"
                    title="Remove photo"
                    @click="removeProjectPhoto(project, photo)"
                  >✕</button>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <input
          ref="photoInput"
          type="file"
          class="d-none"
          accept="image/jpeg,image/png,image/webp"
          multiple
          @change="uploadProjectPhotos"
        />
      </div>
    </template>

    <!-- NEW COLLECTION POPUP -->
    <Teleport to="body">
      <div
        v-if="showNewProject"
        class="confirm-backdrop"
        @click.self="!creatingProject && closeNewProject()"
        @keydown.esc="!creatingProject && closeNewProject()"
      >
        <form
          class="confirm-card new-collection-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-collection-title"
          novalidate
          @submit.prevent="createProject"
        >
          <h2 id="new-collection-title" class="h5 fw-bold mb-3">New Collection</h2>

          <label for="new-project-name" class="visually-hidden">Collection name</label>
          <textarea
            id="new-project-name"
            ref="newProjectField"
            v-model="newProjectName"
            class="form-control name-field new-project-name"
            :class="[nameFieldClass(nameLength, nameShake), nameError ? 'mb-0' : 'mb-3']"
            rows="2"
            :maxlength="NAME_MAX"
            placeholder="Collection Name"
            :disabled="creatingProject"
            :aria-invalid="Boolean(nameError)"
            :aria-describedby="nameError ? 'new-project-name-error' : undefined"
            @input="nameError = ''"
            @beforeinput="guardNameLimit($event, value => (nameShake = value))"
            @animationend="nameShake = false"
          ></textarea>
          <span class="visually-hidden" aria-live="polite">
            {{ charactersLeftText(nameLength) }}
          </span>
          <p
            v-if="nameError"
            id="new-project-name-error"
            class="name-error mb-3"
            role="alert"
          >
            <span class="name-error-icon" aria-hidden="true">!</span>
            {{ nameError }}
          </p>

          <div v-if="portfolioError" class="alert alert-danger py-2" role="alert">
            {{ portfolioError }}
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary"
              :disabled="creatingProject"
              @click="closeNewProject"
            >Cancel</button>
            <button type="submit" class="btn btn-success" :disabled="creatingProject">
              {{ creatingProject ? 'Adding...' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>

    <!-- DELETE COLLECTION POPUP -->
    <Teleport to="body">
      <div
        v-if="projectToDelete"
        class="confirm-backdrop"
        @click.self="cancelDeleteProject"
        @keydown.esc="cancelDeleteProject"
      >
        <div
          class="confirm-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-collection-title"
        >
          <h2 id="delete-collection-title" class="h5 fw-bold mb-4">Delete Collection?</h2>
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" @click="cancelDeleteProject">
              Cancel
            </button>
            <button
              ref="deleteConfirmButton"
              type="button"
              class="btn btn-danger"
              @click="deleteProject"
            >Okay</button>
          </div>
        </div>
      </div>
    </Teleport>
    <dialog v-if="emailPreview" ref="emailPreviewDialog" class="homeowner-email-dialog" aria-labelledby="email-preview-title" @cancel.prevent="closeEmailPreview" @close="emailPreview = null">
      <div class="email-preview-header">
        <div><h2 id="email-preview-title" class="h5 fw-bold mb-1">Preview homeowner email</h2><p class="small text-muted mb-0">To: {{ emailPreview.recipient }}</p><p class="small text-muted mb-0">Subject: {{ emailPreview.subject }}</p></div>
        <button type="button" class="btn-close" aria-label="Close email preview" @click="closeEmailPreview"></button>
      </div>
      <div class="email-preview-instructions"><strong>1.</strong> Copy and open mail. <strong>2.</strong> Click the blank message body. <strong>3.</strong> Press ⌘V / Ctrl+V to paste the formatted email.</div>
      <p v-if="emailCopyMessage" class="email-copy-status" role="status">{{ emailCopyMessage }}</p>
      <div class="email-preview-content" tabindex="0" aria-label="Formatted email preview" v-html="emailPreview.html"></div>
      <div class="email-preview-footer">
        <button type="button" class="btn btn-outline-secondary" @click="closeEmailPreview">Close</button>
        <button type="button" class="btn btn-outline-success" @click="openEmailAppOnly">Open mail app</button>
        <button type="button" class="btn btn-success" :disabled="emailCopyBusy" @click="copyFormattedEmailAndOpen">{{ emailCopyBusy ? 'Copying…' : 'Copy formatted email & open mail' }}</button>
      </div>
    </dialog>
  </div>

  <Teleport to="body">
    <dialog ref="confirmationDialog" class="eco-confirm-dialog"
      aria-labelledby="eco-confirm-title" aria-describedby="eco-confirm-message"
      @cancel.prevent="finishConfirmation(false)" @close="finishConfirmation(false)">
      <div class="eco-confirm-content">
        <div class="eco-confirm-heading">
          <span class="eco-confirm-icon" aria-hidden="true">{{ confirmation.destructive ? '!' : '✓' }}</span>
          <button type="button" class="eco-confirm-close" aria-label="Close confirmation" @click="finishConfirmation(false)">×</button>
        </div>
        <p class="eco-confirm-eyebrow">HDB ECOHOME</p>
        <h2 id="eco-confirm-title">{{ confirmation.title }}</h2>
        <p id="eco-confirm-message" class="eco-confirm-message">{{ confirmation.message }}</p>
        <div class="eco-confirm-actions">
          <button type="button" class="eco-confirm-cancel" autofocus @click="finishConfirmation(false)">Go back</button>
          <button type="button" class="eco-confirm-submit" :class="{ 'is-destructive': confirmation.destructive }" @click="finishConfirmation(true)">{{ confirmation.action }}</button>
        </div>
      </div>
    </dialog>
  </Teleport>
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


/* Quotation requests: compact summaries and progressive disclosure. */
.requests-toolbar { padding: 4px 0 18px; border-bottom: 1px solid #e5ece8; }
.requests-toolbar .form-control, .requests-toolbar .form-select { border-radius: 10px; min-height: 44px; background-color: #fafcfb; border-color: #dbe5df; }
.requests-toolbar .form-label { color: #617368; font-size: .76rem; }
.request-entry { border: 1px solid #e0e8e3; border-radius: 18px; background: #fff; box-shadow: 0 3px 14px rgba(21,55,39,.035); }
.request-facts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; padding:16px 18px; margin-bottom:18px; background:#f6f9f7; border-radius:12px; }
.request-facts > div { display:flex; flex-direction:column; gap:5px; min-width:0; }
.request-facts span { color:#6a7b71; font-size:.73rem; }
.request-facts strong { font-size:.88rem; overflow-wrap:anywhere; }
.request-disclosure { border:1px solid #e0e8e3; border-radius:12px; margin-bottom:14px; background:#fff; }
.request-disclosure > summary { display:flex; justify-content:space-between; align-items:center; gap:18px; padding:16px 18px; cursor:pointer; list-style:none; }
.request-disclosure > summary::-webkit-details-marker { display:none; }
.request-disclosure > summary > span:first-child { display:flex; flex-direction:column; gap:4px; min-width:0; }
.request-disclosure > summary strong { font-size:.9rem; }
.request-disclosure > summary small { color:#6b7c72; font-size:.76rem; font-weight:400; overflow-wrap:anywhere; }
.request-disclosure > summary:hover { background:#f7faf8; border-radius:12px; }
.request-disclosure > summary:focus-visible { outline:3px solid #198754; outline-offset:3px; border-radius:12px; }
.disclosure-arrow { display:inline-block; color:#648170; font-size:1.2rem; flex-shrink:0; }
.request-disclosure[open] > summary .disclosure-arrow { transform:rotate(180deg); }
.disclosure-content { border-top:1px solid #e8eeea; padding:18px; }
.submitted-quotation { background:#f2f9f5; border-color:#cde4d6; margin-bottom:0; }
.sent-total { font-size:1.25rem; font-weight:750; color:#167344; white-space:nowrap; }
.request-disclosure > summary .sent-eyebrow { font-size:.65rem; font-weight:700; letter-spacing:.09em; color:#358058; }
.draft-item-caption { flex:1; }
.draft-item-price { font-weight:650; font-size:.9rem; text-align:right; white-space:nowrap; color:#167344; }
.draft-warnings { font-size:.85rem; }
@media(max-width:767px) { .request-facts { grid-template-columns:repeat(2,minmax(0,1fr)); padding:14px; gap:16px 12px; } .request-disclosure > summary { padding:14px; gap:10px; } .disclosure-content { padding:14px; } .sent-total { font-size:1rem; } }
@media(max-width:420px) { .submitted-quotation > summary { align-items:flex-start; flex-wrap:wrap; } }

/* Corppass navy, as on the Corppass login button. */
.corppass-badge {
  background: #0444ce;
  color: #fff;
}

.dashboard {
  color: #24332d;
}

.card {
  overflow: hidden;
}

.dashboard-tabs {
  display: flex;
  gap: 6px;
  padding: 6px;
  border: 1px solid #e0e8e3;
  border-radius: 14px;
  background: #edf2ef;
}

.dashboard-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 48px;
  padding: 12px 22px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #5c6c62;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.dashboard-tab:hover {
  background: #e4ece7;
  color: #146c43;
}

.dashboard-tab.active {
  background: #fff;
  color: #146c43;
  box-shadow: 0 2px 7px rgb(29 61 43 / 8%);
}

.dashboard-tab:focus-visible,
.filter-buttons button:focus-visible {
  outline: 2px solid #198754;
  outline-offset: 2px;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 20px;
  background: #e1eee6;
  color: #146c43;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b9c2bc;
}

.status-dot.ready {
  background: #198754;
}

.price-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid #d1e5d9;
  border-radius: 12px;
  background: #f0f8f3;
  color: #285b3d;
}

.price-status > div {
  min-width: 0;
}

.price-status.warning {
  border-color: #eadcb6;
  background: #fffaf0;
  color: #79602d;
}

.filter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-buttons button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid #dbe5de;
  border-radius: 9px;
  background: #fff;
  color: #58675d;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.filter-buttons button.active {
  border-color: #198754;
  background: #eaf5ee;
  color: #146c43;
  font-weight: 600;
}

.filter-buttons button span {
  padding: 1px 6px;
  border-radius: 10px;
  background: #edf1ee;
  font-size: 12px;
}

.price-list-card {
  border-top: 4px solid #198754 !important;
}

.saved-list-summary {
  background: #edf7f1;
  border: 1px solid #cfe5d8;
  border-radius: 14px;
}

.file-summary,
.file-details {
  min-width: 0;
}

.file-name {
  overflow-wrap: anywhere;
}

.pdf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 56px;
  border: 1px solid #cfe5d8;
  border-radius: 10px;
  background: #fff;
  color: #198754;
  font-size: 12px;
  font-weight: 800;
}

.category-card {
  overflow: hidden;
  border: 1px solid #dce6df;
  border-radius: 12px;
}

.category-heading {
  background: #edf7f1;
  color: #146c43;
  border-bottom: 1px solid #dce6df;
}

.price-table {
  min-width: 580px;
}

.price-table th {
  padding: 12px 16px;
  background: #fafcfb;
  color: #69776d;
  font-size: 12px;
}

.price-table td {
  padding: 14px 16px;
  font-size: 14px;
}

.price-table .conditions-row td {
  padding-top: 0;
  background: #fff;
}

.price-table tr:has(+ .conditions-row) td {
  border-bottom: 0;
}

.terms-card,
.original-text {
  background: #f7faf8;
  border: 1px solid #dfe8e2;
  border-radius: 12px;
}

.terms-card li + li {
  margin-top: 6px;
}

.pdf-preview {
  max-height: 440px;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 4;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.85;
  color: #283b30;
}

.pdf-preview:focus-visible {
  outline: 2px solid #198754;
  outline-offset: 3px;
}

.upload-panel,
.empty-price-list {
  background: #f8faf9;
  border: 1px dashed #bccfc2;
  border-radius: 14px;
}

.upload-panel {
  scroll-margin-top: 110px;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.upload-panel.upload-highlighted {
  background: #edf9f1;
  border-color: #198754;
  border-style: solid;
  box-shadow: 0 0 0 4px rgb(25 135 84 / 15%);
}

.upload-panel.upload-highlighted input[type="file"] {
  border-color: #198754;
  box-shadow: 0 0 0 3px rgb(25 135 84 / 15%);
}

.upload-panel input[type="file"] {
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

#upload-heading:focus {
  outline: 2px solid #198754;
  outline-offset: 4px;
  border-radius: 4px;
}

.evidence-box {
  background: #f7faf8;
  border-left: 3px solid #bddcc9;
  border-radius: 6px;
  overflow-wrap: anywhere;
}

.preserve-lines {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.quotation-line {
  border-bottom: 1px solid #e6ece8;
}

.quotation-line:last-child {
  border-bottom: 0;
  padding-bottom: 0 !important;
  margin-bottom: 0 !important;
}

.notification-region {
  position: fixed;
  top: 90px;
  right: 24px;
  z-index: 1090;
  width: min(440px, calc(100vw - 32px));
}

.temporary-message {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border: 1px solid #c8ddcf;
  border-left: 4px solid #198754;
  border-radius: 12px;
  background: #fff;
  color: #254b33;
  font-size: 14px;
  line-height: 1.6;
}

.message-close {
  flex-shrink: 0;
  margin-left: auto;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: #526d5b;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.layout-view {
  height: 420px;
  border-radius: 0.75rem;
  overflow: hidden;
}

fieldset {
  min-width: 0;
}


/* The bin's lid is hinged at its right end, and may swing past the icon's edge. */
.bin-button svg {
  overflow: visible;
}

.bin-lid {
  transform-box: fill-box;
  transform-origin: right bottom;
  transition: transform 0.2s ease;
}

/* The lid lifts while the button is hovered or focused, and drops when it is not. */
.bin-button:hover:not(:disabled) .bin-lid,
.bin-button:focus-visible .bin-lid {
  transform: translateY(-1px) rotate(20deg);
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1055;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(18 38 27 / 45%);
}

.confirm-card {
  width: 100%;
  max-width: 360px;
  padding: 24px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 48px -12px rgb(16 40 28 / 35%);
}

.photo-empty {
  border: 1px dashed #c9d8cf;
  background: #f7faf8;
}

/* Wide enough for a typical 40-character name (the limit) in the name field. */
.new-collection-card {
  max-width: calc(40ch + 1.5rem + 2px + 48px);
}

.new-project-name {
  resize: none;
}


/* The rename field, with its message beside it (below it when there is no room). */
.project-name-field {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  max-width: 100%;
  margin-right: auto;
}

.project-name-input {
  width: calc(40ch + 1rem + 2px);
  max-width: 100%;
  margin-left: -0.5rem;
  padding: 0.25rem 0.5rem;
  border-color: transparent;
  background: transparent;
  font-size: 1.15rem;
  font-weight: 700;
  resize: none;
}

.project-name-input:hover {
  border-color: #dee2e6;
}

/* The message for a collection name field that is empty or too short,
   only as wide as its text. */
.name-error {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 10px;
  border: 1px solid #f1aeb5;
  border-radius: 8px;
  background: #f8d7da;
  color: #842029;
  font-size: 0.875rem;
}

.name-error.beside {
  margin-top: 0;
  white-space: nowrap;
}

.name-error-icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #dc3545;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

/* Collection name fields near and at the 40-character limit. */
.name-field {
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.name-field.near-limit {
  border-color: #f0ad4e;
  box-shadow: 0 0 0 0.25rem rgb(240 173 78 / 25%);
}

.name-field.at-limit {
  border-color: #dc3545;
  box-shadow: 0 0 0 0.25rem rgb(220 53 69 / 25%);
}

.name-field.shake {
  animation: name-shake 0.3s ease;
}

@keyframes name-shake {
  20%,
  60% {
    transform: translateX(-4px);
  }

  40%,
  80% {
    transform: translateX(4px);
  }
}

/* One row of photos; scroll sideways when a project has more than fit. */
.photo-grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 240px;
  gap: 16px;
  overflow-x: auto;
  /* Room for a hovered tile's lift and shadow, which the scrolling row would clip. */
  margin: -8px -8px 0;
  padding: 8px 8px 16px;
  scroll-padding-inline: 8px;
  scroll-snap-type: x proximity;
}

.photo-grid > li {
  scroll-snap-align: start;
}

.photo-tile {
  overflow: hidden;
  border: 1px solid #e0e8e3;
  border-radius: 12px;
  background: #fff;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

/* A collection lifts and gains a green outline while the pointer or focus is in it. */
.collection-card {
  box-shadow: 0 0.125rem 0.25rem rgb(0 0 0 / 7.5%);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.collection-card:hover,
.collection-card:focus-within {
  box-shadow:
    0 0 0 1px #a3cfbb,
    0 12px 28px -12px rgb(20 108 67 / 30%);
  transform: translateY(-2px);
}

/* The tile under the pointer, or holding keyboard focus, lifts and turns green. */
.photo-tile:hover,
.photo-tile:focus-within {
  border-color: #198754;
  box-shadow: 0 8px 18px -8px rgb(20 108 67 / 35%);
  transform: translateY(-4px);
}

.photo-tile.busy {
  opacity: 0.6;
}

.photo-tile img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: #edf2ef;
}

@media (prefers-reduced-motion: reduce) {
  .name-field.shake {
    animation: none;
  }

  .collection-card,
  .photo-tile {
    transition: none;
  }

  .collection-card:hover,
  .collection-card:focus-within,
  .photo-tile:hover,
  .photo-tile:focus-within {
    transform: none;
  }

  .bin-lid,
  .upload-panel,
  .upload-panel input[type="file"] {
    transition: none;
  }
}

@media (max-width: 575.98px) {
  .dashboard-tabs {
    flex-wrap: wrap;
  }

  .dashboard-tab {
    flex: 1;
    gap: 6px;
    padding: 10px 8px;
    font-size: 13px;
  }

  .pdf-preview {
    max-height: 340px;
    font-size: 12px;
  }

  .file-summary {
    width: 100%;
  }

  .saved-list-summary .btn {
    flex: 1 1 auto;
  }

  .notification-region {
    top: 80px;
    right: 16px;
  }

  .layout-view {
    height: 340px;
  }
}

/* Shared visual language with MyQuotations. */
.dashboard-status-filters { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; padding:8px; background:#f7f9f8; border:1px solid #e0e8e3; border-radius:14px; }
.dashboard-status-filter { --status-ink:#475569; --status-soft:#edf1f5; --status-line:#cbd5e1; display:flex; align-items:center; justify-content:center; gap:10px; padding:15px 12px; border:1px solid #e5ebe7; border-radius:10px; background:#fff; color:var(--status-ink); font-size:.88rem; font-weight:600; transition:background .16s ease,border-color .16s ease; }
.dashboard-status-filter::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--status-ink); flex-shrink:0; }
.dashboard-status-filter.status-pending { --status-ink:#92400e; --status-soft:#fff5da; --status-line:#e9bc58; }
.dashboard-status-filter.status-received { --status-ink:#146c43; --status-soft:#eaf6ee; --status-line:#81b99a; }
.dashboard-status-filter.status-rejected { --status-ink:#b42332; --status-soft:#fff0f1; --status-line:#e8a2aa; }
.dashboard-status-filter strong { display:inline-flex; align-items:center; justify-content:center; min-width:28px; padding:4px 8px; border-radius:8px; background:var(--status-soft); color:var(--status-ink); font-size:.75rem; }
.dashboard-status-filter:hover { color:var(--status-ink); background:var(--status-soft); border-color:var(--status-line); }
.dashboard-status-filter.is-active { background:var(--status-soft); border-color:var(--status-line); box-shadow:inset 0 -3px 0 var(--status-ink),0 2px 6px rgba(20,40,30,.04); }
.dashboard-status-filter.is-active strong { color:#fff; background:var(--status-ink); }
.dashboard-status-filter:focus-visible { outline:3px solid var(--status-ink); outline-offset:3px; }
.request-entry { border-radius:16px; }
.request-facts { background:#f6f9f7; }
.sent-quotation-wrap .submitted-quotation { background:#f0f8f3; border-color:#d4e8da; }
@media(max-width:480px) { .dashboard-status-filters { grid-template-columns:repeat(2,minmax(0,1fr)); } .dashboard-status-filter { padding:12px 8px; } }
@media(prefers-reduced-motion:reduce) { .dashboard-status-filter { transition:none; } }


/* Consistent View / Hide controls in the quotation request list. */
.request-entry details > summary { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:15px 18px; border-radius:10px; background:#f0f7f3; color:#194f35; cursor:pointer; list-style:none; }
.request-entry details > summary::-webkit-details-marker { display:none; }
.request-entry details > summary::marker { content:''; }
.request-entry details > summary:hover { background:#e3f0e8; }
.request-entry details > summary:focus-visible { outline:3px solid #198754; outline-offset:-3px; }
.standard-expand { display:inline-flex; align-items:center; gap:8px; flex-shrink:0; padding:6px 10px; border:1px solid #c6dccd; border-radius:8px; background:#fff; color:#146c43; font-size:.75rem; font-weight:650; margin-left:auto; }
.standard-expand-label::before { content:'View'; }
.request-entry details[open] > summary .standard-expand-label::before { content:'Hide'; }
.request-entry details[open] > summary .standard-chevron { transform:rotate(180deg); }
.request-entry .draft-item-price { white-space:normal; }
.request-entry .sent-total { font-size:1.1rem; }
@media(max-width:600px) { .request-entry .submitted-quotation > summary { flex-wrap:wrap; } .request-entry details > summary { padding:13px; } }

.layout-expand-button.is-expanded .standard-chevron { transform:rotate(180deg); }

/* Rounded tabs matching the homeowner profile navigation. */
.dashboard-tabs { position:relative; isolation:isolate; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0; width:min(100%,820px); margin-left:auto; margin-right:auto; padding:6px; border:1px solid #d6e8dc; border-radius:999px; background:#fff; box-shadow:0 8px 20px rgba(28,65,43,.08); overflow:visible; }
.dashboard-tabs::before { content:''; position:absolute; z-index:0; left:6px; top:6px; bottom:6px; width:calc((100% - 12px) / 3); border-radius:999px; background:linear-gradient(115deg,#16854e,#26bf6b); box-shadow:0 5px 12px rgba(23,143,79,.23); transform:translateX(calc(var(--active-tab-index,0) * 100%)); transition:transform .32s cubic-bezier(.22,.8,.25,1); pointer-events:none; }
.dashboard-tab { position:relative; z-index:1; display:flex; flex:initial; align-items:center; justify-content:center; gap:9px; min-width:0; min-height:54px; padding:12px 16px; border:0; border-radius:999px; background:transparent; box-shadow:none; color:#52645a; font-size:.95rem; font-weight:650; white-space:normal; text-align:center; transition:color .2s ease; }
.dashboard-tab:hover { background:transparent; color:#167344; }
.dashboard-tab.active { background:transparent; color:white; box-shadow:none; }
.dashboard-tab.active:hover { color:#fff; }
.dashboard-tab:focus-visible { outline:3px solid #135c3a; outline-offset:3px; }
.dashboard-tab-icon { display:inline-flex; font-size:1.15rem; flex-shrink:0; }
.dashboard-tab .tab-count { display:inline-flex; align-items:center; justify-content:center; min-width:24px; padding:3px 7px; border-radius:999px; background:#edf4ef; color:#34714d; font-size:.73rem; }
.dashboard-tab.active .tab-count { background:rgba(255,255,255,.23); color:#fff; }
.dashboard-tab.active .status-dot { background:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.15); }
@media(max-width:600px) { .dashboard-tabs { padding:5px; border-radius:28px; } .dashboard-tabs::before { left:5px; top:5px; bottom:5px; width:calc((100% - 10px) / 3); border-radius:24px; } .dashboard-tab { font-size:.78rem; padding:10px 6px; gap:5px; min-height:58px; border-radius:24px; } .dashboard-tab-icon { display:none; } .dashboard-tab .tab-count { min-width:20px; padding:2px 5px; font-size:.65rem; } }
@media(prefers-reduced-motion:reduce) { .dashboard-tabs::before,.dashboard-tab { transition:none; } }


.dashboard-status-filters { grid-template-columns:repeat(5,minmax(0,1fr)); }
.dashboard-status-filter.status-accepted { --status-ink:#1d4ed8; --status-soft:#eff6ff; --status-line:#93b4ed; }
@media(max-width:700px) { .dashboard-status-filters { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media(max-width:480px) { .dashboard-status-filters { grid-template-columns:repeat(2,minmax(0,1fr)); } }

.homeowner-contact-strip { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; padding:15px 18px; border:1px solid #d7e7dd; border-radius:12px; background:#f5faf7; }
.contact-text { display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; font-size:.86rem; overflow-wrap:anywhere; }
.contact-caption { width:100%; color:#61776a; font-size:.72rem; }

/* Animated status pills: one sliding highlight, with a colour for each status. */
.status-pill-scroll { width:100%; overflow-x:auto; padding:4px 3px 9px; scrollbar-width:thin; -webkit-overflow-scrolling:touch; }
.dashboard-status-filters.animated-filter-track { position:relative; isolation:isolate; display:grid; grid-template-columns:repeat(var(--pill-count,5),minmax(0,1fr)); gap:0; width:100%; min-width:560px; margin:0; padding:6px; border:1px solid #dce7df; border-radius:999px; background:#fff; box-shadow:0 5px 16px rgba(28,65,43,.055); }
.dashboard-status-filters.animated-filter-track::before { content:''; position:absolute; z-index:0; top:6px; bottom:6px; left:6px; width:calc((100% - 12px) / var(--pill-count,5)); border-radius:999px; background-color:var(--pill-colour); background-image:linear-gradient(110deg,rgba(255,255,255,.09),rgba(0,0,0,.06)); box-shadow:0 4px 10px rgba(25,50,35,.17); transform:translateX(calc(var(--pill-index,0) * 100%)); transition:transform .34s cubic-bezier(.22,.8,.25,1),background-color .28s ease; pointer-events:none; }
.animated-filter-track .dashboard-status-filter { position:relative; z-index:1; display:flex; align-items:center; justify-content:center; gap:9px; min-height:52px; padding:12px 10px; border:0; border-radius:999px; background:transparent; box-shadow:none; color:#5b6c61; white-space:nowrap; font-size:.88rem; font-weight:650; transition:color .18s ease; }
.animated-filter-track .dashboard-status-filter::before { width:6px; height:6px; background:currentColor; opacity:.8; }
.animated-filter-track .dashboard-status-filter:hover { background:transparent; color:var(--status-ink,#146c43); box-shadow:none; }
.animated-filter-track .dashboard-status-filter.is-active,.animated-filter-track .dashboard-status-filter.is-active:hover { background:transparent; border:0; color:#fff; box-shadow:none; }
.animated-filter-track .dashboard-status-filter strong { min-width:25px; padding:3px 7px; border-radius:999px; background:#eef3f0; color:inherit; font-size:.73rem; }
.animated-filter-track .dashboard-status-filter.is-active strong { background:rgba(255,255,255,.23); color:white; }
.animated-filter-track .dashboard-status-filter:focus-visible { outline:3px solid #153c2a; outline-offset:-3px; }
@media(max-width:600px) { .dashboard-status-filters.animated-filter-track { min-width:530px; } .animated-filter-track .dashboard-status-filter { min-height:48px; font-size:.81rem; gap:7px; } }
@media(prefers-reduced-motion:reduce) { .dashboard-status-filters.animated-filter-track::before,.animated-filter-track .dashboard-status-filter { transition:none; } }


/* Missing prices must not look like completed, priced rows. */
.request-entry .draft-item.draft-item-needs-price { border-color:#e9a5ac; }
.request-entry .draft-item.draft-item-needs-price > summary { background:#fff0f1; color:#a51f32; }
.request-entry .draft-item.draft-item-needs-price > summary:hover { background:#ffe5e8; }
.request-entry .draft-item.draft-item-needs-price > summary .draft-item-price { color:#b42338; }
.request-entry .draft-item.draft-item-needs-price > summary small { color:#97535d; }
.request-entry .draft-item.draft-item-needs-price > summary .standard-expand { color:#a51f32; border-color:#e5adb4; }
.draft-email-action { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:15px 16px; border:1px solid #dce7df; border-radius:12px; background:#fafcfb; }
.draft-email-action > div { flex:1; min-width:220px; }

.homeowner-email-dialog { width:min(960px,94vw); max-height:92vh; padding:0; border:1px solid #d5e4d9; border-radius:18px; color:#26392e; box-shadow:0 20px 90px rgba(14,40,25,.28); }
.homeowner-email-dialog[open] { display:flex; flex-direction:column; }
.homeowner-email-dialog::backdrop { background:rgba(13,31,23,.5); }
.email-preview-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; padding:20px 24px; border-bottom:1px solid #e3ece6; flex-shrink:0; }
.email-preview-header p { overflow-wrap:anywhere; }
.email-preview-instructions { padding:12px 24px; font-size:.8rem; background:#eff7f2; flex-shrink:0; }
.email-copy-status { margin:0; padding:10px 24px; background:#fff5db; font-size:.82rem; flex-shrink:0; }
.email-preview-content { padding:24px; overflow:auto; background:#f5f7f6; min-height:100px; }
.email-preview-footer { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:10px; padding:16px 24px; border-top:1px solid #e3ece6; background:white; flex-shrink:0; }
@media(max-width:600px) { .email-preview-content { padding:12px; } .email-preview-header,.email-preview-footer { padding:16px; } }

.quote-action { border:1px solid; border-radius:999px; padding:10px 17px; font-size:.83rem; font-weight:650; transition:transform .18s ease,box-shadow .18s ease,background .18s ease; }
.quote-action-revise { color:#89540a; border-color:#e8c26a; background:#fff4d8; }
.quote-action-delete { color:#b42338; border-color:#e5a2ad; background:#fff0f2; }
.quote-action:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 5px 12px rgba(30,40,30,.1); }
.quote-action:disabled { opacity:.55; cursor:wait; }
.quote-action:focus-visible { outline:3px solid currentColor; outline-offset:3px; }
@media(prefers-reduced-motion:reduce) { .quote-action { transition:none; } .quote-action:hover:not(:disabled) { transform:none; } }

.sent-quotation-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; padding:16px 0; }
.sent-quotation-actions > p { flex:1; min-width:220px; }
.sent-action-buttons { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:10px; margin-left:auto; }
.sent-action-buttons .quote-action { display:inline-flex; align-items:center; justify-content:center; min-height:42px; white-space:nowrap; }
@media(max-width:600px) { .sent-quotation-actions { align-items:flex-start; } .sent-action-buttons { width:100%; margin-left:0; justify-content:flex-start; } }
@media(max-width:420px) { .sent-action-buttons .quote-action { flex:1; white-space:normal; text-align:center; } }
.quantity-help { padding:12px 14px; border:1px solid #dce7df; border-radius:10px; background:#f6f9f7; color:#52695c; line-height:1.65; }

/* Shared confirmation styling, kept self-contained for replacement delivery. */
.eco-confirm-dialog{box-sizing:border-box;width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid #d7e7df;border-radius:24px;color:#203d30;background:#fff;box-shadow:0 24px 80px #102f3540;overflow:auto;font-family:inherit}
.eco-confirm-dialog::backdrop{background:rgba(16,36,29,.48);backdrop-filter:blur(4px)}
.eco-confirm-dialog[open]{animation:eco-confirm-enter .18s ease-out}
.eco-confirm-content{padding:28px}.eco-confirm-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.eco-confirm-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:16px;background:#e8f6ee;color:#187b4d;font-size:24px;font-weight:800}
.eco-confirm-close{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:#f1f6f3;color:#52695b;font-size:26px;line-height:1}
.eco-confirm-eyebrow{margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.12em;color:#408460}
.eco-confirm-dialog h2{margin:0 0 14px;font-size:25px;font-weight:750;letter-spacing:-.02em;color:#203d30}
.eco-confirm-message{white-space:pre-line;overflow-wrap:anywhere;color:#5a6e61;line-height:1.65;margin:0 0 26px;font-size:15px}
.eco-confirm-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.eco-confirm-actions button{padding:11px 20px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer;transition:background .16s,box-shadow .16s}
.eco-confirm-cancel{border:1px solid #d6e4da;background:#fff;color:#426450}.eco-confirm-cancel:hover{background:#f1f7f3}
.eco-confirm-submit{border:1px solid #188653;background:#188653;color:#fff;box-shadow:0 4px 12px #18865322}.eco-confirm-submit:hover{background:#126b42}
.eco-confirm-submit.is-destructive{background:#a83b3b;border-color:#a83b3b}.eco-confirm-submit.is-destructive:hover{background:#8c2e2e}
.eco-confirm-dialog button:focus-visible{outline:3px solid #78b993;outline-offset:3px}
@keyframes eco-confirm-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:480px){.eco-confirm-content{padding:22px}.eco-confirm-actions{flex-direction:column-reverse}.eco-confirm-actions button{width:100%}.eco-confirm-dialog h2{font-size:23px}}
@media(prefers-reduced-motion:reduce){.eco-confirm-dialog[open]{animation:none}.eco-confirm-actions button{transition:none}}
</style>