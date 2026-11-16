<template>
  <div class="home">
    <header class="home-nav">
      <router-link class="home-brand" to="/">
        <span class="brand-mark">✦</span>
        <span>自媒体工作台</span>
      </router-link>
      <div class="home-nav-links">
        <a class="home-link" href="#features">功能</a>
        <a class="home-link" href="#flow">工作流</a>
        <router-link v-if="loggedIn" class="home-btn primary" to="/dashboard">进入工作台</router-link>
        <template v-else>
          <router-link class="home-btn" to="/login">登录</router-link>
          <router-link class="home-btn primary" to="/register">注册账号</router-link>
        </template>
      </div>
    </header>

    <section class="home-hero">
      <div>
        <span class="home-eyebrow">私有部署 · 内容生产中枢</span>
        <h1>把选题到发布，<br />收进<em>一条流水线</em></h1>
        <p class="home-lead">
          每日热点雷达自动汇总赛道情报，对标拆解沉淀策略，AI 起草与合规预审衔接审核，
          最后发布归档并回收效果数据。全流程留痕、可回溯，密钥统一加密保管。
        </p>
        <div class="home-actions">
          <router-link v-if="loggedIn" class="home-btn primary" to="/dashboard">进入工作台 →</router-link>
          <template v-else>
            <router-link class="home-btn primary" to="/login">登录工作台 →</router-link>
            <a class="home-btn" href="#features">先看看功能</a>
          </template>
        </div>
        <p class="home-meta">支持一键部署到自有服务器 · 数据留在自己的数据库 · MIT 开源</p>
      </div>

      <div id="flow" class="hero-card">
        <div class="hero-card-head">
          <span>一条内容是怎么走完的</span>
          <span class="pill ok">5 个环节</span>
        </div>
        <div class="hero-flow">
          <div v-for="(s, i) in flow" :key="s.title" class="hero-step">
            <b>{{ i + 1 }}</b>
            <span>{{ s.title }}</span>
            <span>{{ s.tag }}</span>
          </div>
        </div>
      </div>
    </section>

    <section id="features" class="home-section">
      <h2>按业务流程组织，不再东一块西一块</h2>
      <p>从找题、拆解、生产到复盘与系统配置，每个环节都有明确入口。</p>
      <div class="home-features">
        <div v-for="f in features" :key="f.title" class="home-feature">
          <div class="fi">{{ f.icon }}</div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <footer class="home-foot">
      自媒体工作台 · v0.1.0 · MIT License · 私有部署，数据自持
    </footer>
  </div>
</template>

<script setup lang="ts">
import { isLoggedIn } from '../api/auth';

const loggedIn = isLoggedIn();

const flow = [
  { title: '选题雷达采集赛道热点', tag: '零 Key 免费源' },
  { title: '对标拆解沉淀账号策略', tag: '素材 / 分析' },
  { title: '选题与标题候选生成', tag: 'AI + 人工' },
  { title: '内容起草、合规预审与审核', tag: '版本留痕' },
  { title: '发布归档与效果成本复盘', tag: '看板' },
];

const features = [
  { icon: '⌖', title: '选题与洞察', desc: '每日简报、盯号更新、对标账号与策略版本，先看清再动笔。' },
  { icon: '✎', title: '内容生产', desc: '内容项目、素材库、内容日历、批量操作与起号计划，一屏贯通。' },
  { icon: '▥', title: '数据与复盘', desc: '效果看板与成本看板，把生成花费、成功率与发布结果对齐。' },
  { icon: '⚿', title: '密钥集中管理', desc: 'LLM、公众号、通知渠道凭据统一在设置中心维护，不再散落各处。' },
  { icon: '♧', title: '用户与权限', desc: '所有者 / 管理员 / 编辑三级角色，注册开关与口令重置由管理员掌控。' },
  { icon: '⟳', title: '后台一键更新', desc: '后台检查 GitHub 新提交并自动备份、重建，无需登录服务器敲命令。' },
];
</script>
