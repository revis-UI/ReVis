import * as d3 from 'd3'
import type { XYDatumAxis } from './mark';

type DrawData = {
  id: string;
  x1: number; // 0-100
  y1: number; // 0-100
  x2: number; // 0-100
  y2: number; // 0-100
  props: Record<string, number | string>
}

function generateLine(links: { x: number; y: number; }[], attribution: Record<string, any> = {}, direction?: 'horizontal' | 'vertical') {
  let nodes = links;

  // 只有指定了方向时才创建贝塞尔曲线控制点
  if (direction && nodes.length === 2) {
    if (direction === 'horizontal') {
      nodes = [
        links[0],
        {
          x: links[0].x + (links[1].x - links[0].x) / 2,
          y: links[0].y,
        },
        {
          x: links[1].x - (links[1].x - links[0].x) / 2,
          y: links[1].y,
        },
        links[1],
      ]
    } else if (direction === 'vertical') {
      nodes = [
        links[0],
        {
          x: links[0].x,
          y: links[0].y + (links[1].y - links[0].y) / 2,
        },
        {
          x: links[1].x,
          y: links[1].y - (links[1].y - links[0].y) / 2,
        },
        links[1],
      ]
    }
  }

  let path: string;

  if (direction && nodes.length > 2) {
    // 贝塞尔曲线路径
    path = `M ${nodes[0].x} ${nodes[0].y}
            C ${nodes.slice(1).map(node => `${node.x} ${node.y}`).join(', ')}`;
  } else {
    // 直线路径
    path = `M ${nodes[0].x} ${nodes[0].y} L ${nodes[nodes.length - 1].x} ${nodes[nodes.length - 1].y}`;
  }

  const line = d3
    .select(document.createElementNS(d3.namespaces.svg, 'path'))
    .datum(nodes)
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "black")
    .attr("stroke-width", 2)

  Object.keys(attribution).forEach((key) => {
    line.attr(key, attribution[key])
  })
  return line
}

export function generateLink(type: 'line' | 'band', links: { x: number; y: number; }[], attribution: Record<string, any> = {}, direction?: 'horizontal' | 'vertical') {

  const isCurve = attribution?.line_type === 'curve';

  return generateLine(links, {
    'stroke-width': type === 'band' ? '15' : '1',
    'opacity': type === 'band' ? '0.1' : '1',
    ...attribution,
  }, isCurve ? direction : undefined).node()
}

// 绘制折线图
export function generateLineChart(dataPoints: DrawData[], attribution: Record<string, any> = {}, coordinate?: 'cartesian' | 'polar', center?: { centerX: number, centerY: number }) {
  const isCurve = attribution?.line_type === 'curve';

  const data = dataPoints.map((d) => {
    if (coordinate === 'cartesian') {
      return {
        x: { d1: d.x1, d2: d.x2 },
        y: { d1: d.y1, d2: d.y2 }
      }
    } else {
      const d1 = polarToCartesian(center?.centerX || 0, center?.centerY || 0, d.x1, d.y1)
      const d2 = polarToCartesian(center?.centerX || 0, center?.centerY || 0, d.x2, d.y2)

      return {
        x: { d1: d1.x, d2: d2.x },
        y: { d1: d1.y, d2: d2.y }
      }
    }
  })

  const line = d3
    .line<XYDatumAxis>()
    .x(d => d.x.d1)
    .y(d => d.y.d1)
    .curve(isCurve ? d3.curveCardinal : d3.curveLinear);

  const path = line(data);

  const svgLine = d3
    .select(document.createElementNS(d3.namespaces.svg, 'path'))
    .datum(dataPoints)
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", attribution.stroke || "steelblue")
    .attr("stroke-width", attribution.strokeWidth || 2);

  Object.keys(attribution).forEach((key) => {
    if (key !== 'stroke' && key !== 'strokeWidth') {
      svgLine.attr(key, attribution[key]);
    }
  });

  return svgLine.node();
}


// 绘制面积图
export function generateAreaChart(dataPoints: DrawData[], attribution: Record<string, any> = {}, coordinate?: 'cartesian' | 'polar', center?: { centerX: number, centerY: number }) {
  const isCurve = attribution?.line_type === 'curve';
  const isPolar = coordinate === 'polar';
  let path:any;

  if (coordinate === 'cartesian') {
    path = d3
        .area<DrawData>()
        .x(d => d.x1)
        .y0(d => d.y1)
        .y1(d => d.y2)
        .curve(isCurve ? d3.curveCardinal : d3.curveLinear)
        (dataPoints);
  } else {
    path = d3
        .area<DrawData>()
        .x0((d, i) => {
          const angle = d.x1 - 90; // 调整角度
          const point = polarToCartesian(center?.centerX || 0, center?.centerY || 0, 0, 0);
          return point.x;
        })
        .x1((d, i) => {
          const angle = d.x2 - 90; // 调整角度
          const point = polarToCartesian(center?.centerX || 0, center?.centerY || 0, angle, d.y2);
          return point.x;
        })
        .y0((d, i) => {
          const angle = d.x1 - 90; // 调整角度
          const point = polarToCartesian(center?.centerX || 0, center?.centerY || 0, 0, 0);
          return point.y;
        })
        .y1((d, i) => {
          const angle = d.x2 - 90; // 调整角度
          const point = polarToCartesian(center?.centerX || 0, center?.centerY || 0, angle, d.y2);
          return point.y;
        })
        .curve(isCurve ? d3.curveLinearClosed : d3.curveLinearClosed)
        (dataPoints);
  }
  debugger;
  const svgArea = d3
    .select(document.createElementNS(d3.namespaces.svg, 'path'))
    .attr("d", path)
    .attr("fill", attribution.fill || "steelblue")
    .attr("fill-opacity", attribution.fillOpacity || 0.5)
    .attr("stroke", attribution.stroke || "none");

  Object.keys(attribution).forEach((key) => {
    if (key !== 'fill' && key !== 'fillOpacity' && key !== 'stroke') {
      svgArea.attr(key, attribution[key]);
    }
  });

  return svgArea.node();
}

export type GroupType = 'line' | 'area' | 'band'

export function generateGroup(type: GroupType, data: DrawData[], attribution: Record<string, any> = {}, coordinate?: 'cartesian' | 'polar', center?: { centerX: number, centerY: number }) {
  if (type === 'line') {
    return generateLineChart(data, attribution, coordinate, center);
  } else if (type === 'area' || type === 'band') {
    return generateAreaChart(data, attribution, coordinate, center);
  }
}

function polarToCartesian(centerX: number, centerY: number, angle: number, radius: number) {
  return {
    x: centerX + (radius * Math.sin(angle)),
    y: centerY - (radius * Math.cos(angle))
  };
}
