<script setup lang="ts">
import { PLATFORMS, type PlatformName } from '../../shared/types'

defineProps<{ platform: PlatformName }>()

const config = PLATFORMS
</script>

<template>
  <span class="badge" :class="platform">
    {{ config[platform]?.displayName || platform }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0;
}
.deepseek { background: #4d6bfe; }
.yiyan { background: #2d8cf0; }
.tongyi { background: #ff6b35; }
.doubao { background: #00c48c; }
.moonshot { background: #7c5cfc; }
</style>
