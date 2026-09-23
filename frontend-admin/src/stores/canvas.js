import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { clampElementRect, getElementTypeName } from '@/utils/element'

const MM_TO_DOT = 8

export const useCanvasStore = defineStore('canvas', () => {
  const canvasWidth = ref(80)
  const canvasHeight = ref(60)
  const scale = ref(1)
  const elements = ref([])
  const selectedElementId = ref(null)
  const selectedElementIds = ref([])
  let elementIdCounter = 0
  // 每种类型独立的命名序号，删除元件不重排，保证名称稳定
  const nameCounters = {}

  const canvasPixelWidth = computed(() => canvasWidth.value * MM_TO_DOT)
  const canvasPixelHeight = computed(() => canvasHeight.value * MM_TO_DOT)

  const selectedElement = computed(() => {
    if (!selectedElementId.value) return null
    return elements.value.find(el => el.id === selectedElementId.value)
  })

  const selectedElements = computed(() => {
    return elements.value.filter(el => selectedElementIds.value.includes(el.id))
  })

  function setCanvasSize(width, height) {
    canvasWidth.value = width
    canvasHeight.value = height
  }

  function setScale(newScale) {
    scale.value = Math.max(0.25, Math.min(4, newScale))
  }

  function addElement(element) {
    const id = `element_${++elementIdCounter}`
    // 新增时即按统一口径钳制在画布内
    const rect = clampElementRect(
      {
        x: element.x ?? 10,
        y: element.y ?? 10,
        width: element.width || 100,
        height: element.height || 30
      },
      canvasPixelWidth.value,
      canvasPixelHeight.value
    )
    nameCounters[element.type] = (nameCounters[element.type] || 0) + 1
    const newElement = {
      id,
      ...element,
      ...rect,
      name: element.name || `${getElementTypeName(element.type)}${nameCounters[element.type]}`,
      rotation: element.rotation || 0,
      locked: false,
      visible: true
    }
    elements.value.push(newElement)
    selectElement(id)
    return id
  }

  function updateElement(id, updates) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value[index] = { ...elements.value[index], ...updates }
    }
  }

  // 位置/尺寸的唯一修改入口：按像素计算并限制在画布内
  function setElementGeometry(id, updates) {
    const el = elements.value.find(el => el.id === id)
    if (!el) return
    const rect = clampElementRect(
      {
        x: updates.x ?? el.x,
        y: updates.y ?? el.y,
        width: updates.width ?? el.width,
        height: updates.height ?? el.height
      },
      canvasPixelWidth.value,
      canvasPixelHeight.value
    )
    updateElement(id, rect)
  }

  function renameElement(id, name) {
    updateElement(id, { name: (name || '').trim() || getElementTypeName(elements.value.find(el => el.id === id)?.type) })
  }

  function deleteElement(id) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value.splice(index, 1)
      selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
      
      // 删除后选中第一个元件
      if (elements.value.length > 0) {
        const firstElement = elements.value[elements.value.length - 1]
        selectedElementId.value = firstElement.id
        selectedElementIds.value = [firstElement.id]
      } else {
        selectedElementId.value = null
        selectedElementIds.value = []
      }
    }
  }

  function selectElement(id, multiSelect = false) {
    if (multiSelect) {
      if (selectedElementIds.value.includes(id)) {
        selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
        if (selectedElementIds.value.length > 0) {
          selectedElementId.value = selectedElementIds.value[selectedElementIds.value.length - 1]
        } else {
          selectedElementId.value = null
        }
      } else {
        selectedElementIds.value.push(id)
        selectedElementId.value = id
      }
    } else {
      selectedElementId.value = id
      selectedElementIds.value = id ? [id] : []
    }
  }

  function clearSelection() {
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  // 多选元件之间对齐（对齐结果同样走统一钳制口径）
  function alignElements(alignment) {
    const selected = selectedElements.value
    if (selected.length < 2) return

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...selected.map(el => el.x))
        selected.forEach(el => setElementGeometry(el.id, { x: minX }))
        break
      }
      case 'right': {
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        selected.forEach(el => setElementGeometry(el.id, { x: maxRight - el.width }))
        break
      }
      case 'center-h': {
        const minX = Math.min(...selected.map(el => el.x))
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        const centerX = (minX + maxRight) / 2
        selected.forEach(el => setElementGeometry(el.id, { x: centerX - el.width / 2 }))
        break
      }
      case 'top': {
        const minY = Math.min(...selected.map(el => el.y))
        selected.forEach(el => setElementGeometry(el.id, { y: minY }))
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        selected.forEach(el => setElementGeometry(el.id, { y: maxBottom - el.height }))
        break
      }
      case 'center-v': {
        const minY = Math.min(...selected.map(el => el.y))
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        const centerY = (minY + maxBottom) / 2
        selected.forEach(el => setElementGeometry(el.id, { y: centerY - el.height / 2 }))
        break
      }
    }
  }

  function duplicateElement(id) {
    const element = elements.value.find(el => el.id === id)
    if (!element) return

    const newElement = {
      ...element,
      x: element.x + 20,
      y: element.y + 20
    }
    delete newElement.id
    delete newElement.name
    return addElement(newElement)
  }

  function clearCanvas() {
    elements.value = []
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  return {
    canvasWidth,
    canvasHeight,
    scale,
    elements,
    selectedElementId,
    selectedElementIds,
    canvasPixelWidth,
    canvasPixelHeight,
    selectedElement,
    selectedElements,
    setCanvasSize,
    setScale,
    addElement,
    updateElement,
    setElementGeometry,
    renameElement,
    deleteElement,
    selectElement,
    clearSelection,
    alignElements,
    duplicateElement,
    clearCanvas,
    MM_TO_DOT
  }
})
