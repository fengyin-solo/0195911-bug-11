<template>
  <div class="qrcode-element">
    <canvas v-if="!error" ref="canvasRef"></canvas>
    <div v-else class="render-error">二维码内容不合法</div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({ element: { type: Object, required: true } })
const canvasRef = ref(null)
const error = ref(false)

const render = async () => {
  await nextTick()
  if (!canvasRef.value) return
  try {
    await QRCode.toCanvas(canvasRef.value, props.element.content || 'https://example.com', {
      width: Math.min(props.element.width, props.element.height),
      margin: 2,
      errorCorrectionLevel: props.element.errorLevel || 'M',
      color: { dark: '#000000', light: '#ffffff' }
    })
    error.value = false
  } catch (e) {
    error.value = true
  }
}

watch(() => [props.element.content, props.element.errorLevel, props.element.width, props.element.height], render, { deep: true })
onMounted(render)
</script>

<style scoped>
.qrcode-element { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #fff; }
.qrcode-element canvas { max-width: 100%; max-height: 100%; }
.render-error {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: #f56c6c; font-size: 12px; border: 1px dashed #f56c6c; text-align: center; padding: 4px;
}
</style>
