<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useStatsStore } from '../stores/stats'
import { PLATFORMS, type PlatformName } from '../../shared/types'

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

onMounted(async () => {
  await store.loadQuotaConfig()
  dailyTokenLimit.value = store.quotaConfig.dailyTokenLimit?.toString() || ''
  const configMap = store.quotaConfig.platformDailyTokenLimit || {}
  for (const key of Object.keys(platformDailyTokenLimit.value) as PlatformName[]) {
    platformDailyTokenLimit.value[key] = configMap[key]?.toString() || ''
  }
})

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
.quota-config {
  background: #fff;
  border: 1px solid #e5ece8;
  border-radius: 8px;
  padding: 10px;
}
.section-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #334155; }
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
