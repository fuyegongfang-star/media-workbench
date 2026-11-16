import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import BasicLayout from '../layouts/BasicLayout.vue';
import { isLoggedIn } from '../api/auth';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import ForgotPasswordView from '../views/ForgotPasswordView.vue';

/**
 * 信息架构（按业务流程归集）：
 *   总览 → 选题与洞察 → 内容生产 → 数据与复盘 → 系统管理（二级菜单）
 * 系统管理不再挤在一个页面，每个二级入口都有独立路由，可刷新、可收藏、可回跳。
 */
export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: 'overview',
    label: '总览',
    items: [{ path: '/dashboard', label: '工作台', icon: '◧' }],
  },
  {
    key: 'insight',
    label: '选题与洞察',
    items: [
      { path: '/radar', label: '选题雷达', icon: '⌖' },
      { path: '/analysis', label: '对标分析', icon: '◎' },
      { path: '/account', label: '账号与策略', icon: '☰' },
    ],
  },
  {
    key: 'production',
    label: '内容生产',
    items: [
      { path: '/content', label: '内容项目', icon: '✎' },
      { path: '/library', label: '素材库', icon: '▤' },
      { path: '/calendar', label: '内容日历', icon: '▦' },
      { path: '/batch', label: '批量操作', icon: '⛒' },
      { path: '/launch', label: '起号计划', icon: '⇧' },
    ],
  },
  {
    key: 'review',
    label: '数据与复盘',
    items: [
      { path: '/metrics', label: '效果看板', icon: '▥' },
      { path: '/dashboard/cost', label: '成本看板', icon: '¥' },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    items: [
      { path: '/system/site', label: '站点设置', icon: '⚙' },
      { path: '/system/users', label: '用户与权限', icon: '♧' },
      { path: '/system/ai', label: 'AI 与密钥', icon: '⚿' },
      { path: '/system/notifications', label: '通知与告警', icon: '◔' },
      { path: '/system/ops', label: '版本与运维', icon: '⟳' },
      { path: '/system/audit', label: '审计与回收站', icon: '◉' },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

/** 系统设置二级页面的标题与说明（供 SystemView 渲染页头）。 */
export const systemSections: { key: string; label: string; desc: string }[] = [
  { key: 'site', label: '站点设置', desc: '站点信息、TDK / Logo、SEO·GEO 与页脚所有者信息' },
  { key: 'users', label: '用户与权限', desc: '账号列表、角色、启停与口令重置' },
  { key: 'ai', label: 'AI 与密钥', desc: '全站密钥与凭据集中管理、LLM 供应商配置' },
  { key: 'notifications', label: '通知与告警', desc: '企业微信 / 钉钉 / 邮件渠道与转发规则' },
  { key: 'ops', label: '版本与运维', desc: '在线更新、依赖健康与服务状态' },
];

const routes: RouteRecordRaw[] = [
  // 未登录也能访问的公开首页
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView },
  {
    path: '/',
    component: BasicLayout,
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
      { path: 'radar', name: 'radar', component: () => import('../views/RadarView.vue') },
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
      // 系统管理：静态路由优先于 :section，审计页复用原可观测性组件
      { path: 'system', redirect: '/system/site' },
      { path: 'system/audit', name: 'system-audit', component: () => import('../views/ObservabilityView.vue') },
      { path: 'system/:section', name: 'system', component: () => import('../views/SystemView.vue') },
      { path: 'observability', redirect: '/system/audit' },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// T6.4 路由守卫：未登录访问受保护页面 → 跳登录页并带回跳地址。
// 公开页面：首页 / 登录 / 注册 / 找回密码。已登录访问登录类页面回工作台。
const AUTH_ROUTES = new Set(['/login', '/register', '/forgot-password']);
router.beforeEach((to) => {
  const loggedIn = isLoggedIn();
  if (to.path === '/') return true; // 首页始终可见，内容按登录态自适应
  if (AUTH_ROUTES.has(to.path)) {
    return loggedIn ? { path: '/dashboard' } : true;
  }
  if (!loggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});
