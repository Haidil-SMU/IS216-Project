import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../components/Home.vue';
import SimulatorView from '../components/Simulator.vue';

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
],
})

export default router
