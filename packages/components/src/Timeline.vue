<script setup lang="ts">
/**
 * Timeline — 时间线。
 *
 * 纵向时间线，按 items 顺序排列节点。
 *
 * @props
 * - items: { time: string; title: string; desc?: string }[]  时间线条目，按顺序自上而下。
 */
interface TimelineItem {
  time: string;
  title: string;
  desc?: string;
}

defineProps<{
  items: TimelineItem[];
}>();
</script>

<template>
  <div class="spp-timeline">
    <div v-if="!items || items.length === 0" class="empty">无内容</div>
    <ol v-else class="list">
      <li v-for="(it, i) in items" :key="i" class="item">
        <div class="dot" />
        <div class="body">
          <div class="time">{{ it.time }}</div>
          <div class="title">{{ it.title }}</div>
          <div v-if="it.desc" class="desc">{{ it.desc }}</div>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.spp-timeline {
  width: 100%;
  color: var(--slidev-code-color, inherit);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  position: relative;
  padding-left: 24px;
  padding-bottom: 18px;
}
.item:last-child {
  padding-bottom: 0;
}
/* 竖线：除最后一项外 */
.item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 10px;
  bottom: 0;
  width: 2px;
  background: var(--slidev-theme-primary, #42b883);
  opacity: 0.4;
}
.dot {
  position: absolute;
  left: 0;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--slidev-theme-primary, #42b883);
  border: 2px solid var(--slidev-code-background, #fff);
  box-sizing: border-box;
}
.time {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 2px;
}
.title {
  font-size: 16px;
  font-weight: 600;
}
.desc {
  font-size: 13px;
  opacity: 0.75;
  margin-top: 2px;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  border: 1px dashed var(--slidev-code-background, #d1d5db);
  border-radius: 8px;
  opacity: 0.6;
}
</style>
