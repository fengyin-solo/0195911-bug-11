/**
 * 画布 -> 位图渲染（导出 PNG / 1-bit BMP 共用）。
 * 与画布 DOM 使用同一套像素口径：x/y/宽高/旋转/裁剪完全一致，
 * 保证“画布上看到的”与“保存成图片的”逐项对得上。
 *
 * renderLabel(ctx, elements, options) 返回未成功绘制的元件提示列表。
 */
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { getElementName } from './elementMeta'

const loadImageElement = (el) => new Promise((resolve) => {
  if (!el.imageData) {
    resolve(null)
    return
  }
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = el.imageData
})

/** 字体字符串（含空格的字体名加引号，否则 canvas 解析失败会静默回退） */
export const buildFontString = (el, sizeOverride) => {
  const size = sizeOverride ?? el.fontSize ?? 14
  const family = el.fontFamily || 'Arial'
  const quotedFamily = /\s/.test(family) ? `"${family}"` : family
  return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${size}px ${quotedFamily}`
}

/** contain 适配：保持宽高比居中绘制（与 DOM 的 object-fit: contain 一致） */
const drawContained = (ctx, source, sw, sh, boxW, boxH) => {
  if (!sw || !sh) return
  const ratio = Math.min(boxW / sw, boxH / sh)
  const dw = sw * ratio
  const dh = sh * ratio
  ctx.drawImage(source, (boxW - dw) / 2, (boxH - dh) / 2, dw, dh)
}

const renderElement = async (ctx, el, name, warnings) => {
  switch (el.type) {
    case 'text': {
      const content = el.content ?? ''
      ctx.fillStyle = el.color || '#000'
      ctx.font = buildFontString(el)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const metrics = ctx.measureText(content || '')
      const ascent = metrics.actualBoundingBoxAscent
      const descent = metrics.actualBoundingBoxDescent
      const fontSize = el.fontSize || 14
      const inkHeight = (Number.isFinite(ascent) && Number.isFinite(descent))
        ? ascent + descent
        : fontSize
      // 与画布 DOM（line-height:1 + flex 垂直居中）一致：文字墨迹垂直居中
      const textY = Number.isFinite(ascent)
        ? (el.height - inkHeight) / 2 + ascent
        : (el.height + fontSize * 0.75) / 2
      ctx.fillText(content, 0, textY)
      break
    }
    case 'rect': {
      const strokeWidth = Number(el.strokeWidth) || 0
      if (el.fillColor && el.fillColor !== 'transparent') {
        // DOM 的 border 在 border-box 内，填充区域要扣除边框宽度
        ctx.fillStyle = el.fillColor
        ctx.fillRect(strokeWidth / 2, strokeWidth / 2, el.width - strokeWidth, el.height - strokeWidth)
      }
      if (strokeWidth > 0) {
        ctx.strokeStyle = el.strokeColor || '#000'
        ctx.lineWidth = strokeWidth
        ctx.strokeRect(strokeWidth / 2, strokeWidth / 2, el.width - strokeWidth, el.height - strokeWidth)
      }
      break
    }
    case 'circle': {
      const strokeWidth = Number(el.strokeWidth) || 0
      const rx = Math.max(0, el.width / 2 - strokeWidth / 2)
      const ry = Math.max(0, el.height / 2 - strokeWidth / 2)
      ctx.beginPath()
      ctx.ellipse(el.width / 2, el.height / 2, rx, ry, 0, 0, Math.PI * 2)
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor
        ctx.fill()
      }
      if (strokeWidth > 0) {
        ctx.strokeStyle = el.strokeColor || '#000'
        ctx.lineWidth = strokeWidth
        ctx.stroke()
      }
      break
    }
    case 'line': {
      ctx.beginPath()
      ctx.moveTo(0, el.height / 2)
      ctx.lineTo(el.width, el.height / 2)
      ctx.strokeStyle = el.strokeColor || '#000'
      ctx.lineWidth = el.strokeWidth || 2
      ctx.lineCap = 'butt'
      ctx.stroke()
      break
    }
    case 'image': {
      if (!el.imageData) {
        warnings.push(`「${name}」未绘制：图片未读入`)
        break
      }
      const img = await loadImageElement(el)
      if (!img) {
        warnings.push(`「${name}」未绘制：图片读取失败`)
        break
      }
      drawContained(ctx, img, img.width, img.height, el.width, el.height)
      break
    }
    case 'barcode': {
      const content = el.content || '123456789'
      const bcCanvas = document.createElement('canvas')
      try {
        // 选项与画布条码元件保持一致
        JsBarcode(bcCanvas, content, {
          format: el.format || 'CODE128',
          displayValue: el.showText !== false,
          width: 2,
          height: Math.max(30, el.height - 20),
          margin: 10,
          background: '#ffffff',
          lineColor: '#000000'
        })
      } catch (err) {
        warnings.push(`「${name}」未绘制：条码内容不合法（${content || '空'}）`)
        break
      }
      drawContained(ctx, bcCanvas, bcCanvas.width, bcCanvas.height, el.width, el.height)
      break
    }
    case 'qrcode': {
      const qrCanvas = document.createElement('canvas')
      try {
        await QRCode.toCanvas(qrCanvas, el.content || 'https://example.com', {
          width: Math.max(1, Math.round(Math.min(el.width, el.height))),
          margin: 2,
          errorCorrectionLevel: el.errorLevel || 'M',
          color: { dark: '#000000', light: '#ffffff' }
        })
      } catch (err) {
        warnings.push(`「${name}」未绘制：二维码内容不合法（${el.content || '空'}）`)
        break
      }
      // 与画布二维码元件一致：按宽高较小者成正方形并居中
      const side = Math.min(el.width, el.height)
      ctx.drawImage(qrCanvas, (el.width - side) / 2, (el.height - side) / 2, side, side)
      break
    }
    case 'table': {
      const rows = el.rows || 3
      const cols = el.cols || 3
      const bw = el.borderWidth || 1
      const bc = el.borderColor || '#000000'
      const cellW = el.width / cols
      const cellH = el.height / rows
      const padding = 4
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
      const cellFamily = el.cellFontFamily || 'Arial'
      const quotedFamily = /\s/.test(cellFamily) ? `"${cellFamily}"` : cellFamily
      const textAlign = el.cellTextAlign || 'center'
      ctx.fillStyle = el.cellFontColor || '#000000'
      ctx.font = `${fontSize}px ${quotedFamily}`
      ctx.textAlign = textAlign
      ctx.textBaseline = 'middle'
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const text = (el.cells && el.cells[r] && el.cells[r][c]) || ''
          if (text) {
            let tx
            if (textAlign === 'left') tx = c * cellW + padding
            else if (textAlign === 'right') tx = (c + 1) * cellW - padding
            else tx = c * cellW + cellW / 2
            const ty = r * cellH + cellH / 2
            ctx.fillText(text, tx, ty)
          }
        }
      }
      break
    }
  }
}

/**
 * 渲染整张标签到给定 2D 上下文。
 * @returns {Promise<string[]>} 未成功绘制元件的中文提示
 */
export async function renderLabel(ctx, elements, canvasWidth, canvasHeight) {
  const warnings = []
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // 空画布只画白底，不报错
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!el.visible) continue
    const name = getElementName(el, i)
    ctx.save()
    // 与 CSS rotate 完全相同的变换：平移到中心 -> 旋转 -> 平移回左上角
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180)
    ctx.translate(-el.width / 2, -el.height / 2)
    // 与 DOM 的 overflow: hidden 一致，元件内容不能画到自身框外
    ctx.beginPath()
    ctx.rect(0, 0, el.width, el.height)
    ctx.clip()
    try {
      await renderElement(ctx, el, name, warnings)
    } catch (err) {
      warnings.push(`「${name}」绘制失败：${err.message || err}`)
    }
    ctx.restore()
  }
  return warnings
}
