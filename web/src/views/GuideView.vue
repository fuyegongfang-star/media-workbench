<template>
  <SettingsHeader active="guide" />
  <div class="guide">
    <!-- 内联 SVG 图标库：全部几何自绘，不加载任何外部图片或字体 -->
    <svg class="svg-sprite" aria-hidden="true" focusable="false">
      <symbol id="g-icon-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
        <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19" />
        <path d="M9 7h6M9 10h5" />
      </symbol>
      <symbol id="g-icon-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2 4 13.5h6L9 22l11-11.5h-6L13 2Z" />
      </symbol>
      <symbol id="g-icon-flow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="5" cy="18" r="2" />
        <path d="M7 6h4a3 3 0 0 1 3 3v2M7 18h4a3 3 0 0 0 3-3v-2" />
      </symbol>
      <symbol id="g-icon-radar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.4" />
        <path d="M12 12 19 5.5" />
      </symbol>
      <symbol id="g-icon-edit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 20h4L18.5 9.5l-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
        <path d="M4 16h16" />
      </symbol>
      <symbol id="g-icon-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 3v17h17" />
        <rect x="7" y="12" width="3" height="5" rx="0.6" />
        <rect x="12" y="8" width="3" height="9" rx="0.6" />
        <rect x="17" y="14" width="3" height="3" rx="0.6" />
      </symbol>
      <symbol id="g-icon-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="8" cy="17" r="2" />
      </symbol>
      <symbol id="g-icon-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.5 1-1.5 2v.4" />
        <path d="M12 17.2h.01" />
      </symbol>
      <symbol id="g-icon-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3 4 6v6c0 4.2 3.2 7.6 8 9 4.8-1.4 8-4.8 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </symbol>
      <symbol id="g-icon-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6" />
      </symbol>
      <symbol id="g-icon-print" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 9V3h10v6" />
        <path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
        <path d="M7 15h10v6H7v-6Z" />
      </symbol>
    </svg>

    <!-- 页头 -->
    <header class="guide-head card">
      <div class="head-main">
        <span class="head-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-book" /></svg></span>
        <div class="head-copy">
          <h1 class="guide-title">使用教程</h1>
          <p class="guide-lead">从首次配置到日常出稿与复盘，按本指引完成设置即可把工作台投入正式运营。</p>
          <div class="guide-meta">
            <span class="pill">最后更新：2026-11</span>
            <span class="pill">适用版本：v0.1.0 及以上</span>
          </div>
        </div>
      </div>
      <div class="guide-head-actions">
        <router-link class="btn" to="/dashboard">← 返回工作台</router-link>
        <button class="btn primary" type="button" @click="printPage">
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-print" /></svg>
          打印 / 导出 PDF
        </button>
      </div>
    </header>

    <div class="guide-body">
      <!-- 左侧章节目录 -->
      <aside class="guide-toc">
        <nav class="toc-inner card" aria-label="章节目录">
          <p class="toc-title">目录</p>
          <a
            v-for="c in chapters"
            :key="c.id"
            class="toc-link"
            :class="{ active: activeId === c.id }"
            :href="'#' + c.id"
            @click.prevent="goTo(c.id)"
          >
            <span class="toc-num">{{ c.num }}</span>
            <span class="toc-text">{{ c.title }}</span>
          </a>
        </nav>
      </aside>

      <!-- 右侧内容 -->
      <main class="guide-main">
        <!-- 01 快速开始 -->
        <section id="quickstart" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">01</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-start" /></svg>
            <div>
              <h2 class="sec-title">快速开始</h2>
              <p class="sec-lead">第一次登录后，按五步完成基础配置，即可开始日常使用。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">系统管理 → AI 与密钥</span>
            <span class="path-tag">系统管理 → 站点设置</span>
            <span class="path-tag">选题雷达</span>
          </div>

          <ol class="steps ordered">
            <li>
              <b>登录并确认角色</b>：使用管理员分配的账号登录，进入「工作台」总览。如需做全局配置，先在「用户与权限」确认本人角色为所有者或管理员。
            </li>
            <li>
              <b>配置模型供应商</b>：进入「系统管理 → AI 与密钥」，在「AI 模型供应商」中填写供应商标识、显示名称、模型、Base URL 与 API Key，保存后点「测试连接」确认可用，并按需设置月预算。
            </li>
            <li>
              <b>完善站点信息</b>：进入「系统管理 → 站点设置」，填写站点名称、页面标题（TDK）、Logo 地址与替代文字、页脚所有者、联系邮箱与备案信息；保存后公开首页与浏览器标签页立即生效。
            </li>
            <li>
              <b>配置选题雷达</b>：进入「选题雷达」，设置关注赛道与赛道词库、开启每日定时采集，并按需补充监控账号；保存后可手动触发一次采集验证结果。
            </li>
            <li>
              <b>回到工作台</b>：查看业务总览中的各环节状态，确认情报采集、模型与发布通道正常，即可开始第一轮出稿。
            </li>
          </ol>

          <figure class="figure">
            <div class="figure-scroll">
              <svg class="diagram nav-svg" viewBox="0 0 300 300" role="img" aria-label="侧栏导航分组示意图">
                <rect class="dg-side" x="8" y="8" width="284" height="284" rx="12" />
                <rect class="dg-brand-box" x="20" y="20" width="22" height="22" rx="6" />
                <text class="dg-brand-tx" x="50" y="35">自媒体工作台</text>
                <line class="dg-sep" x1="20" y1="52" x2="280" y2="52" />
                <g v-for="(g, gi) in navDiagram" :key="g.label">
                  <text class="dg-group-label" x="22" :y="g.y">{{ g.label }}</text>
                  <g v-for="bi in 2" :key="bi">
                    <rect
                      class="dg-bar"
                      :class="{ on: gi === navDiagram.length - 1 && bi === 1 }"
                      x="20"
                      :y="g.y + 8 + (bi - 1) * 16"
                      width="260"
                      height="13"
                      rx="4"
                    />
                    <circle class="dg-bar-dot" cx="31" :cy="g.y + 14.5 + (bi - 1) * 16" r="2.6" />
                    <line
                      class="dg-bar-line"
                      x1="41"
                      :y1="g.y + 14.5 + (bi - 1) * 16"
                      :x2="96 + bi * 26"
                      :y2="g.y + 14.5 + (bi - 1) * 16"
                    />
                  </g>
                </g>
              </svg>
            </div>
            <figcaption>左侧导航按业务流程分为五组；本教程位于「系统管理」的二级菜单中。</figcaption>
          </figure>
        </section>

        <!-- 02 五步工作流 -->
        <section id="workflow" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">02</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-flow" /></svg>
            <div>
              <h2 class="sec-title">五步工作流</h2>
              <p class="sec-lead">下图是完整链路。其中「选题雷达」「对标拆解」是每轮的情报输入；从定题到复盘，日常操作可归纳为五个步骤。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">选题雷达 → 内容项目 → 效果看板</span>
          </div>

          <figure class="figure">
            <div class="figure-scroll">
              <svg class="diagram flow-svg" viewBox="0 0 1000 120" role="img" aria-label="全流程横向流程图">
                <g v-for="(n, i) in flowNodes" :key="n.t1">
                  <g v-if="i < flowNodes.length - 1">
                    <line class="dg-arrow" :x1="flowX(i) + 144" y1="72" :x2="flowX(i) + 160" y2="72" />
                    <path class="dg-arrow-head" :d="flowArrowHead(flowX(i))" />
                  </g>
                  <circle class="dg-num-bg" :cx="flowX(i) + 70" cy="18" r="13" />
                  <text class="dg-num-tx t-mid" :x="flowX(i) + 70" y="18">{{ i + 1 }}</text>
                  <rect class="dg-node" :x="flowX(i)" y="36" width="140" height="72" rx="12" />
                  <text class="dg-title t-mid" :x="flowX(i) + 70" y="64">{{ n.t1 }}</text>
                  <text class="dg-sub t-mid" :x="flowX(i) + 70" y="88">{{ n.t2 }}</text>
                </g>
              </svg>
            </div>
            <figcaption>选题雷达 → 对标拆解 → 选题 / 标题 → 内容起草与合规预审 → 审核发布 → 效果与成本复盘。</figcaption>
          </figure>

          <div class="steps">
            <div v-for="s in workflowSteps" :key="s.n" class="step">
              <span class="step-num">{{ s.n }}</span>
              <div class="step-body">
                <div class="step-top">
                  <b>{{ s.title }}</b>
                  <span class="path-tag">{{ s.path }}</span>
                </div>
                <p class="step-desc">{{ s.desc }}</p>
                <p class="step-out"><span class="out-label">产出</span>{{ s.out }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 03 选题与洞察 -->
        <section id="insight" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">03</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-radar" /></svg>
            <div>
              <h2 class="sec-title">选题与洞察</h2>
              <p class="sec-lead">先看清赛道与对手，再动笔，避免凭感觉选题。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">选题与洞察 → 选题雷达</span>
            <span class="path-tag">选题与洞察 → 对标分析</span>
            <span class="path-tag">选题与洞察 → 账号与策略</span>
          </div>

          <figure class="figure">
            <svg class="diagram source-svg" viewBox="0 0 640 96" role="img" aria-label="选题雷达数据源汇聚示意图">
              <rect class="dg-src-box" x="12" y="18" width="132" height="26" rx="7" />
              <text class="dg-src-tx t-mid" x="78" y="31">内置热点源</text>
              <rect class="dg-src-box" x="12" y="52" width="132" height="26" rx="7" />
              <text class="dg-src-tx t-mid" x="78" y="65">RSS / JSON 源</text>
              <line class="dg-arrow" x1="148" y1="31" x2="212" y2="48" />
              <line class="dg-arrow" x1="148" y1="65" x2="212" y2="48" />
              <path class="dg-arrow-head" d="M 206 42 L 216 48 L 206 54 Z" />
              <rect class="dg-node brand-node" x="218" y="24" width="150" height="48" rx="10" />
              <text class="dg-title t-mid" x="293" y="41">今日简报</text>
              <text class="dg-sub t-mid" x="293" y="59">按赛道汇总</text>
              <line class="dg-arrow" x1="372" y1="48" x2="424" y2="48" />
              <path class="dg-arrow-head" d="M 418 42 L 428 48 L 418 54 Z" />
              <rect class="dg-node" x="430" y="24" width="196" height="48" rx="10" />
              <text class="dg-title t-mid" x="528" y="41">一键转选题</text>
              <text class="dg-sub t-mid" x="528" y="59">→ 标题 → 建项目</text>
            </svg>
            <figcaption>多路数据源汇总为今日简报，有价值的条目可一键转为选题。</figcaption>
          </figure>

          <div class="sub-grid">
            <div class="sub-card">
              <h3>选题雷达</h3>
              <p>查看按赛道汇总的今日简报；对有价值条目「一键转选题」；在「数据源」中启用内置源或添加自定义 RSS / JSON 数据源；配置监控账号持续盯更；维护赛道词库，让热度打分更贴合业务方向。</p>
            </div>
            <div class="sub-card">
              <h3>对标分析</h3>
              <p>导入图文或链接素材后做单篇拆解，查看结构、标题与互动拆解结果；跑「账号级汇总」得到账号层面的选题与风格结论；把结论沉淀为策略版本，供后续项目取用。</p>
            </div>
            <div class="sub-card">
              <h3>账号与策略</h3>
              <p>维护自有账号与对标账号，管理策略版本：新建版本、设为默认、绑定到具体账号。绑定后，新建内容项目会按该版本取用风格基线与提示词模板。</p>
            </div>
          </div>
        </section>

        <!-- 04 内容生产 -->
        <section id="production" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">04</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-edit" /></svg>
            <div>
              <h2 class="sec-title">内容生产</h2>
              <p class="sec-lead">从建项目到发布归档，全部动作在同一套内容项目里完成并留痕。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">内容生产 → 内容项目 / 素材库 / 内容日历 / 批量操作 / 起号计划</span>
          </div>

          <figure class="figure">
            <div class="figure-scroll">
              <svg class="diagram state-svg" viewBox="0 0 760 100" role="img" aria-label="审核状态机示意图">
                <defs>
                  <marker id="g-back-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path class="dg-back-head" d="M 0 0 L 10 5 L 0 10 Z" />
                  </marker>
                </defs>
                <g v-for="(name, i) in reviewStates" :key="name">
                  <g v-if="i < reviewStates.length - 1">
                    <line class="dg-arrow" :x1="stateX(i) + 136" y1="36" :x2="stateX(i) + 180" y2="36" />
                    <path class="dg-arrow-head" :d="stateArrowHead(stateX(i))" />
                  </g>
                  <rect class="dg-node" :x="stateX(i)" y="16" width="130" height="40" rx="9" />
                  <text class="dg-title t-mid" :x="stateX(i) + 65" y="36">{{ name }}</text>
                </g>
                <line class="dg-back" x1="265" y1="68" x2="90" y2="68" marker-end="url(#g-back-arrow)" />
                <text class="dg-back-label t-mid" x="178" y="88">驳回后退回草稿，并附修改意见</text>
              </svg>
            </div>
            <figcaption>审核按清单逐项确认；「退回修改」带回意见，通过后才能执行发布。</figcaption>
          </figure>

          <div class="sub-grid">
            <div class="sub-card">
              <h3>内容项目</h3>
              <p>按「选题 → 标题 → 建项目」立项。项目创建时会快照当前策略版本与提示词模板版本，后续改动不影响已有项目的基线。选题若来自「选题雷达」（未绑定策略），可在选题列表的「归属策略」下拉补绑，或在标题页选「归属账号」直接立项（自动用该账号默认策略）。</p>
            </div>
            <div class="sub-card">
              <h3>编辑器与版本历史</h3>
              <p>支持 Markdown 编辑与预览、自动保存。每次保存生成版本，可回溯与对比；润色结果作为待采纳版本，在「版本历史」中采纳或放弃。</p>
            </div>
            <div class="sub-card">
              <h3>AI 生成 / 润色 / 朱雀检测</h3>
              <p>「生成初稿」发起写作任务；「AI 润色」不改原稿、另存待采纳版本；「朱雀检测」绑定当前版本且不改文，改稿后旧结果自动标注为旧版本结果。服务不可用时创作链路不阻断。</p>
            </div>
            <div class="sub-card">
              <h3>合规预审</h3>
              <p>送审前扫描广告法极限词与敏感词，命中阻断级风险词会标红并硬卡点；确需放行可强制送审，系统会保留预审记录备查。</p>
            </div>
            <div class="sub-card">
              <h3>审核状态机</h3>
              <p>草稿 → 待审核 → 审核通过 → 已发布。审核人逐项勾选清单后可通过，或「退回修改」并填写意见，状态回到需修订。</p>
            </div>
            <div class="sub-card">
              <h3>公众号发布执行</h3>
              <p>审核通过后执行草稿箱同步（回写 media_id）、正式发布（回写文章链接）或定时群发。需先在「AI 与密钥」配置公众号 AppID / AppSecret。</p>
            </div>
            <div class="sub-card">
              <h3>素材库</h3>
              <p>集中管理图片与附件，供项目引用；删除为软删，可在「审计与回收站」按类型筛选后恢复。</p>
            </div>
            <div class="sub-card">
              <h3>内容日历</h3>
              <p>按日期查看排期，直观掌握待发与已发分布，便于协调多账号、多项目的发布节奏。</p>
            </div>
            <div class="sub-card">
              <h3>批量操作</h3>
              <p>对多篇项目统一改状态、打标签或触发任务，减少逐条重复点击，适合集中处理一批稿件。</p>
            </div>
            <div class="sub-card">
              <h3>起号计划</h3>
              <p>新建计划 → 拆解为阶段任务 → 关联内容项目 → 任务完成后状态回写计划，进度与产出一目了然。</p>
            </div>
          </div>
        </section>

        <!-- 05 数据与复盘 -->
        <section id="review" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">05</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-chart" /></svg>
            <div>
              <h2 class="sec-title">数据与复盘</h2>
              <p class="sec-lead">发布不是终点，把结果与花费对齐，才能稳定提升下一轮选题质量。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">数据与复盘 → 效果看板</span>
            <span class="path-tag">数据与复盘 → 成本看板</span>
          </div>

          <figure class="figure">
            <svg class="diagram board-svg" viewBox="0 0 640 168" role="img" aria-label="效果与成本双看板示意图">
              <rect class="dg-board" x="12" y="12" width="300" height="144" rx="10" />
              <text class="dg-board-title" x="28" y="36">发布后指标回收</text>
              <line class="dg-axis" x1="28" y1="132" x2="296" y2="132" />
              <rect
                v-for="(b, i) in metricBars"
                :key="i"
                class="dg-col"
                :class="{ hi: i === 3 }"
                :x="b.x"
                :y="132 - b.h"
                width="30"
                :height="b.h"
                rx="4"
              />
              <text class="dg-board-foot" x="28" y="150">按选题 / 标题 / 账号聚合</text>

              <rect class="dg-board" x="328" y="12" width="300" height="144" rx="10" />
              <text class="dg-board-title" x="344" y="36">月度预算使用</text>
              <rect class="dg-track" x="344" y="56" width="268" height="18" rx="9" />
              <rect class="dg-fill" x="344" y="56" width="182" height="18" rx="9" />
              <line class="dg-threshold" x1="558" y1="50" x2="558" y2="80" />
              <text class="dg-board-num" x="344" y="102">已用 68%</text>
              <text class="dg-board-warn" x="470" y="102">预警线 80%</text>
              <text class="dg-board-foot" x="344" y="132">按模型 / 阶段拆分花费</text>
            </svg>
            <figcaption>效果看板回收发布指标，成本看板跟踪模型花费与月度预算。</figcaption>
          </figure>

          <ul class="points">
            <li><b>效果看板</b>：发布后按选题、标题、账号维度回收阅读与互动等指标，判断哪类选题更有效，结论直接反哺下一轮定题。</li>
            <li><b>成本看板</b>：按模型与阶段统计 AI 花费，展示月度预算使用进度；接近预算上限会触发预警，可在「通知与告警」中配置转发。</li>
            <li><b>使用建议</b>：为每个模型供应商设置合理的月预算，并定期对照效果看板，淘汰高花费、低产出的生成环节。</li>
          </ul>
        </section>

        <!-- 06 系统管理 -->
        <section id="system" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">06</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-settings" /></svg>
            <div>
              <h2 class="sec-title">系统管理</h2>
              <p class="sec-lead">六个二级页面各管一类设置，入口固定、职责清晰。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">系统管理 → 站点设置 / 用户与权限 / AI 与密钥 / 通知与告警 / 版本与运维 / 审计与回收站</span>
          </div>

          <figure class="figure">
            <div class="figure-scroll">
              <svg class="diagram key-svg" viewBox="0 0 640 220" role="img" aria-label="设置中心密钥集中管理示意图">
                <defs>
                  <marker id="g-key-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path class="dg-arrow-head" d="M 0 0 L 10 5 L 0 10 Z" />
                  </marker>
                </defs>
                <g v-for="s in keySources" :key="s.t1">
                  <rect class="dg-key-card" x="16" :y="s.y" width="180" height="46" rx="10" />
                  <circle class="dg-key-dot" cx="32" :cy="s.y + 23" r="4" />
                  <text class="dg-key-t1" x="44" :y="s.y + 19">{{ s.t1 }}</text>
                  <text class="dg-key-t2" x="44" :y="s.y + 35">{{ s.t2 }}</text>
                  <line class="dg-arrow" x1="198" :y1="s.y + 23" x2="392" y2="110" marker-end="url(#g-key-arrow)" />
                </g>
                <rect class="dg-vault" x="400" y="50" width="216" height="120" rx="16" />
                <text class="dg-vault-title t-mid" x="508" y="74">密钥集中管理</text>
                <circle class="dg-lock" cx="452" cy="116" r="22" />
                <circle class="dg-keyhole" cx="452" cy="110" r="4.5" />
                <rect class="dg-keyhole" x="450.5" y="113" width="3" height="9" rx="1.2" />
                <text class="dg-vault-tx" x="484" y="108">AES 加密入库</text>
                <text class="dg-vault-tx" x="484" y="128">明文不回显</text>
                <text class="dg-vault-foot t-mid" x="508" y="156">前端仅见脱敏状态</text>
              </svg>
            </div>
            <figcaption>三类凭据统一在「系统管理 → AI 与密钥」维护，服务端加密保存，页面只显示脱敏状态。</figcaption>
          </figure>

          <div class="sub-grid">
            <div class="sub-card">
              <h3>站点设置</h3>
              <p>站点名称与描述、TDK（页面标题 / 描述 / 关键词）、主域名、Logo 与替代文字、GEO 站点摘要、页脚所有者、联系邮箱与备案信息；AI 生成声明、自动保存、严格审核等合规开关，以及账号注册开关也在此维护。</p>
            </div>
            <div class="sub-card">
              <h3>用户与权限</h3>
              <p>所有者 / 管理员 / 编辑三级角色：所有者拥有全部权限，管理员可管理账号，编辑仅使用业务功能。可开关自助注册、启停账号、重置密码、修改本人口令；不能禁用自己或降级最后一个所有者。</p>
            </div>
            <div class="sub-card">
              <h3>AI 与密钥</h3>
              <p>全站密钥集中维护：LLM 供应商、公众号 AppID / AppSecret、通知渠道凭据均在此配置。服务端以 AES 加密入库，前端只显示脱敏状态、明文永不回显；输入框留空表示保持原值。</p>
            </div>
            <div class="sub-card">
              <h3>通知与告警</h3>
              <p>支持企业微信、钉钉、飞书、Telegram 与邮件等渠道，每个渠道提供「测试」按钮即发即用；可指定转发任务失败、备份失败、配额预警、服务存活等告警类型。</p>
            </div>
            <div class="sub-card">
              <h3>版本与运维</h3>
              <p>检查远端新提交后「一键更新」，更新前自动备份数据库与附件并重建服务；页面展示当前版本、执行进度与日志；依赖健康可查看数据库与队列状态。</p>
            </div>
            <div class="sub-card">
              <h3>审计与回收站</h3>
              <p>关键操作留痕可查；软删的素材、账号等内容可按类型筛选并恢复，误删后也能找回。</p>
            </div>
          </div>
        </section>

        <!-- 07 常见问题 -->
        <section id="faq" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">07</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-help" /></svg>
            <div>
              <h2 class="sec-title">常见问题</h2>
              <p class="sec-lead">遇到下面这些情况，按对应步骤处理即可。</p>
            </div>
          </div>

          <div class="faq-list">
            <div v-for="(f, i) in faqs" :key="f.q" class="faq-item" :class="{ open: openFaq === i }">
              <button class="faq-q" type="button" :aria-expanded="openFaq === i" @click="toggleFaq(i)">
                <span class="faq-mark">Q</span>
                <span class="faq-q-text">{{ f.q }}</span>
                <svg class="faq-chevron" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-chevron" /></svg>
              </button>
              <div v-show="openFaq === i" class="faq-a">
                <p v-for="(p, pi) in f.a" :key="pi">{{ p }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 08 安全与数据 -->
        <section id="security" class="guide-section card">
          <div class="sec-head">
            <span class="sec-num">08</span>
            <svg class="sec-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-icon-shield" /></svg>
            <div>
              <h2 class="sec-title">安全与数据</h2>
              <p class="sec-lead">系统面向正式投运设计，数据、凭据与权限边界都有明确归属。</p>
            </div>
          </div>
          <div class="path-row">
            <span class="path-tag">系统管理 → 版本与运维 / 通知与告警</span>
          </div>

          <ul class="points">
            <li><b>数据存放</b>：选题、素材、内容、效果与成本数据统一存放在自有服务器的数据库中，附件落在自有存储卷；全部业务数据由本系统自行保管。</li>
            <li><b>密钥加密</b>：LLM API Key、公众号凭据与通知渠道凭据经 AES 加密入库；日志不打印明文，页面只显示脱敏状态，明文不回显。</li>
            <li><b>角色边界</b>：所有者 / 管理员 / 编辑三级角色，登录态自动管理、过期跳转登录；自助注册默认关闭，关键配置与用户管理仅所有者、管理员可操作。</li>
            <li><b>备份建议</b>：为数据库与附件卷设置定时备份（更新前系统也会自动备份），定期验证备份可恢复；备份失败可在「通知与告警」开启告警转发，第一时间获知。</li>
          </ul>

          <p class="sec-foot">按以上配置完成后，即可在日常运营中稳定使用：每天看简报定题、按项目推进审核与发布、用看板复盘效果与花费。</p>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import SettingsHeader from '../components/SettingsHeader.vue';

interface Chapter {
  id: string;
  num: string;
  title: string;
}

interface Faq {
  q: string;
  a: string[];
}

const chapters: Chapter[] = [
  { id: 'quickstart', num: '01', title: '快速开始' },
  { id: 'workflow', num: '02', title: '五步工作流' },
  { id: 'insight', num: '03', title: '选题与洞察' },
  { id: 'production', num: '04', title: '内容生产' },
  { id: 'review', num: '05', title: '数据与复盘' },
  { id: 'system', num: '06', title: '系统管理' },
  { id: 'faq', num: '07', title: '常见问题' },
  { id: 'security', num: '08', title: '安全与数据' },
];

// 全流程横向流程图（6 个节点）
const flowNodes = [
  { t1: '选题雷达', t2: '赛道热点采集' },
  { t1: '对标拆解', t2: '沉淀账号策略' },
  { t1: '选题 / 标题', t2: '生成候选' },
  { t1: '内容起草', t2: '合规预审' },
  { t1: '审核发布', t2: '公众号执行' },
  { t1: '效果与成本', t2: '复盘数据回收' },
];
function flowX(i: number): number {
  return 15 + i * 166;
}
function flowArrowHead(x: number): string {
  return `M ${x + 156} 66 L ${x + 166} 72 L ${x + 156} 78 Z`;
}

// 02 章节：五个操作步骤
const workflowSteps = [
  {
    n: '1',
    title: '定题',
    path: '选题雷达 / 对标分析 → 内容项目',
    desc: '从今日简报或账号级对标结论中挑选方向，用 AI 生成标题候选并人工定稿，确定本轮要写的选题。',
    out: '一条选题记录与定稿标题',
  },
  {
    n: '2',
    title: '立项与起草',
    path: '内容项目',
    desc: '由选题建立内容项目，用「生成初稿」或手动撰写；编辑器支持 Markdown 预览与自动保存。',
    out: '内容项目与首个正文版本',
  },
  {
    n: '3',
    title: '预审与润色',
    path: '内容项目详情',
    desc: '运行「合规预审」扫描风险词，按需做「朱雀检测」与「AI 润色」；润色结果写入待采纳版本，在「版本历史」中采纳或放弃。',
    out: '可送审的定稿版本',
  },
  {
    n: '4',
    title: '审核与发布',
    path: '内容项目详情',
    desc: '按审核清单逐项勾选后送审，状态由「待审核」流转到「审核通过」；随后执行公众号草稿箱同步、正式发布或定时群发。',
    out: '已发布文章与回写的文章链接',
  },
  {
    n: '5',
    title: '复盘',
    path: '效果看板 / 成本看板',
    desc: '发布后回收阅读与互动等指标，并在成本看板核对按模型、阶段的花费与月度预算，结论反哺下一轮定题。',
    out: '效果与成本结论',
  },
];

// 01 章节：侧栏导航分组示意图
const navDiagram = [
  { label: '总览', y: 66 },
  { label: '选题与洞察', y: 112 },
  { label: '内容生产', y: 158 },
  { label: '数据与复盘', y: 204 },
  { label: '系统管理', y: 250 },
];

// 04 章节：审核状态机示意图
const reviewStates = ['草稿', '待审核', '审核通过', '已发布'];
function stateX(i: number): number {
  return 12 + i * 188;
}
function stateArrowHead(x: number): string {
  return `M ${x + 178} 30 L ${x + 188} 36 L ${x + 178} 42 Z`;
}

// 05 章节：效果看板柱状示意
const metricBars = [
  { x: 36, h: 34 },
  { x: 88, h: 52 },
  { x: 140, h: 44 },
  { x: 192, h: 68 },
  { x: 244, h: 56 },
];

// 06 章节：密钥集中管理示意图
const keySources = [
  { y: 26, t1: 'AI 模型 API Key', t2: 'LLM 供应商' },
  { y: 90, t1: '公众号凭据', t2: 'AppID / AppSecret' },
  { y: 154, t1: '通知渠道凭据', t2: 'Webhook / SMTP' },
];

const faqs: Faq[] = [
  {
    q: 'AI 生成一直排队、长时间不出结果？',
    a: [
      '先在「系统管理 → AI 与密钥」确认已配置并启用 LLM 供应商、API Key 有效，可用「测试连接」验证。',
      '再到「版本与运维 → 依赖健康」确认数据库与队列服务在线。任务会在处理服务就绪后执行，环境未就绪时保留排队状态。',
      '若配置了月预算，也请检查该供应商是否已达到预算上限。',
    ],
  },
  {
    q: '选题雷达某个数据源没有数据？',
    a: [
      '在「选题雷达 → 数据源」确认该来源已启用，地址可正常访问、无需额外鉴权。',
      '监控账号需填写正确的账号标识；自定义数据源需符合格式要求（见下方条目）。',
      '赛道当日无更新或词库过窄也会显示为空，可手动触发一次采集验证配置是否生效。',
    ],
  },
  {
    q: '忘记密码怎么办？',
    a: [
      '登录页提供找回入口。若未开放自助找回，请联系管理员在「系统管理 → 用户与权限」中为你「重置密码」。',
      '管理员与所有者也可在「当前账号」区块修改本人口令；密码长度至少 8 位。',
    ],
  },
  {
    q: '改了站点名，页面没生效？',
    a: [
      '「站点设置」保存后请强制刷新浏览器（Ctrl+F5），以排除本地缓存。',
      '公开首页的标题若在 TDK 中单独设置了「页面标题」，则以该字段为准；只有留空时才回落到站点名称。',
      'Logo 与页脚信息同属该页，保存后即时写入公开页面，可一并核对。',
    ],
  },
  {
    q: '通知「测试」失败，怎么排查？',
    a: [
      '核对 Webhook 地址或 SMTP 主机、端口、用户名、密码、发件人与收件人是否填写完整，并确认渠道已勾选启用且已保存。',
      '企业微信、钉钉等渠道检查密钥或加签配置是否正确；服务器需能访问对应的外部地址。',
      '根据页面返回的错误提示调整后重试；也可先用「发送测试告警」确认转发链路是否通畅。',
    ],
  },
  {
    q: '密钥轮换要注意什么？',
    a: [
      '在「AI 与密钥」中直接覆盖保存新密钥即可；输入框留空表示保持原值，不会清空已有配置。',
      '主加密密钥由服务端环境变量维护，轮换会使已加密数据无法解密，请勿随意更改。',
      '轮换完成后，用「测试连接」与各通知渠道的「测试」按钮逐一复核，确认业务链路未受影响。',
    ],
  },
  {
    q: '自定义数据源有什么格式要求？',
    a: [
      'RSS 源填写可直接访问的 RSS 2.0 或 Atom 地址；JSON 源需返回条目数组。',
      '每条记录至少包含标题与原文链接，可选发布时间、摘要与作者；时间使用 ISO 8601 格式，单次返回建议不超过 50 条。',
      '缺少必需字段的记录会被跳过；保存后先手动采集一次，确认解析正常再纳入每日定时。',
    ],
  },
  {
    q: '误删的内容还能找回吗？',
    a: [
      '可以。素材、账号等删除均为软删，到「系统管理 → 审计与回收站」按类型筛选后即可恢复。',
      '内容项目的历史正文不会被覆盖，可在「版本历史」中回溯并另存；确需移除请使用对应页面的删除入口，不要直接改动数据库。',
    ],
  },
];

const activeId = ref<string>('quickstart');
const openFaq = ref<number | null>(0);
let observer: IntersectionObserver | null = null;

function goTo(id: string): void {
  activeId.value = id;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleFaq(i: number): void {
  openFaq.value = openFaq.value === i ? null : i;
}

function printPage(): void {
  window.print();
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (!visible.length) return;
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      activeId.value = visible[0].target.id;
    },
    { rootMargin: '-12% 0px -68% 0px', threshold: 0 },
  );
  document.querySelectorAll<HTMLElement>('.guide-section').forEach((el) => observer?.observe(el));
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.svg-sprite {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

/* ---------- 页头 ---------- */
.guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding: 22px 24px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.head-mark {
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--brand-soft, #eaf1ff);
  border: 1px solid var(--brand, #2f6fed);
  color: var(--brand, #2f6fed);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.head-mark svg {
  width: 28px;
  height: 28px;
}

.head-copy {
  min-width: 0;
}

.guide-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text, #1f2733);
}

.guide-lead {
  margin: 0;
  font-size: 13px;
  color: var(--muted, #5b6675);
  line-height: 1.7;
}

.guide-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.guide-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-icon {
  width: 15px;
  height: 15px;
}

/* ---------- 主体两栏 ---------- */
.guide-body {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.guide-main {
  min-width: 0;
}

.guide-main > .card + .card {
  margin-top: 20px;
}

/* ---------- 目录 ---------- */
.toc-inner {
  position: sticky;
  top: 20px;
  padding: 14px 12px;
}

.toc-title {
  margin: 0 0 10px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--muted, #5b6675);
}

.toc-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  color: var(--muted, #5b6675);
  font-size: 13px;
  line-height: 1.4;
  border-left: 2px solid transparent;
}

.toc-link:hover {
  background: var(--panel-soft, #f5f7fa);
  color: var(--brand, #2f6fed);
  text-decoration: none;
}

.toc-link.active {
  background: var(--brand-soft, #eaf1ff);
  color: var(--brand, #2f6fed);
  font-weight: 600;
  border-left-color: var(--brand, #2f6fed);
}

.toc-num {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--muted, #5b6675);
}

.toc-link.active .toc-num {
  color: var(--brand, #2f6fed);
}

/* ---------- 章节卡片 ---------- */
.guide-section {
  padding: 20px 22px;
  scroll-margin-top: 20px;
}

.sec-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sec-num {
  flex: 0 0 auto;
  margin-top: 2px;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--brand-soft, #eaf1ff);
  color: var(--brand, #2f6fed);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sec-icon {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  margin-top: 5px;
  color: var(--brand, #2f6fed);
}

.sec-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #1f2733);
}

.sec-lead {
  margin: 0;
  font-size: 13px;
  color: var(--muted, #5b6675);
  line-height: 1.7;
}

.path-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 0;
}

.path-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e6ec);
  background: var(--brand-soft, #eaf1ff);
  color: var(--brand, #2f6fed);
  font-size: 12px;
  line-height: 1.5;
}

/* ---------- 列表与步骤 ---------- */
.steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.steps.ordered {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: quick;
}

.steps.ordered > li {
  position: relative;
  padding: 10px 12px 10px 42px;
  background: var(--panel-soft, #f5f7fa);
  border: 1px solid var(--border, #e2e6ec);
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  line-height: 1.75;
  color: var(--text, #1f2733);
  counter-increment: quick;
}

.steps.ordered > li::before {
  content: counter(quick);
  position: absolute;
  left: 12px;
  top: 11px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand, #2f6fed);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  background: var(--panel-soft, #f5f7fa);
  border: 1px solid var(--border, #e2e6ec);
  border-radius: var(--radius-sm, 6px);
}

.step-num {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--brand, #2f6fed);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.step-body {
  min-width: 0;
}

.step-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 14px;
}

.step-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--muted, #5b6675);
}

.step-out {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--text, #1f2733);
}

.out-label {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--ok-soft, #e8f6ef);
  color: var(--ok, #15845c);
  font-size: 11px;
  font-weight: 600;
}

.points {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.points > li {
  position: relative;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text, #1f2733);
}

.points > li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand, #2f6fed);
}

.sec-foot {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm, 6px);
  background: var(--brand-soft, #eaf1ff);
  color: var(--brand, #2f6fed);
  font-size: 12.5px;
  line-height: 1.7;
}

/* ---------- 子卡片 ---------- */
.sub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.sub-card {
  background: var(--panel-soft, #f5f7fa);
  border: 1px solid var(--border, #e2e6ec);
  border-radius: var(--radius-sm, 6px);
  padding: 12px 14px;
}

.sub-card h3 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #1f2733);
}

.sub-card p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--muted, #5b6675);
}

/* ---------- 插图 ---------- */
.figure {
  margin: 16px 0 0;
}

.figure-scroll {
  overflow-x: auto;
}

.diagram {
  display: block;
  width: 100%;
  height: auto;
  background: var(--panel-soft, #f5f7fa);
  border: 1px solid var(--border, #e2e6ec);
  border-radius: var(--radius-sm, 6px);
}

.figure-scroll .diagram {
  min-width: 700px;
}

.nav-svg {
  max-width: 300px;
  margin: 0 auto;
}

.figure figcaption {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted, #5b6675);
}

.guide svg text {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.t-mid {
  text-anchor: middle;
  dominant-baseline: central;
}

/* 图形通用上色：一律走 CSS 变量，带浅色 fallback */
.dg-node {
  fill: var(--panel, #fff);
  stroke: var(--border-strong, #cbd3de);
  stroke-width: 1.2;
}

.dg-node.brand-node {
  fill: var(--brand-soft, #eaf1ff);
  stroke: var(--brand, #2f6fed);
}

.dg-num-bg {
  fill: var(--brand, #2f6fed);
}

.dg-num-tx {
  fill: #fff;
  font-size: 12px;
  font-weight: 700;
}

.dg-title {
  fill: var(--text, #1f2733);
  font-size: 13px;
  font-weight: 600;
}

.dg-sub {
  fill: var(--muted, #5b6675);
  font-size: 11px;
}

.dg-arrow {
  stroke: var(--brand, #2f6fed);
  stroke-width: 1.6;
  fill: none;
}

.dg-arrow-head,
.dg-back-head {
  fill: var(--brand, #2f6fed);
  stroke: none;
}

.dg-side {
  fill: var(--panel, #fff);
  stroke: var(--border, #e2e6ec);
  stroke-width: 1.2;
}

.dg-brand-box {
  fill: var(--brand, #2f6fed);
}

.dg-brand-tx {
  fill: var(--text, #1f2733);
  font-size: 12px;
  font-weight: 600;
}

.dg-sep {
  stroke: var(--border, #e2e6ec);
  stroke-width: 1;
}

.dg-group-label {
  fill: var(--muted, #5b6675);
  font-size: 11px;
  font-weight: 600;
}

.dg-bar {
  fill: var(--panel, #fff);
  stroke: var(--border, #e2e6ec);
  stroke-width: 1;
}

.dg-bar.on {
  fill: var(--brand-soft, #eaf1ff);
  stroke: var(--brand, #2f6fed);
}

.dg-bar-dot {
  fill: var(--border-strong, #cbd3de);
}

.dg-bar-line {
  stroke: var(--border-strong, #cbd3de);
  stroke-width: 2;
  stroke-linecap: round;
}

.dg-src-box {
  fill: var(--panel, #fff);
  stroke: var(--border-strong, #cbd3de);
  stroke-width: 1.2;
}

.dg-src-tx,
.dg-key-t1 {
  fill: var(--text, #1f2733);
  font-size: 12px;
  font-weight: 600;
}

.dg-key-t2 {
  fill: var(--muted, #5b6675);
  font-size: 11px;
}

.dg-key-card {
  fill: var(--panel, #fff);
  stroke: var(--border-strong, #cbd3de);
  stroke-width: 1.2;
}

.dg-key-dot {
  fill: var(--brand, #2f6fed);
}

.dg-vault {
  fill: var(--brand-soft, #eaf1ff);
  stroke: var(--brand, #2f6fed);
  stroke-width: 1.4;
}

.dg-vault-title {
  fill: var(--brand, #2f6fed);
  font-size: 13px;
  font-weight: 700;
}

.dg-lock {
  fill: var(--panel, #fff);
  stroke: var(--brand, #2f6fed);
  stroke-width: 1.4;
}

.dg-keyhole {
  fill: var(--brand, #2f6fed);
}

.dg-vault-tx {
  fill: var(--text, #1f2733);
  font-size: 11.5px;
  font-weight: 600;
}

.dg-vault-foot {
  fill: var(--muted, #5b6675);
  font-size: 10.5px;
}

.dg-back {
  stroke: var(--warn, #a45b06);
  stroke-width: 1.6;
  stroke-dasharray: 4 3;
  fill: none;
}

.dg-back-head {
  fill: var(--warn, #a45b06);
}

.dg-back-label {
  fill: var(--warn, #a45b06);
  font-size: 11px;
}

.dg-board {
  fill: var(--panel, #fff);
  stroke: var(--border, #e2e6ec);
  stroke-width: 1.2;
}

.dg-board-title {
  fill: var(--text, #1f2733);
  font-size: 12px;
  font-weight: 600;
}

.dg-axis {
  stroke: var(--border-strong, #cbd3de);
  stroke-width: 1;
}

.dg-col {
  fill: var(--brand, #2f6fed);
  opacity: 0.85;
}

.dg-col.hi {
  fill: var(--ok, #15845c);
  opacity: 1;
}

.dg-track {
  fill: var(--panel-soft, #f5f7fa);
  stroke: var(--border-strong, #cbd3de);
  stroke-width: 1;
}

.dg-fill {
  fill: var(--brand, #2f6fed);
}

.dg-threshold {
  stroke: var(--warn, #a45b06);
  stroke-width: 1.4;
  stroke-dasharray: 3 2;
}

.dg-board-num {
  fill: var(--text, #1f2733);
  font-size: 12px;
  font-weight: 600;
}

.dg-board-warn {
  fill: var(--warn, #a45b06);
  font-size: 11px;
}

.dg-board-foot {
  fill: var(--muted, #5b6675);
  font-size: 10.5px;
}

/* ---------- FAQ 折叠 ---------- */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.faq-item {
  border: 1px solid var(--border, #e2e6ec);
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
  background: var(--panel, #fff);
}

.faq-item.open {
  border-color: var(--brand, #2f6fed);
  background: var(--brand-soft, #eaf1ff);
}

.faq-q {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--text, #1f2733);
  font-size: 13px;
  font-weight: 600;
}

.faq-mark {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: var(--brand, #2f6fed);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.faq-q-text {
  flex: 1;
  min-width: 0;
}

.faq-chevron {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--muted, #5b6675);
  transition: transform 0.2s;
}

.faq-item.open .faq-chevron {
  transform: rotate(180deg);
  color: var(--brand, #2f6fed);
}

.faq-a {
  padding: 2px 14px 12px 44px;
  background: var(--panel, #fff);
}

.faq-a p {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--muted, #5b6675);
}

/* ---------- 响应式：目录变横向可滚动 chips ---------- */
@media (max-width: 900px) {
  .guide-head {
    padding: 18px;
  }

  .guide-body {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .toc-inner {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    overflow-x: auto;
  }

  .toc-title {
    display: none;
  }

  .toc-link {
    flex: 0 0 auto;
    white-space: nowrap;
    border: 1px solid var(--border, #e2e6ec);
    border-left: 1px solid var(--border, #e2e6ec);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12px;
  }

  .toc-link.active {
    border-color: var(--brand, #2f6fed);
  }

  .guide-section {
    padding: 18px 16px;
  }
}

/* ---------- 打印 / 导出 PDF ---------- */
@media print {
  .guide {
    gap: 12px;
  }

  .guide-toc,
  .guide-head-actions {
    display: none !important;
  }

  .guide-body {
    display: block;
  }

  .guide-main > .card + .card {
    margin-top: 12px;
  }

  .guide-section {
    box-shadow: none;
    break-inside: avoid;
  }

  .figure {
    break-inside: avoid;
  }

  .figure-scroll {
    overflow: visible;
  }

  .figure-scroll .diagram {
    min-width: 0;
  }

  .faq-a {
    display: block !important;
  }
}
</style>
