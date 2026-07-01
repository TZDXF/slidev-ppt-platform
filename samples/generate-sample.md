---
theme: default
---
# Slidev PPT 平台

### 下一代开发者友好的演示文稿工具

- 基于 Markdown 的幻灯片创作体验
- 支持代码高亮、实时演示、国际化
---
# 核心功能特性

- **Markdown 语法支持** - 纯文本编写幻灯片
- **内置代码高亮** - 60+ 主题可选
- **实时演示模式** - 演讲者视图支持
- **组件化扩展** - Vue 组件直接引入
---
# 功能使用分布

{{
  const data = [
    { label: '代码高亮', value: 85 },
    { label: '实时演示', value: 72 },
    { label: '组件扩展', value: 68 },
    { label: '国际化', value: 45 }
  ]
}}

<BarChart :data="data" />
---
# 平台关键数据

{{
  const stats = [
    { value: '12,500+', label: '活跃创作者' },
    { value: '89,000+', label: '累计幻灯片' },
    { value: '120+', label: '社区主题' }
  ]
}}

<div style="display: flex; gap: 40px; justify-content: center; margin-top: 60px;">
  <StatCard :value="stats[0].value" :label="stats[0].label" />
  <StatCard :value="stats[1].value" :label="stats[1].label" />
  <StatCard :value="stats[2].value" :label="stats[2].label" />
</div>
---
# 感谢关注

### 开始使用 Slidev

- 访问官方文档
- 加入社区交流
- 发现更多可能
