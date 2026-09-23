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
import {
  getElementDisplayName,
  loadImage,
  drawImageContain,
  renderBarcodeToCanvas,
  renderQrcodeToCanvas
} from '@/utils/element'

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
    // 统一走 store 的钳制口径：按像素计算并限制在画布内
    store.setElementGeometry(currentElementId, {
      x: elementStartX + dx,
      y: elementStartY + dy
    })
  } else if (isResizing && currentElementId) {
    let newX = elementStartX, newY = elementStartY, newW = elementStartW, newH = elementStartH

    if (currentHandle.includes('e')) newW = Math.max(10, elementStartW + dx)
    if (currentHandle.includes('w')) { newW = Math.max(10, elementStartW - dx); newX = elementStartX + dx }
    if (currentHandle.includes('s')) newH = Math.max(10, elementStartH + dy)
    if (currentHandle.includes('n')) { newH = Math.max(10, elementStartH - dy); newY = elementStartY + dy }

    store.setElementGeometry(currentElementId, { x: newX, y: newY, width: newW, height: newH })
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
    const container = wrapperRef.value.querySelector('.canvas-container')
    const rect = container.getBoundingClientRect()
    let x = (e.clientX - rect.left) / store.scale
    let y = (e.clientY - rect.top) / store.scale
    
    const defaultSize = {
      text: { width: 100, height: 24 },
      rect: { width: 80, height: 60 },
      circle: { width: 60, height: 60 },
      line: { width: 100, height: 4 },
      image: { width: 80, height: 80 },
      barcode: { width: 150, height: 60 },
      qrcode: { width: 80, height: 80 },
      table: { width: 200, height: 120 }
    }
    
    const size = defaultSize[item.type] || { width: 100, height: 40 }

    // 位置与尺寸由 store.addElement 统一钳制在画布内，这里只计算期望落点
    store.addElement({
      type: item.type,
      ...item.defaultProps,
      x: Math.round(x - size.width / 2),
      y: Math.round(y - size.height / 2),
      ...size
    })
  } catch (err) {
    console.error('Drop error:', err)
  }
}

// 导出渲染：与画布 DOM 保持同一套口径
// - 坐标/尺寸直接使用 store 中已钳制的像素值
// - 旋转以元件中心为轴（与画布 CSS transform 一致）
// - 内容裁剪到元件框内（与画布 overflow:hidden 一致）
// 返回绘制失败的元件及原因
const renderCanvas = async () => {
  await nextTick()
  const canvas = canvasRef.value
  if (!canvas) return []
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const failures = []
  for (const el of store.elements) {
    if (!el.visible) continue
    ctx.save()
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180)
    ctx.translate(-el.width / 2, -el.height / 2)
    const result = await renderElement(ctx, el)
    ctx.restore()
    if (result && !result.ok) {
      failures.push({ name: getElementDisplayName(el), reason: result.reason })
    }
  }
  return failures
}

// 返回 { ok: true } 或 { ok: false, reason }
const renderElement = async (ctx, el) => {
  switch (el.type) {
    case 'text': {
      // 与画布 DOM（flex 垂直居中、line-height:1）一致：垂直居中绘制
      ctx.fillStyle = el.color || '#000'
      ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.fontSize || 14}px ${el.fontFamily || 'Arial'}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      clipToElement(ctx, el)
      ctx.fillText(el.content || '', 0, el.height / 2)
      return { ok: true }
    }
    case 'rect':
      if (el.fillColor && el.fillColor !== 'transparent') { ctx.fillStyle = el.fillColor; ctx.fillRect(0, 0, el.width, el.height) }
      if (el.strokeWidth) { ctx.strokeStyle = el.strokeColor || '#000'; ctx.lineWidth = el.strokeWidth; ctx.strokeRect(0, 0, el.width, el.height) }
      return { ok: true }
    case 'circle':
      ctx.beginPath()
      ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2)
      if (el.fillColor && el.fillColor !== 'transparent') { ctx.fillStyle = el.fillColor; ctx.fill() }
      if (el.strokeWidth) { ctx.strokeStyle = el.strokeColor || '#000'; ctx.lineWidth = el.strokeWidth; ctx.stroke() }
      return { ok: true }
    case 'line':
      ctx.beginPath(); ctx.moveTo(0, el.height / 2); ctx.lineTo(el.width, el.height / 2)
      ctx.strokeStyle = el.strokeColor || '#000'; ctx.lineWidth = el.strokeWidth || 2; ctx.stroke()
      return { ok: true }
    case 'image': {
      if (!el.imageData) return { ok: false, reason: '未设置图片' }
      try {
        const img = await loadImage(el.imageData)
        clipToElement(ctx, el)
        drawImageContain(ctx, img, 0, 0, el.width, el.height, true)
        return { ok: true }
      } catch (e) {
        return { ok: false, reason: '图片加载失败' }
      }
    }
    case 'barcode': {
      try {
        const bcCanvas = renderBarcodeToCanvas(el)
        clipToElement(ctx, el)
        drawImageContain(ctx, bcCanvas, 0, 0, el.width, el.height)
        return { ok: true }
      } catch (e) {
        return { ok: false, reason: '条码内容不合法' }
      }
    }
    case 'qrcode': {
      try {
        const qrCanvas = await renderQrcodeToCanvas(el)
        clipToElement(ctx, el)
        drawImageContain(ctx, qrCanvas, 0, 0, el.width, el.height)
        return { ok: true }
      } catch (e) {
        return { ok: false, reason: '二维码内容不合法' }
      }
    }
    case 'table': {
      const rows = el.rows || 3
      const cols = el.cols || 3
      const bw = el.borderWidth || 1
      const bc = el.borderColor || '#000000'
      const cellW = el.width / cols
      const cellH = el.height / rows
      const padding = 4
      clipToElement(ctx, el)
      ctx.strokeStyle = bc
      ctx.lineWidth = bw
      ctx.strokeRect(bw / 2, bw / 2, el.width - bw, el.height - bw)
      for (let r = 1; r < rows; r++) {
        ctx.beginPath()
        ctx.moveTo(0, r * cellH)
        ctx.lineTo(el.width, r * cellH)
        ctx.stroke()
      }
      for (let c = 1; c < cols; c++) {
        ctx.beginPath()
        ctx.moveTo(c * cellW, 0)
        ctx.lineTo(c * cellW, el.height)
        ctx.stroke()
      }
      const fontSize = el.cellFontSize || 12
      const fontFamily = el.cellFontFamily || 'Arial'
      const textAlign = el.cellTextAlign || 'center'
      ctx.fillStyle = el.cellFontColor || '#000000'
      ctx.font = `${fontSize}px ${fontFamily}`
      ctx.textAlign = textAlign
      ctx.textBaseline = 'middle'
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const text = (el.cells && el.cells[r] && el.cells[r][c]) || ''
          if (text) {
            let x
            if (textAlign === 'left') x = c * cellW + padding
            else if (textAlign === 'right') x = (c + 1) * cellW - padding
            else x = c * cellW + cellW / 2
            const y = r * cellH + cellH / 2
            ctx.fillText(text, x, y)
          }
        }
      }
      return { ok: true }
    }
    default:
      return { ok: true }
  }
}

// 内容裁剪到元件框内，与画布 DOM 的 overflow:hidden 对齐
const clipToElement = (ctx, el) => {
  ctx.beginPath()
  ctx.rect(0, 0, el.width, el.height)
  ctx.clip()
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

const exportCanvas = async (type) => {
  // 空画布直接提示，不生成文件
  if (store.elements.filter(el => el.visible).length === 0) {
    ElMessage.info('画布为空，没有可导出的内容')
    return
  }
  const failures = await renderCanvas()
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
  // 说明是哪一项没画出来
  if (failures.length > 0) {
    ElMessage.warning(`已导出，但以下元件未绘制：${failures.map(f => `${f.name}（${f.reason}）`).join('、')}`)
  } else {
    ElMessage.success(`${type.toUpperCase()} 导出成功`)
  }
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

.canvas-element {
  position: absolute; cursor: move; border: 1px solid transparent; box-sizing: border-box;
  &:hover { border-color: #409eff; }
  &.selected { border-color: #409eff; border-width: 2px; }
  &.multi-selected { border-color: #67c23a; border-width: 2px; }
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
