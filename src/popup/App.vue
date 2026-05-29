<script setup lang="ts">
import { ref } from 'vue'
import Dashboard from './views/Dashboard.vue'
import Settings from './views/Settings.vue'

const activeTab = ref<'dashboard' | 'settings'>('dashboard')

const tabs = [
  { key: 'dashboard' as const, label: '统计' },
  { key: 'settings' as const, label: '设置' },
]
</script>

<template>
  <div class="popup">
    <header class="header">
      <h1 class="title">AI Token Guard</h1>
      <span class="version">v1.0.0</span>
    </header>

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab-btn', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="content">
      <Dashboard v-if="activeTab === 'dashboard'" />
      <Settings v-else-if="activeTab === 'settings'" />
    </main>
  </div>
</template>

<style scoped>
.popup {
  min-width: 336px;
  max-width: 360px;
  padding: 14px;
  background: #f6f8f7;
  color: #111827;
}
.header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.title { font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: 0; }
.version { font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
.tab-btn {
  height: 32px;
  border: 1px solid #dbe5e1;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #64748b;
  transition: all 0.18s ease;
}
.tab-btn.active { border-color: #0f766e; background: #e8f5f2; color: #0f766e; font-weight: 700; }
.tab-btn:hover:not(.active) { border-color: #cbd5e1; color: #334155; }
</style>
