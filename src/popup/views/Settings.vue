<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useStatsStore } from '../stores/stats'
import { PLATFORMS, type PlatformName } from '../../shared/types'
import {
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODE_KEY,
  normalizeDisplayMode,
  type FloatingDisplayMode,
} from '../../shared/display-mode'

const store = useStatsStore()

const dailyTokenLimit = ref('')
const platformDailyTokenLimit = ref<Record<PlatformName, string>>({
  deepseek: '',
  yiyan: '',
  tongyi: '',
  doubao: '',
  moonshot: '',
})
const saved = ref(false)
const displayMode = ref<FloatingDisplayMode>(DEFAULT_DISPLAY_MODE)

onMounted(async () => {
  const [, displayResult] = await Promise.all([
    store.loadQuotaConfig(),
    chrome.storage.local.get(DISPLAY_MODE_KEY),
  ])
  displayMode.value = normalizeDisplayMode(displayResult[DISPLAY_MODE_KEY])
  dailyTokenLimit.value = store.quotaConfig.dailyTokenLimit?.toString() || ''
  const configMap = store.quotaConfig.platformDailyTokenLimit || {}
  for (const key of Object.keys(platformDailyTokenLimit.value) as PlatformName[]) {
    platformDailyTokenLimit.value[key] = configMap[key]?.toString() || ''
  }
})

async function selectDisplayMode(mode: FloatingDisplayMode) {
  displayMode.value = mode
  await chrome.storage.local.set({ [DISPLAY_MODE_KEY]: mode })
}

async function saveQuota() {
  saved.value = false
  const platformLimitPayload = {} as Partial<Record<PlatformName, number>>
  for (const key of Object.keys(platformDailyTokenLimit.value) as PlatformName[]) {
    const value = platformDailyTokenLimit.value[key]
    if (value) {
      platformLimitPayload[key] = Number(value)
    }
  }
  await chrome.runtime.sendMessage({
    type: 'update_quota_config',
    config: {
      dailyTokenLimit: dailyTokenLimit.value ? Number(dailyTokenLimit.value) : undefined,
      platformDailyTokenLimit: platformLimitPayload,
    },
  })
  await store.loadQuotaConfig()
  saved.value = true
  setTimeout(() => { saved.value = false }, 1400)
}
</script>

<template>
  <div class="settings">
    <section class="appearance-config">
      <div class="section-heading">
        <div>
          <h2 class="section-title">页面浮层</h2>
          <p class="section-description">切换后，已打开的 AI 页面会立即更新</p>
        </div>
      </div>
      <div class="mode-grid" role="group" aria-label="页面浮层样式">
        <button
          type="button"
          class="mode-card"
          :class="{ active: displayMode === 'compact' }"
          :aria-pressed="displayMode === 'compact'"
          @click="selectDisplayMode('compact')"
        >
          <span class="mode-preview compact-preview" aria-hidden="true">
            <i></i><b>输入 42 · 输出 180 · 上下文≈3,891</b>
          </span>
          <span class="mode-copy">
            <strong>简洁状态条</strong>
            <small>安静、清楚，不挡内容</small>
          </span>
          <span class="mode-check">✓</span>
        </button>
        <button
          type="button"
          class="mode-card"
          :class="{ active: displayMode === 'pet' }"
          :aria-pressed="displayMode === 'pet'"
          @click="selectDisplayMode('pet')"
        >
          <span class="mode-preview pet-preview" aria-hidden="true">
            <span class="pet-bubble">输入 · 输出 · 上下文</span>
            <span class="pet-orb"><i></i><i></i></span>
          </span>
          <span class="mode-copy">
            <strong>桌面宠物</strong>
            <small>保留动画和互动效果</small>
          </span>
          <span class="mode-check">✓</span>
        </button>
      </div>
    </section>

    <section class="quota-config">
      <h2 class="section-title">Token 预警</h2>
      <div class="form-group">
        <label>总览上限</label>
        <input v-model="dailyTokenLimit" type="number" placeholder="留空 = 不提醒" />
      </div>
      <div class="platform-group">
        <div class="platform-title">平台上限</div>
        <div v-for="platform in (Object.keys(PLATFORMS) as PlatformName[])" :key="platform" class="form-group platform-limit">
          <label>{{ PLATFORMS[platform].displayName }}</label>
          <input v-model="platformDailyTokenLimit[platform]" type="number" placeholder="留空 = 不提醒" />
        </div>
      </div>
      <button class="save-btn" @click="saveQuota">{{ saved ? '已保存' : '保存' }}</button>
    </section>
  </div>
</template>

<style scoped>
.settings { padding-top: 2px; }
.appearance-config, .quota-config {
  background: #fff;
  border: 1px solid #e5ece8;
  border-radius: 8px;
  padding: 10px;
}
.quota-config { margin-top: 10px; }
.section-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #334155; }
.section-heading .section-title { margin-bottom: 3px; }
.section-description { margin: 0 0 10px; font-size: 10px; color: #94a3b8; }
.mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mode-card {
  position: relative;
  min-width: 0;
  padding: 8px;
  border: 1px solid #dfe8e4;
  border-radius: 9px;
  background: #fbfdfc;
  color: #334155;
  text-align: left;
  cursor: pointer;
  transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
}
.mode-card:hover { border-color: #9fc8bc; transform: translateY(-1px); }
.mode-card.active {
  border-color: #0f766e;
  background: #f0faf7;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, .08);
}
.mode-preview {
  position: relative;
  display: flex;
  width: 100%;
  height: 42px;
  margin-bottom: 7px;
  overflow: hidden;
  border: 1px solid #e4ebe8;
  border-radius: 7px;
  background: #f3f6f5;
}
.compact-preview { align-items: center; padding: 0 7px; }
.compact-preview::before {
  content: '';
  position: absolute;
  inset: 10px 6px;
  border: 1px solid rgba(15,118,110,.2);
  border-radius: 5px;
  background: #fff;
  box-shadow: 0 3px 8px rgba(15,23,42,.07);
}
.compact-preview i {
  position: relative;
  z-index: 1;
  width: 5px;
  height: 5px;
  margin-left: 4px;
  border-radius: 50%;
  background: #10b981;
}
.compact-preview b {
  position: relative;
  z-index: 1;
  margin-left: 5px;
  overflow: hidden;
  color: #64748b;
  font-size: 6px;
  font-weight: 700;
  white-space: nowrap;
}
.pet-preview { align-items: flex-end; justify-content: center; }
.pet-bubble {
  position: absolute;
  top: 4px;
  left: 9px;
  padding: 3px 5px;
  border: 1px solid #dfe8e4;
  border-radius: 5px;
  background: #fff;
  color: #94a3b8;
  font-size: 5px;
  box-shadow: 0 2px 5px rgba(15,23,42,.06);
}
.pet-orb {
  position: relative;
  width: 25px;
  height: 22px;
  margin-bottom: 2px;
  border-radius: 12px 12px 9px 9px;
  background: linear-gradient(180deg, #b8e2ff, #5b82ed);
  box-shadow: inset 0 2px 4px rgba(255,255,255,.6), 0 3px 5px rgba(37,99,235,.2);
}
.pet-orb i {
  position: absolute;
  top: 9px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #08245f;
}
.pet-orb i:first-child { left: 7px; }
.pet-orb i:last-child { right: 7px; }
.mode-copy { display: flex; flex-direction: column; gap: 2px; padding-right: 16px; }
.mode-copy strong { font-size: 11px; color: #334155; }
.mode-copy small { font-size: 9px; color: #94a3b8; line-height: 1.25; }
.mode-check {
  position: absolute;
  right: 7px;
  bottom: 9px;
  display: none;
  color: #0f766e;
  font-size: 11px;
  font-weight: 900;
}
.mode-card.active .mode-check { display: block; }
.form-group { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
.form-group label { font-size: 12px; color: #475569; }
.form-group input {
  width: 150px;
  padding: 6px 8px;
  border: 1px solid #dbe4e0;
  border-radius: 6px;
  font-size: 12px;
  color: #0f172a;
  background: #fcfefe;
}
.form-group input:focus {
  outline: none;
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
}
.platform-group { margin-top: 10px; border-top: 1px solid #edf2f0; padding-top: 10px; }
.platform-title { font-size: 11px; color: #94a3b8; margin-bottom: 8px; font-weight: 700; letter-spacing: 0; }
.platform-limit label { font-size: 12px; }
.save-btn {
  width: 100%;
  height: 34px;
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 6px;
}
.save-btn:hover { background: #0d6a63; }
</style>
