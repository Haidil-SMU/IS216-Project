<template>
  <div>

    <!-- NAVBAR -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-success">
      <div class="container">

        <RouterLink class="navbar-brand fw-bold" to="/">
          🏠 HDB EcoHome
        </RouterLink>

        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="navbarNav">
          <div class="navbar-nav ms-auto">

            <RouterLink class="nav-link" to="/">
              Home
            </RouterLink>

            <RouterLink class="nav-link" to="/Simulator/">
              My HDB
            </RouterLink>

            <!-- <RouterLink class="nav-link" to="/Ex2/">
              Challenges
            </RouterLink>

            <RouterLink class="nav-link" to="/Ex3/">
              Dashboard
            </RouterLink> -->

          </div>
        </div>

      </div>
    </nav>


    <!-- HERO SECTION -->
    <section class="hero-section">
      <div class="container">

        <div class="row align-items-center">

          <!-- LEFT SIDE -->
          <div class="col-lg-6">

            <span class="badge bg-success mb-3">
              Singapore HDB Energy Simulator
            </span>

            <h1 class="display-4 fw-bold">
              Can you build an
              <span class="text-success">energy-smart home?</span>
            </h1>

            <p class="lead text-secondary mt-3">
              Manage appliances, respond to Singapore's weather,
              and discover how your everyday decisions affect
              your household's electricity usage.
            </p>

            <div class="mt-4">

              <RouterLink
                to="/Ex1/"
                class="btn btn-success btn-lg me-2"
              >
                Start Simulation
              </RouterLink>

              <RouterLink
                to="/Ex2/"
                class="btn btn-outline-success btn-lg"
              >
                View Challenges
              </RouterLink>

            </div>

          </div>


          <!-- RIGHT SIDE -->
          <div class="col-lg-6 mt-5 mt-lg-0">

            <div class="card shadow-sm simulator-preview">

              <div class="card-body p-4">

                <div class="d-flex justify-content-between">
                  <h5>🏠 My HDB</h5>
                  <span class="badge bg-success">
                    Eco Score: 82
                  </span>
                </div>

                <hr>

                <div class="row g-3">

                  <div class="col-6">
                    <div class="room">
                      <h4>🛋️</h4>
                      <strong>Living Room</strong>
                      <p class="text-secondary mb-0">
                        Fan · TV · Lights
                      </p>
                    </div>
                  </div>

                  <div class="col-6">
                    <div class="room">
                      <h4>🛏️</h4>
                      <strong>Bedroom</strong>
                      <p class="text-secondary mb-0">
                        AC · Fan · Lights
                      </p>
                    </div>
                  </div>

                  <div class="col-6">
                    <div class="room">
                      <h4>🍳</h4>
                      <strong>Kitchen</strong>
                      <p class="text-secondary mb-0">
                        Fridge · Appliances
                      </p>
                    </div>
                  </div>

                  <div class="col-6">
                    <div class="room">
                      <h4>🚿</h4>
                      <strong>Bathroom</strong>
                      <p class="text-secondary mb-0">
                        Water Heater
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            </div>

          </div>

        </div>
      </div>
    </section>


    <!-- HOW IT WORKS -->
    <section class="py-5 bg-light">
      <div class="container text-center">

        <h2 class="fw-bold mb-2">
          How does it work?
        </h2>

        <p class="text-secondary mb-5">
          Make everyday household decisions and see their impact.
        </p>


        <div class="row g-4">

          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body p-4">

                <div class="feature-icon">
                  🏠
                </div>

                <h4>Manage Your HDB</h4>

                <p class="text-secondary">
                  Control your air conditioner, fans, lights,
                  water heater and other appliances.
                </p>

              </div>
            </div>
          </div>


          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body p-4">

                <div class="feature-icon">
                  ☀️
                </div>

                <h4>Adapt to Weather</h4>

                <p class="text-secondary">
                  Singapore's weather affects your household's
                  cooling needs and energy usage.
                </p>

              </div>
            </div>
          </div>


          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body p-4">

                <div class="feature-icon">
                  ⚡
                </div>

                <h4>Save Energy</h4>

                <p class="text-secondary">
                  Complete challenges while balancing energy
                  consumption, cost and household comfort.
                </p>

              </div>
            </div>
          </div>

        </div>

      </div>
    </section>


    <!-- CTA -->
    <section class="py-5">
      <div class="container text-center">

        <h2 class="fw-bold">
          Ready to manage your HDB?
        </h2>

        <p class="text-secondary">
          See how your everyday choices affect your energy usage.
        </p>

        <RouterLink
          to="/Ex1/"
          class="btn btn-success btn-lg mt-2"
        >
          Start Simulation →
        </RouterLink>

      </div>
    </section>


    <!-- FOOTER -->
    <footer class="border-top py-4">
      <div class="container text-center text-secondary">
        HDB EcoHome · Energy Simulator
      </div>
    </footer>

  </div>
</template>


<style scoped>

.hero-section {
  padding: 90px 0;
}

.simulator-preview {
  border-radius: 20px;
}

.room {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 12px;
  padding: 20px;
  min-height: 130px;
}

.feature-icon {
  font-size: 40px;
  margin-bottom: 15px;
}

/* Mobile */
@media (max-width: 768px) {

  .hero-section {
    padding: 50px 0;
  }

}

</style>