import type { MarkType } from "../../utils/mark";

// 笛卡尔坐标系
export interface ContainerCartesian {
  container_id: string;
  template_id: string;
  coordinate_system: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  r: number;
  coordinate_data?: ContainerCartesian[];
}

// 极坐标系
export interface ContainerPolar {
  container_id: string;
  template_id: string;
  coordinate_system: {
    center_x: number;
    center_y: number;
    a1: number;
    a2: number;
    r1: number;
    r2: number;
  };
  coordinate_data?: ContainerPolar[];
}

export interface VisualChartDataSize {
  dimension: "x" | "y" | "redius" | "angle";
  number: number;
  explanation: string;
}

export interface VisualChartLayout {
  stacking: boolean,
  stacking_direction: "min" | "max" | "middle",
  anchor: "stacking_decided" | "min" | "max" | "middle",
  subdividing: boolean,
  "2D_flatten": boolean,
  size_uniform: boolean,
  size_range: [number, number], // [0, 100]
  // - **'fixed_value'**: 固定值：表示锚点对齐
  // - **'uniform_interval'**：锚点等间距分布
  // - **'flexible'**: 锚点灵活排布，由数据决定
  anchor_distribute?: "fixed_value" | "uniform_interval" | "flexible",
  anchor_interval?: number,
  anchor_start?: number,
  number: number | number[];
}

export interface VisualChartContainer {
  template_id: string;
  container_id: string;
  description: string;
  coordinate: "cartesian" | "polar";
  parent_coordinate?: "cartesian" | "polar";
  coordinate_system: Record<'x1' | 'x2' | 'y1' | 'y2' | 'r1' | 'r2' | 'a1' | 'a2' | 'cx' | 'cy', number>;
  if_leaf: boolean;
  if_template_container?: boolean;
  components?: VisualChartContainer[];
  mark_type?: MarkType;
  __data_specification?: VisualChartDataSpecification
  __temp_specification?: VisualChartDataSpecification
}

export interface VisualChartDataSpecification {
  mark_specification: {
    mark_type: MarkType;
    link_mark_type?: 'group_type' | 'node_link_type';
    is_link_mark?: boolean;
    link_number?: number;
  }
  data_structure: {
    data_type: "2D_MATRIX" | "2D_LIST" | "1D_LIST",
    data_size: {
      primary: VisualChartDataSize,
      secondary: VisualChartDataSize
    }
  }
  layout_specification: {
    x?: VisualChartLayout;
    y?: VisualChartLayout;
    radius?: VisualChartLayout;
    angle?: VisualChartLayout;
    link_mark_configuration?: any;
    source?: {
      container_id: string;
      linked_object: 'mark' | 'container';
    }[];
    target?: {
      container_id: string;
      linked_object: 'mark' | 'container';
    }[];
  };
  non_layout_specification: {
    [key: string]: number | string | string[] | {
      scale: 'fix' | 'linear' | 'ordinal_primary' | 'ordinal_secondary' | 'categorical',
      fix?: number,
      linear?: [number, number],
      options?: string[]
    }
  }
}

export interface VisualChartJsonData extends VisualChartContainer {

  template_data_specification: {
    [key: string]: VisualChartDataSpecification
  };
  data_specification: {
    [key: string]: VisualChartDataSpecification
  };
}

export type DrawDataCartesian = {
  id: string;
  x1: number; // 0-100
  y1: number; // 0-100
  x2: number; // 0-100
  y2: number; // 0-100
  props: Record<string, number | string>
}

export type DrawDataPolar = {
  id: string;
  a1: number; // 0-360
  a2: number; // 0-360
  r1: number; // 0-1
  r2: number; // 0-1
  props: Record<string, number | string>
}
export type LinkData = {
  id: string;
  source: string;
  target: string;
  props: Record<string, number | string>
}

export type DrawData = DrawDataCartesian | DrawDataPolar | LinkData

export type ContainerData = Record<string, DrawData[] | DrawData[][]>

export enum DataFormProp {
  ALL = 'all',
  X_SIZE_RANGE = 'x_size_range',
  Y_SIZE_RANGE = 'y_size_range',
  X_ANCHOR_POSITION = 'x_anchor_position',
  Y_ANCHOR_POSITION = 'y_anchor_position',
  NON_PROPERTY = 'non_property',
  LINK_NODES = 'link_nodes'
}
