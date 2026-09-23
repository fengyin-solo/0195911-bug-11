// 用 esbuild 把渲染器（含 jsbarcode/qrcode）打包为 CJS，注入桩全局后在 Node 中验证。
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'fs'

const outfile = 'test-renderer.bundle.mjs'

await build({
  entryPoints: ['src/utils/canvasRenderer.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile,
  logLevel: 'silent'
})

// ---- 桩：2D 上下文，记录调用 ----
function createCtx(width, height) {
  const calls = []
  const stack = []
  const ctx = {
    calls,
    canvas: { width, height },
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', lineWidth: 1, lineCap: '',
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    strokeRect: (...a) => calls.push(['strokeRect', ...a]),
    fillText: (text, x, y) => calls.push(['fillText', text, round(x), round(y), ctx.font]),
    measureText: (text) => ({
      // 模拟浏览器度量：ascent ≈ 0.8em，descent ≈ 0.2em（line-height 1 的墨迹盒）
      actualBoundingBoxAscent: parseFontSize(ctx.font) * 0.8,
      actualBoundingBoxDescent: parseFontSize(ctx.font) * 0.2,
      width: (text || '').length * parseFontSize(ctx.font) * 0.5
    }),
    beginPath: () => calls.push(['beginPath']),
    ellipse: (...a) => calls.push(['ellipse', ...a]),
    moveTo: (...a) => calls.push(['moveTo', ...a]),
    lineTo: (...a) => calls.push(['lineTo', ...a]),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    drawImage: (src, x, y, w, h) => calls.push(['drawImage', src && src.__tag, round(x), round(y), round(w), round(h)]),
    save: () => { calls.push(['save']); stack.push({ fillStyle: ctx.fillStyle, font: ctx.font }) },
    restore: () => { calls.push(['restore']); const s = stack.pop(); if (s) Object.assign(ctx, s) },
    translate: (x, y) => calls.push(['translate', round(x), round(y)]),
    rotate: (a) => calls.push(['rotate', Number(a.toFixed(4))]),
    rect: (...a) => calls.push(['rect', ...a]),
    clip: () => calls.push(['clip'])
  }
  return ctx
}
function parseFontSize(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || '')
  return m ? parseFloat(m[1]) : 14
}
function round(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v }

// ---- 桩全局 ----
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return { __tag: 'canvas', width: 0, height: 0, getContext: () => createCtxStub2d() }
    throw new Error('unexpected element ' + tag)
  }
}
function createCtxStub2d() {
  // 内部 canvas（jsbarcode/qrcode 绘制用）：任意方法为空操作，属性可任意赋值
  const proxy = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (prop === 'getContext') return () => proxy
      if (prop === 'measureText') return () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 })
      if (prop === 'getImageData') return () => ({ data: [] })
      return () => {}
    },
    set(target, prop, value) { target[prop] = value; return true }
  })
  return proxy
}
let barcodeShouldThrow = false
globalThis.JsBarcode = undefined
globalThis.Image = class {
  set src(v) {
    if (v === 'data:broken') { this.onerror && this.onerror(new Error('bad')) }
    else { this.width = 100; this.height = 50; this.onload && this.onload() }
  }
}

const { renderLabel } = await import('./' + outfile)

let failures = 0
const ok = (cond, msg) => { if (cond) console.log('PASS:', msg); else { failures++; console.error('FAIL:', msg) } }

// 1. 空画布：不报错，只刷白底
{
  const ctx = createCtx(100, 80)
  const warnings = await renderLabel(ctx, [], 100, 80)
  ok(warnings.length === 0, '空画布无警告')
  ok(JSON.stringify(ctx.calls[0]) === JSON.stringify(['fillRect', 0, 0, 100, 80]), '空画布刷白底')
}

// 2. 文本垂直居中：height=40, fontSize=20 -> 墨迹盒高 20，baseline y = 10+16 = 26
{
  const ctx = createCtx(200, 100)
  const el = { type: 'text', x: 0, y: 0, width: 200, height: 40, rotation: 0, visible: true,
    content: 'AB', fontSize: 20, fontFamily: 'Arial', color: '#000' }
  await renderLabel(ctx, [el], 200, 100)
  const ft = ctx.calls.find(c => c[0] === 'fillText')
  ok(ft && ft[3] === 26, `文本墨迹垂直居中 baseline y=26，实际 ${ft && ft[3]}`)
}
// 2b. 字号越大居中偏移越大但仍居中：fontSize=40 in height=80 -> baseline y=20+32=52
{
  const ctx = createCtx(200, 200)
  const el = { type: 'text', x: 0, y: 0, width: 200, height: 80, rotation: 0, visible: true,
    content: 'AB', fontSize: 40, fontFamily: 'Arial' }
  await renderLabel(ctx, [el], 200, 200)
  const ft = ctx.calls.find(c => c[0] === 'fillText')
  ok(ft && ft[3] === 52, `大字号仍居中 baseline y=52，实际 ${ft && ft[3]}`)
}

// 3. 多词字体名加引号
{
  const ctx = createCtx(200, 100)
  const el = { type: 'text', x: 0, y: 0, width: 200, height: 40, rotation: 0, visible: true,
    content: 'X', fontSize: 14, fontFamily: 'Times New Roman', bold: true, italic: true }
  await renderLabel(ctx, [el], 200, 100)
  const ft = ctx.calls.find(c => c[0] === 'fillText')
  ok(ft[4] === 'italic bold 14px "Times New Roman"', '多词字体加引号且粗斜体生效: ' + ft[4])
}

// 4. 图片未读入 -> 指明名称
{
  const ctx = createCtx(400, 400)
  const els = [
    { type: 'image', x: 0, y: 0, width: 80, height: 80, rotation: 0, visible: true },
    { type: 'image', x: 0, y: 90, width: 80, height: 80, rotation: 0, visible: true, imageData: 'data:broken' }
  ]
  const warnings = await renderLabel(ctx, els, 400, 400)
  ok(warnings[0] === '「图片 1」未绘制：图片未读入', '未读入图片指明项: ' + warnings[0])
  ok(warnings[1] === '「图片 2」未绘制：图片读取失败', '读取失败指明项: ' + warnings[1])
  ok(!ctx.calls.some(c => c[0] === 'drawImage'), '失败图片没有绘制')
}

// 5. 合法图片 contain 居中（100x50 的源画进 80x80 -> 80x40，y 偏移 20）
{
  const ctx = createCtx(400, 400)
  const el = { type: 'image', x: 0, y: 0, width: 80, height: 80, rotation: 0, visible: true, imageData: 'data:ok' }
  const warnings = await renderLabel(ctx, [el], 400, 400)
  const di = ctx.calls.find(c => c[0] === 'drawImage')
  ok(warnings.length === 0 && JSON.stringify(di) === JSON.stringify(['drawImage', undefined, 0, 20, 80, 40]),
    '图片 contain 居中不拉伸: ' + JSON.stringify(di))
}

// 6. 条码内容不合法 -> 指明项；合法 -> 绘制（用真实 JsBarcode：EAN13 不接受字母）
{
  const ctx = createCtx(400, 400)
  const warnings = await renderLabel(ctx, [{ type: 'barcode', x: 0, y: 0, width: 150, height: 60,
    rotation: 0, visible: true, content: 'ABC', format: 'EAN13' }], 400, 400)
  ok(warnings[0] === '「条码 1」未绘制：条码内容不合法（ABC）', '非法条码指明项: ' + warnings[0])
  const ctx2 = createCtx(400, 400)
  const w2 = await renderLabel(ctx2, [{ type: 'barcode', x: 0, y: 0, width: 150, height: 60,
    rotation: 0, visible: true, content: '123456789', format: 'CODE128' }], 400, 400)
  ok(w2.length === 0 && ctx2.calls.some(c => c[0] === 'drawImage'), '合法条码正常绘制')
}

// 7. 旋转 90 度的变换序列与 CSS 一致（中心平移 -> rotate(pi/2) -> 回移）
{
  const ctx = createCtx(200, 200)
  const el = { type: 'text', x: 30, y: 20, width: 100, height: 40, rotation: 90, visible: true, content: 'X', fontSize: 14 }
  await renderLabel(ctx, [el], 200, 200)
  const seq = ctx.calls.filter(c => ['translate', 'rotate'].includes(c[0])).slice(0, 3)
  ok(JSON.stringify(seq) === JSON.stringify([['translate', 80, 40], ['rotate', 1.5708], ['translate', -50, -20]]),
    '90° 旋转变换与 CSS 口径一致: ' + JSON.stringify(seq))
}

// 8. 可见性：隐藏元件不绘制
{
  const ctx = createCtx(200, 200)
  const warnings = await renderLabel(ctx, [{ type: 'text', x: 0, y: 0, width: 100, height: 20,
    rotation: 0, visible: true, content: 'X', visible: false }], 200, 200)
  ok(warnings.length === 0 && !ctx.calls.some(c => c[0] === 'fillText'), '隐藏元件不绘制')
}

rmSync(outfile)
process.exit(failures ? 1 : 0)
