<template>
  <div class="canvas-area card">
    <div class="canvas-wrapper" ref="wrapperRef" @click.self="clearSelection" @drop="handleDrop" @dragover="handleDragOver">
      <div class="canvas-container" :style="canvasContainerStyle">
        <canvas ref="canvasRef" :width="store.canvasPixelWidth" :height="store.canvasPixelHeight" class="export-canvas" />
        <div class="edit-area">
          <div
            v-for="element in visibleElements"
            :key="element.id"
            class="canvas-element"
            :class="{ selected: isSelected(element.id), 'multi-selected': isMultiSelected(element.id) }"
            :style="getElementStyle(element)"
            @mousedown="handleElementMouseDown($event, element)"
            @dblclick="handleDoubleClick(element)"
          >
            <component :is="getElementComponent(element.type)" :element="element" :ref="el => setElementRef(element.id, el)" />
            <div v-if="isSelected(element.id)" class="resize-handles">
              <div v-for="handle in resizeHandles" :key="handle" :class="['resize-handle', handle]" @mousedown.stop="startResize($event, element, handle)" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="canvas-info">
      <span>画布: {{ store.canvasWidth }}mm × {{ store.canvasHeight }}mm</span>
      <span>像素: {{ store.canvasPixelWidth }} × {{ store.canvasPixelHeight }} px</span>
      <span class="tip">提示: Ctrl+点击多选元件</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import TextElement from './elements/TextElement.vue'
import RectElement from './elements/RectElement.vue'
import CircleElement from './elements/CircleElement.vue'
import LineElement from './elements/LineElement.vue'
import ImageElement from './elements/ImageElement.vue'
import BarcodeElement from './elements/BarcodeElement.vue'
import QrcodeElement from './elements/QrcodeElement.vue'
import TableElement from './elements/TableElement.vue'
import { ElMessage } from 'element-plus'
import { ELEMENT_TYPES } from '@/utils/elementMeta'
import { renderLabel } from '@/utils/canvasRenderer'

const store = useCanvasStore()
const canvasRef = ref(null)
const wrapperRef = ref(null)
const elementRefs = ref({})

const resizeHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
let isDragging = false
let isResizing = false
let dragStartX = 0
let dragStartY = 0
let elementStartX = 0
let elementStartY = 0
let elementStartW = 0
let elementStartH = 0
let currentHandle = ''
let currentElementId = null

const visibleElements = computed(() => store.elements.filter(el => el.visible))

const canvasContainerStyle = computed(() => ({
  width: `${store.canvasPixelWidth}px`,
  height: `${store.canvasPixelHeight}px`,
  transform: `scale(${store.scale})`,
  transformOrigin: 'top left'
}))

const componentMap = { text: TextElement, rect: RectElement, circle: CircleElement, line: LineElement, image: ImageElement, barcode: BarcodeElement, qrcode: QrcodeElement, table: TableElement }
const getElementComponent = (type) => componentMap[type] || 'div'

const setElementRef = (id, el) => { if (el) elementRefs.value[id] = el }

const getElementStyle = (el) => ({
  left: `${el.x}px`,
  top: `${el.y}px`,
  width: `${el.width}px`,
  height: `${el.height}px`,
  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
})

const isSelected = (id) => store.selectedElementId === id
const isMultiSelected = (id) => store.selectedElementIds.includes(id) && store.selectedElementIds.length > 1
const clearSelection = () => store.clearSelection()

const handleDoubleClick = (element) => {
  if (element.type === 'text') {
    const ref = elementRefs.value[element.id]
    if (ref && ref.startEdit) ref.startEdit()
  }
}

const handleElementMouseDown = (e, element) => {
  if (element.locked) return
  e.preventDefault()
  store.selectElement(element.id, e.ctrlKey || e.metaKey)
  isDragging = true
  currentElementId = element.id
  dragStartX = e.clientX
  dragStartY = e.clientY
  elementStartX = element.x
  elementStartY = element.y
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const startResize = (e, element, handle) => {
  e.preventDefault()
  isResizing = true
  currentHandle = handle
  currentElementId = element.id
  dragStartX = e.clientX
  dragStartY = e.clientY
  elementStartX = element.x
  elementStartY = element.y
  elementStartW = element.width
  elementStartH = element.height
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (e) => {
  const dx = (e.clientX - dragStartX) / store.scale
  const dy = (e.clientY - dragStartY) / store.scale
  const el = store.elements.find(el => el.id === currentElementId)
  if (!el) return

  if (isDragging && currentElementId) {
    // 统一口径：store 按像素计算并限制在画布内（含旋转包围盒）
    store.updateElement(currentElementId, {
      x: elementStartX + dx,
      y: elementStartY + dy
    })
  } else if (isResizing && currentElementId) {
    let newX = elementStartX, newY = elementStartY, newW = elementStartW, newH = elementStartH

    if (currentHandle.includes('e')) newW = elementStartW + dx
    if (currentHandle.includes('w')) { newW = elementStartW - dx; newX = elementStartX + dx }
    if (currentHandle.includes('s')) newH = elementStartH + dy
    if (currentHandle.includes('n')) { newH = elementStartH - dy; newY = elementStartY + dy }

    // 统一口径：最小尺寸与画布限制由 store 处理
    store.updateElement(currentElementId, { x: newX, y: newY, width: newW, height: newH })
  }
}

const handleMouseUp = () => {
  isDragging = false
  isResizing = false
  currentElementId = null
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

const handleDragOver = (e) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

const handleDrop = (e) => {
  e.preventDefault()
  e.stopPropagation()
  const data = e.dataTransfer.getData('application/json')
  if (!data) return

  try {
    const item = JSON.parse(data)
    const meta = ELEMENT_TYPES.find(t => t.type === item.type)
    if (!meta) return
    const container = wrapperRef.value.querySelector('.canvas-container')
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / store.scale
    const y = (e.clientY - rect.top) / store.scale

    // 以落点为中心，统一口径限制在画布内
    store.addElement({
      type: item.type,
      ...meta.defaultProps,
      x: x - meta.defaultSize.width / 2,
      y: y - meta.defaultSize.height / 2,
      ...meta.defaultSize
    })
  } catch (err) {
    console.error('Drop error:', err)
  }
}

// ---------------------------------------------------------------------------
// 导出渲染统一走 utils/canvasRenderer.js，与画布 DOM 使用同一套像素口径。
// ---------------------------------------------------------------------------

const renderCanvas = async () => {
  await nextTick()
  const canvas = canvasRef.value
  if (!canvas) return []
  const ctx = canvas.getContext('2d')
  return renderLabel(ctx, store.elements, canvas.width, canvas.height)
}

const exportToBMP = (canvas, filename = 'label.bmp') => {
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const width = canvas.width
  const height = canvas.height
  const rowSize = Math.ceil(width / 8)
  const paddedRowSize = Math.ceil(rowSize / 4) * 4
  const pixelDataSize = paddedRowSize * height
  const headerSize = 62
  const fileSize = headerSize + pixelDataSize
  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)
  view.setUint8(0, 0x42); view.setUint8(1, 0x4D)
  view.setUint32(2, fileSize, true); view.setUint32(6, 0, true); view.setUint32(10, headerSize, true)
  view.setUint32(14, 40, true); view.setInt32(18, width, true); view.setInt32(22, -height, true)
  view.setUint16(26, 1, true); view.setUint16(28, 1, true); view.setUint32(30, 0, true)
  view.setUint32(34, pixelDataSize, true); view.setUint32(38, 2835, true); view.setUint32(42, 2835, true)
  view.setUint32(46, 2, true); view.setUint32(50, 2, true)
  view.setUint8(54, 0); view.setUint8(55, 0); view.setUint8(56, 0); view.setUint8(57, 0)
  view.setUint8(58, 255); view.setUint8(59, 255); view.setUint8(60, 255); view.setUint8(61, 0)
  let offset = headerSize
  for (let y = 0; y < height; y++) {
    let byte = 0, bitIndex = 7
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2]
      byte |= ((gray > 128 ? 1 : 0) << bitIndex); bitIndex--
      if (bitIndex < 0 || x === width - 1) { view.setUint8(offset++, byte); byte = 0; bitIndex = 7 }
    }
    for (let p = Math.ceil(width / 8); p < paddedRowSize; p++) view.setUint8(offset++, 0)
  }
  const blob = new Blob([buffer], { type: 'image/bmp' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = filename; link.click()
}

const reportWarnings = (warnings, type) => {
  if (warnings.length === 0) {
    ElMessage.success(type === 'bmp' ? 'BMP 导出成功' : 'PNG 导出成功')
  } else {
    ElMessage.warning(`已导出，${warnings.join('；')}`)
  }
}

const exportCanvas = async (type) => {
  // 空画布也正常导出（白底图），不报错
  const warnings = await renderCanvas()
  const canvas = canvasRef.value
  if (!canvas) return
  if (type === 'bmp') {
    exportToBMP(canvas, 'label.bmp')
  } else {
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'label.png'
    link.click()
  }
  reportWarnings(warnings, type)
}

defineExpose({ exportCanvas })
</script>

<style lang="scss" scoped>
.canvas-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

.canvas-wrapper {
  flex: 1; overflow: auto; background: #e4e7ed;
  background-image: linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%);
  background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  padding: 24px; display: flex; justify-content: flex-start; align-items: flex-start;
}

.canvas-container { position: relative; background: #fff; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); overflow: hidden; flex-shrink: 0; }
.export-canvas { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
.edit-area { position: relative; width: 100%; height: 100%; }

// 选中框使用 outline，不占据布局像素，保证画布显示位置与导出像素一致
.canvas-element {
  position: absolute; cursor: move; box-sizing: border-box;
  outline: 1px solid transparent; outline-offset: -1px;
  &:hover { outline-color: #409eff; }
  &.selected { outline: 2px solid #409eff; outline-offset: -2px; }
  &.multi-selected { outline: 2px solid #67c23a; outline-offset: -2px; }
}

.resize-handles .resize-handle {
  position: absolute; width: 8px; height: 8px; background: #409eff; border: 1px solid #fff; border-radius: 2px;
  &.nw { top: -4px; left: -4px; cursor: nw-resize; }
  &.n { top: -4px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
  &.ne { top: -4px; right: -4px; cursor: ne-resize; }
  &.e { top: 50%; right: -4px; transform: translateY(-50%); cursor: e-resize; }
  &.se { bottom: -4px; right: -4px; cursor: se-resize; }
  &.s { bottom: -4px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
  &.sw { bottom: -4px; left: -4px; cursor: sw-resize; }
  &.w { top: 50%; left: -4px; transform: translateY(-50%); cursor: w-resize; }
}

.canvas-info {
  padding: 8px 16px; background: #f5f7fa; border-top: 1px solid #e4e7ed;
  display: flex; gap: 24px; font-size: 12px; color: #909399;
  .tip { margin-left: auto; color: #409eff; }
}
</style>
