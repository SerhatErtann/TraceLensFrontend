<script setup lang="ts">
// Durum her zaman ikon + metinle gösterilir; renk tek başına anlam taşımaz.
defineProps<{ kind: 'ok' | 'slow' | 'error' | 'info'; label: string }>()
</script>

<template>
  <span class="status" :class="kind">
    <svg v-if="kind === 'ok'" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
    <svg v-else-if="kind === 'slow'" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" />
    </svg>
    <svg v-else-if="kind === 'error'" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6.5 12h-13zM8 6.5v3.5M8 12v.2" /></svg>
    <svg v-else viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 7v4.5M8 4.8v.2" /></svg>
    {{ label }}
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text-primary);
}
svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ok svg { stroke: var(--status-good); }
.slow svg { stroke: var(--status-serious); }
.error svg { stroke: var(--status-critical); }
.info svg { stroke: var(--text-muted); }
</style>
