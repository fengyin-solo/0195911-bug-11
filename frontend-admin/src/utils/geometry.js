/**
 * 像素几何口径 —— 画布显示、拖拽/缩放、属性面板、对齐、复制、导出
 * 全部使用这里的同一套规则，禁止各组件再各算一遍。
 *
 * 坐标系单位为点（dot，即像素）：1mm = 8 dot。
 * x/y 为元件未旋转包围盒左上角，width/height 为未旋转包围盒尺寸，
 * rotation 为绕包围盒中心的旋转角度（度）。
 * 约束规则：元件旋转后的完整包围盒（AABB）必须落在画布内。
 */

export const MIN_ELEMENT_SIZE = 1

/** 角度规范化到 [0, 360)，与属性面板输入范围保持一致 */
export function normalizeRotation(rotation) {
  let r = Number(rotation) || 0
  r = r % 360
  if (r < 0) r += 360
  return r
}

/**
 * 旋转后包围盒（轴对齐）的宽高，旋转中心为未旋转包围盒中心。
 * 旋转后 AABB 左上角相对未旋转左上角偏移：
 *   aabbLeft = x - offsetX, aabbTop = y - offsetY
 * 其中 offsetX = (boundsWidth - width) / 2
 */
export function rotatedBounds(width, height, rotation) {
  const angle = ((Number(rotation) || 0) * Math.PI) / 180
  const sin = Math.abs(Math.sin(angle))
  const cos = Math.abs(Math.cos(angle))
  if (sin < 1e-9 && Math.abs(cos - 1) < 1e-9) {
    return { boundsWidth: width, boundsHeight: height, offsetX: 0, offsetY: 0 }
  }
  const boundsWidth = width * cos + height * sin
  const boundsHeight = width * sin + height * cos
  return {
    boundsWidth,
    boundsHeight,
    offsetX: (boundsWidth - width) / 2,
    offsetY: (boundsHeight - height) / 2
  }
}

/**
 * 按像素计算并把元件限制在画布内。
 * 返回规范化后的 { x, y, width, height, rotation }（坐标取整为像素整数）。
 */
export function clampElementGeometry(geom, canvasWidth, canvasHeight) {
  const rotation = normalizeRotation(geom.rotation)
  // 元件未旋转包围盒不得大于画布（与属性面板宽高上限一致），最小 1 像素
  const width = Math.min(canvasWidth, Math.max(MIN_ELEMENT_SIZE, Math.round(Number(geom.width) || MIN_ELEMENT_SIZE)))
  const height = Math.min(canvasHeight, Math.max(MIN_ELEMENT_SIZE, Math.round(Number(geom.height) || MIN_ELEMENT_SIZE)))

  const { boundsWidth, boundsHeight, offsetX, offsetY } = rotatedBounds(width, height, rotation)

  // AABB 边界：[x-offsetX, x-offsetX+boundsWidth] 必须落在画布内。
  // 坐标为整数像素：下界向上取整、上界向下取整，保证边缘不探出画布。
  let x
  let y
  if (canvasWidth >= boundsWidth) {
    const minX = Math.ceil(offsetX)
    const maxX = Math.floor(canvasWidth - boundsWidth + offsetX)
    x = Math.min(Math.max(Math.round(Number(geom.x) || 0), minX), maxX)
  } else {
    // 元件本身宽于画布（用户主动拉大或画布改小）：保留尺寸，画布居中裁剪
    x = Math.round((canvasWidth - width) / 2)
  }
  if (canvasHeight >= boundsHeight) {
    const minY = Math.ceil(offsetY)
    const maxY = Math.floor(canvasHeight - boundsHeight + offsetY)
    y = Math.min(Math.max(Math.round(Number(geom.y) || 0), minY), maxY)
  } else {
    y = Math.round((canvasHeight - height) / 2)
  }

  return { x, y, width, height, rotation }
}

/** 属性面板 X/Y 允许输入的最小/最大值（旋转包围盒口径） */
export function positionLimits(element, canvasWidth, canvasHeight) {
  const { boundsWidth, boundsHeight, offsetX, offsetY } = rotatedBounds(
    element.width, element.height, element.rotation
  )
  if (canvasWidth < boundsWidth || canvasHeight < boundsHeight) {
    return {
      minX: Math.round((canvasWidth - element.width) / 2),
      maxX: Math.round((canvasWidth - element.width) / 2),
      minY: Math.round((canvasHeight - element.height) / 2),
      maxY: Math.round((canvasHeight - element.height) / 2)
    }
  }
  return {
    minX: Math.ceil(offsetX),
    maxX: Math.floor(canvasWidth - boundsWidth + offsetX),
    minY: Math.ceil(offsetY),
    maxY: Math.floor(canvasHeight - boundsHeight + offsetY)
  }
}
