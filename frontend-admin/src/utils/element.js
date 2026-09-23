import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

// 元件类型显示名：图层列表、属性面板、导出提示共用同一份
export const ELEMENT_TYPE_NAMES = {
  text: '文本',
  rect: '矩形',
  circle: '圆形',
  line: '线条',
  image: '图片',
  barcode: '条码',
  qrcode: '二维码',
  table: '表格'
}

export function getElementTypeName(type) {
  return ELEMENT_TYPE_NAMES[type] || type
}

// 元件显示名：优先用户命名，否则用 store 生成的默认名（如 文本1）
export function getElementDisplayName(el) {
  return (el && el.name) || getElementTypeName(el && el.type)
}

// 位置与尺寸钳制：全应用唯一口径，按像素计算并限制在画布内
// 返回钳制后的 { x, y, width, height }（整数）
export function clampElementRect(rect, canvasPixelWidth, canvasPixelHeight, minSize = 1) {
  const width = Math.max(minSize, Math.min(Math.round(rect.width), canvasPixelWidth))
  const height = Math.max(minSize, Math.min(Math.round(rect.height), canvasPixelHeight))
  const x = Math.max(0, Math.min(Math.round(rect.x), canvasPixelWidth - width))
  const y = Math.max(0, Math.min(Math.round(rect.y), canvasPixelHeight - height))
  return { x, y, width, height }
}

// 加载图片，失败时 reject（用于导出时判断“图片没读进来”）
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

// 与画布 DOM 一致的 contain 口径：等比缩放、居中
// allowUpscale: 图片元件对应 object-fit:contain（可放大）；条码/二维码对应 max-width/max-height（不放大）
export function drawImageContain(ctx, img, x, y, w, h, allowUpscale = false) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  let scale = Math.min(w / iw, h / ih)
  if (!allowUpscale) scale = Math.min(scale, 1)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

// 条码渲染：画布 DOM 与导出共用同一份参数，内容非法时抛错
export function renderBarcodeToCanvas(el) {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, el.content || '', {
    format: el.format || 'CODE128',
    displayValue: el.showText !== false,
    width: 2,
    height: Math.max(30, (el.height || 60) - 20),
    margin: 10,
    background: '#ffffff',
    lineColor: '#000000'
  })
  return canvas
}

// 二维码渲染：画布 DOM 与导出共用同一份参数，内容非法时抛错
export function renderQrcodeToCanvas(el) {
  const canvas = document.createElement('canvas')
  return QRCode.toCanvas(canvas, el.content || '', {
    width: Math.min(el.width, el.height),
    margin: 2,
    errorCorrectionLevel: el.errorLevel || 'M',
    color: { dark: '#000000', light: '#ffffff' }
  }).then(() => canvas)
}
