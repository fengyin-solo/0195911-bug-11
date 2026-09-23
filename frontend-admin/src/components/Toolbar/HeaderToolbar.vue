<template>
  <div class="header-toolbar">
    <div class="toolbar-left">
      <div class="logo">
        <el-icon :size="24"><Tickets /></el-icon>
        <span>标签编辑器</span>
      </div>
      <el-divider direction="vertical" />
      <div class="canvas-size">
        <el-input-number v-model="width" :min="10" :max="200" size="small" controls-position="right" />
        <span class="size-label">×</span>
        <el-input-number v-model="height" :min="10" :max="200" size="small" controls-position="right" />
        <span class="size-unit">mm</span>
        <span class="size-unit">（最大为200*200）</span>
        <el-button type="primary" size="small" @click="applySize">应用</el-button>
      </div>
    </div>
    
    <div class="toolbar-right">
      <el-select v-model="scaleValue" size="small" style="width: 90px" @change="changeScale">
        <el-option v-for="s in scales" :key="s" :label="`${s * 100}%`" :value="s" />
      </el-select>
      <el-divider direction="vertical" />
      <el-dropdown @command="handleExport">
        <el-button type="success" size="small">
          导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="bmp">导出 BMP (1-bit)</el-dropdown-item>
            <el-dropdown-item command="png">导出 PNG</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button type="danger" size="small" @click="clearCanvas">清空</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessage, ElMessageBox } from 'element-plus'

const emit = defineEmits(['export'])
const store = useCanvasStore()

const width = ref(store.canvasWidth)
const height = ref(store.canvasHeight)
const scaleValue = ref(store.scale)
const scales = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

watch(() => store.scale, (val) => { scaleValue.value = val })

const applySize = () => {
  const oldWidth = store.canvasPixelWidth
  const oldHeight = store.canvasPixelHeight
  store.setCanvasSize(width.value, height.value)
  const newWidth = store.canvasPixelWidth
  const newHeight = store.canvasPixelHeight

  if (store.elements.length > 0) {
    const scaleX = newWidth / oldWidth
    const scaleY = newHeight / oldHeight
    store.elements.forEach(el => {
      // 统一走 store 的钳制口径，缩放后不会超出画布
      store.setElementGeometry(el.id, {
        x: el.x * scaleX,
        y: el.y * scaleY,
        width: el.width * scaleX,
        height: el.height * scaleY
      })
    })
  }
  ElMessage.success('画布尺寸已更新')
}

const changeScale = (val) => store.setScale(val)
const handleExport = (type) => emit('export', type)

const clearCanvas = () => {
  ElMessageBox.confirm('确定要清空画布吗？', '提示', { type: 'warning' })
    .then(() => { store.clearCanvas(); ElMessage.success('画布已清空') })
    .catch(() => {})
}
</script>

<style lang="scss" scoped>
.header-toolbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.toolbar-left { display: flex; align-items: center; gap: 16px; }

.logo {
  display: flex; align-items: center; gap: 8px;
  font-size: 18px; font-weight: 600; color: #409eff;
}

.canvas-size {
  display: flex; align-items: center; gap: 8px;
  .size-label { color: #909399; }
  .size-unit { color: #606266; font-size: 13px; }
  :deep(.el-input-number) { width: 90px; }
}

.toolbar-right { display: flex; align-items: center; gap: 12px; }
</style>
