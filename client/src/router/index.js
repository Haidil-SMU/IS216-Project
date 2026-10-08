import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../components/Home.vue';
import SimulatorView from '../components/Simulator.vue';
import Contractors from '@/views/Contractors.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
],
})

export default router
