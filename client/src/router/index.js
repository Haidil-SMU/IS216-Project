import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../components/Home.vue';
import SimulatorView from '../components/Simulator.vue';
import EnergyPlannerView from '../components/EnergyPlanner.vue';
import Contractors from '@/views/Contractors.vue';
import MyProfile from '@/views/MyProfile.vue';
import ThreeDSpatial from '@/views/ThreeDSpatial.vue';
import QuotationRequest from '@/views/QuotationRequest.vue';
import ContractorDashboard from '@/views/ContractorDashboard.vue';
import AuthView from '@/views/AuthView.vue';
import { useAuthStore, safeRedirect, homeFor, loginLocation } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
  {
    path: '/EnergyPlanner/',
    component: EnergyPlannerView,
    meta: { requiresAuth: true, role: 'client', requiresHousehold: true }
  },
  {
    path: '/',
    component: HomeView
  },

  {
    path: '/Simulator/',
    component: SimulatorView,
    meta: { requiresAuth: true, role: 'client', requiresHousehold: true }
  },
    {
    path: '/Contractors',
    component: Contractors,
    meta: { requiresAuth: true, role: 'client', requiresHousehold: true }
  },
  // My quotations is now a tab on My Profile; keep the old address working.
  {
    path: '/MyQuotations',
    redirect: { path: '/MyProfile', query: { tab: 'quotations' } }
  },
  {
    path: '/MyProfile',
    component: MyProfile,
    meta: { requiresAuth: true, role: 'client' }
  },

  {
    path: '/3d',
    component: ThreeDSpatial,
    meta: { requiresAuth: true, role: 'client', requiresHousehold: true }
  },
    {
    path: '/QuotationRequest',
    component: QuotationRequest,
    meta: { requiresAuth: true, role: 'client', requiresHousehold: true }
  },
      {
    path: '/ContractorDashboard',
    component: ContractorDashboard,
    meta: { requiresAuth: true, role: 'contractor' }
  },

  {
    path: '/login',
    component: AuthView,
    props: { mode: 'login' },
    meta: { guestOnly: true }
  },
  {
    path: '/signup',
    component: AuthView,
    props: { mode: 'signup' },
    meta: { guestOnly: true }
  },
],
})

// Personal pages need a session, homeowner and contractor pages are kept apart,
// and the login pages are only for signed-out users.
router.beforeEach(async (to, from) => {
  const auth = useAuthStore();
  await auth.fetchMe();

  // Signed-out users stay where they are and get a popup that counts down to the login page.
  if (to.meta.requiresAuth && !auth.user) {
    auth.promptLogin(loginLocation(to.fullPath, to.meta.role));
    // Opened from the address bar there is no page to stay on, so show home underneath.
    return from.matched.length ? false : '/';
  }
  // Contractors only have their dashboard; every other page is for homeowners.
  if (auth.user?.role === 'contractor' && to.meta.role !== 'contractor') {
    return homeFor(auth.user);
  }
  if (to.meta.role && auth.user && (auth.user.role || 'client') !== to.meta.role) {
    return homeFor(auth.user);
  }
  // Homeowners save their household on My Profile before using these pages.
  if (to.meta.requiresHousehold && auth.user?.hasHousehold === false) {
    return { path: '/MyProfile', query: { setup: 'household' } };
  }
  if (to.meta.guestOnly && auth.user) {
    return safeRedirect(to.query.redirect) || homeFor(auth.user);
  }
});

export default router
