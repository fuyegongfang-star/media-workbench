import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import BasicLayout from '../layouts/BasicLayout.vue';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  phase: string;
}

/** PRD §4 七大导航模块（T0.1 信息结构骨架已合并进可运行前端） */
export const navItems: NavItem[] = [
  { path: '/dashboard', label: '工作台', icon: '◧', phase: 'T1.1' },
  { path: '/content', label: '内容项目', icon: '✎', phase: 'T3.x' },
  { path: '/analysis', label: '对标分析', icon: '◎', phase: 'T2.x' },
  { path: '/launch', label: '起号计划', icon: '⇧', phase: 'T4.1/T4.2' },
  { path: '/calendar', label: '内容日历', icon: '▦', phase: 'T4.4' },
  { path: '/library', label: '素材库', icon: '▤', phase: 'T4.3' },
  { path: '/batch', label: '批量操作', icon: '⛒', phase: 'T4.5' },
  { path: '/metrics', label: '效果看板', icon: '📈', phase: 'T3.10' },
  { path: '/dashboard/cost', label: '成本看板', icon: '¥', phase: 'T4.6' },
  { path: '/account', label: '账号与策略', icon: '☰', phase: 'T1.7/T2.5' },
  { path: '/system', label: '系统设置', icon: '⚙', phase: 'T1.8' },
  { path: '/observability', label: '可观测性', icon: '◉', phase: 'T1.9' },
];

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: BasicLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
      { path: 'content', name: 'content', component: () => import('../views/ContentView.vue') },
      { path: 'content-projects/:id', name: 'content-project', component: () => import('../views/ContentProjectView.vue') },
      { path: 'analysis', name: 'analysis', component: () => import('../views/AnalysisView.vue') },
      { path: 'launch', name: 'launch', component: () => import('../views/LaunchView.vue') },
      { path: 'calendar', name: 'calendar', component: () => import('../views/CalendarView.vue') },
      { path: 'library', name: 'library', component: () => import('../views/LibraryView.vue') },
      { path: 'batch', name: 'batch', component: () => import('../views/BatchView.vue') },
      { path: 'metrics', name: 'metrics', component: () => import('../views/MetricsView.vue') },
      { path: 'dashboard/cost', name: 'cost-dashboard', component: () => import('../views/CostDashboardView.vue') },
      { path: 'account', name: 'account', component: () => import('../views/AccountView.vue') },
      { path: 'system', name: 'system', component: () => import('../views/SystemView.vue') },
      { path: 'observability', name: 'observability', component: () => import('../views/ObservabilityView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
