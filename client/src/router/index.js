import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../components/Home.vue';
import SimulatorView from '../components/Simulator.vue';
import EnergyPlannerView from '../components/EnergyPlanner.vue';
import Contractors from '@/views/Contractors.vue';
import MyQuotations from '@/views/MyQuotations.vue';
import ThreeDSpacial from '@/views/ThreeDSpacial.vue';
import QuotationRequest from '@/views/QuotationRequest.vue';
import ContractorDashboard from '@/views/ContractorDashboard.vue';
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
  {
    path: '/EnergyPlanner/',
    component: EnergyPlannerView
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
    component: MyQuotations
  },

  {
    path: '/3d',
    component: ThreeDSpacial
  },
    {
    path: '/QuotationRequest',
    component: QuotationRequest
  },
      {
    path: '/ContractorDashboard',
    component: ContractorDashboard
  },
],
})

export default router
