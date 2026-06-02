<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useStatsStore } from '../stores/stats'
import TokenGauge from '../components/TokenGauge.vue'
import PlatformBadge from '../components/PlatformBadge.vue'
import { PLATFORMS, type PlatformName } from '../../shared/types'

const store = useStatsStore()
let refreshTimer: ReturnType<typeof setInterval> | null = null
const platformKeys = Object.keys(PLATFORMS) as PlatformName[]

onMounted(() => {
  store.loadDailyStatsV2()
  store.loadQuotaConfig()
  refreshTimer = setInterval(() => {
    store.loadDailyStatsV2()
  }, 1500)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

async function clearOne(platform: PlatformName) {
  await store.clearPlatformStats(platform)
}

async function clearAll() {
  await store.clearAllStats()
}
</script>

<template>
  <div class="dashboard">
    <section class="today-stats">
      <div class="section-head">
        <h2 class="section-title">今日统计</h2>
        <span class="day-key">统计日 {{ store.todayDayKey }}</span>
      </div>
      <div class="headline-panel">
        <div class="headline-main">
          <span class="stat-label">总量</span>
          <span class="stat-value">{{ store.todayOverview.totalTokens.toLocaleString() }}<small> tokens</small></span>
        </div>
        <div class="headline-meta">
          <div class="meta-block">
            <span class="meta-label">输入</span>
            <strong>{{ store.todayOverview.inputTokens.toLocaleString() }}</strong>
          </div>
          <div class="meta-block">
            <span class="meta-label">输出</span>
            <strong>{{ store.todayOverview.outputTokens.toLocaleString() }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section v-if="store.quotaConfig.dailyTokenLimit" class="quota-section">
      <h2 class="section-title">日额度</h2>
      <TokenGauge :current="store.todayTokens" :limit="store.quotaConfig.dailyTokenLimit" />
    </section>

    <section class="platform-section">
      <div class="section-head">
        <h2 class="section-title">平台分布</h2>
        <div class="actions">
          <button class="action-btn danger" @click="clearAll">清空全部</button>
        </div>
      </div>
      <div class="platform-list">
        <div v-for="platform in platformKeys" :key="platform" class="platform-row">
          <PlatformBadge :platform="platform" />
          <div class="platform-meta">
            <div class="platform-nums">
              <span>入 {{ store.todayByPlatform[platform].inputTokens.toLocaleString() }}</span>
              <span>出 {{ store.todayByPlatform[platform].outputTokens.toLocaleString() }}</span>
              <strong>{{ store.todayByPlatform[platform].totalTokens.toLocaleString() }}</strong>
              <button class="mini-clear" @click="clearOne(platform)">清空</button>
            </div>
            <div class="platform-bar">
              <span
                class="platform-fill"
                :style="{ width: `${store.todayOverview.totalTokens ? Math.round((store.todayByPlatform[platform].totalTokens / store.todayOverview.totalTokens) * 100) : 0}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.dashboard { padding: 0; }
.section-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: #334155; }
.day-key {
  font-size: 11px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
.headline-panel {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 8px;
  background: linear-gradient(180deg, #ffffff 0%, #f7fbfa 100%);
  border: 1px solid #e3ebe7;
  border-radius: 10px;
  padding: 10px;
}
.headline-main { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
.headline-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.meta-block {
  border: 1px solid #e7efec;
  border-radius: 8px;
  background: #fff;
  padding: 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.meta-label { font-size: 11px; color: #94a3b8; }
.meta-block strong { font-size: 18px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.05; }
.stat-label { font-size: 11px; color: #94a3b8; }
.stat-value { font-size: 28px; font-weight: 800; color: #0f766e; font-variant-numeric: tabular-nums; line-height: 1; }
.stat-value small { font-size: 11px; font-weight: 600; color: #64748b; margin-left: 4px; }
.quota-section, .platform-section { margin-top: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.actions { display: flex; gap: 6px; }
.action-btn {
  height: 24px;
  border: 1px solid #d9e4e0;
  background: #fff;
  border-radius: 6px;
  font-size: 11px;
  color: #475569;
  padding: 0 8px;
  cursor: pointer;
}
.action-btn.danger { border-color: #f1d4d4; color: #b42318; }
.platform-list { display: flex; flex-direction: column; gap: 8px; }
.platform-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  background: #fff;
  border: 1px solid #e5ece8;
  border-radius: 8px;
  padding: 7px 8px;
}
.platform-meta { display: flex; flex-direction: column; gap: 4px; }
.platform-nums { display: flex; gap: 8px; font-size: 11px; color: #64748b; align-items: center; font-variant-numeric: tabular-nums; }
.platform-nums strong { margin-left: auto; color: #0f172a; font-weight: 800; }
.mini-clear {
  margin-left: 6px;
  height: 22px;
  border: 1px solid #d9e4e0;
  background: #fff;
  border-radius: 6px;
  font-size: 10px;
  color: #475569;
  padding: 0 6px;
  cursor: pointer;
}
.platform-bar { height: 7px; background: #ecf2ef; border-radius: 999px; overflow: hidden; }
.platform-fill { display: block; height: 100%; background: #047857; }
</style>
