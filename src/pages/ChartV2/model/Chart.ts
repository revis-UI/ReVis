import { generateGroup, generateLink, type GroupType } from '@/utils/link';
import * as d3 from 'd3';
import * as R from 'ramda';
import { generateMark, MarkType } from '../../../utils/mark';
import type { ContainerData, DrawData, DrawDataCartesian, DrawDataPolar, LinkData, VisualChartContainer, VisualChartDataSpecification, VisualChartJsonData, VisualChartLayout } from '../type';
import { polarToCartesian, randomInRange } from '../utils';

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 1000

const isLink = (spec?: VisualChartDataSpecification) => spec?.mark_specification?.is_link_mark && spec?.mark_specification?.link_mark_type === 'node_link_type';
export class VisualChart {
  svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>
  dsl_json: VisualChartJsonData | undefined
  dsl_tree: VisualChartContainer[] = []
  dsl_container: Record<string, VisualChartContainer> = {}
  dsl_data: ContainerData = {}
  dsl_cache: Record<keyof ReturnType<typeof getInitialDSLCache>, any> = getInitialDSLCache()
  constructor() {

  }
  initSVGDOM(svgDom: SVGSVGElement) {
    this.svg = d3
      .select(svgDom)
      .attr('viewBox', `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
  }
  reset() {
    this.dsl_cache = getInitialDSLCache();
  }
  parseDSL(
    raw_dsl: string | Object,
    options?: {
      computeDslContainer?: (container: Record<string, VisualChartContainer>) => Record<string, VisualChartContainer>
      computeDslData?: (data: ContainerData) => ContainerData
    }
  ) {
    try {
      const dsl = typeof raw_dsl === 'string' ? JSON.parse(raw_dsl) : raw_dsl;
      this.dsl_json = dsl as VisualChartJsonData;
      this.dsl_data = {};
      this.dsl_tree = [];
      this.dsl_container = {};
      if (!this.dsl_json) {
        throw new Error('DSL 解析失败');
      }
      this.parseContainer();
      if (options?.computeDslContainer) {
        this.dsl_container = options.computeDslContainer(this.dsl_container);
      }
      this.parseData();
      if (options?.computeDslData) {
        this.dsl_data = options.computeDslData(this.dsl_data);
      }
    } catch (e) {
      alert(e);
      throw e;
    }
    return {
      dsl_data: this.dsl_data,
      dsl_container: this.dsl_container
    }
  }
  parseContainer() {
    if (!this.dsl_json) {
      throw new Error('DSL 解析失败');
    }
    // 计算 dsl_container

    this.dsl_container = {};
    const computeCoordinateTemplate = (container: VisualChartContainer, parent?: VisualChartContainer) => {

      const isParentTemplate = parent?.template_id && /[a-zA-Z]/.test(parent.template_id);
      const containerId = parent ? container.container_id.replace(parent.template_id, parent.container_id) : container.container_id;
      const __data_specification = this.dsl_json!.data_specification?.[container.template_id || container.container_id];
      let container_ins_list: VisualChartContainer[] | undefined;

      const spec = /[a-zA-Z]/.test(container.container_id) && this.dsl_json!.template_data_specification?.[container.container_id];

      // template_container
      if (spec) {
        const xScale = d3.scaleLinear()
          .domain([0, 100])
          .range([Number(container.coordinate_system.x1), Number(container.coordinate_system.x2)])
        const yScale = d3.scaleLinear()
          .domain([0, 100])
          .range([Number(container.coordinate_system.y1), Number(container.coordinate_system.y2)])
        const rScale = d3.scaleLinear()
          .domain([0, 1])
          .range([Number(container.coordinate_system.r1), Number(container.coordinate_system.r2)])
        const aScale = d3.scaleLinear()
          .domain([0, 360])
          .range([Number(container.coordinate_system.a1), Number(container.coordinate_system.a2)])

        const getId = (i: number) => containerId.replace(/-([a-zA-Z])/, `-${i}$1`);

        container_ins_list = (
          // this.computeData(`container_${containerId}`, spec, container.coordinate, (i: number) => getId(i)).flat().map((item) => ({
          this.computeData(`container_${containerId}`, spec, container.coordinate, (i: number) => getId(i)).flat().map((item) => ({
            container_id: item.id,
            description: container.description,
            template_id: container.container_id,
            coordinate: container.coordinate,
            parent_coordinate: parent?.coordinate,
            coordinate_system: container.coordinate === 'cartesian' ? {
              x1: xScale((item as DrawDataCartesian).x1)!,
              x2: xScale((item as DrawDataCartesian).x2)!,
              y1: yScale((item as DrawDataCartesian).y1)!,
              y2: yScale((item as DrawDataCartesian).y2)!,
            } : {
              r1: rScale((item as DrawDataPolar).r1)!,
              r2: rScale((item as DrawDataPolar).r2)!,
              a1: aScale((item as DrawDataPolar).a1)!,
              a2: aScale((item as DrawDataPolar).a2)!,
            } as unknown as VisualChartContainer['coordinate_system'],
            if_leaf: container.if_leaf,
            __data_specification,
          }))
        ).map((item) => {
          const _item = item as VisualChartContainer;
          this.dsl_container[_item.container_id] = _item;
          _item.components = container.components?.map((component) => computeCoordinateTemplate(component, _item)).flat();
          return _item;
        })
      }
      container_ins_list = (
        [{
          container_id: containerId,
          template_id: container.container_id,
          description: container.description,
          coordinate: container.coordinate,
          parent_coordinate: parent?.coordinate,
          coordinate_system: isParentTemplate ? parent.coordinate_system : Object.fromEntries(
            Object.entries(container.coordinate_system || {}).map(([key, value]) => [key, Number(value)])
          ),
          if_template_container: spec,
          if_leaf: spec ? false : container.if_leaf,
          __data_specification,
        }]
      ).map((item) => {
        const _item = item as VisualChartContainer;
        this.dsl_container[_item.container_id] = _item;
        if (spec) {
          _item.components = container_ins_list
          _item.__temp_specification = spec;
        } else {
          _item.components = container.components?.map((component) => computeCoordinateTemplate(component, _item)).flat();
        }
        return _item;
      })

      return container_ins_list;
    }
    this.dsl_tree = computeCoordinateTemplate(this.dsl_json);
  }
  parseData() {
    if (!this.dsl_container) {
      throw new Error('DSL 解析失败');
    }
    this.dsl_data = {};
    // 计算 dsl_data
    const leafContainers = Object.values(this.dsl_container).filter(item => item.if_leaf && !isLink(item.__data_specification));
    const linkContainers = Object.values(this.dsl_container).filter(item => item.if_leaf && isLink(item.__data_specification));
    for (const container of leafContainers) {
      if (!container.__data_specification) {
        throw new Error(`Missing data specification for container ${container.container_id}`);
      }
      this.dsl_data[container.container_id] = this.computeData(`${container.container_id}`, container.__data_specification, container.coordinate, (i: number) => `${container.container_id}__${i}`);
    }
    for (const linkContainer of linkContainers) {
      if (!linkContainer.__data_specification) {
        throw new Error(`Missing data specification for container ${linkContainer.container_id}`);
      }
      this.dsl_data[linkContainer.container_id] = this.computeData(`${linkContainer.container_id}`, linkContainer.__data_specification, linkContainer.coordinate, (i: number) => `${linkContainer.container_id}__${i}`);
    }
  }
  computeData(container_id: string, spec: VisualChartDataSpecification, coordinate: 'cartesian' | 'polar', getId: (i: number) => string) {
    if (!spec) {
      throw new Error(`Missing data specification for container ${container_id}`);
    }

    const computeProps = (i: number, j: number): Record<string, number | string> => {
      if (!spec.non_layout_specification) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(spec.non_layout_specification).map(([key, value]) => {
          if (value) {
            if (Array.isArray(value)) {
              return [key, value[(i * value.length + j) % value.length]];
            }
            if (typeof value === 'object') {
              if (value.scale === 'fix') {
                return [key, value.fix];
              } else if (value.scale === 'ordinal_primary') {
                return [key, value.options?.[i]];
              } else if (value.scale === 'ordinal_secondary') {
                return [key, value.options?.[j]];
              } else if (value.scale === 'categorical') {
                return [key, value.options?.[randomInRange(0, value.options?.length - 1)]];
              } else if (value.scale === 'linear') {
                return [key, d3.scaleLinear().domain([0, 100]).range(value.linear!)(randomInRange(0, 100))];
              }
            }
          }

          return [key, value];
        }).filter(([key, value]) => value)
      )
    }

    // 处理 link 的情况
    if (isLink(spec)) {

      const length = spec.mark_specification?.link_number || 5;
      if (this.dsl_cache.link_nodes[container_id]) {
        return Array.from({ length }, (_, i) => {
          return ({
            id: getId(i),
            source: this.dsl_cache.link_nodes[container_id][i][0],
            target: this.dsl_cache.link_nodes[container_id][i][1],
            props: {
              ...computeProps(i, 0),
              'data-source': this.dsl_cache.link_nodes[container_id][i][0],
              'data-target': this.dsl_cache.link_nodes[container_id][i][1],
            },
          }) as LinkData
        })
      }

      const { source, target } = spec.layout_specification;
      if (!source?.length || !target?.length) {
        throw new Error(`Missing source or target for link mark`);
      }
      const sourceIds = Object.values(this.dsl_container)
        .map(item => {
          const c = source.find(target => target.container_id === item.template_id && !item.if_template_container);
          if (c?.linked_object === 'container') {
            return [`container_${item.container_id}`];
          }
          if (c?.linked_object === 'mark') {
            return (this.dsl_data[item.container_id] as DrawData[]).map((item) => `id_${item.id}`) || [];
          }
          return [];
        }).flat()
      const targetIds = Object.values(this.dsl_container)
        .map(item => {
          const c = target.find(target => target.container_id === item.template_id && !item.if_template_container);
          if (c?.linked_object === 'container') {
            return [`container_${item.container_id}`];
          }
          if (c?.linked_object === 'mark') {
            return (this.dsl_data[item.container_id] as DrawData[]).map((item) => `id_${item.id}`) || [];
          }
          return [];
        }).flat()

      const linkNodes = Array.from({ length }, (_, i) => {
        const sourceIndex = randomInRange(0, sourceIds.length - 1);
        const targetIndex = randomInRange(0, targetIds.length - 1);
        return ({
          id: getId(i),
          source: sourceIds[sourceIndex],
          target: targetIds[targetIndex],
          props: {
            ...computeProps(i, 0),
            'data-source': sourceIds[sourceIndex],
            'data-target': targetIds[targetIndex],
          },
        }) as LinkData
      })

      this.dsl_cache.link_nodes[container_id] = linkNodes.map(item => [item.source, item.target]);
      return linkNodes;
    }

    const dim_x = coordinate === 'cartesian' ? 'x' : 'angle';
    const dim_y = coordinate === 'cartesian' ? 'y' : 'radius';

    const dim_x_spec = spec.layout_specification[dim_x];
    const dim_y_spec = spec.layout_specification[dim_y];
    if (!dim_x_spec || !dim_y_spec) {
      throw new Error(`Missing layout specification for dimension ${dim_x} or ${dim_y}`);
    }

    type DataCache = { _size: number, _point: number };
    type DataPoint = { min: number, max: number} & DataCache;

    const stackingCache: {
      [k in string]: DataPoint[];
    } = {}

    const computeStack = (index: number, dim_spec: VisualChartLayout, number: number, dim_symbol: string, cache?: DataCache[]): DataPoint => {
      if (!stackingCache[dim_symbol] || stackingCache[dim_symbol].length === 0) {
        let sub_size: number[] = [];
        if (Array.isArray(number)) {
          sub_size = number;
        } else if (Array.isArray(dim_spec.size_range) && dim_spec.size_range.length === 2) {
          sub_size = Array.from({ length: number }, (_, i) => cache?.map(item => item?._size)?.[i] ?? randomInRange((dim_spec.size_range as [number, number])[0], (dim_spec.size_range as [number, number])[1]));
        } else if (dim_spec.size_range === null) {
          sub_size = Array.from({ length: number }, (_, i) => 10);
        }

        let cur = 0;
        let stacking = Array.from({ length: sub_size.length }, (_, i) => {
          return {
            min: cur,
            max: cur += sub_size[i],
            _size: sub_size[i],
            _point: 0,
          }
        })
        const max = stacking[stacking.length - 1].max;
        // if (max > 100 || dim_spec.subdividing) {
        if (dim_spec.subdividing) {
          const radio = (dim_spec.subdividing ? 100 : randomInRange(0, 100)) / max;
          stacking = stacking.map((item) => ({
            min: item.min * radio,
            max: item.max * radio,
            _size: item._size * radio,
            _point: 0,
          }));
        }

        const middleOffset = Math.max((100 - max) / 2, 0);
        if (dim_spec.stacking_direction === "min" || dim_spec.subdividing) {
          stackingCache[dim_symbol] = stacking;
        } else if (dim_spec.stacking_direction === "max") {
          stackingCache[dim_symbol] = stacking.map((item) => ({
            min: 100 - item.max,
            max: 100 - item.min,
            _size: item._size,
            _point: 0,
          }));
        } else if (dim_spec.stacking_direction === "middle") {
          stackingCache[dim_symbol] = stacking.map((item) => ({
            min: item.min + middleOffset,
            max: item.max + middleOffset,
            _size: item._size,
            _point: 0,
          }));
        }
      }
      return stackingCache[dim_symbol][index];
    }

    const computeDataPoint = (index: number, dim_spec: VisualChartLayout, cache?: DataCache): DataPoint => {
      let size = cache?._size ?? randomInRange(dim_spec.size_range[0], dim_spec.size_range[1])
      if (dim_spec.anchor_distribute === "fixed_value") {
        if (dim_spec.anchor === "min") {
          return {
            min: dim_spec.anchor_start ?? 0,
            max: (dim_spec.anchor_start ?? 0) + size,
            _size: size,
            _point: 0,
          }
        }
        if (dim_spec.anchor === "max") {
          return {
            min: (dim_spec.anchor_start ?? 100) - size,
            max: (dim_spec.anchor_start ?? 100),
            _size: size,
            _point: 0,
          }
        }
        if (dim_spec.anchor === "middle") {
          return {
            min: (dim_spec.anchor_start ?? 50) - size / 2,
            max: (dim_spec.anchor_start ?? 50) + size / 2,
            _size: size,
            _point: 0,
          }
        }
      }
      if (dim_spec.anchor_distribute === "uniform_interval") {
        const anchor_point = (dim_spec.anchor_start || 0) + (dim_spec.anchor_interval || 0) * index;
        if (dim_spec.anchor === 'min') {
          return {
            min: anchor_point,
            max: anchor_point + size,
            _size: size,
            _point: 0,
          };
        }
        if (dim_spec.anchor === 'max') {
          return {
            min: anchor_point - size,
            max: anchor_point,
            _size: size,
            _point: 0,
          }
        }
        if (dim_spec.anchor === 'middle') {
          return {
            min: anchor_point - size / 2,
            max: anchor_point + size / 2,
            _size: size,
            _point: 0,
          }
        }
      }
      if (dim_spec.anchor_distribute === "flexible") {
        if (dim_spec.anchor === 'min') {
          let anchor_point = cache?._point ?? randomInRange(0, 100 - size)
          return {
            min: anchor_point,
            max: anchor_point + size,
            _size: size,
            _point: anchor_point,
          }
        }
        if (dim_spec.anchor === 'max') {
          let anchor_point = cache?._point ?? randomInRange(size, 100)
          return {
            min: anchor_point - size,
            max: anchor_point,
            _size: size,
            _point: anchor_point,
          }
        }
        if (dim_spec.anchor === 'middle') {
          let anchor_point = cache?._point ?? randomInRange(size / 2, 100 - size / 2)
          return {
            min: anchor_point - size / 2,
            max: anchor_point + size / 2,
            _size: size,
            _point: anchor_point,
          }
        }
      }
      return {
        min: 0,
        max: 100,
        _size: 0,
        _point: 0,
      }
    }

    const getDataPoint = (index: number, dim_spec: VisualChartLayout, number: number, dim_symbol: string, cache?: DataCache[]): DataPoint => {
      if (dim_spec.stacking) {
        return computeStack(index, dim_spec, number, dim_symbol, cache);
      } else {
        return computeDataPoint(index, dim_spec, cache?.[index]);
      }
    }

    let data: {
      x: DataPoint;
      y: DataPoint;
      props: Record<string, any>;
    }[] | {
      x: DataPoint;
      y: DataPoint;
      props: Record<string, any>;
    }[][] = [];

    const primary = spec.data_structure.data_size.primary;
    const secondary = spec.data_structure.data_size.secondary;
    if (Array.isArray(primary.number)) {
      throw new Error('1D_list 数据结构中 primary 维度必须是单个数值');
    }
    if (spec.data_structure.data_type === '1D_LIST') {

      const cache_x = Array.from({ length: primary.number }, (_, i) => ({
        _size: this.dsl_cache.size_range[container_id]?.x?.[i],
        _point: this.dsl_cache.anchor_point[container_id]?.x?.[i],
      }))
      const cache_y = Array.from({ length: primary.number }, (_, i) => ({
        _size: this.dsl_cache.size_range[container_id]?.y?.[i],
        _point: this.dsl_cache.anchor_point[container_id]?.y?.[i],
      }))

      const cache_props = Array.from({ length: primary.number }, (_, i) => this.dsl_cache.non_property[container_id]?.[i])

      data = Array.from({ length: primary.number },
        (_, i) => ({
          x: getDataPoint(i, dim_x_spec, primary.number, `x-constant`, cache_x),
          y: getDataPoint(i, dim_y_spec, primary.number, `y-constant`, cache_y),
          props: cache_props[i] || computeProps(i, 0),
        })
      ); 
    } else {

      const cache_x = Array.from({ length: primary.number }, (_, i) => {
        const secondary_number = Array.isArray(secondary.number) ? secondary.number[i] : secondary.number;
        return Array.from({ length: secondary_number }, (_, j) => [
          {
            _size: this.dsl_cache.size_range[container_id]?.x?.[i]?.[j]?.[0],
            _point: this.dsl_cache.anchor_point[container_id]?.x?.[i]?.[j]?.[0],
          },
          {
            _size: this.dsl_cache.size_range[container_id]?.x?.[i]?.[j]?.[1],
            _point: this.dsl_cache.anchor_point[container_id]?.x?.[i]?.[j]?.[1],
          }
        ])
      })
      const cache_y = Array.from({ length: primary.number }, (_, i) => {
        const secondary_number = Array.isArray(secondary.number) ? secondary.number[i] : secondary.number;
        return Array.from({ length: secondary_number }, (_, j) => [
          {
            _size: this.dsl_cache.size_range[container_id]?.y?.[i]?.[j]?.[0],
            _point: this.dsl_cache.anchor_point[container_id]?.y?.[i]?.[j]?.[0],
          },
          {
            _size: this.dsl_cache.size_range[container_id]?.y?.[i]?.[j]?.[1],
            _point: this.dsl_cache.anchor_point[container_id]?.y?.[i]?.[j]?.[1],
          }
        ])
      })
      const cache_props = Array.from({ length: primary.number }, (_, i) => {
        const secondary_number = Array.isArray(secondary.number) ? secondary.number[i] : secondary.number;
        return Array.from({ length: secondary_number }, (_, j) => this.dsl_cache.non_property[container_id]?.[i]?.[j])
      });

      data = Array.from({ length: primary.number }, (_, i) => {
        const secondary_number = Array.isArray(secondary.number) ? secondary.number[i] : secondary.number;
        return Array.from({ length: secondary_number }, (_, j) => {
          const symbol = spec.mark_specification?.link_mark_type === 'group_type' ? j : 'const'
          const dim_x_primary = primary.dimension === dim_x ? getDataPoint(i, dim_x_spec, primary.number, `x-${symbol}`, cache_x.map((item) => item[j]?.[0])) : { min: 0, max: 100, _size: null, _point: null };
          const dim_y_primary = primary.dimension === dim_y ? getDataPoint(i, dim_y_spec, primary.number, `y-${symbol}`, cache_y.map((item) => item[j]?.[0])) : { min: 0, max: 100, _size: null, _point: null };

          const xDimScale = d3.scaleLinear().domain([0, 100]).range([dim_x_primary.min, dim_x_primary.max]);
          const yDimScale = d3.scaleLinear().domain([0, 100]).range([dim_y_primary.min, dim_y_primary.max]);

          // const dim_x_secondary = computeDataPoint(j, dim_x_spec, Array.isArray(secondary.number) ? secondary.number[i] : secondary.number, `x-${i}`)
          const dim_x_secondary = primary.dimension === secondary.dimension || secondary.dimension === dim_x ? getDataPoint(j, dim_x_spec, Array.isArray(secondary.number) ? secondary.number[i] : secondary.number, `x-${i}`, cache_x[i].map((item) => item[1])) : { min: 0, max: 100, _size: null, _point: null };
          // const dim_y_secondary = computeDataPoint(j, dim_y_spec, Array.isArray(secondary.number) ? secondary.number[i] : secondary.number, `y-${i}`)
          const dim_y_secondary = primary.dimension === secondary.dimension || secondary.dimension === dim_y ? getDataPoint(j, dim_y_spec, Array.isArray(secondary.number) ? secondary.number[i] : secondary.number, `y-${i}`, cache_y[i].map((item) => item[1])) : { min: 0, max: 100, _size: null, _point: null };

          return {
            x: {
              min: xDimScale(dim_x_secondary.min)!,
              max: xDimScale(dim_x_secondary.max)!,
              _size: [dim_x_primary._size, dim_x_secondary._size],
              _point: [dim_x_primary._point, dim_x_secondary._point],
            },
            y: {
              min: yDimScale(dim_y_secondary.min)!,
              max: yDimScale(dim_y_secondary.max)!,
              _size: [dim_y_primary._size, dim_y_secondary._size],
              _point: [dim_y_primary._point, dim_y_secondary._point],
            },
            props: cache_props[i][j] || computeProps(i, j),
          }
        });
      });
    }
    const rScale = d3.scaleLinear().domain([0, 100]).range([0, 1]);
    const aScale = d3.scaleLinear().domain([0, 100]).range([0, 360]);
    let index = 0;
    const compute = (datum: any) => {
      if (coordinate === 'cartesian') {
        return {
          id: getId(index++),
          x1: datum.x.min,
          y1: datum.y.min,
          x2: datum.x.max,
          y2: datum.y.max,
          props: datum.props,
        }
      } else {
        return {
          id: getId(index++),
          a1: aScale(datum.x.min),
          a2: aScale(datum.x.max),
          r1: rScale(datum.y.min),
          r2: rScale(datum.y.max),
          props: datum.props,
        }
      }
    }

    this.dsl_cache.size_range[container_id] = {
      x: data.map(datum => {
        if (Array.isArray(datum)) {
          return datum.map(d => d.x._size);
        }
        return datum.x._size;
      }),
      y: data.map(datum => {
        if (Array.isArray(datum)) {
          return datum.map(d => d.y._size);
        }
        return datum.y._size;
      }),
    };

    this.dsl_cache.anchor_point[container_id] = {
      x: data.map(datum => {
        if (Array.isArray(datum)) {
          return datum.map(d => d.x._point);
        }
        return datum.x._point;
      }),
      y: data.map(datum => {
        if (Array.isArray(datum)) {
          return datum.map(d => d.y._point);
        }
        return datum.y._point;
      }),
    }

    this.dsl_cache.non_property[container_id] = data.map(datum => {
      if (Array.isArray(datum)) {
        return datum.map(d => d.props);
      }
      return datum.props;
    })

    return data.map(datum => {
      if (Array.isArray(datum)) {
        return datum.map(compute);
      }
      return compute(datum);
    }) as DrawData[] | DrawData[][]
  }
  getContainerChildren(root_id?: string) {
    if (!root_id) {
      return Object.values(this.dsl_container);
    }

    const ans = Object.values(this.dsl_container)
      .filter(container => container.template_id === root_id);
    const _ans = R.clone(ans);

    const dfs = (container: VisualChartContainer) => {
      for (const child of container.components || []) {
        ans.push(child);
        dfs(child);
      }
    }
    _ans.forEach(dfs);

    return ans;
  }
  drawData(config?: {
    root_id: string,
    svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    option?: {
      width: number,
      height: number,
    }
  }) {
    const { root_id, svg = this.svg, option = {
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
    } } = config || {};
    if (!svg) {
      return
    }
    const scale = {
      xScale: d3.scaleLinear()
        .domain([0, 100])
        .range([0, option.width]),
      yScale: d3.scaleLinear()
        .domain([0, 100])
        .range([option.height, 0]),
      rScale: d3.scaleLinear()
        .domain([0, 1])
        .range([0, Math.min(option.width, option.height) / 2]),
      aScale: d3.scaleLinear()
        .domain([0, 360])
        .range([0, Math.PI * 2])
    }
    svg.selectAll('*').remove();
    this.drawContainer(undefined, svg);
    const containers = this.getContainerChildren(root_id);

    const leafContainers = containers.filter(container => container.if_leaf && !isLink(container.__data_specification));
    const linkContainers = containers.filter(container => container.if_leaf && isLink(container.__data_specification));
    for (const container of leafContainers) {
      if (container.if_leaf) {

        const genMark = (drawPoint: DrawDataCartesian) => {
          return generateMark(
            container.__data_specification?.mark_specification?.mark_type as MarkType,
            {
              x: { d1: drawPoint.x1, d2: drawPoint.x2 },
              y: { d1: drawPoint.y1, d2: drawPoint.y2 }
            },
            {
              transXY: (x, y) => {
                if (container.coordinate === 'polar') {
                  if (container.parent_coordinate === 'cartesian' && !R.isNil(container.coordinate_system.cx) && !R.isNil(container.coordinate_system.cy)) {
                    return {
                      x: scale!.xScale(container.coordinate_system.cx)!,
                      y: scale!.yScale(container.coordinate_system.cy)!,
                    }
                  }
                  return polarToCartesian(option.width / 2, option.height / 2, x, y)
                }
                return { x, y }
              },
              layout: container.coordinate,
            },
            drawPoint.props,
          )
        }

        const genMarks = (drawPoints: DrawDataCartesian[]) => {
          if (container.__data_specification?.mark_specification?.link_mark_type === 'group_type') {
            const mark = generateGroup(
              container.__data_specification?.mark_specification?.mark_type as GroupType,
              drawPoints,
              drawPoints[0].props,
              container.coordinate,
              {
                centerX: option.width / 2,
                centerY: option.height / 2,
              }
            )
            mark && g.append(() => mark!)
          } else {
            for (const dataPoint of drawPoints) {
              const mark = genMark(dataPoint)
              mark && g.append(() => mark!)
            }
          }
        }

        const g = svg!.append('g').attr('class', `id_${container.container_id}`)

        if (container.coordinate === "cartesian") {

          const x1 = scale!.xScale(Number(container.coordinate_system.x1));
          const x2 = scale!.xScale(Number(container.coordinate_system.x2));
          const y1 = scale!.yScale(Number(container.coordinate_system.y1));
          const y2 = scale!.yScale(Number(container.coordinate_system.y2));


          const xScale = d3.scaleLinear()
            .domain([0, 100])
            .range([x1, x2]);
          const yScale = d3.scaleLinear()
            .domain([0, 100])
            .range([y1, y2]);

          const data = this.dsl_data[container.container_id] as DrawDataCartesian[] | DrawDataCartesian[][];
          const dataPointArr = (Array.isArray(data[0]) ? data : [data]) as DrawDataCartesian[][];

          for (const dataPoints of dataPointArr) {
            const drawPoints = dataPoints.map((dataPoint) => ({
              id: dataPoint.id,
              x1: xScale(dataPoint.x1),
              x2: xScale(dataPoint.x2),
              y1: yScale(dataPoint.y1),
              y2: yScale(dataPoint.y2),
              props: {
                ...dataPoint.props,
                class: `id_${dataPoint.id}`
              }
            }))
            genMarks(drawPoints)
          }
        } else {

          const a1 = scale!.aScale(Number(container.coordinate_system.a1));
          const a2 = scale!.aScale(Number(container.coordinate_system.a2));
          const r1 = scale!.rScale(Number(container.coordinate_system.r1));
          const r2 = scale!.rScale(Number(container.coordinate_system.r2));

          const aScale = d3.scaleLinear()
            .domain([0, 360])
            .range([a1, a2]);
          const rScale = d3.scaleLinear()
            .domain([0, 1])
            .range([r1, r2]);


          const data = this.dsl_data[container.container_id] as DrawDataPolar[] | DrawDataPolar[][];
          const dataPointArr = (Array.isArray(data[0]) ? data : [data]) as DrawDataPolar[][];

          for (const dataPoints of dataPointArr) {
            const drawPoints = dataPoints.map((dataPoint) => ({
              id: dataPoint.id,
              x1: aScale(dataPoint.a1),
              x2: aScale(dataPoint.a2),
              y1: rScale(dataPoint.r1),
              y2: rScale(dataPoint.r2),
              props: {
                ...dataPoint.props,
                class: `id_${dataPoint.id}`
              }
            }))
            genMarks(drawPoints)
          }
        }
      }
    }

    for (const container of linkContainers) {
      if (container.if_leaf) {
        const spec = this.dsl_data[container.container_id] as LinkData[];
        if (!spec) {
          throw new Error(`Link container ${container.container_id} has no data`)
        }
        const computePostion = (sourceId: string, targetId: string) => {
          const sourceNode = document.querySelector(`.editor-preview .${sourceId}`);
          const targetNode = document.querySelector(`.editor-preview .${targetId}`);

          const _sourcePos = (sourceNode as Element)?.getBoundingClientRect()
          const _targetPos = (targetNode as Element)?.getBoundingClientRect()
          const svgPos = svg!.node()!.getBoundingClientRect();


          if (!_sourcePos || !_targetPos) {
            return {
              sourcePos: null,
              targetPos: null,
            }
          }

          let sourcePos = {
            id: sourceId,
            left: _sourcePos?.left - svgPos.left,
            top: _sourcePos?.top - svgPos.top,
            right: _sourcePos?.right - svgPos.left,
            bottom: _sourcePos?.bottom - svgPos.top,
          }
          let targetPos = {
            id: targetId,
            left: _targetPos?.left - svgPos.left,
            top: _targetPos?.top - svgPos.top,
            right: _targetPos?.right - svgPos.left,
            bottom: _targetPos?.bottom - svgPos.top,
          }

          if (sourcePos.left > targetPos.right) {
            [sourcePos, targetPos] = [targetPos, sourcePos]
          }

          const xScale = d3.scaleLinear().domain([0, svgPos.width]).range([0, VIEW_WIDTH])
          const yScale = d3.scaleLinear().domain([0, svgPos.height]).range([0, VIEW_HEIGHT])


          if (targetPos.left < sourcePos.right) {
            [sourcePos, targetPos] = [targetPos, sourcePos];
          }

          // const isSourceMark = sourcePos.id.startsWith('id_');
          // const isTargetMark = targetPos.id.startsWith('id_');

          return {
            sourcePos: {
              // x: isSourceMark ? xScale((sourcePos.left + sourcePos.right) / 2) : xScale(sourcePos.right),
              x: xScale(sourcePos.right),
              y: yScale((sourcePos.top + sourcePos.bottom) / 2),
            },
            targetPos: {
              // x: isTargetMark ? xScale((targetPos.left + targetPos.right) / 2) : xScale(targetPos.left),
              x: xScale(targetPos.left),
              y: yScale((targetPos.top + targetPos.bottom) / 2),
            },
            direction: 'horizontal' as string,
          }
        }

        const g = svg!.append('g').attr('class', `id_${container.container_id} chart-link`).lower()

        for (const { source, target, props } of spec) {
          const { sourcePos, targetPos, direction } = computePostion(source, target);
          if (sourcePos && targetPos) {
            const linkMarkType = (container.__data_specification?.mark_specification?.mark_type ?? 'line') as 'line';
            const mark = generateLink(linkMarkType, [sourcePos!, targetPos!], props, direction as any)
            if (mark instanceof Node) {
              g.append(() => mark!)
            } else {
              debugger
            }
          }
        }
      }
    }
  }
  drawContainer(containerId?: string | null, _svg?: d3.Selection<SVGSVGElement, any, any, any>, _option?: {
    width: number,
    height: number,
    g_props?: Record<string, any>,
  }) {
    const option = _option || {
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
    }
    const svg = _svg ?
      _svg
        .attr('viewBox', `0 0 ${option.width} ${option.height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
      : this.svg;

    const isInitial = containerId === undefined;

    if (!svg) {
      return
    }
    const scale = {
      xScale: d3.scaleLinear()
        .domain([0, 100])
        .range([0, option.width]),
      yScale: d3.scaleLinear()
        .domain([0, 100])
        .range([option.height, 0]),
      rScale: d3.scaleLinear()
        .domain([0, 1])
        .range([0, Math.min(option.width, option.height) / 2]),
      aScale: d3.scaleLinear()
        .domain([0, 360])
        .range([0, Math.PI * 2])
    }

    if (isInitial) {
      // @ts-ignore
      svg.selectAll(`container`).remove()
    } else {
      // @ts-ignore
      svg.selectAll(`.selected-container`).remove()
    }

    const _containers = R.flatten(Object.values(this.dsl_container))
    const containers = containerId === undefined ? _containers : _containers.filter(container => container.template_id === containerId);
    // const containers = !isInitial ? _containers.filter(container => container.container_id === _containerId) : _containers
    for (const container of containers) {
      const genMark = (xd1: number, xd2: number, yd1: number, yd2: number) => {
        return generateMark(
          container.coordinate === 'cartesian' ? MarkType.rect : MarkType.arc,
          {
            x: { d1: xd1, d2: xd2 },
            y: { d1: yd1, d2: yd2 }
          },
          {
            transXY: (x, y) => {
              if (container.coordinate === 'polar') {
                if (container.parent_coordinate === 'cartesian' && !R.isNil(container.coordinate_system.cx) && !R.isNil(container.coordinate_system.cy)) {
                  return {
                    x: scale!.xScale(container.coordinate_system.cx)!,
                    y: scale!.yScale(container.coordinate_system.cy)!,
                  }
                }
                return polarToCartesian(option.width / 2, option.height / 2, x * 2, y * 2)
              }
              return { x, y }
            },
            layout: container.coordinate
          },
          {
            fill: isInitial ? 'gray' : 'red',
            opacity: 0.1,
            stroke: 'blue',
            "stroke-width": 2,
          }
        )
      }

      // @ts-ignore
      const g = svg!.append('g').attr('class', `${containerId === container.template_id ? 'selected-container cursor-pointer' : ''} container container_${container.container_id}`)
        .attr('data-container-id', container.container_id)
        .call(this.enableDrag.bind(this))
        .raise()
      if (option?.g_props) {
        Object.entries(option.g_props).forEach(([key, value]) => {
          g.attr(key, value)
        })
      }
      // 直角坐标系
      if (container.coordinate === 'cartesian') {
        const x1 = scale.xScale(Number(container.coordinate_system.x1 || 0))
        const y1 = scale.yScale(Number(container.coordinate_system.y1 || 0))
        const x2 = scale.xScale(Number(container.coordinate_system.x2 || 0))
        const y2 = scale.yScale(Number(container.coordinate_system.y2 || 0))

        const mark = genMark(x1, x2, y1, y2)
        g.append(() => mark!)
      } else if (container.coordinate === 'polar') {
        const y1 = scale.rScale(Number(container.coordinate_system.r1 || 0))
        const y2 = scale.rScale(Number(container.coordinate_system.r2 || 0))
        const x1 = scale.aScale(Number(container.coordinate_system.a1 || 0))
        const x2 = scale.aScale(Number(container.coordinate_system.a2 || 0))

        const mark = genMark(x1, x2, y1, y2)
        g.append(() => mark!)
      }
    }
  }

  enableDrag(selection: d3.Selection<SVGGElement, unknown, null, undefined>) {
    const drag = d3.drag<SVGGElement, unknown>()
      .on('start', (event) => {
        d3.select(event.sourceEvent.target).raise();
      })
      .on('drag', (event) => {
        const dx = event.dx;
        const dy = event.dy;

        // 更新当前 <g> 元素的位置
        const transform = d3.select(event.sourceEvent.target).attr('transform') || 'translate(0,0)';
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        let currentX = 0, currentY = 0;
        if (match) {
          currentX = parseFloat(match[1]) || 0;
          currentY = parseFloat(match[2]) || 0;
        }

        const newX = currentX + dx;
        const newY = currentY + dy;
        d3.select(event.sourceEvent.target).attr('transform', `translate(${newX},${newY})`);

        // 获取当前容器的 ID
        const containerId = d3.select(event.sourceEvent.target).attr('data-container-id');
        if (containerId) {
          // 获取所有子节点容器
          const children = this.getContainerChildren(containerId);
          // 更新所有子节点容器的位置
          children.forEach(child => {
            const childElement = this.svg?.select(`.container_${child.container_id}`);
            if (childElement && childElement.node() !== event.sourceEvent.target) {
              const childTransform = childElement.attr('transform') || 'translate(0,0)';
              const childMatch = childTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
              let childX = 0, childY = 0;
              if (childMatch) {
                childX = parseFloat(childMatch[1]) || 0;
                childY = parseFloat(childMatch[2]) || 0;
              }
              const newChildX = childX + dx;
              const newChildY = childY + dy;
              childElement.attr('transform', `translate(${newChildX},${newChildY})`);
            }
          });
        }
      });

    selection.call(drag);
  }
}

function getInitialDSLCache() {
  return {
    size_range: {},
    anchor_point: {},
    link_nodes: {},
    non_property: {},
  }
}

export const visualChart = new VisualChart()