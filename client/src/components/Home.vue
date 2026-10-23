<script setup>
import { ref } from 'vue'

// Change these paths if your router uses different URLs.
const spatialPage = '/3d'
const plannerPage = '/EnergyPlanner/'
const simulatorPage = '/Simulator/'
const contractorPage = '/Contractors/'

//ensure that it starts from slide 0.
const currentSlide = ref(0)

const slides = [
  {
    tag: 'WELCOME TO HDB ECOHOME',
    title: 'A better home starts with smarter choices.',
    description: 'Explore your home in 3D, understand your electricity use, and find the right professionals for your next home improvement.',
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2000&q=85',
    button: 'Explore our tools',
    link: '#explore'
  },
  {
    tag: 'DESIGN YOUR SPACE',
    title: 'See the possibilities before you begin.',
    description: 'Plan your rooms and appliances in an interactive 3D space built around your home.',
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2000&q=85',
    button: 'Explore 3D Spatial',
    link: spatialPage
  },
  {
    tag: 'LIVE MORE SUSTAINABLY',
    title: 'Small changes. Smarter energy habits.',
    description: 'Discover how your household choices influence electricity consumption, costs and comfort.',
    image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2000&q=85',
    button: 'Try the simulation',
    link: simulatorPage
  },
  {
    tag: 'PLAN YOUR ENERGY',
    title: 'Understand your home’s electricity costs.',
    description: 'Explore energy use from your household appliances and make more informed decisions with the Energy Planner.',
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2000&q=85',
    button: 'Explore Energy Planner',
    link: plannerPage
  },
  {
    tag: 'FIND HOME PROFESSIONALS',
    title: 'Find the right help for your home.',
    description: 'Explore renovation services and connect with contractors suited to your home improvement needs.',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2000&q=85',
    button: 'Find Contractors',
    link: contractorPage
  }
]

function nextSlide() {
  currentSlide.value++
  if (currentSlide.value >= slides.length) {
    currentSlide.value = 0
  }
}

function previousSlide() {
  currentSlide.value--
  if (currentSlide.value < 0) {
    currentSlide.value = slides.length - 1
  }
}
</script>

<template>
  <div class="home-page">
    <!-- Animated simulator sky behind the existing redesigned layout -->
    <div class="eco-sky" aria-hidden="true">
      <div class="eco-sun"></div>
      <div class="eco-cloud cloud-one"></div>
      <div class="eco-cloud cloud-two"></div>
      <div class="eco-cloud cloud-three"></div>
      <div class="eco-cloud cloud-four"></div>
      <div class="eco-landscape"></div>
    </div>

    <!-- NAVIGATION: Keep your existing global navbar if you already have one in App.vue -->
    <!-- <nav class="navbar navbar-expand-lg eco-navbar">
      <div class="container">
        <RouterLink to="/" class="navbar-brand fw-bold"><span class="brand-icon">⌂</span> HDB <span class="brand-green">EcoHome</span></RouterLink>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#homeNavigation" aria-controls="homeNavigation" aria-expanded="false" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button>
        <div class="collapse navbar-collapse" id="homeNavigation">
          <div class="navbar-nav ms-auto align-items-lg-center gap-lg-3">
            <RouterLink to="/" class="nav-link active">Home</RouterLink>
            <RouterLink :to="spatialPage" class="nav-link">3D Spatial</RouterLink>
            <RouterLink :to="plannerPage" class="nav-link">Energy Planner</RouterLink>
            <RouterLink :to="simulatorPage" class="nav-link">Simulation</RouterLink>
            <RouterLink :to="contractorPage" class="nav-link">Find Contractors</RouterLink>
            <a href="#explore" class="btn btn-success nav-cta">Explore EcoHome ↗</a>
          </div>
        </div>
      </div>
    </nav> -->

    <!-- LARGE PHOTO CAROUSEL -->
    <section class="hero" :style="{ backgroundImage: 'linear-gradient(90deg, rgba(9,35,29,.87), rgba(9,35,29,.43)), url(' + slides[currentSlide].image + ')' }">
      <div class="container hero-inner">
        <div class="hero-content">
          <span class="eyebrow light-eyebrow">✦ {{ slides[currentSlide].tag }}</span>
          <h1>{{ slides[currentSlide].title }}</h1>
          <p>{{ slides[currentSlide].description }}</p>
          <div class="d-flex flex-wrap gap-3 mt-4">
            <a v-if="slides[currentSlide].link === '#explore'" href="#explore" class="btn btn-success btn-lg">{{ slides[currentSlide].button }} →</a>
            <RouterLink v-else :to="slides[currentSlide].link" class="btn btn-success btn-lg">{{ slides[currentSlide].button }} →</RouterLink>
            <a href="#how-it-works" class="btn btn-outline-light btn-lg">How it works</a>
          </div>
        </div>
        <div class="hero-bottom">
          <div class="hero-dots">
            <button v-for="(slide, index) in slides" :key="index" :class="['hero-dot', { selected: currentSlide === index }]" :aria-label="'Show slide ' + (index + 1)" @click="currentSlide = index"></button>
          </div>
          <div class="hero-arrows">
            <button @click="previousSlide" aria-label="Previous slide">←</button>
            <button @click="nextSlide" aria-label="Next slide">→</button>
          </div>
        </div>
      </div>
    </section>

    <!-- INTRO -->
    <section class="intro-strip">
      <div class="container d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div><strong>One platform. A smarter HDB home.</strong><span class="ms-lg-3">Plan your space, manage your energy and make confident home decisions.</span></div>
        <a href="#explore" class="intro-link">Discover what you can do →</a>
      </div>
    </section>

    <!-- FEATURE CARDS -->
    <section id="explore" class="section-space">
      <div class="container">
        <div class="section-heading text-center mx-auto">
          <span class="eyebrow">EXPLORE OUR SERVICES</span>
          <h2>Everything you need for a smarter home.</h2>
          <p>From visualising your living space to making informed energy and renovation decisions, discover tools designed for everyday HDB living.</p>
        </div>
        <div class="row g-4 mt-2">
          <div class="col-md-6 col-xl-3">
            <RouterLink :to="spatialPage" class="feature-card">
              <div class="feature-photo"><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=850&q=85" alt="Contemporary residential living room" loading="lazy"><span class="photo-tag">01 / VISUALISE</span></div>
              <div class="feature-body"><div class="feature-icon">▣</div><h3>3D Spatial</h3><p>Build your virtual room, adjust its dimensions and explore different appliance arrangements in 3D.</p><span class="feature-link">Explore your space <span>↗</span></span></div>
            </RouterLink>
          </div>
          <div class="col-md-6 col-xl-3">
            <RouterLink :to="plannerPage" class="feature-card">
              <div class="feature-photo"><img src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=850&q=85" alt="Bright interior with natural lighting" loading="lazy"><span class="photo-tag">02 / PLAN</span></div>
              <div class="feature-body"><div class="feature-icon">⚡</div><h3>Energy Planner</h3><p>Explore household appliance energy use and better understand your estimated electricity costs.</p><span class="feature-link">Plan your energy <span>↗</span></span></div>
            </RouterLink>
          </div>
          <div class="col-md-6 col-xl-3">
            <RouterLink :to="simulatorPage" class="feature-card">
              <div class="feature-photo"><img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=850&q=85" alt="Comfortable modern home interior" loading="lazy"><span class="photo-tag">03 / EXPERIENCE</span></div>
              <div class="feature-body"><div class="feature-icon">◷</div><h3>Energy Simulation</h3><p>Take on real-time household decisions and balance electricity usage, daily costs and comfort.</p><span class="feature-link">Play simulation <span>↗</span></span></div>
            </RouterLink>
          </div>
          <div class="col-md-6 col-xl-3">
            <RouterLink :to="contractorPage" class="feature-card">
              <div class="feature-photo"><img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=850&q=85" alt="Renovated residential home" loading="lazy"><span class="photo-tag">04 / IMPROVE</span></div>
              <div class="feature-body"><div class="feature-icon">⌂</div><h3>Find Contractors</h3><p>Choose the renovation services you need and find matching contractors for your home project.</p><span class="feature-link">Find a contractor <span>↗</span></span></div>
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURE SPOTLIGHT -->
    <section class="spotlight-section">
      <div class="container">
        <div class="row align-items-center g-5">
          <div class="col-lg-6"><div class="spotlight-photo"><img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85" alt="Modern apartment interior" loading="lazy"><div class="photo-label">YOUR HOME, YOUR POSSIBILITIES <span>↗</span></div></div></div>
          <div class="col-lg-6"><span class="eyebrow">DESIGN WITH CONFIDENCE</span><h2 class="spotlight-title">See your home in a whole new dimension.</h2><p class="spotlight-text">Make more informed choices about your space. With 3D Spatial, you can visualise a room, place appliances and explore how your layout works before moving on to energy planning.</p>
            <div class="spotlight-points"><div><span class="check-icon">✓</span> Customise room dimensions</div><div><span class="check-icon">✓</span> Add and arrange household appliances</div><div><span class="check-icon">✓</span> Explore your setup in an interactive 3D view</div></div>
            <RouterLink :to="spatialPage" class="btn btn-success btn-lg mt-4">Start designing →</RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section id="how-it-works" class="section-space">
      <div class="container"><div class="section-heading text-center mx-auto"><span class="eyebrow">YOUR ECOHOME JOURNEY</span><h2>From your first idea to a better home.</h2><p>Our tools work together to help you explore your home and make more thoughtful decisions.</p></div>
        <div class="row g-4 mt-3">
          <div class="col-md-4"><div class="step-card"><span class="step-number">01</span><h3>Visualise your home</h3><p>Start with 3D Spatial to design your room and select the appliances that reflect your household.</p></div></div>
          <div class="col-md-4"><div class="step-card"><span class="step-number">02</span><h3>Understand your energy</h3><p>Use the Energy Planner and Simulation to see how daily choices affect energy use and comfort.</p></div></div>
          <div class="col-md-4"><div class="step-card"><span class="step-number">03</span><h3>Take the next step</h3><p>Explore suitable renovation services and find contractors who match your home improvement needs.</p></div></div>
        </div>
      </div>
    </section>

    <!-- ENERGY PROMO -->
    <section class="energy-banner"><div class="container"><div class="row align-items-center g-4"><div class="col-lg-8"><span class="eyebrow light-eyebrow">ENERGY-SMART LIVING</span><h2>What if every household choice made a difference?</h2><p>Try the interactive simulation and discover how your decisions about appliances, weather and comfort shape your household's electricity consumption.</p></div><div class="col-lg-4 text-lg-end"><RouterLink :to="simulatorPage" class="btn btn-light btn-lg">Start the simulation →</RouterLink></div></div></div></section>

    <!-- EDUCATIONAL CONTENT -->
    <section class="section-space learning-section"><div class="container"><div class="row align-items-center g-5"><div class="col-lg-5"><span class="eyebrow">WHY ENERGY MATTERS</span><h2>Smarter habits begin with better awareness.</h2><p>Everyday actions such as cooling a room, switching on lights or using a water heater contribute to household electricity consumption.</p><p>EcoHome makes these decisions easier to understand through practical planning tools and an interactive simulation, helping you consider both comfort and efficiency.</p><RouterLink :to="plannerPage" class="text-link">Explore the Energy Planner →</RouterLink></div><div class="col-lg-7"><img class="learning-image" src="https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85" alt="Sunlit modern residential living space" loading="lazy"></div></div></div></section>

    <!-- FINAL CTA -->
    <section class="final-cta"><div class="container text-center"><span class="eyebrow">GET STARTED TODAY</span><h2>Your smarter home journey starts here.</h2><p>Explore the tools, discover new possibilities and make your next home decision with confidence.</p><a href="#explore" class="btn btn-success btn-lg">Explore all services →</a></div></section>

    <footer class="eco-footer"><div class="container"><div class="row g-4"><div class="col-lg-5"><h3>⌂ HDB <span>EcoHome</span></h3><p>Helping Singapore households explore smarter spaces, energy habits and home improvement choices.</p></div><div class="col-6 col-lg-3"><h4>Explore</h4><RouterLink :to="spatialPage">3D Spatial</RouterLink><RouterLink :to="plannerPage">Energy Planner</RouterLink><RouterLink :to="simulatorPage">Energy Simulation</RouterLink></div><div class="col-6 col-lg-4"><h4>Home services</h4><RouterLink :to="contractorPage">Find Contractors</RouterLink><a href="#how-it-works">How it works</a><a href="#explore">All features</a></div></div><div class="footer-bottom">© 2026 HDB EcoHome. Educational project. Not an official HDB website.</div></div></footer>
  </div>
</template>

<style scoped>
.home-page { color: #172b25; background: #fff; font-family: inherit; }
a { text-decoration: none; }
.eco-navbar { background: #fff; padding: 16px 0; box-shadow: 0 2px 16px #102f2410; position: relative; z-index: 2; }
.navbar-brand { font-size: 23px; color: #173a2b; }
.brand-green { color: #168b59; }.brand-icon { color: #168b59; font-size: 32px; vertical-align: -2px; }
.nav-link { font-size: 14px; font-weight: 600; color: #485950; }.nav-link:hover,.nav-link.active { color: #168b59; }
.btn-success { background: #168a56; border-color: #168a56; font-weight: 600; }.btn-success:hover { background: #116a42; border-color: #116a42; }
.nav-cta { padding: 11px 18px; font-size: 13px; }.btn-lg { border-radius: 7px; padding: 13px 25px; font-size: 15px; }
.hero { min-height: 610px; background-size: cover; background-position: center; color: white; transition: background-image .3s ease; }
.hero-inner { min-height: 610px; display: flex; flex-direction: column; justify-content: space-between; padding-top: 110px; padding-bottom: 28px; }
.hero-content { max-width: 730px; }.hero h1 { font-size: clamp(40px, 5vw, 68px); font-weight: 750; letter-spacing: -2px; line-height: 1.13; margin: 18px 0 22px; }.hero p { max-width: 620px; font-size: 18px; line-height: 1.8; color: #e3ebe7; }
.eyebrow { display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #168b59; }.light-eyebrow { color: #a9edc6; }
.hero-bottom { display: flex; justify-content: space-between; align-items: center; }.hero-dots { display: flex; gap: 9px; }.hero-dot { width: 28px; height: 5px; border: 0; border-radius: 10px; background: #ffffff66; }.hero-dot.selected { background: #fff; width: 48px; }.hero-arrows { display: flex; gap: 10px; }.hero-arrows button { width: 43px; height: 43px; border: 1px solid #ffffff80; border-radius: 50%; color: white; background: #ffffff20; font-size: 20px; }.hero-arrows button:hover { background: #168b59; }
.intro-strip { background: #eaf5ee; padding: 22px 0; font-size: 14px; color: #456354; }.intro-strip strong { color: #153e2c; font-size: 16px; }.intro-link { color: #117448; font-weight: 700; white-space: nowrap; }
.section-space { padding: 100px 0; }.section-heading { max-width: 690px; }.section-heading h2,.spotlight-title,.learning-section h2,.final-cta h2 { font-size: clamp(30px, 3.4vw, 43px); font-weight: 750; letter-spacing: -1px; line-height: 1.2; margin: 15px 0; }.section-heading p,.spotlight-text,.learning-section p { color: #718078; line-height: 1.8; font-size: 16px; }
.feature-card { display: block; color: #172b25; background: #fff; height: 100%; border: 1px solid #e8eeea; border-radius: 12px; overflow: hidden; transition: transform .2s,box-shadow .2s; }.feature-card:hover { transform: translateY(-6px); box-shadow: 0 16px 36px #163c231c; color: #172b25; }.feature-photo { height: 210px; position: relative; overflow: hidden; }.feature-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }.feature-card:hover img { transform: scale(1.05); }.photo-tag { position: absolute; top: 16px; left: 16px; background: #fff; border-radius: 4px; padding: 8px 10px; color: #166e46; font-size: 10px; font-weight: 800; letter-spacing: .7px; }.feature-body { padding: 25px; }.feature-icon { color: #148958; background: #e8f5ec; width: 44px; height: 44px; display: grid; place-items: center; font-size: 24px; border-radius: 10px; margin-bottom: 20px; }.feature-body h3 { font-size: 21px; font-weight: 750; }.feature-body p { color: #75817b; line-height: 1.75; font-size: 14px; min-height: 100px; }.feature-link { display: flex; justify-content: space-between; align-items: center; font-weight: 750; font-size: 14px; color: #12804e; padding-top: 14px; border-top: 1px solid #edf1ee; }
.spotlight-section { background: #f3f8f5; padding: 95px 0; }.spotlight-photo { height: 450px; border-radius: 14px; overflow: hidden; position: relative; }.spotlight-photo img { width: 100%; height: 100%; object-fit: cover; }.photo-label { position: absolute; bottom: 22px; left: 22px; right: 22px; background: #fff; border-radius: 8px; padding: 16px 20px; font-weight: 800; letter-spacing: .7px; font-size: 12px; display: flex; justify-content: space-between; }.spotlight-points { margin-top: 25px; }.spotlight-points div { padding: 10px 0; font-weight: 600; font-size: 15px; }.check-icon { color: #168b59; background: #d8efe1; border-radius: 50%; padding: 4px 8px; margin-right: 10px; }
.step-card { border-top: 2px solid #168b59; padding: 27px 15px 10px; }.step-number { color: #16945d; font-weight: 800; font-size: 13px; }.step-card h3 { margin-top: 18px; font-size: 21px; font-weight: 750; }.step-card p { color: #718078; line-height: 1.8; font-size: 15px; }
.energy-banner { padding: 70px 0; background: #145a3e; color: #fff; }.energy-banner h2 { max-width: 690px; font-size: clamp(29px, 3vw, 39px); font-weight: 750; margin: 14px 0; }.energy-banner p { max-width: 690px; color: #d0e5d9; line-height: 1.8; }.energy-banner .btn-light { color: #155c3f; font-weight: 750; }
.learning-section { background: #fff; }.learning-image { width: 100%; height: 390px; object-fit: cover; border-radius: 12px; }.text-link { color: #11834f; font-weight: 750; }
.final-cta { padding: 85px 0; background: #edf6ef; }.final-cta p { color: #718078; margin-bottom: 28px; }
.eco-footer { background: #102e23; color: #d8e6dd; padding: 65px 0 25px; }.eco-footer h3 { color: #fff; font-weight: 750; }.eco-footer h3 span { color: #6bd59a; }.eco-footer p { max-width: 360px; color: #a5bbad; line-height: 1.8; font-size: 14px; }.eco-footer h4 { color: white; font-size: 15px; font-weight: 750; margin-bottom: 20px; }.eco-footer a { display: block; color: #b9cfc1; font-size: 14px; margin-bottom: 12px; }.eco-footer a:hover { color: white; }.footer-bottom { border-top: 1px solid #ffffff22; margin-top: 50px; padding-top: 23px; font-size: 12px; color: #8da899; }
@media (max-width: 768px) { .hero,.hero-inner { min-height: 560px; }.hero-inner { padding-top: 75px; }.hero h1 { letter-spacing: -1px; }.hero p { font-size: 16px; }.section-space { padding: 65px 0; }.spotlight-section { padding: 65px 0; }.spotlight-photo { height: 320px; }.feature-body p { min-height: 0; }.learning-image { height: 270px; } }


/* Simulator-inspired animated sky: the redesigned layout and carousel remain unchanged. */
.home-page {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 100vh;
  background: #b8e9e9;
}
.home-page > section,
.home-page > footer {
  position: relative;
  z-index: 1;
}
.eco-sky {
  position: fixed;
  inset: 0;
  overflow: hidden;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(180deg, #71cfee 0%, #b4e9e9 45%, #d9f4d9 100%);
}

/* Sun: same soft glow used by the simulator. */
.eco-sun {
  position: absolute;
  top: 11%;
  right: 12%;
  width: 123px;
  height: 123px;
  border-radius: 50%;
  background: #fff5bf;
  box-shadow: 0 0 0 20px #fff3b12b, 0 0 90px 38px #ffe8a480;
  animation: eco-sun-glow 7s ease-in-out infinite;
}

/* Moving clouds copied in style from the simulator. */
.eco-cloud {
  position: absolute;
  left: -250px;
  width: 195px;
  height: 52px;
  border-radius: 90px;
  background: #ffffffc4;
  box-shadow: 0 6px 22px #27688014;
  animation: eco-cloud-drift linear infinite;
}
.eco-cloud::before,
.eco-cloud::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: inherit;
}
.eco-cloud::before {
  width: 95px;
  height: 83px;
  left: 37px;
  bottom: 11px;
}
.eco-cloud::after {
  width: 103px;
  height: 68px;
  left: 95px;
  bottom: 4px;
}
.cloud-one { top: 13%; animation-duration: 67s; animation-delay: -23s; }
.cloud-two { top: 31%; width: 150px; height: 42px; opacity: .83; animation-duration: 92s; animation-delay: -62s; }
.cloud-three { top: 53%; opacity: .65; animation-duration: 83s; animation-delay: -47s; }
.cloud-four { top: 71%; opacity: .5; animation-duration: 110s; animation-delay: -83s; }

/* Green rolling hills at the bottom of the screen, like Simulator.vue. */
.eco-landscape {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 285px;
  opacity: .62;
  background:
    radial-gradient(ellipse 58% 89% at 5% 138%, #5eb78c 0 82%, transparent 83%),
    radial-gradient(ellipse 58% 85% at 74% 145%, #5eb78c 0 82%, transparent 83%),
    radial-gradient(ellipse 58% 86% at 42% 120%, #94cfa8 0 82%, transparent 83%);
}

@keyframes eco-cloud-drift {
  from { transform: translateX(0); }
  to { transform: translateX(calc(100vw + 500px)); }
}
@keyframes eco-sun-glow {
  50% { box-shadow: 0 0 0 25px #fff3b132, 0 0 110px 55px #ffe8a48c; }
}


/* Keep the photo carousel clear of decorative clouds. Animated sky stays behind page sections. */
.hero { position: relative; overflow: hidden; }
.hero-inner { position: relative; z-index: 1; }

/* Only adjust section backgrounds to reveal the simulator sky. */
.intro-strip { background: rgba(226, 245, 230, .85); }
.spotlight-section { background: rgba(240, 249, 242, .78); }
.learning-section { background: rgba(255, 255, 255, .68); }
.final-cta { background: rgba(232, 247, 231, .78); }
.feature-card { background: rgba(255, 255, 255, .94); }
/* Existing dark green energy banner and footer are intentionally untouched. */
@media (prefers-reduced-motion: reduce) {
  .eco-cloud, .eco-sun { animation: none; }
  .cloud-one { left: 12%; }
  .cloud-two { left: 60%; }
  .cloud-three { left: 31%; }
  .cloud-four { left: 78%; }
}

</style>
