// 验证 store 的所有几何更新路径都走统一口径（add/update/画布改尺寸/对齐/复制）
import { build } from 'esbuild'
import { rmSync } from 'fs'
import { createPinia, setActivePinia } from 'pinia'

const outfile = 'test-store.bundle.mjs'
await build({
  entryPoints: ['src/stores/canvas.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  alias: { '@': process.cwd() + '/src' },
  external: ['pinia', 'vue'],
  outfile,
  logLevel: 'silent'
})

const { useCanvasStore } = await import('./' + outfile)
setActivePinia(createPinia())
const store = useCanvasStore()

let failures = 0
const ok = (cond, msg) => { if (cond) console.log('PASS:', msg); else { failures++; console.error('FAIL:', msg) } }

// 默认画布 80x60mm = 640x480
ok(store.canvasPixelWidth === 640 && store.canvasPixelHeight === 480, '1mm=8dot 画布像素 640x480')

// addElement：越界坐标被夹回
const id1 = store.addElement({ type: 'text', x: -100, y: 9999, width: 100, height: 40, rotation: 0, content: 'A' })
const el1 = store.elements[0]
ok(el1.x === 0 && el1.y === 440, `新增元件夹回画布内 (${el1.x},${el1.y})`)

// updateElement：拖拽越界 -> 夹回（模拟 handleMouseMove 的更新）
store.updateElement(id1, { x: -50, y: -50 })
ok(store.elements[0].x === 0 && store.elements[0].y === 0, '拖拽更新统一夹回')

// 旋转后包围盒口径：45° 元件不能贴 x=0（AABB 左边会探出）
store.updateElement(id1, { rotation: 45, x: 0, y: 0 })
const after = store.elements[0]
ok(after.x === 0 && after.y === 30, `45° 元件 y 被夹到 offset=30，实际 ${after.y}`)

// resize：拉大到超出画布 -> 受尺寸/位置共同约束
store.updateElement(id1, { rotation: 0, x: 0, y: 0, width: 99999, height: 99999 })
const r = store.elements[0]
ok(r.width === 640 && r.height === 480 && r.x === 0 && r.y === 0, `缩放到画布大小 ${r.width}x${r.height}`)

// 属性面板直接写旋转 360 -> 规范化为 0
store.updateElement(id1, { width: 100, height: 40, x: 0, y: 0, rotation: 360 })
ok(store.elements[0].rotation === 0, '旋转 360 规范化为 0')

// 画布改小：元件按统一口径重新限制（不超出新画布）
store.setCanvasSize(10, 10) // 80x80 px
const s = store.elements[0]
ok(s.width <= 80 && s.height <= 80 && s.x >= 0 && s.y >= 0, `画布改小后元件重新限制 (x=${s.x},y=${s.y},${s.width}x${s.height})`)
store.setCanvasSize(80, 60)

// 对齐：三个元件左对齐后 x 相同，且都在画布内
store.clearCanvas()
const a = store.addElement({ type: 'rect', x: 10, y: 10, width: 50, height: 50 })
const b = store.addElement({ type: 'rect', x: 200, y: 100, width: 60, height: 40 })
const c = store.addElement({ type: 'rect', x: 400, y: 200, width: 70, height: 30 })
store.selectElement(a); store.selectElement(b, true); store.selectElement(c, true)
store.alignElements('left')
ok(store.elements.every(e => e.x === 10), '左对齐 x 一致: ' + store.elements.map(e => e.x).join(','))

// 复制：偏移 20，越界时由 addElement 统一夹回
store.clearCanvas()
const d = store.addElement({ type: 'text', x: 620, y: 460, width: 20, height: 20, content: 'D' })
const dup = store.duplicateElement(d)
const dupEl = store.elements.find(e => e.id === dup)
ok(dupEl.x <= 640 - dupEl.width && dupEl.y <= 480 - dupEl.height, `复制件夹回画布内 (${dupEl.x},${dupEl.y})`)

// 名称口径：属性面板与图层列表共用 getElementName
const { getElementName } = await import('./src/utils/elementMeta.js')
ok(getElementName(store.elements[0], 0) === '文本 1', '元件名称统一（文本 1）: ' + getElementName(store.elements[0], 0))

rmSync(outfile)
process.exit(failures ? 1 : 0)
