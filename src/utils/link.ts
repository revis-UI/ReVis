import * as d3 from 'd3'
import type { XYDatumAxis } from './mark';

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
export function generateLineChart(dataPoints: XYDatumAxis[], attribution: Record<string, any> = {}, coordinate?: 'cartesian' | 'polar') {
  const isCurve = attribution?.line_type === 'curve';
  const closed = attribution.closed === 1 || attribution.closed === true;

  const line = d3
    .line<XYDatumAxis>()
    .x(d => d.x.d1)
    .y(d => d.y.d1)
    .curve(closed ? (isCurve ? d3.curveCardinalClosed : d3.curveLinearClosed) : (isCurve ? d3.curveCardinal : d3.curveLinear));

  const path = line(dataPoints);

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
export function generateAreaChart(dataPoints: XYDatumAxis[], attribution: Record<string, any> = {}, coordinate?: 'cartesian' | 'polar', band = false) {
  const isCurve = attribution?.line_type === 'curve';
  const isPolar = coordinate === 'polar';

  const area = d3
    .area<XYDatumAxis>()
    .x0(d => d.x.d1)
    .x1(d => isPolar ? d.x.d2 : d.x.d1)
    .y0(d => d.y.d1)
    .y1(d => d.y.d2)
    .curve(isPolar
      ? (isCurve ? d3.curveCardinalClosed : d3.curveLinearClosed)
      : (isCurve ? d3.curveCardinal : d3.curveLinear)
    );

  // A radar series is one closed polygon. Only a band has an inner contour.
  const path = isPolar && !band
    ? d3.line<XYDatumAxis>()
      .x(d => d.x.d2)
      .y(d => d.y.d2)
      .curve(isCurve ? d3.curveCardinalClosed : d3.curveLinearClosed)(dataPoints)
    : area(dataPoints);

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

export function generateGroup(type: GroupType, data: XYDatumAxis[], attribution: Record<string, any> = {}, coordinate?: 'cartesian' | 'polar') {
  if (type === 'line') {
    return generateLineChart(data, attribution, coordinate);
  } else if (type === 'area' || type === 'band') {
    return generateAreaChart(data, attribution, coordinate, type === 'band');
  }
}