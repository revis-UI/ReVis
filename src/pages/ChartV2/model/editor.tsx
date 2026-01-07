import { create } from 'zustand';
import { VisualChart } from './Chart';
import * as R from 'ramda';
import { immer } from 'zustand/middleware/immer';
import { loadData } from '../utils';
import { type ContainerData, type VisualChartContainer, type VisualChartJsonData, DataFormProp } from '../type';
import { JSON_FILES } from '@/generated/json-files';
import { showToast } from '@/components/toast';

export const useChartStore = create(immer<{
  chart: VisualChart,
  dsl_file: typeof JSON_FILES[number],
  dsl_json: VisualChartJsonData | undefined,
  dsl_container: Record<string, VisualChartContainer>
  dsl_data: ContainerData
  allContainers: VisualChartContainer[]
  selectedContainerId: string | null
  selectedContainer: VisualChartContainer | null
  selectedContainerChildren: VisualChartContainer[]
  showContainers: boolean
  hoveredContainerId: string | null
  currentDataFormProp: DataFormProp
}>(() => ({
  chart: new VisualChart(),
  dsl_file: "07_iForest",
  dsl_json: undefined,
  dsl_container: {},
  dsl_data: {},
  allContainers: [],
  selectedContainerId: null,
  selectedContainer: null,
  selectedContainerChildren: [],
  showContainers: false,
  hoveredContainerId: null,
  currentDataFormProp: DataFormProp.ALL,
})));

export const initChart = async () => {
  const dsl_file = useChartStore.getState().dsl_file;
  const jsonData = await loadData(dsl_file);
  changeDslJson(jsonData);
}

export const handleHoverContainer = (containerId: string | null) => {
  useChartStore.setState((state) => {
    state.hoveredContainerId = containerId;
  });
  const { chart } = useChartStore.getState();
  // Hover-only highlight: do not fall back to selected container
  chart.drawContainer(containerId ?? null);
};

export const handleChangeContainer = (containerId: string | null) => {
  useChartStore.setState((state) => {
    state.selectedContainerId = containerId;
    state.hoveredContainerId = null;
    state.selectedContainer = R.clone(state.allContainers.find(c => c.container_id === containerId)) || null;
    state.selectedContainerChildren = Object.values(state.dsl_container).filter((item) => item.template_id === containerId);
    state.currentDataFormProp = DataFormProp.ALL;
  });
  // Selection should not trigger highlight; clear any selection-driven highlight
  useChartStore.getState().chart.drawContainer(null);
};

export const applyDataChanges = (specType: 'template' | 'mark', jsonData: ContainerData) => {
  const { selectedContainerChildren, chart, selectedContainerId, currentDataFormProp } = useChartStore.getState();
  
  if (specType === 'template') {
    switch (currentDataFormProp) {
      case DataFormProp.ALL: 
        if (jsonData) {
          const containers = jsonData as any;
          if (selectedContainerId && Array.isArray(containers)) {
            const dslContainer = R.clone(chart.dsl_container);
            for (const container of containers) {
              if (dslContainer[container.container_id]) {
                dslContainer[container.container_id] = R.mergeDeepRight(dslContainer[container.container_id], container);
              }
            }
            chart.dsl_container = dslContainer;
          }
        }
        break;
      case DataFormProp.X_SIZE_RANGE:
        if (jsonData && chart.dsl_cache.size_range[`container_${selectedContainerId}`]) {
          chart.dsl_cache.size_range[`container_${selectedContainerId}`].x = jsonData;
        }
        chart.parseContainer();
        break;
      case DataFormProp.Y_SIZE_RANGE:
        if (jsonData && chart.dsl_cache.size_range[`container_${selectedContainerId}`]) {
          chart.dsl_cache.size_range[`container_${selectedContainerId}`].y = jsonData;
        }
        chart.parseContainer();
        break;
    }
    chart.parseData();
  } else if (specType === 'mark') {
    switch (currentDataFormProp) {
      case DataFormProp.ALL:
        if (jsonData) {
          if (selectedContainerChildren?.length) {
            const dslData = R.clone(chart.dsl_data);
            for (const container of selectedContainerChildren) {
              if (dslData[container.container_id] && jsonData?.[container.container_id]) {
                dslData[container.container_id] = jsonData[container.container_id]
              }
            }
            chart.dsl_data = dslData;
          } else {
            chart.dsl_data = jsonData || {};
          }
        }
        break;
      case DataFormProp.X_SIZE_RANGE:
        selectedContainerChildren.forEach((item, index) => {
          const data = jsonData?.[index];
          if (data && chart.dsl_cache.size_range[item.container_id]) {
            chart.dsl_cache.size_range[item.container_id].x = data;
          }
        })
        chart.parseData();
        break;
      case DataFormProp.Y_SIZE_RANGE:
        selectedContainerChildren.forEach((item, index) => {
          const data = jsonData?.[index];
          if (data && chart.dsl_cache.size_range[item.container_id]) {
            chart.dsl_cache.size_range[item.container_id].y = data;
          }
        })
        chart.parseData();
        break;
      case DataFormProp.X_ANCHOR_POSITION:
        selectedContainerChildren.forEach((item, index) => {
          const data = jsonData?.[index];
          if (data && chart.dsl_cache.anchor_point[item.container_id]) {
            chart.dsl_cache.anchor_point[item.container_id].x = data;
          }
        })
        chart.parseData();
        break;
      case DataFormProp.Y_ANCHOR_POSITION:
        selectedContainerChildren.forEach((item, index) => {
          const data = jsonData?.[index];
          if (data && chart.dsl_cache.anchor_point[item.container_id]) {
            chart.dsl_cache.anchor_point[item.container_id].y = data;
          }
        })
        chart.parseData();
        break;
      case DataFormProp.NON_PROPERTY:
        selectedContainerChildren.forEach((item, index) => {
          const data = jsonData?.[index];
          if (data && chart.dsl_cache.non_property[item.container_id]) {
            chart.dsl_cache.non_property[item.container_id] = data;
          }
        })
        chart.parseData();
        break;
      case DataFormProp.LINK_NODES:
        selectedContainerChildren.forEach((item, index) => {
          const data = jsonData?.[index];
          if (data && chart.dsl_cache.link_nodes[item.container_id]) {
            chart.dsl_cache.link_nodes[item.container_id] = data;
          }
        })
        chart.parseData();
        break;
    }
  }
  chart.drawData();
  // Do not highlight on selection; hover will control highlight separately
}

// Apply changes to the selected container
export const applyContainerChanges = () => {
  const { selectedContainer, dsl_json, selectedContainerChildren } = useChartStore.getState();
  if (!dsl_json) return;

  const updateContainer = (container: VisualChartContainer) => {
    if (container.container_id === selectedContainer?.container_id) {
      return R.mergeDeepRight(container, R.omit(['components', '__data_specification'], selectedContainer));
    } else {
      container.components = container.components?.map(comp => updateContainer(comp)) || [];
      return container;
    }
  }
  const _dsl_json = selectedContainer ? updateContainer(R.clone(dsl_json)) : dsl_json;
  if (selectedContainer?.__data_specification) {
    // @ts-ignore
    _dsl_json.data_specification[selectedContainer.container_id] = R.mergeDeepRight(_dsl_json.data_specification[selectedContainer.container_id], selectedContainer.__data_specification);
  }
  if (selectedContainer?.__temp_specification) {
    // @ts-ignore
    _dsl_json.template_data_specification[selectedContainer.container_id] = R.mergeDeepRight(_dsl_json.template_data_specification[selectedContainer.container_id], selectedContainer.__temp_specification);
  }
  
  // Re-parse the DSL JSON to update the chart state
  changeDslJson(_dsl_json, {
    computeDslContainer: (dsl_container) => {
      for (const container of selectedContainerChildren) {
        if (dsl_container[container.container_id]) {
          dsl_container[container.container_id] = R.mergeDeepRight(dsl_container[container.container_id], R.omit(['components', '__data_specification'], container));
        }
      }
      return dsl_container;
    },
  });
  // Do not highlight on selection; hover will control highlight separately
  
  showToast('Container changes applied successfully!');
};

export const changeDslFile = async (dsl_file: typeof JSON_FILES[number]) => {
  const jsonData = await loadData(dsl_file);
  useChartStore.setState((state) => {
    state.dsl_file = dsl_file;
    state.dsl_json = jsonData || undefined;
    state.selectedContainerId = null;
    state.selectedContainer = null;
    state.selectedContainerChildren = [];
    state.currentDataFormProp = DataFormProp.ALL;
  });
  changeDslJson(jsonData);
}

export const changeDslJson = (
  dsl_json: any, options?: {
    computeDslContainer?: (container: Record<string, VisualChartContainer>) => Record<string, VisualChartContainer>
    computeDslData?: (data: ContainerData) => ContainerData 
  }
) => {
  
  // Helper function to extract all containers recursively
  const extractAllContainers = (container: VisualChartContainer | undefined): VisualChartContainer[] => {
    if (!container) return [];

    const containers: VisualChartContainer[] = [{
      ...R.omit(['components'], container),
      __data_specification: dsl_json.data_specification?.[container.container_id],
      __temp_specification: dsl_json.template_data_specification?.[container.container_id],
    }];
    if (container.components) {
      container.components.forEach(comp => {
        containers.push(...extractAllContainers(comp));
      });
    }
    return containers;
  };

  // Get all containers from the DSL JSON and filter to keep only one per template_id
  const allContainers = extractAllContainers(dsl_json);
  useChartStore.setState((state) => {
    state.dsl_json = dsl_json;
    state.chart.reset();
    const { dsl_container, dsl_data } = state.chart.parseDSL(dsl_json, options);
    state.dsl_container = dsl_container;
    state.dsl_data = dsl_data;
    state.allContainers = allContainers;
  });

  const { hoveredContainerId, selectedContainerId, chart } = useChartStore.getState();
  // Only hover should drive highlight
  chart.drawContainer(hoveredContainerId ?? null);
  chart.drawData();
};

export const toggleShowContainers = () => {
  useChartStore.setState((state) => {
    state.showContainers = !state.showContainers;
  });
}

export const getRootCoordinateSystem = () => {
  const dsl = useChartStore.getState().dsl_json;
  return Object.fromEntries(Object.entries(dsl?.coordinate_system || {}).map(([key, value]) => [key, Number(value)]))
}


// 删除容器及其相关数据
export const deleteContainer = (containerId: string) => {
  const { dsl_json, chart } = useChartStore.getState();
  if (!dsl_json) return;

  // 递归删除容器
  const removeContainer = (container: any): any => {
    if (container.container_id === containerId) {
      return null; // 删除该容器
    }

    if (container.components && Array.isArray(container.components)) {
      const filteredComponents = container.components
        .map(removeContainer)
        .filter(Boolean);

      if (filteredComponents.length === 0) {
        return { ...container, components: undefined };
      }
      return { ...container, components: filteredComponents };
    }

    return container;
  };

  // 创建新的 DSL JSON
  const newDslJson = removeContainer(R.clone(dsl_json));

  // 删除 template_data_specification 中的相关数据
  if (newDslJson.template_data_specification && newDslJson.template_data_specification[containerId]) {
    delete newDslJson.template_data_specification[containerId];
  }

  // 删除 data_specification 中的相关数据
  if (newDslJson.data_specification && newDslJson.data_specification[containerId]) {
    delete newDslJson.data_specification[containerId];
  }
  // 更新状态
  changeDslJson(newDslJson);

  // 如果删除的是当前选中的容器，清空选中状态
  const { selectedContainerId } = useChartStore.getState();
  if (selectedContainerId === containerId) {
    handleChangeContainer(null);
  }

  showToast(`Container ${containerId} deleted successfully!`);
};

// 复制容器及其相关数据
export const copyContainer = (containerId: string) => {
  const { dsl_json } = useChartStore.getState();
  if (!dsl_json) return;

  // 创建副本进行修改
  const newDslJson = R.clone(dsl_json);

  // 生成新的 container_id
  const generateNewContainerId = (oldId: string): string => {
    // 如果没有数字后缀，直接添加 '-0'
    return `-${oldId}`;
  };

  const updateContainer = (container: any) => {
    const oldContainerId = container.container_id;
    const newContainerId = generateNewContainerId(container.container_id);
    container.container_id = newContainerId;
    if (container.template_id) {
      container.template_id = container.container_id;
    }
    if (newDslJson.template_data_specification && newDslJson.template_data_specification[oldContainerId]) {
      newDslJson.template_data_specification[newContainerId] = R.clone(newDslJson.template_data_specification[oldContainerId]);
    }
    if (newDslJson.data_specification && newDslJson.data_specification[oldContainerId]) {
      newDslJson.data_specification[newContainerId] = R.clone(newDslJson.data_specification[oldContainerId]);
    }
    if (container.components && Array.isArray(container.components)) {
      container.components.forEach(updateContainer);
    }
  }

  // 递归查找并复制容器
  const findAndCopyContainer = (container: any): boolean => {
    if (container.components && Array.isArray(container.components)) {
      for (let i = 0; i < container.components.length; i++) {
        const comp = container.components[i];
        if (comp.container_id === containerId) {
          // 复制组件
          const newComp = R.clone(comp);
          updateContainer(newComp);
          container.components.splice(i+1, 0, newComp);
          return true;
        }
        if (findAndCopyContainer(comp)) {
          return true;
        }
      }
    }
    return false;
  };

  if (findAndCopyContainer(newDslJson)) {
    // 更新状态
    changeDslJson(newDslJson);
    showToast(`Container ${containerId} copied successfully!`);
  } else {
    showToast(`Container ${containerId} not found!`);
  }
};

// @ts-ignore
window.useChartStore = useChartStore;