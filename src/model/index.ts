import * as d3 from 'd3'
import { drawArc } from '../utils/draw'
import { getMockData, type D3Data, type D3Datum } from '../utils/mock'
import { generateMark, MarkType, type AxisScale, type DatumAxis } from '../utils/mark'
import * as R from 'ramda'
import { polarToCartesian } from '../utils/functions'

enum DataLayoutType {
  min = 'min',
  max = 'max',
  middle = 'middle',
  delta = 'delta'
}

export interface Axisconfig {
  scaleRange: {
    min: number
    max: number
  }
  description: {
    paramsTypeText: string
    returnTypeText: string
  }
  funcText: string
  // min, max, middle, delta
  func?: (datum?: D3Datum, indexs?: number[]) => [number, number, number, number]
}

export interface D3LayoutConfig {
  x: Axisconfig
  y: Axisconfig
  dimension: 1 | 2
  data: {
    dimensions: number
    arraySize: number[]
    props: {
      key: string
      pattern: string
    }[]
    data: string
  }
  coordinate: {
    layout: 'polar' | 'cartesian'
  }
  mark: {
    type: MarkType
  }
}

const MARGIN = { top: 20, right: 20, bottom: 50, left: 50 }
const WIDTH = 1000
const HEIGHT = 1000

export class D3Layout {
  config: D3LayoutConfig
  svg?: d3.Selection<SVGSVGElement, any, HTMLElement, any>
  data: D3Data
  drawConfig?: {
    xScale: AxisScale
    yScale: AxisScale
  }

  constructor(config: D3LayoutConfig) {
    this.config = config
    this.data = []
    this.generate(config)
  }
  getData() {
    if (this.config.data.data) {
      this.data = JSON.parse(this.config.data.data)
    } else {
      const [data, dataStr] = getMockData(this.config.data.arraySize, this.config.data.props)
      this.data = data
      this.config.data.data = dataStr
    }
  }
  update(config: D3LayoutConfig) {
    this.generate(config)
  }
  generate(config: D3LayoutConfig) {
    try {
      this.transformAxis(config.x)
      this.transformAxis(config.y)
      this.config = config
      this.getData()
      this.draw()
    } catch (error) {
      alert(error)
      console.error(error)
    }
  }
  transformAxis(axisConfig: Axisconfig) {
    axisConfig.func = eval(`(datum, indexs) => ${axisConfig.funcText}`)
  }
  draw() {
    if (this.svg) {
      this.clear()
      this.drawScale()
      this.drawMarks()
    }
  }
  clear() {
    if (!this.svg) {
      return
    }
    this.svg.selectAll('*').remove()
  }
  drawScale() {
    switch (this.config.coordinate.layout) {
      case 'cartesian':
        this.drawScaleForCartesian()
        break
      case 'polar':
        this.drawScaleForPolar()
        break
    }
  }
  drawScaleForCartesian() {
    if (!this.svg) {
      return
    }
    // 创建比例尺
    const xScale = d3
      .scaleLinear()
      .domain([this.config.x.scaleRange.min, this.config.x.scaleRange.max])
      .range([MARGIN.left, WIDTH - MARGIN.right])

    const yScale = d3
      .scaleLinear()
      .domain([this.config.y.scaleRange.min, this.config.y.scaleRange.max])
      .range([HEIGHT - MARGIN.bottom, MARGIN.top])

    // 绘制网格
    const xAxisGrid = d3
      .axisBottom(xScale)
      .ticks(10)
      .tickSize(-HEIGHT + MARGIN.top + MARGIN.bottom)
      .tickFormat(() => '')

    const yAxisGrid = d3
      .axisLeft(yScale)
      .ticks(10)
      .tickSize(-WIDTH + MARGIN.left + MARGIN.right)
      .tickFormat(() => '')

    this.svg
      .append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0, ${HEIGHT - MARGIN.bottom})`)
      .attr('opacity', 0.2)
      .call(xAxisGrid)

    this.svg
      .append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(${MARGIN.left}, 0)`)
      .attr('opacity', 0.2)
      .call(yAxisGrid)

    // 绘制坐标轴
    const xAxis = d3.axisBottom(xScale)
    const yAxis = d3.axisLeft(yScale)

    this.svg
      .append('g')
      .attr('transform', `translate(0, ${HEIGHT - MARGIN.bottom})`)
      .call(xAxis)

    this.svg.append('g').attr('transform', `translate(${MARGIN.left}, 0)`).call(yAxis)

    this.drawConfig = {
      xScale,
      yScale
    }
  }
  drawScaleForPolar() {
    if (!this.svg) return

    const centerX = WIDTH / 2
    const centerY = HEIGHT / 2
    const radius = Math.min(WIDTH, HEIGHT) / 2 - Math.max(MARGIN.left, MARGIN.right)

    // 创建极坐标比例尺
    const angleLinear = d3
      .scaleLinear()
      .domain([0, 360])
      .range([-Math.PI / 2, Math.PI * 1.5])


    const radiusLinear = d3.scaleLinear().domain([0, this.config.y.scaleRange.max]).range([0, radius])

    const g = this.svg.append('g').attr('opacity', 0.2)

    const textG = this.svg.append('g').attr('opacity', 0.6)
    // 添加半径刻度文本
    radiusLinear.ticks(6).forEach((tick) => {
      textG
        .append('text')
        .attr('x', centerX)
        .attr('y', centerY - radiusLinear(tick) + 5)
        .text(tick)
        .attr('fill', '#666')
        .attr('text-anchor', 'start')
        .attr('font-size', 12)

      drawArc(g, {
        innerRadius: radiusLinear(tick),
        outerRadius: radiusLinear(tick),
        startAngle: angleLinear(0) + Math.PI / 2,
        endAngle: angleLinear(360) + Math.PI / 2,
        center: { x: centerX, y: centerY }
      })
    })

    // 添加半径刻度文本
    angleLinear.ticks(12).forEach((tick, i) => {
      textG
        .append('text')
        .attr('x', centerX + radiusLinear(this.config.y.scaleRange.max) * Math.cos(angleLinear(tick)))
        .attr('y', centerY + radiusLinear(this.config.y.scaleRange.max) * Math.sin(angleLinear(tick)))
        .text(tick)
        .attr('fill', '#666')
        .attr('text-anchor', 'start')
        .attr('font-size', 12)

      g.append('line')
        .attr('x1', centerX + radiusLinear(this.config.y.scaleRange.min) * Math.sin(angleLinear(tick) + Math.PI / 2))
        .attr('y1', centerY - radiusLinear(this.config.y.scaleRange.min) * Math.cos(angleLinear(tick) + Math.PI / 2))
        .attr('x2', centerX + radiusLinear(this.config.y.scaleRange.max) * Math.sin(angleLinear(tick) + Math.PI / 2))
        .attr('y2', centerY - radiusLinear(this.config.y.scaleRange.max) * Math.cos(angleLinear(tick) + Math.PI / 2))
        .attr('stroke', 'currentColor')
    })

    this.drawConfig = { xScale: angleLinear, yScale: radiusLinear }
  }
  drawMarks() {
    if (!this.svg) return

    // 绘制点
    const drawData: { x: DatumAxis; y: DatumAxis; props: D3Datum }[] = []

    const getAxisData = (data: number[], scale: AxisScale): DatumAxis => {
      const LAYOUT_TYPES = [DataLayoutType.min, DataLayoutType.max, DataLayoutType.middle, DataLayoutType.delta]
      const [min, max, middle, delta] = data

      let result;

      if (data.filter((i) => !R.isNil(i)).length > 1) {
        // data 中有两个有效值，把 min max 计算出来
        result = {
          d1: [min, max - delta, 2 * middle - max, middle - delta / 2].find((x) => !R.isNil(x) && !isNaN(x))!,
          d2: [max, min + delta, 2 * middle - min, middle + delta / 2].find((x) => !R.isNil(x) && !isNaN(x))!,
          type: DataLayoutType.middle
        }
      } else {
        result = {
          d1: [min, max, middle].find((x) => !R.isNil(x) && !isNaN(x)) || 0,
          d2: [min, max, middle].find((x) => !R.isNil(x) && !isNaN(x)) || 0,
          type: LAYOUT_TYPES.find((type, index) => !R.isNil(data[index])) || DataLayoutType.min
        }
      }
      return {
        d1: scale(result.d1),
        d2: scale(result.d2),
        type: LAYOUT_TYPES.find((type, index) => !R.isNil(data[index])) || DataLayoutType.min
      }
    }
    const appendDrawData = (data: D3Data, indexs: number[] = []) => {
      if (Array.isArray(data)) {
        data.forEach((d, i) => appendDrawData(d, indexs.concat(i)))
      } else {
        const leafData = data as D3Datum
        const xdata = this.config.x.func?.(leafData, indexs) || [0]
        const ydata = this.config.y.func?.(leafData, indexs) || [0]

        drawData.push({
          x: getAxisData(xdata, this.drawConfig!.xScale),
          y: getAxisData(ydata, this.drawConfig!.yScale),
          props: leafData
        })
      }
    }
    appendDrawData(this.data)

    // 添加数据点
    this.svg.selectAll('.mark').remove()

    const gmark = this.svg.append('g').attr('class', 'mark')

    if (this.drawConfig) {
      drawData.forEach((d) => {
        const mark = generateMark(
          this.config.mark.type,
          { x: d.x, y: d.y },
          {
            xScale: this.drawConfig!.xScale!,
            yScale: this.drawConfig!.yScale!,
            layout: this.config.coordinate.layout,
            transXY: (x, y) => {
              if (this.config.coordinate.layout === 'cartesian') {
                return { x, y }
              }
              return polarToCartesian(WIDTH / 2, HEIGHT / 2, x, y)
            }
          },
          d.props
        )
        if (mark) {
          gmark?.append(() => mark)
        }
      })
    }
  }
  initSVG(svgDom: SVGSVGElement) {
    this.svg = d3.select(svgDom).attr('viewBox', `0 0 1000 1000`).attr('preserveAspectRatio', 'xMidYMid meet')
  }
}
