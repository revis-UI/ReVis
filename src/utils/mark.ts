import * as d3 from 'd3'

export enum MarkType {
  circle = 'circle',
  rect = 'rect',
  rectangle = 'rectangle',
  polygon = 'polygon',
  line = 'line',
  text = 'text',
  image = 'image',
  arc = 'arc',
  band = 'band'
}

export interface MarkProps {
  [key: string]: any
}

export enum DataLayoutType {
  min = 'min',
  max = 'max',
  middle = 'middle',
  delta = 'delta'
}

export interface DatumAxis {
  d1: number
  d2: number
  type?: DataLayoutType
}

export interface XYDatumAxis {
  x: DatumAxis
  y: DatumAxis
}

export type AxisScale = (arg: number) => number;

export interface DrawContext {
  xScale?: AxisScale
  yScale?: AxisScale
  layout?: 'polar' | 'cartesian'
  transXY: (x: number, y: number) => { x: number, y: number }
  bounding?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export function generateCircle(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x, y } = context.transXY((axis.x.d1 + axis.x.d2) / 2, (axis.y.d1 + axis.y.d2) / 2)

  const r = context.layout === 'polar' ? Math.abs(axis.y.d1 - axis.y.d2) / 2 : Math.min(Math.abs(axis.x.d1 - axis.x.d2) / 2, Math.abs(axis.y.d1 - axis.y.d2) / 2)

  const correctCircle = d3
    .select(document.createElementNS(d3.namespaces.svg, 'circle'))
    .attr('cx', x)
    .attr('cy', y)
    .attr('r', r || 10)
    .attr('fill', 'gray')

  Object.keys(attribution).forEach((key) => {
    if (key === 'x' || key === 'y') {
      return
    }
    correctCircle.attr(key, attribution[key])
  })

  return correctCircle
}

export function generateRect(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x, y } = context.transXY(axis.x.d1, axis.y.d1)
  const width = Math.abs(axis.x.d2 - axis.x.d1) || 10
  const height = Math.abs(axis.y.d2 - axis.y.d1) || 10

  const correctRect = d3
    .select(document.createElementNS(d3.namespaces.svg, 'rect'))
    .attr('x', x)
    .attr('y', y - height)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'gray')

  Object.keys(attribution).forEach((key) => {
    if (key === 'x' || key === 'y') {
      return
    }
    correctRect.attr(key, attribution[key])
  })

  return correctRect
}

export function generatePolygon(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x, y } = context.transXY(axis.x.d1, axis.y.d1)

  const { radius = 10, sides = 5, ...restProps } = attribution;

  // 计算多边形顶点坐标
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides; // 转换为弧度
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    points.push(`${px},${py}`);
  }

  const correctPolygon = d3
    .select(document.createElementNS(d3.namespaces.svg, 'polygon'))
    .attr('points', points.join(' '))
    .attr('fill', 'gray')

  Object.keys(restProps).forEach((key) => {
    correctPolygon.attr(key, attribution[key])
  })

  return correctPolygon
}

export function generateLine(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x: x1, y: y1 } = context.transXY(axis.x.d1, axis.y.d1)
  const { x: x2, y: y2 } = context.transXY(axis.x.d2, axis.y.d2)

  const correctLine = d3
    .select(document.createElementNS(d3.namespaces.svg, 'line'))
    .attr('x1', x1)
    .attr('y1', y1)
    .attr('x2', x2)
    .attr('y2', y2)
    .attr('stroke', 'gray')
    .attr('stroke-width', 2)

  Object.keys(attribution).forEach((key) => {
    correctLine.attr(key, attribution[key])
  })

  return correctLine
}

export function generateText(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x, y } = context.transXY(axis.x.d1, axis.y.d1)

  const { text = 'hello', ...restProps } = attribution;
  const correctText = d3
    .select(document.createElementNS(d3.namespaces.svg, 'text'))
    .attr('x', x)
    .attr('y', y)
    .attr('text-anchor', 'middle')
    .text(text)

  Object.keys(restProps).forEach((key) => {
    correctText.attr(key, attribution[key])
  })

  return correctText
}
export function generateImage(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x, y } = context.transXY(axis.x.d1, axis.y.d1)

  const { url = "https://picsum.photos/100/100", ...restProps } = attribution;
  const correctImage = d3
    .select(document.createElementNS(d3.namespaces.svg, 'image'))
    .attr('x', x)
    .attr('y', y)
    .attr('width', Math.abs(axis.x.d1 - axis.x.d2) || 10)
    .attr('height', Math.abs(axis.y.d1 - axis.y.d2) || 10)
    .attr('href', url)
    .attr('crossorigin', 'anonymous')

  Object.keys(restProps).forEach((key) => {
    correctImage.attr(key, attribution[key])
  })

  return correctImage
}

export function generateArc(axis: XYDatumAxis, context: DrawContext, attribution: MarkProps) {
  const { x, y } = context.transXY(0, 0);

  const correctArc = d3
    .select(document.createElementNS(d3.namespaces.svg, 'path'))
    .attr('d', d3.arc()({
      innerRadius: axis.y.d1,
      outerRadius: axis.y.d2 === axis.y.d1 ? axis.y.d1 + 1 : axis.y.d2,
      startAngle: axis.x.d1,
      endAngle: (axis.x.d2 === axis.x.d1 ? axis.x.d1 + 0.1 : axis.x.d2),
    }))
    .attr('fill', 'gray')
    .attr('opacity', 0.5)
    .attr('transform', `translate(${x}, ${y})`)


  Object.keys(attribution).forEach((key) => {
    correctArc.attr(key, attribution[key])
  })

  return correctArc
}

export function generateMark(...args: [
  MarkType | SVGGElement,
  XYDatumAxis,
  DrawContext,
  MarkProps,
]) {
  const [type, axis, context, attribution = {}] = args;
  if (type instanceof SVGGElement) {
    return type
  }
  let result;
  if (type === 'circle') {
    result = generateCircle(axis, context, attribution)
  }
  if (type === 'rect' || type === 'rectangle') {
    result = generateRect(axis, context, attribution)
  }
  if (type === 'polygon') {
    result = generatePolygon(axis, context, attribution)
  }
  if (type === 'line') {
    result = generateLine(axis, context, attribution)
  }
  if (type === 'text') {
    result = generateText(axis, context, attribution)
  }
  if (type === 'image') {
    result = generateImage(axis, context, attribution)
  }
  if (type === 'arc' || type === 'band') {
    result = generateArc(axis, context, attribution)
  }

  result?.attr('data-x1', axis.x.d1)
    .attr('data-x2', axis.x.d2)
    .attr('data-y1', axis.y.d1)
    .attr('data-y2', axis.y.d2)

  return result?.node();
}
