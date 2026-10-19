import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../components/Home.vue';
import SimulatorView from '../components/Simulator.vue';
import EnergyPlannerView from '../components/EnergyPlanner.vue';
import Contractors from '@/views/Contractors.vue';
import MyQuotations from '@/views/MyQuotations.vue';
import ThreeDSpacial from '@/views/ThreeDSpacial.vue';
import QuotationRequest from '@/views/QuotationRequest.vue';
import ContractorDashboard from '@/views/ContractorDashboard.vue';
import AuthView from '@/views/AuthView.vue';
import { useAuthStore, safeRedirect, homeFor } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
  {
    path: '/EnergyPlanner/',
    component: EnergyPlannerView,
    meta: { requiresAuth: true, role: 'client' }
  },
  {
    path: '/',
    component: HomeView
  },

  {
    path: '/Simulator/',
    component: SimulatorView
  },
    {
    path: '/Contractors',
    component: Contractors
  },
      {
    path: '/MyQuotations',
    component: MyQuotations,
    meta: { requiresAuth: true, role: 'client' }
  },

  {
    path: '/3d',
    component: ThreeDSpacial
  },
    {
    path: '/QuotationRequest',
    component: QuotationRequest,
    meta: { requiresAuth: true, role: 'client' }
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
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.fetchMe();

  if (to.meta.requiresAuth && !auth.user) {
    const query = { redirect: to.fullPath };
    if (to.meta.role === 'contractor') query.as = 'contractor';
    return { path: '/login', query };
  }
  // Contractors only have their dashboard; every other page is for homeowners.
  if (auth.user?.role === 'contractor' && to.meta.role !== 'contractor') {
    return homeFor(auth.user);
  }
  if (to.meta.role && auth.user && (auth.user.role || 'client') !== to.meta.role) {
    return homeFor(auth.user);
  }
  if (to.meta.guestOnly && auth.user) {
    return safeRedirect(to.query.redirect) || homeFor(auth.user);
  }
});

export default router
