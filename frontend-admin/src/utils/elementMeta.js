/**
 * 元件元数据 —— 元件库、图层列表、属性面板、导出提示共用同一份口径，
 * 名称只在这里定义一次，避免各处各写一份导致不一致。
 */

export const ELEMENT_TYPES = [
  {
    type: 'text',
    label: '文本',
    icon: 'Document',
    defaultSize: { width: 100, height: 24 },
    defaultProps: { content: '双击编辑', fontSize: 14, fontFamily: 'Arial', color: '#000000', bold: false, italic: false }
  },
  {
    type: 'rect',
    label: '矩形',
    icon: 'FullScreen',
    defaultSize: { width: 80, height: 60 },
    defaultProps: { fillColor: '#ffffff', strokeColor: '#000000', strokeWidth: 1 }
  },
  {
    type: 'circle',
    label: '圆形',
    icon: 'CircleCheck',
    defaultSize: { width: 60, height: 60 },
    defaultProps: { fillColor: '#ffffff', strokeColor: '#000000', strokeWidth: 1 }
  },
  {
    type: 'line',
    label: '线条',
    icon: 'Minus',
    defaultSize: { width: 100, height: 4 },
    defaultProps: { strokeColor: '#000000', strokeWidth: 2 }
  },
  {
    type: 'image',
    label: '图片',
    icon: 'Picture',
    defaultSize: { width: 80, height: 80 },
    defaultProps: { src: 'https://picsum.photos/100/100' }
  },
  {
    type: 'barcode',
    label: '条码',
    icon: 'Postcard',
    defaultSize: { width: 150, height: 60 },
    defaultProps: { content: '123456789', format: 'CODE128', showText: true }
  },
  {
    type: 'qrcode',
    label: '二维码',
    icon: 'Grid',
    defaultSize: { width: 80, height: 80 },
    defaultProps: { content: 'https://example.com', errorLevel: 'M' }
  },
  {
    type: 'table',
    label: '表格',
    icon: 'Grid',
    defaultSize: { width: 200, height: 120 },
    defaultProps: {
      rows: 3, cols: 3, borderWidth: 1, borderColor: '#000000',
      cellFontSize: 12, cellFontFamily: 'Arial', cellFontColor: '#000000',
      cellTextAlign: 'center', cells: {}
    }
  }
]

const elementTypeMap = ELEMENT_TYPES.reduce((map, item) => {
  map[item.type] = item
  return map
}, {})

export const getElementType = (type) => elementTypeMap[type]

export const getElementLabel = (type) => elementTypeMap[type]?.label || type

/**
 * 元件显示名称 —— 图层列表与属性面板必须调用同一个函数，
 * 传入层级序号时追加序号，便于区分同类元件（也用于导出时指明是哪一项）。
 */
export const getElementName = (el, index) => {
  const label = getElementLabel(el?.type)
  return Number.isInteger(index) ? `${label} ${index + 1}` : label
}
