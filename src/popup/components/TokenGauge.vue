<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ current: number; limit: number }>()

const percentage = computed(() => {
  if (!props.limit) return 0
  return Math.min((props.current / props.limit) * 100, 100)
})

const color = computed(() => {
  if (percentage.value >= 100) return '#f44336'
  if (percentage.value >= 80) return '#ffc107'
  return '#4caf50'
})

const label = computed(() => {
  if (!props.limit) return `${props.current.toLocaleString()} / 无限制`
  return `${props.current.toLocaleString()} / ${props.limit.toLocaleString()}`
})
</script>

<template>
  <div class="gauge">
    <div class="gauge-label">
      <span>{{ label }}</span>
      <span>{{ percentage.toFixed(0) }}%</span>
    </div>
    <div class="gauge-bar">
      <div class="gauge-fill" :style="{ width: percentage + '%', backgroundColor: color }"></div>
    </div>
  </div>
</template>

<style scoped>
.gauge-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 6px;
  font-variant-numeric: tabular-nums;
}
.gauge-bar { height: 7px; background: #e8eeeb; border-radius: 999px; overflow: hidden; }
.gauge-fill { height: 100%; border-radius: 3px; transition: width 0.3s, background-color 0.3s; }
</style>
