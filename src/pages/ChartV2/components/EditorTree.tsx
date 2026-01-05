import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartStore, handleChangeContainer, handleHoverContainer, deleteContainer, copyContainer } from '../model/editor';
import type { VisualChartJsonData } from '../type';

import { useShallow } from 'zustand/shallow';

export const EditorTree = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { dsl_json, dsl_container, chart } = useChartStore(useShallow((state) => ({
    dsl_json: state.dsl_json,
    dsl_container: state.dsl_container,
    chart: state.chart,
  })));

  // 解析 DSL 并绘制层次结构
  const drawHierarchy = (dslData: VisualChartJsonData) => {
    if (!svgRef.current || !dslData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerRect = svgRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width || 400;
    const containerHeight = containerRect.height || 600;
    const margin = { top: 30, right: 50, bottom: 60, left: 20 };


    // 使用 parseCoordinateSystemHelper 解析根坐标系统
    const root_coordinate_system = Object.fromEntries(Object.entries(dslData.coordinate_system).map(([key, value]) => [key, Number(value)]));

    const root_coordinate_system_type = dslData.coordinate;

    // 创建右键菜单容器
    const contextMenu = d3.select("body")
      .append("div")
      .attr("class", "context-menu")
      .style("position", "absolute")
      .style("background", "white")
      .style("border", "1px solid #ccc")
      .style("border-radius", "4px")
      .style("padding", "8px 0")
      .style("box-shadow", "2px 2px 6px rgba(0,0,0,0.1)")
      .style("display", "none")
      .style("z-index", "1000");

    // 添加菜单项
    const menuItems = [
      { name: "edit", action: "edit" },
      { name: "copy", action: "copy" },
      { name: "remove", action: "remove" },
    ];

    let currentNode: any = null;

    const handleMenuClick = (action: string, d: any) => {

      // 点击节点时选中对应的container进行编辑
      if (d.data.id && d.data.id !== 'root') {
        if (action === "edit") {
          handleChangeContainer(d.data.id);
        } else if (action === "copy") {
          copyContainer(d.data.id);
        } else if (action === "remove") {
          deleteContainer(d.data.id);
        }
      }
    }

    // 清除旧的菜单项

    contextMenu.selectAll(".menu-item")
      .data(menuItems)
      .enter()
      .append("div")
      .attr("class", "menu-item")
      .style("padding", "6px 12px")
      .style("cursor", "pointer")
      .style("font-size", "14px")
      .style("color", "#333")
      .text(d => d.name)
      .on("mouseenter", function () {
        d3.select(this).style("background", "#f0f0f0");
      })
      .on("mouseleave", function () {
        d3.select(this).style("background", "white");
      })
      .on("click", function (event, d) {
        handleMenuClick(d.action, currentNode);
        contextMenu.style("display", "none");
      });


    // 递归构建层次结构数据
    const buildHierarchy = (node: any, depth = 0): any => {
      // template 检测逻辑：container_id 以字母结尾
      const isTemplate = node.container_id && /[a-zA-Z]$/.test(node.container_id);

      return {
        id: node.container_id || 'root',
        description: node.description || '',
        coordinate: node.coordinate || '',
        coordinate_system: node.coordinate_system || '',
        if_leaf: node.if_leaf === 'true',
        mark_type: node.mark_type || '',
        is_template: isTemplate,
        depth,
        children: node.components ? node.components.map((child: any) => buildHierarchy(child, depth + 1)) : []
      };
    };

    const hierarchyData = buildHierarchy(dslData);
    const root = d3.hierarchy(hierarchyData);

    // 创建树布局 - 垂直布局
    const treeLayout = d3
      .tree<any>()
      .size([containerWidth - margin.left - margin.right, containerHeight - margin.top - margin.bottom]);

    treeLayout(root);

    const g = svg.append('g').attr('transform', `translate(${margin.left - 20},${margin.top})`);

    // 绘制连接线
    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr(
        'd',
        d3
          .linkVertical<any, any>()
          .x((d) => d.x)
          .y((d) => d.y)
      )
      .style('fill', 'none')
      .style('stroke', '#ccc')
      .style('stroke-width', 2);

    // 绘制节点
  const node = g
    .selectAll('.node')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', (d) => `translate(${d.x},${d.y})`)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      if (d.data.id && d.data.id !== 'root') {
        handleChangeContainer(d.data.id);
      }
      event.stopPropagation();
    })
    .on('mouseenter', (event, d) => {
      if (d.data.id && d.data.id !== 'root') {
        handleHoverContainer(d.data.id);
      }
    })
    .on('mouseleave', () => {
      handleHoverContainer(null);
    })
    .on("contextmenu", function (event, d) {
      event.preventDefault();
      currentNode = d;
      if (d.data?.id === '0') {
        return;
      }
      contextMenu
        .style("display", "block")
        .style("left", `${event.pageX}px`)
        .style("top", `${event.pageY}px`);
    });

    // root background
    let height = 30,
      width = 50;
    let root_shape: {
      type: string;
      mark: string;
      height: number;
      width: number;
      x_scale?: d3.ScaleLinear<number, number>;
      y_scale?: d3.ScaleLinear<number, number>;
      r_scale?: d3.ScaleLinear<number, number>;
    } | null = null;

    if (root_coordinate_system && root_coordinate_system_type === 'cartesian') {
      const rate =
        (root_coordinate_system.x2 - root_coordinate_system.x1) /
        (root_coordinate_system.y2 - root_coordinate_system.y1);
      // Make the preview icon larger for cartesian containers
      height = rate > 1.5 ? 40 : 80;
      width = height * rate;

      root_shape = {
        type: 'cartesian',
        mark: 'rect',
        height: height,
        width: width,
        x_scale: d3
          .scaleLinear()
          .domain([root_coordinate_system.x1, root_coordinate_system.x2])
          .range([-width / 2, width / 2]),
        y_scale: d3.scaleLinear().domain([root_coordinate_system.y1, root_coordinate_system.y2]).range([-height, 0])
      };
    } else if (root_coordinate_system && root_coordinate_system_type === 'polar') {
      // Make the preview icon larger for polar containers
      height = 70;
      width = 70;
      root_shape = {
        type: 'polar',
        mark: 'circle',
        height: height,
        width: width,
        x_scale: d3
          .scaleLinear()
          .domain([
            root_coordinate_system.cx - root_coordinate_system.r2,
            root_coordinate_system.cx + root_coordinate_system.r2
          ])
          .range([-width / 2, width / 2]),
        y_scale: d3
          .scaleLinear()
          .domain([
            root_coordinate_system.cy - root_coordinate_system.r2,
            root_coordinate_system.cy + root_coordinate_system.r2
          ])
          .range([-height / 2, height / 2]),
        r_scale: d3
          .scaleLinear()
          .domain([root_coordinate_system.r1, root_coordinate_system.r2])
          .range([0, height / 2])
      };
    }

    node.each(function (d) {
      const SVGElement = d3.select(this);
      const container_id = d.data.id;

      // draw root shape
      if (root_shape && root_shape.type === 'cartesian') {
        SVGElement.append('rect')
          .attr('width', root_shape.width)
          .attr('height', root_shape.height)
          .attr('fill', '#f7f7f7')
          .attr('x', -root_shape.width / 2)
          .attr('y', -root_shape.height);
      } else if (root_shape && root_shape.type === 'polar') {
        SVGElement.append('circle')
          .attr('r', root_shape.height * 0.5)
          .attr('fill', '#f7f7f7')
          .attr('cx', 0)
          .attr('cy', -0.5 * root_shape.height);
      }

      chart.drawContainer(container_id, SVGElement as any, {
        width: root_shape?.width || 0,
        height: root_shape?.height || 0,
        g_props: {
          transform: `translate(-${(root_shape?.width || 0) / 2}, -${root_shape?.height || 0})`,
        }
      });
    });

    // 点击其他地方隐藏菜单
    d3.select("body").on("click", function () {
      d3.selectAll('.context-menu').style("display", "none");
    });
    // 节点标签 - 垂直布局下放在节点下方
    node
      .append('text')
      .attr('dy', '1.3em')
      .attr('x', 0)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-family', 'monospace')
      .style('font-weight', 'bold')
      .text((d) => d.data.id);

    // 添加工具提示
    node
      .append('title')
      .text(
        (d) =>
          `ID: ${d.data.id}\nDescription: ${d.data.description}\nCoordinate: ${d.data.coordinate_system}\nLeaf: ${d.data.if_leaf
          }${d.data.mark_type ? `\nMark: ${d.data.mark_type}` : ''}`
      );

    // 计算实际内容的边界框
    setTimeout(() => {
      const bbox = g.node()?.getBBox();
      if (bbox) {
        const horizontalPadding = 30;
        const verticalPadding = 20;
        const bottomExtraPadding = 40; // 底部额外边距

        // 计算居中的 viewBox
        const contentWidth = bbox.width + horizontalPadding * 2;
        const contentHeight = bbox.height + verticalPadding + bottomExtraPadding;

        // 居中计算
        const viewBoxX = bbox.x - horizontalPadding;
        const viewBoxY = bbox.y - verticalPadding;

        // 更新 SVG 的 viewBox 以适应内容并居中
        svg.attr('viewBox', `${viewBoxX} ${viewBoxY} ${contentWidth} ${contentHeight}`);
      }
    }, 0);
  };

  // 当 DSL 内容变化时重新绘制
  useEffect(() => {
    if (dsl_json && dsl_container) {
      drawHierarchy(dsl_json);
    }
  }, [dsl_json, dsl_container]);

  // 监听窗口大小变化，重新绘制层次结构
  useEffect(() => {
    const handleResize = () => {
      if (dsl_json) {
        drawHierarchy(dsl_json);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dsl_json]);

  return (
    <Card className="flex flex-col h-full w-full min-h-0">
      <CardHeader className="p-4 border-b">
        <CardTitle className="text-lg font-semibold">DSL Visualization Panel</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-4 overflow-auto">
        {dsl_json ? (
          <div className="w-full h-full min-h-[200px]">
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              className="border-0 max-w-full max-h-full"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No DSL data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};