<template>
  <div class="barcode-element">
    <canvas v-if="!error" ref="canvasRef"></canvas>
    <div v-else class="render-error">条码内容不合法</div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import JsBarcode from 'jsbarcode'

const props = defineProps({ element: { type: Object, required: true } })
const canvasRef = ref(null)
const error = ref(false)

const render = async () => {
  await nextTick()
  if (!canvasRef.value) return
  try {
    JsBarcode(canvasRef.value, props.element.content || '123456789', {
      format: props.element.format || 'CODE128',
      displayValue: props.element.showText !== false,
      width: 2,
      height: Math.max(30, props.element.height - 20),
      margin: 10,
      background: '#ffffff',
      lineColor: '#000000'
    })
    error.value = false
  } catch (e) {
    error.value = true
  }
}

watch(() => [props.element.content, props.element.format, props.element.showText, props.element.width, props.element.height], render, { deep: true })
onMounted(render)
</script>

<style scoped>
.barcode-element { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; }
.barcode-element canvas { max-width: 100%; max-height: 100%; }
.render-error {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: #f56c6c; font-size: 12px; border: 1px dashed #f56c6c; text-align: center; padding: 4px;
}
</style>
