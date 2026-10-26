<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import FloorPlan3D from '@/components/FloorPlan3D.vue'

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
const priceListSearch = ref('')
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
  return ['quoted', 'accepted'].includes(request.status)
}

const pendingCount = computed(() =>
  myRequests.value.filter(request => request.status === 'pending').length
)

const sentCount = computed(() =>
  myRequests.value.filter(isSent).length
)

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
      if (statusFilter.value === 'sent' && !isSent(request)) {
        return false
      }
      if (!query) return true

      const searchable = [
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

const structuredData = computed(() =>
  latestPriceList.value?.structuredData || null
)

const hasStructuredData = computed(() =>
  latestPriceList.value?.structuringStatus === 'completed' &&
  Array.isArray(structuredData.value?.prices)
)

const priceGroups = computed(() => {
  const groups = new Map()
  const query = priceListSearch.value.trim().toLowerCase()

  for (const entry of structuredData.value?.prices || []) {
    const category = entry.category || 'Other Services'
    const searchable = [
      category,
      entry.service,
      entry.flatType,
      entry.unit,
      entry.price,
      entry.maxPrice,
      entry.priceBasis,
      ...(entry.conditions || [])
    ].join(' ').toLowerCase()

    if (query && !searchable.includes(query)) continue

    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(entry)
  }

  return Array.from(groups, ([category, entries]) => ({
    category,
    entries
  }))
})

const informationSections = computed(() => {
  const data = structuredData.value
  if (!data) return []

  return [
    { title: 'Payment Terms', items: data.paymentTerms || [] },
    { title: 'General Conditions', items: data.generalConditions || [] },
    { title: 'Additional Notes', items: data.additionalNotes || [] }
  ].filter(section => section.items.length)
})

function formatPriceEntry(entry) {
  if (entry.price == null || !Number.isFinite(Number(entry.price))) {
    return 'Not specified'
  }

  if (entry.priceBasis === 'range' && entry.maxPrice != null) {
    return `${formatMoney(entry.price)} – ${formatMoney(entry.maxPrice)}`
  }

  if (entry.priceBasis === 'from') {
    return `From ${formatMoney(entry.price)}`
  }

  return formatMoney(entry.price)
}

function flatTypeLabel(value) {
  if (!value) return 'Not specified'

  return {
    '2-room': '2-room HDB',
    '3-room': '3-room HDB',
    '4-room': '4-room HDB',
    '5-room': '5-room HDB',
    executive: 'Executive HDB'
  }[value] || value
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
    accepted: 'bg-info-subtle text-info-emphasis'
  }[status] || 'bg-secondary-subtle'
}

function statusLabel(status) {
  return {
    pending: 'Pending Response',
    quoted: 'Quotation Sent',
    rejected: 'Rejected',
    accepted: 'Accepted'
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
  priceListSearch.value = ''
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

function refreshDashboard() {
  if (dashboardBusy.value) return

  if (
    (requests.value.some(request => request.aiDraft) || pdfFile.value) &&
    !confirm('Refreshing will discard unsent drafts and your selected PDF. Continue?')
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
    !confirm('Saving a replacement price list will clear unsent drafts on this page. Continue?')
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
    priceListSearch.value = ''
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
      !confirm('Generating again will replace this unsent draft. Continue?')
    ) return

    request.aiDraft = null

    const { data } = await axios.post(`${API}/generate-quotation`, {
      requestId: getId(request),
      contractorId: getCurrentContractorId()
    })

    const draft = data.draft

    if (!draft || !Array.isArray(draft.items)) {
      throw new Error('Invalid AI response.')
    }

    request.aiDraft = {
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

// QUOTATION CALCULATIONS

function getItemAmount(item) {
  if (
    item.unitPrice == null ||
    item.unitPrice === '' ||
    item.quantity == null ||
    item.quantity === '' ||
    !Number.isFinite(Number(item.unitPrice)) ||
    !Number.isFinite(Number(item.quantity)) ||
    Number(item.unitPrice) < 0 ||
    Number(item.quantity) <= 0
  ) return null

  const amount = Math.round(
    Number(item.quantity) * Number(item.unitPrice) * 100
  ) / 100

  return Number.isFinite(amount) ? amount : null
}

function getDraftTotal(request) {
  if (!request.aiDraft) return 0

  return Math.round(
    request.aiDraft.items.reduce(
      (total, item) => total + (getItemAmount(item) ?? 0),
      0
    ) * 100
  ) / 100
}

function hasMissingPrices(request) {
  return !request.aiDraft ||
    request.aiDraft.items.some(item => getItemAmount(item) === null)
}

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

// SEND OR REJECT

async function submitQuotation(request) {
  if (
    !request.aiDraft ||
    dashboardBusy.value ||
    request.status !== 'pending'
  ) return

  if (pdfFile.value) {
    await goToPriceListUpload(
      'Save or cancel your selected PDF before sending this quotation.'
    )
    return
  }

  request.actionError = ''
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

  if (!confirm(
    `Submit quotation of ${formatMoney(total)}?\n\n` +
    'Please confirm that you have reviewed all prices and services.'
  )) return

  const requestId = getId(request)
  savingId.value = requestId

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
    notify('Quotation sent successfully.')
  } catch (error) {
    console.error(error)
    request.actionError =
      error.response?.data?.error || 'Unable to submit quotation.'
  } finally {
    savingId.value = ''
  }
}

async function rejectRequest(request) {
  if (dashboardBusy.value || request.status !== 'pending') return
  if (!confirm('Are you sure you want to reject this request?')) return

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
  } finally {
    savingId.value = ''
  }
}

onMounted(loadData)

onUnmounted(() => {
  clearTimeout(messageTimer)
  clearTimeout(uploadHighlightTimer)
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
          Quotation Requests <span class="tab-count">{{ pendingCount }}</span>
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
          Price List
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
          Portfolio <span class="tab-count">{{ portfolio.length }}</span>
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

        <div class="row g-3 mb-4">
          <div class="col-md-4">
            <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
              <p class="text-muted mb-1">Total Requests</p>
              <h2 class="fw-bold mb-0">{{ myRequests.length }}</h2>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
              <p class="text-muted mb-1">Pending Requests</p>
              <h2 class="fw-bold text-warning mb-0">{{ pendingCount }}</h2>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card border-0 shadow-sm rounded-4 p-4 h-100">
              <p class="text-muted mb-1">Quotations Sent</p>
              <h2 class="fw-bold text-success mb-0">{{ sentCount }}</h2>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center gap-3 mb-3">
          <h2 class="h4 fw-bold mb-0">Quotation Requests</h2>
          <button
            type="button"
            class="btn btn-outline-success"
            :disabled="dashboardBusy"
            @click="refreshDashboard"
          >Refresh</button>
        </div>

        <!-- SEARCH, FILTER AND SORT -->
        <div class="card border-0 shadow-sm rounded-4 mb-4">
          <div class="card-body p-3 p-md-4">
            <div class="row g-3 align-items-end">
              <div class="col-lg-7">
                <label for="request-search" class="form-label small fw-semibold">
                  Search requests
                </label>
                <input
                  id="request-search"
                  v-model="requestSearch"
                  type="search"
                  class="form-control"
                  placeholder="Search household, flat type, service or description"
                />
              </div>
              <div class="col-lg-5">
                <label for="date-sort" class="form-label small fw-semibold">
                  Requested date
                </label>
                <select id="date-sort" v-model="dateSort" class="form-select">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>

            <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3">
              <div class="filter-buttons" role="group" aria-label="Filter requests by status">
                <button
                  type="button"
                  :class="{ active: statusFilter === 'all' }"
                  :aria-pressed="statusFilter === 'all'"
                  @click="statusFilter = 'all'"
                >All <span>{{ myRequests.length }}</span></button>
                <button
                  type="button"
                  :class="{ active: statusFilter === 'pending' }"
                  :aria-pressed="statusFilter === 'pending'"
                  @click="statusFilter = 'pending'"
                >Pending <span>{{ pendingCount }}</span></button>
                <button
                  type="button"
                  :class="{ active: statusFilter === 'sent' }"
                  :aria-pressed="statusFilter === 'sent'"
                  @click="statusFilter = 'sent'"
                >Sent <span>{{ sentCount }}</span></button>
              </div>
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
          class="card border-0 shadow-sm rounded-4 mb-4"
        >
          <div class="card-body p-4">
            <div class="d-flex justify-content-between flex-wrap gap-3 mb-4">
              <div>
                <h3 class="h5 fw-bold mb-1">
                  {{ request.household?.name || 'Unnamed Household' }}
                </h3>
                <small class="text-muted">
                  Requested {{ formatDate(request.createdAt) }}
                </small>
              </div>
              <span class="badge align-self-start" :class="statusClass(request.status)">
                {{ statusLabel(request.status) }}
              </span>
            </div>

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
                  class="btn btn-outline-success fw-semibold"
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

            <p class="fw-semibold mb-2">Services Required</p>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <span
                v-for="service in request.services || []"
                :key="service"
                class="badge bg-success-subtle text-success-emphasis"
              >{{ service }}</span>
            </div>

            <p class="fw-semibold mb-1">Renovation Description</p>
            <p class="text-muted preserve-lines">{{ request.description }}</p>

            <!-- PENDING REQUEST -->
            <div
              v-if="request.status === 'pending'"
              class="bg-light rounded-3 p-3 p-md-4 mt-4"
            >
              <h4 class="h6 fw-bold mb-2">Prepare Quotation</h4>
              <p class="small text-muted">
                Generate a draft from your latest saved price list,
                then review it before sending.
              </p>

              <button
                type="button"
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

              <fieldset
                v-if="request.aiDraft"
                class="bg-white border rounded-3 p-3 p-md-4 mt-2"
                :disabled="dashboardBusy"
              >
                <legend class="visually-hidden">Review AI quotation</legend>
                <h4 class="h5 fw-bold text-success mb-2">Review AI Quotation</h4>
                <p class="small text-muted mb-4">
                  Verify prices, quantities and conditions against your price list.
                </p>

                <div v-if="request.aiDraft.warnings.length" class="alert alert-warning">
                  <strong>AI Warnings</strong>
                  <ul class="mb-0 mt-2">
                    <li v-for="(warning, index) in request.aiDraft.warnings" :key="index">
                      {{ warning }}
                    </li>
                  </ul>
                </div>

                <div
                  v-for="(item, index) in request.aiDraft.items"
                  :key="index"
                  class="border rounded-3 p-3 mb-3"
                >
                  <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
                    <h5 class="h6 fw-bold mb-0">Item {{ index + 1 }}</h5>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger"
                      @click="removeQuotationItem(request, index)"
                    >Remove</button>
                  </div>

                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label small d-block">
                        Service
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
                        Quantity
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
                        Unit Price (S$)
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

                  <div class="evidence-box p-3 mt-3">
                    <p class="small fw-semibold mb-1">Price List Evidence</p>
                    <p class="small text-muted preserve-lines mb-0">
                      {{ item.source || 'No supporting excerpt provided.' }}
                    </p>
                  </div>
                  <p v-if="item.needsReview" class="small text-warning-emphasis mt-2 mb-0">
                    This item requires manual verification.
                  </p>
                </div>

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
                  {{ savingId === getId(request) ? 'Submitting...' : 'Approve & Send Quotation' }}
                </button>
              </fieldset>

              <div v-if="request.actionError" class="alert alert-danger mt-3" role="alert">
                {{ request.actionError }}
              </div>

              <div class="border-top pt-3 mt-4">
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

            <!-- SENT QUOTATION -->
            <div
              v-if="request.quotation && isSent(request)"
              class="bg-success-subtle rounded-3 p-3 p-md-4 mt-4"
            >
              <h4 class="h6 fw-bold">Quotation Submitted</h4>
              <p class="mb-3">
                <strong>Total:</strong> {{ formatMoney(request.quotation.total) }}
              </p>

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

            <!-- ORGANISED PRICE LIST -->
            <div
              v-if="priceListLoaded && latestPriceList && showPriceList"
              id="saved-price-list-viewer"
              class="mt-4"
            >
              <template v-if="hasStructuredData">
                <div class="alert alert-warning small">
                  AI-organised information needs checking against the original PDF.
                  This display does not mark it as approved.
                </div>

                <label for="price-list-search" class="form-label small fw-semibold">
                  Search prices
                </label>
                <input
                  id="price-list-search"
                  v-model="priceListSearch"
                  type="search"
                  class="form-control mb-4"
                  placeholder="Search category, service, flat type or condition"
                />

                <section
                  v-for="group in priceGroups"
                  :key="group.category"
                  class="category-card mb-3"
                >
                  <div class="category-heading p-3">
                    <h3 class="h6 fw-bold mb-0">{{ group.category }}</h3>
                  </div>

                  <div class="table-responsive">
                    <table class="table price-table align-middle mb-0">
                      <caption class="visually-hidden">
                        Prices and conditions for {{ group.category }}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Service</th>
                          <th scope="col">Property Type</th>
                          <th scope="col">Price</th>
                          <th scope="col">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        <template v-for="(entry, index) in group.entries" :key="index">
                          <tr>
                            <td class="fw-semibold">{{ entry.service }}</td>
                            <td>{{ flatTypeLabel(entry.flatType) }}</td>
                            <td class="fw-semibold text-success">
                              {{ formatPriceEntry(entry) }}
                              <span
                                v-if="entry.price != null && entry.priceBasis === 'unspecified'"
                                class="d-block small text-muted fw-normal"
                              >Price basis not specified</span>
                            </td>
                            <td>{{ entry.unit || 'Not specified' }}</td>
                          </tr>
                          <tr class="conditions-row">
                            <td colspan="4">
                              <div v-if="entry.conditions?.length" class="mb-2">
                                <strong class="small">Conditions & Inclusions</strong>
                                <ul class="small mb-0 mt-1">
                                  <li v-for="(condition, i) in entry.conditions" :key="i">
                                    {{ condition }}
                                  </li>
                                </ul>
                              </div>
                              <details v-if="entry.source" class="small">
                                <summary class="text-success">View Source Evidence</summary>
                                <p class="preserve-lines text-muted mt-2 mb-0">
                                  {{ entry.source }}
                                </p>
                              </details>
                            </td>
                          </tr>
                        </template>
                      </tbody>
                    </table>
                  </div>
                </section>

                <p v-if="!priceGroups.length" class="text-muted">
                  {{
                    priceListSearch.trim()
                      ? 'No matching price entries. Try another search.'
                      : 'No individual price entries were identified.'
                  }}
                </p>

                <div class="row g-3 mt-1">
                  <div
                    v-for="section in informationSections"
                    :key="section.title"
                    class="col-md-6"
                  >
                    <div class="terms-card p-3 h-100">
                      <h3 class="h6 fw-bold">{{ section.title }}</h3>
                      <ul class="small mb-0 ps-3">
                        <li v-for="(item, index) in section.items" :key="index">
                          {{ item }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </template>

              <div v-else class="alert alert-warning small">
                {{
                  latestPriceList.structuringWarning ||
                  'This version has no organised price data. You can read its original extracted text below. Upload again to try automatic organisation.'
                }}
              </div>

              <details class="original-text mt-4 p-3" :open="!hasStructuredData">
                <summary class="fw-semibold text-success">
                  View Original Extracted Text
                </summary>
                <pre
                  v-if="savedPriceListText"
                  class="pdf-preview mt-3 mb-0"
                  tabindex="0"
                  aria-label="Original extracted price-list text"
                >{{ savedPriceListText }}</pre>
                <p v-else class="small text-muted mt-3 mb-0">
                  No extracted text is available.
                </p>
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
                Prices and conditions will be extracted and organised automatically.
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
                  {{ uploading ? 'Extracting & Organising...' : 'Extract PDF Text & Save' }}
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
  </div>
</template>

<style scoped>
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
</style>