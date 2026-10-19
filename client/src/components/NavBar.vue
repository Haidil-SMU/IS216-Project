<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, homeFor } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

// First letter or digit of the name (company names can start with "#" or "(").
const initial = computed(() => (auth.user?.name.match(/[A-Za-z0-9]/)?.[0] || '?').toUpperCase())

async function logout() {
  try {
    await auth.logout()
  } finally {
    router.push('/login')
  }
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-success">
    <div class="container">

      <RouterLink class="navbar-brand fw-bold" :to="homeFor(auth.user)">
        🏠 HDB EcoHome
      </RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbar"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbar">
        <div class="navbar-nav ms-auto align-items-lg-center">

          <!-- Contractors only have their dashboard; every other page is for homeowners -->
          <RouterLink v-if="auth.isContractor" class="nav-link" to="/ContractorDashboard">
            Dashboard
          </RouterLink>

          <template v-else>
            <RouterLink class="nav-link" to="/">
              Home
            </RouterLink>

            <RouterLink class="nav-link" to="/Simulator">
              My HDB
            </RouterLink>

            <RouterLink class="nav-link" to="/EnergyPlanner/">
              Energy Planner
            </RouterLink>

            <RouterLink class="nav-link" to="/Contractors">
              Find Contractors
            </RouterLink>

            <RouterLink class="nav-link" to="/3d">
              3D Spatial
            </RouterLink>
          </template>

          <!-- Account -->
          <div v-if="auth.user" class="nav-item dropdown ms-lg-3">
            <button
              class="btn nav-link dropdown-toggle account-toggle"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <span class="avatar" aria-hidden="true">{{ initial }}</span>
              {{ auth.user.name }}
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              <template v-if="auth.user.email || auth.user.singpass">
                <li class="px-3 py-2 small text-secondary">
                  <div v-if="auth.user.email">{{ auth.user.email }}</div>
                  <span v-if="auth.user.singpass" class="badge badge-singpass mt-1">
                    ✓ Singpass verified
                  </span>
                </li>
                <li><hr class="dropdown-divider" /></li>
              </template>
              <template v-if="auth.isContractor">
                <li>
                  <RouterLink class="dropdown-item" to="/ContractorDashboard">Quotation requests</RouterLink>
                </li>
              </template>
              <template v-else>
                <li>
                  <RouterLink class="dropdown-item" to="/EnergyPlanner/">My households &amp; plans</RouterLink>
                </li>
                <li>
                  <RouterLink class="dropdown-item" to="/MyQuotations">My quotations</RouterLink>
                </li>
              </template>
              <li><hr class="dropdown-divider" /></li>
              <li>
                <button class="dropdown-item text-danger" type="button" @click="logout">Log out</button>
              </li>
            </ul>
          </div>

          <div v-else-if="auth.ready" class="d-flex gap-2 ms-lg-3 py-2 py-lg-0">
            <RouterLink class="btn btn-sm btn-outline-light" to="/login">Log in</RouterLink>
            <RouterLink class="btn btn-sm btn-light text-success fw-semibold" to="/signup">
              Sign up
            </RouterLink>
          </div>

        </div>
      </div>

    </div>
  </nav>
</template>
<style scoped>
.nav-link.router-link-active {
  color: white !important;
  font-weight: bold;
}

.account-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
}

.avatar {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ffd66b;
  color: #145c32;
  font-weight: 700;
  font-size: 0.85rem;
}

.dropdown-item.router-link-active {
  color: var(--bs-success) !important;
}
</style>
