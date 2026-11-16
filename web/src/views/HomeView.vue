<template>
  <div class="home">
    <header class="home-nav">
      <router-link class="home-brand" to="/">
        <img
          v-if="logo"
          class="brand-logo"
          :src="logo"
          :alt="seo.logoAlt || siteName"
        />
        <span v-else class="brand-mark">✦</span>
        <span>{{ siteName }}</span>
      </router-link>
      <div class="home-nav-links">
        <a class="home-link" href="#features">功能</a>
        <a class="home-link" href="#flow">工作流</a>
        <a class="home-link" href="#privacy">{{ privacyTitle }}</a>
        <router-link v-if="loggedIn" class="home-btn primary" to="/dashboard">进入工作台</router-link>
        <template v-else>
          <router-link class="home-btn" to="/login">登录</router-link>
          <router-link class="home-btn primary" to="/register">注册账号</router-link>
        </template>
      </div>
    </header>

    <div class="home-hero-wrap">
      <section class="home-hero">
        <div>
          <span class="home-eyebrow">{{ seo.homeEyebrow || '内容生产中枢 · 全流程留痕' }}</span>
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
          <p class="home-meta">{{ seo.homeMetaLine || '选题 · 拆解 · 起草 · 审核 · 发布 · 复盘，一站完成' }}</p>
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
    </div>

    <section class="home-band">
      <div class="band-inner">
        <div v-for="s in highlights" :key="s.title" class="band-item">
          <span class="band-icon">{{ s.icon }}</span>
          <div>
            <h3>{{ s.title }}</h3>
            <p>{{ s.desc }}</p>
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

    <section id="privacy" class="home-band home-band-soft">
      <div class="band-inner home-section privacy-inner">
        <h2>{{ privacyTitle }}</h2>
        <p class="privacy-lead">{{ seo.privacyLead || '我们重视数据安全与合规。业务数据仅在授权账号登录后可见，公开页面不承载任何业务数据。' }}</p>
        <div class="privacy-grid">
          <div class="home-feature">
            <h3>数据存放与备份</h3>
            <p>选题、素材、内容与效果数据集中存放于站点数据库，附件落在自有存储卷，可按计划备份导出。</p>
          </div>
          <div class="home-feature">
            <h3>凭据加密保管</h3>
            <p>模型 API Key、公众号 AppID / AppSecret 与通知渠道凭据均加密保存，管理界面只显示脱敏状态。</p>
          </div>
          <div class="home-feature">
            <h3>登录与权限</h3>
            <p>所有者 / 管理员 / 编辑三级角色，按最小权限隔离；自助注册是否开放由管理员决定。</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="home-foot">
      <div class="foot-inner">
        <div class="foot-grid">
          <div class="foot-col foot-about">
            <div class="foot-brand">
              <img v-if="logo" class="brand-logo" :src="logo" :alt="seo.logoAlt || siteName" />
              <span v-else class="brand-mark">✦</span>
              <b>{{ siteName }}</b>
            </div>
            <p>{{ siteDesc }}</p>
            <p v-if="seo.footerNote" class="foot-note">{{ seo.footerNote }}</p>
          </div>

          <div class="foot-col">
            <h4>产品</h4>
            <a href="#features">功能模块</a>
            <a href="#flow">工作流</a>
            <a href="#privacy">隐私与数据</a>
            <router-link to="/login">登录工作台</router-link>
          </div>

          <div class="foot-col">
            <h4>资源</h4>
            <a :href="REPO" target="_blank" rel="noopener noreferrer">源码仓库</a>
            <a :href="REPO + '/blob/main/README.md'" target="_blank" rel="noopener noreferrer">部署文档</a>
            <a :href="REPO + '/commits/main'" target="_blank" rel="noopener noreferrer">更新记录</a>
            <a :href="REPO + '/blob/main/LICENSE'" target="_blank" rel="noopener noreferrer">MIT 许可证</a>
          </div>

          <div class="foot-col">
            <h4>站点信息</h4>
            <span class="foot-static">所有者：{{ owner }}</span>
            <a v-if="ownerHref" :href="ownerHref" target="_blank" rel="noopener noreferrer">所有者主页 ↗</a>
            <a v-if="supportMail" :href="supportMail">联系邮箱：{{ seo.supportEmail }}</a>
            <span v-else class="foot-static">联系邮箱：未公开</span>
            <a v-if="seo.icpNumber" :href="icpHref" target="_blank" rel="noopener noreferrer">{{ seo.icpNumber }}</a>
            <a v-if="seo.policeRecord" :href="policeHref" target="_blank" rel="noopener noreferrer">{{ seo.policeRecord }}</a>
            <span v-if="seo.deploymentLabel" class="foot-static">{{ seo.deploymentLabel }}</span>
          </div>
        </div>

        <div class="foot-bottom">
          <span>© {{ year }} {{ owner }} · 保留所有权利</span>
          <span v-if="seo.copyrightNote">{{ seo.copyrightNote }}</span>
          <span>v0.1.0 · MIT License</span>
          <span v-if="seo.footerDisclaimer">{{ seo.footerDisclaimer }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { isLoggedIn } from '../api/auth';
import { safeMailto, safeUrl, siteInfo } from '../api/site';

const REPO = 'https://github.com/fuyegongfang-star/media-workbench';
const loggedIn = isLoggedIn();
const year = new Date().getFullYear();

const seo = computed(() => siteInfo.value.seo);
const siteName = computed(() => siteInfo.value.siteName || '自媒体工作台');
const siteDesc = computed(
  () => siteInfo.value.siteDesc || '把选题到发布收进一条流水线，覆盖洞察、生产、复盘与系统配置。',
);
const privacyTitle = computed(() => seo.value.privacyTitle || '隐私与数据');
const logo = computed(() => safeUrl(seo.value.logoUrl));
const owner = computed(() => seo.value.ownerName.trim() || siteName.value);
const ownerHref = computed(() => safeUrl(seo.value.ownerUrl));
const supportMail = computed(() => safeMailto(seo.value.supportEmail));
const icpHref = computed(() => safeUrl(seo.value.icpUrl) || 'https://beian.miit.gov.cn/');
const policeHref = computed(() => safeUrl(seo.value.policeUrl) || 'https://www.beian.gov.cn/');

const flow = [
  { title: '选题雷达采集赛道热点', tag: '零 Key 免费源' },
  { title: '对标拆解沉淀账号策略', tag: '素材 / 分析' },
  { title: '选题与标题候选生成', tag: 'AI + 人工' },
  { title: '内容起草、合规预审与审核', tag: '版本留痕' },
  { title: '发布归档与效果成本复盘', tag: '看板' },
];

const highlights = [
  { icon: '⌖', title: '全链路覆盖', desc: '找题 → 拆解 → 起草 → 审核 → 发布 → 复盘，五个环节串成一条线。' },
  { icon: '◔', title: '零 Key 起步', desc: '免费热点源与模板兜底可用；接入 LLM 后再解锁生成能力。' },
  { icon: '⚿', title: '凭据加密入库', desc: 'AES-256-GCM 保存第三方密钥，日志不打印明文、前端不回显。' },
  { icon: '⛁', title: '数据统一管理', desc: '业务数据集中存放，备份与版本更新流程由站点管理员掌控。' },
];

const features = [
  { icon: '⌖', title: '选题与洞察', desc: '每日简报、盯号更新、对标账号与策略版本，先看清再动笔。' },
  { icon: '✎', title: '内容生产', desc: '内容项目、素材库、内容日历、批量操作与起号计划，一屏贯通。' },
  { icon: '▥', title: '数据与复盘', desc: '效果看板与成本看板，把生成花费、成功率与发布结果对齐。' },
  { icon: '⚿', title: '密钥集中管理', desc: 'LLM、公众号、通知渠道凭据统一在设置中心维护，不再散落各处。' },
  { icon: '♧', title: '用户与权限', desc: '所有者 / 管理员 / 编辑三级角色，注册开关与口令重置由管理员掌控。' },
  { icon: '⟳', title: '后台一键更新', desc: '后台检查 GitHub 新提交并自动备份、重建，无需登录服务器敲命令。' },
  { icon: '◉', title: '审计与回收站', desc: '关键操作留痕，软删记录可恢复，改错了也能找回来。' },
  { icon: '▤', title: '备份与恢复', desc: '数据库逻辑备份与附件卷镜像按计划轮换，恢复步骤有据可查。' },
];
</script>
