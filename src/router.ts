import { createRouter, createWebHistory } from 'vue-router'
import OverviewView from './views/OverviewView.vue'
import TraceView from './views/TraceView.vue'
import AlertsView from './views/AlertsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/services' },
    { path: '/services', component: OverviewView, props: { app: 'service' } },
    { path: '/schedulers', component: OverviewView, props: { app: 'scheduler' } },
    { path: '/traces/:traceId', component: TraceView, props: true },
    { path: '/alerts', component: AlertsView }
  ]
})
