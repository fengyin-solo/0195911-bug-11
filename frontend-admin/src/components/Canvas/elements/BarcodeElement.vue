<template>
  <div class="barcode-element">
    <canvas v-show="!hasError" ref="canvasRef"></canvas>
    <div v-if="hasError" class="error-placeholder">条码内容不合法</div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { renderBarcodeToCanvas } from '@/utils/element'

const props = defineProps({ element: { type: Object, required: true } })
const canvasRef = ref(null)
const hasError = ref(false)

const render = () => {
  if (!canvasRef.value) return
  try {
    // 与导出共用同一份渲染口径
    const source = renderBarcodeToCanvas(props.element)
    const canvas = canvasRef.value
    canvas.width = source.width
    canvas.height = source.height
    canvas.getContext('2d').drawImage(source, 0, 0)
    hasError.value = false
  } catch (e) {
    hasError.value = true
  }
}

watch(
  () => [props.element.content, props.element.format, props.element.showText, props.element.width, props.element.height],
  render,
  { deep: true }
)
onMounted(render)
</script>

<style scoped>
.barcode-element { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; }
.barcode-element canvas { max-width: 100%; max-height: 100%; }
.error-placeholder { color: #f56c6c; font-size: 11px; text-align: center; padding: 0 4px; }
</style>
