<template>
  <nav class="navbar navbar-expand-lg eco-navbar">
    <div class="container">
      <RouterLink class="navbar-brand fw-bold" to="/">
        <span class="brand-icon">⌂</span> HDB <span class="brand-green">EcoHome</span>
      </RouterLink>

      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar" aria-controls="navbar" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbar">
        <div class="navbar-nav ms-auto align-items-lg-center gap-lg-3">
          <RouterLink class="nav-link" to="/">Home</RouterLink>
          <RouterLink class="nav-link" to="/3d">Make Your 3D Home</RouterLink>
          <RouterLink class="nav-link" to="/EnergyPlanner/">Energy Planner</RouterLink>
          <RouterLink class="nav-link" to="/Simulator">Simulation</RouterLink>
          <RouterLink class="nav-link" to="/Contractors">Find Contractors</RouterLink>
          <!-- <RouterLink class="btn btn-success nav-cta" to="/3d">Explore EcoHome ↗</RouterLink> -->
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.eco-navbar {
  background: white;
  padding: 16px 0;
  box-shadow: 0 2px 16px #102f2410;
  position: relative;
  z-index: 10;
}
.navbar-brand { color: #19352a; font-size: 22px; }
.brand-green { color: #168b59; }
.brand-icon { color: #168b59; font-size: 32px; vertical-align: -2px; }
.nav-link { font-size: 14px; font-weight: 600; color: #485950; }
.nav-link:hover, .router-link-exact-active.nav-link { color: #168b59; }
.nav-cta { padding: 11px 18px; font-size: 13px; border-radius: 7px; font-weight: 600; }
.navbar-toggler { border-color: #d5e2da; }
.navbar-toggler-icon { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Cpath stroke='%2319352a' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3E%3C/svg%3E"); }
</style>
