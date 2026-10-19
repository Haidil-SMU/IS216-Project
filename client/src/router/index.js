import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../components/Home.vue';
import SimulatorView from '../components/Simulator.vue';
import EnergyPlannerView from '../components/EnergyPlanner.vue';
import Contractors from '@/views/Contractors.vue';
import SavedContractors from '@/views/SavedContractors.vue';
import ThreeDSpacial from '@/views/ThreeDSpacial.vue';
import AuthView from '@/views/AuthView.vue';
import { useAuthStore, safeRedirect } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
  {
    path: '/EnergyPlanner/',
    component: EnergyPlannerView,
    meta: { requiresAuth: true }
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
    path: '/SavedContractors',
    component: SavedContractors,
    meta: { requiresAuth: true }
  },

  {
    path: '/3d',
    component: ThreeDSpacial
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

// Personal pages need a session; the login pages are only for signed-out users.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.fetchMe();

  if (to.meta.requiresAuth && !auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.user) {
    return safeRedirect(to.query.redirect) || '/';
  }
});

export default router
