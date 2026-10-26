<style scoped src="../assets/style.css"></style>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'

// A website-registered contractor's portfolio, opened from View Portfolio in Find Contractors:
// their details and a cover card for each past project, which opens that project's photos.
const props = defineProps({ contractor: { type: Object, required: true } })
const emit = defineEmits(['close'])

const projects = ref([])
const loading = ref(true)
const error = ref('')
const open = ref(null) // { project, index } of the photo shown large, or null for the grid
const dialog = ref(null)
const scrolled = ref(false) // projects scrolled under the header, which then casts a shadow

const openPhoto = computed(() => open.value?.project.photos[open.value.index] || null)
const contractorId = computed(() =>
  String(props.contractor._id?.$oid || props.contractor._id)
)

const REFRESH_MS = 10000

async function loadProjects() {
  const { data } = await axios.get(`/api/contractors/${contractorId.value}/projects`)
  projects.value = data.projects

  // An open project keeps showing, with its latest name and photos.
  if (open.value) {
    const project = data.projects.find(item => item._id === open.value.project._id)
    open.value = project
      ? { project, index: Math.min(open.value.index, project.photos.length - 1) }
      : null
  }
}

// While the popup is open, pick up the contractor's changes: every few seconds,
// and straight away when the homeowner comes back to this tab.
async function refresh() {
  try {
    await loadProjects()
    error.value = ''
  } catch {
    // Keep showing what was loaded; the next refresh tries again.
  }
}
let refreshTimer

onMounted(async () => {
  dialog.value?.focus()
  document.body.style.overflow = 'hidden'

  try {
    await loadProjects()
  } catch {
    error.value = 'Unable to load past projects. Please try again later.'
  } finally {
    loading.value = false
  }

  refreshTimer = setInterval(refresh, REFRESH_MS)
  window.addEventListener('focus', refresh)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  clearInterval(refreshTimer)
  window.removeEventListener('focus', refresh)
})

// Previous and next stay within the open photo's project.
function showPhoto(project, index) {
  const count = project.photos.length
  open.value = { project, index: (index + count) % count }
}
// Back to the project cards, with focus on the project that was open.
async function closePhoto() {
  const { project } = open.value
  open.value = null
  await nextTick()
  dialog.value?.querySelector(`[data-project="${project._id}"]`)?.focus()
}

function photoCount(project) {
  const count = project.photos.length
  return `${count} photo${count === 1 ? '' : 's'}`
}

// Escape steps back from a large photo first; arrow keys move between photos.
function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (openPhoto.value) closePhoto()
    else emit('close')
  } else if (openPhoto.value && event.key === 'ArrowRight') {
    showPhoto(open.value.project, open.value.index + 1)
  } else if (openPhoto.value && event.key === 'ArrowLeft') {
    showPhoto(open.value.project, open.value.index - 1)
  }
}
</script>

<template>
  <div class="popup-backdrop" @click.self="emit('close')">
    <div
      ref="dialog"
      class="popup-card portfolio-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contractor-profile-title"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <!-- Stays in place while the projects below scroll. -->
      <header class="portfolio-header" :class="{ scrolled }">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h2 id="contractor-profile-title" class="h4 fw-bold mb-0">
              {{ contractor.companyName }}
            </h2>
          </div>
          <button type="button" class="btn-close" aria-label="Close" @click="emit('close')"></button>
        </div>

        <div class="d-flex flex-wrap gap-2 mb-3">
          <span
            v-for="service in contractor.services || []"
            :key="service"
            class="badge bg-success-subtle text-success-emphasis"
          >{{ service }}</span>
        </div>

        <div class="section-heading">
          <h3 class="h5 fw-bold mb-0">Past Projects</h3>
          <span v-if="projects.length" class="project-count">{{ projects.length }}</span>
        </div>
      </header>

      <div class="portfolio-body" @scroll="scrolled = $event.target.scrollTop > 0">
        <div v-if="loading" class="text-center py-4">
          <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Loading past projects</span>
          </div>
        </div>

        <div v-else-if="error" class="alert alert-warning mb-0">{{ error }}</div>

        <p v-else-if="!projects.length" class="text-muted mb-0">
          This contractor has not added any past projects yet.
        </p>

        <!-- ONE PROJECT'S PHOTOS -->
        <figure v-else-if="openPhoto" class="mb-0">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h4 class="h5 fw-bold mb-0 preserve-lines">{{ open.project.name }}</h4>
            <button type="button" class="btn btn-sm btn-outline-success" @click="closePhoto">
              ← All projects
            </button>
          </div>

          <div class="photo-stage">
            <img :src="openPhoto.url" :alt="openPhoto.caption || open.project.name" />
            <template v-if="open.project.photos.length > 1">
              <button
                type="button"
                class="photo-nav prev"
                aria-label="Previous photo"
                @click="showPhoto(open.project, open.index - 1)"
              >‹</button>
              <button
                type="button"
                class="photo-nav next"
                aria-label="Next photo"
                @click="showPhoto(open.project, open.index + 1)"
              >›</button>
            </template>
          </div>

          <figcaption class="d-flex justify-content-between align-items-center gap-3 mt-2">
            <span>{{ openPhoto.caption }}</span>
            <span class="small text-muted text-nowrap">
              {{ open.index + 1 }} / {{ open.project.photos.length }}
            </span>
          </figcaption>

          <div v-if="open.project.photos.length > 1" class="thumb-strip mt-3">
            <button
              v-for="(photo, index) in open.project.photos"
              :key="photo._id"
              type="button"
              class="strip-thumb"
              :class="{ active: index === open.index }"
              :aria-label="`Photo ${index + 1}`"
              :aria-current="index === open.index"
              @click="showPhoto(open.project, index)"
            >
              <img :src="photo.url" alt="" loading="lazy" />
            </button>
          </div>
        </figure>

        <!-- PROJECT COVER CARDS -->
        <ul v-else class="project-grid list-unstyled mb-0">
          <li v-for="project in projects" :key="project._id">
            <button
              type="button"
              class="project-card"
              :data-project="project._id"
              :aria-label="`View ${project.name}, ${photoCount(project)}`"
              @click="showPhoto(project, 0)"
            >
              <img :src="project.photos[0].url" alt="" loading="lazy" />
              <span class="project-badge">{{ photoCount(project) }}</span>
              <span class="project-name">{{ project.name }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.portfolio-card {
  display: flex;
  flex-direction: column;
  max-width: 900px;
  max-height: calc(100vh - 32px);
  padding: 0;
  overflow: hidden;
  outline: none;
}

.portfolio-header {
  position: relative;
  z-index: 2;
  padding: 24px 24px 16px;
  background: #fff;
  transition: box-shadow 0.2s ease;
}

.portfolio-header.scrolled {
  box-shadow: 0 8px 16px -10px rgb(16 40 28 / 25%);
}

.portfolio-body {
  overflow-y: auto;
  padding: 4px 24px 24px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 28px;
}

.project-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: #e1eee6;
  color: #146c43;
  font-size: 13px;
  font-weight: 600;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.project-card {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #1d2a23;
  color: #fff;
  text-align: left;
}

.project-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

/* Darken the bottom of the photo so the project name stays readable. */
.project-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgb(0 0 0 / 75%), rgb(0 0 0 / 0%) 50%);
}

.project-card:hover img {
  transform: scale(1.04);
}

.project-card:focus-visible {
  outline: 3px solid #198754;
  outline-offset: 3px;
}

.project-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  padding: 6px 12px;
  background: rgb(255 255 255 / 92%);
  color: #146c43;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.preserve-lines {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.project-name {
  position: absolute;
  right: 24px;
  bottom: 20px;
  left: 24px;
  z-index: 1;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: pre-line;
  overflow-wrap: anywhere; /* a long word with no spaces breaks instead of running off the card */
  text-shadow: 0 1px 8px rgb(0 0 0 / 40%);
}

.photo-stage {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #1d2a23;
}

.photo-stage img {
  display: block;
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
}

.photo-nav {
  position: absolute;
  top: 50%;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 85%);
  color: #146c43;
  font-size: 26px;
  line-height: 1;
  transform: translateY(-50%);
}

.photo-nav:hover {
  background: #fff;
}

.photo-nav.prev {
  left: 10px;
}

.photo-nav.next {
  right: 10px;
}

.thumb-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.strip-thumb {
  flex: 0 0 72px;
  height: 54px;
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 6px;
  background: #edf2ef;
  opacity: 0.6;
}

.strip-thumb.active,
.strip-thumb:hover {
  opacity: 1;
}

.strip-thumb.active {
  border-color: #198754;
}

.strip-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 575.98px) {
  .project-grid {
    grid-template-columns: 1fr;
  }

  .project-name {
    font-size: 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .portfolio-header,
  .project-card img {
    transition: none;
  }
}
</style>
