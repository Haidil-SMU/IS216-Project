<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, homeFor } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

// The navbar's height changes with the screen width and login state, so share it as
// --nav-h for pages that sit below it (the login scene in auth.css).
const nav = ref(null)
const resize = new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--nav-h', `${entry.borderBoxSize[0].blockSize}px`)
})
onMounted(() => resize.observe(nav.value))
onBeforeUnmount(() => resize.disconnect())

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
  <nav ref="nav" class="navbar navbar-expand-lg eco-navbar">
    <div class="container-fluid px-3 px-lg-4">

      <RouterLink class="navbar-brand fw-bold" :to="homeFor(auth.user)">
        <span class="brand-icon" aria-hidden="true">⌂</span> HDB <span class="brand-green">EcoHome</span>
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
        <div class="navbar-nav ms-auto align-items-lg-center gap-lg-2">

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

          <!-- Account: the name opens the profile page, the icon logs out. -->
          <div v-if="auth.user" class="d-flex align-items-center gap-2 ms-lg-3 py-2 py-lg-0">
            <RouterLink
              class="btn account-toggle"
              :to="auth.isContractor ? '/ContractorDashboard' : '/MyProfile'"
            >
              <img v-if="auth.pictureUrl" class="avatar" :src="auth.pictureUrl" alt="" />
              <span v-else class="avatar" aria-hidden="true">{{ initial }}</span>
              {{ auth.user.name }}
            </RouterLink>
            <button
              class="btn logout-btn"
              type="button"
              aria-label="Log out"
              title="Log out"
              @click="logout"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>

          <div v-else-if="auth.ready" class="d-flex gap-2 ms-lg-3 py-2 py-lg-0">
            <RouterLink class="btn btn-sm btn-outline-success" to="/login">Log in</RouterLink>
            <RouterLink class="btn btn-sm btn-success fw-semibold" to="/signup">
              Sign up
            </RouterLink>
          </div>

        </div>
      </div>

    </div>
  </nav>
</template>
<style scoped>
/* Visual styling only. Auth, roles, logout and links are unchanged. */
.eco-navbar {
  background: #ffffff;
  padding: 14px 0;
  box-shadow: 0 2px 16px rgba(16, 47, 36, 0.08);
  position: relative;
  z-index: 1030;
}
.navbar-brand {
  color: #19352a;
  font-size: 22px;
  white-space: nowrap;
}
.brand-icon {
  color: #168b59;
  font-size: 32px;
  vertical-align: -2px;
}
.brand-green { color: #168b59; }
.nav-link {
  color: #485950;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  padding: 9px 10px;
}
.nav-link:hover,
.nav-link.router-link-active {
  color: #168b59 !important;
  background: #eaf7ee;
}
.account-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #264c3b;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid #d6e9dd;
  background: #f4faf6;
  padding: 6px 10px;
}
.account-toggle:hover,
.account-toggle:focus,
.account-toggle.router-link-active {
  color: #168b59;
  background: #eaf7ee;
  border-color: #d6e9dd;
}
.avatar {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #d8f2df;
  color: #145c32;
  font-weight: 700;
  font-size: 0.85rem;
  object-fit: cover;
}
.logout-btn {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  padding: 0;
  color: #b4232a;
  border: 1px solid #f1d4d6;
  background: #fff6f6;
}
.logout-btn:hover,
.logout-btn:focus {
  color: #fff;
  background: #c8323a;
  border-color: #c8323a;
}
.navbar-toggler { border-color: #d5e2da; }
.navbar-toggler-icon {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Cpath stroke='%2319352a' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3E%3C/svg%3E");
}
</style>
