<script setup lang="ts">
import type { Insight } from '../insights'
import StatusBadge from './StatusBadge.vue'

/** Sayfanın en üstündeki "Kısaca" kutusu: veriden çıkarılmış düz cümleler; her biri ilgili yere götürebilir. */
defineProps<{ items: Insight[] }>()
</script>

<template>
  <section v-if="items.length" class="card insights" aria-label="Kısaca">
    <div class="card-header">
      <h2>Kısaca</h2>
      <span class="muted small">veriden otomatik çıkarıldı</span>
    </div>
    <ul>
      <li v-for="(i, n) in items" :key="n">
        <StatusBadge :kind="i.tone" label="" class="icon" />
        <span>
          {{ i.text }}
          <RouterLink v-if="i.to" :to="i.to" class="link">{{ i.linkText ?? 'incele' }} →</RouterLink>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.insights { margin-bottom: 16px; }
.small { font-size: 12px; }
ul { list-style: none; margin: 0; padding: 0 16px 14px; display: flex; flex-direction: column; gap: 8px; }
li { display: flex; align-items: flex-start; gap: 8px; font-size: 13.5px; line-height: 1.5; }
.icon { margin-top: 2px; flex: none; }
.link { white-space: nowrap; margin-left: 4px; font-size: 13px; }
</style>
