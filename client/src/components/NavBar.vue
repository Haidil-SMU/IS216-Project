<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-success">
    <div class="container">

      <RouterLink class="navbar-brand fw-bold" to="/">
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
        <div class="navbar-nav ms-auto">

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

        </div>
      </div>

    </div>
  </nav>
</template>
<style scoped>
.router-link-active {
  color: white !important;
  font-weight: bold;
}
</style>