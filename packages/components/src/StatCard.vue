<script setup lang="ts">
/** 统计卡片组件（占位实现） */
defineProps<{
  value: string | number;
  label: string;
}>();
</script>

<template>
  <div class="stat-card-placeholder">
    <p>🔢 StatCard（占位）</p>
  </div>
</template>
