import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyDataChanges, useChartStore } from "../model/editor";
import { useShallow } from "zustand/shallow";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DataFormProp } from "../type";
import * as R from "ramda";

export const DSLDataViewer = () => {
  const {
    dslData,
    selectedContainer,
    selectedContainerId,
    dslContainer,
    currentDataFormProp,
    isSaving,
  } = useChartStore(
    useShallow((state) => ({
      dslData: state.dsl_data,
      selectedContainer: state.selectedContainer,
      selectedContainerId: state.selectedContainerId,
      dslContainer: state.dsl_container,
      currentDataFormProp: state.currentDataFormProp,
      isSaving: state.isSaving,
    })),
  );
  const [selectedSpecType, setSelectedSpecType] = useState<"template" | "mark">("template");

  const [jsonText, setJsonText] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applying, setApplying] = useState(false);

  // 过滤数据，只保留选中的属性
  const filterDataByProperty = (data: any, selectedContainerChildrenIds: string[]) => {
    if (currentDataFormProp === DataFormProp.ALL) {
      return data;
    }

    const dslCache = useChartStore.getState().chart.dsl_cache;
    // 根据不同的prop提取对应的值
    switch (currentDataFormProp) {
      case DataFormProp.X_SIZE_RANGE:
        return Object.entries(dslCache.size_range).filter(([key]) => selectedContainerChildrenIds.includes(key)).map(([_, value]) => (value as any).x);
      case DataFormProp.Y_SIZE_RANGE:
        return Object.entries(dslCache.size_range).filter(([key]) => selectedContainerChildrenIds.includes(key)).map(([_, value]) => (value as any).y);
      case DataFormProp.X_ANCHOR_POSITION:
        return Object.entries(dslCache.anchor_point).filter(([key]) => selectedContainerChildrenIds.includes(key)).map(([_, value]) => (value as any).x);
      case DataFormProp.Y_ANCHOR_POSITION:
        return Object.entries(dslCache.anchor_point).filter(([key]) => selectedContainerChildrenIds.includes(key)).map(([_, value]) => (value as any).y);

      case DataFormProp.NON_PROPERTY:
        return Object.entries(dslCache.non_property).filter(([key]) => selectedContainerChildrenIds.includes(key)).map(([_, value]) => value);
      case DataFormProp.LINK_NODES:
        return Object.entries(dslCache.link_nodes).filter(([key]) => selectedContainerChildrenIds.includes(key)).map(([_, value]) => value);
      default:
        return null;
    }
  };

  const xSizeRangeDisabled =
    selectedContainer?.__data_specification?.mark_specification?.is_link_mark ||
    selectedContainer?.__data_specification?.layout_specification?.x?.stacking ||
    selectedContainer?.__data_specification?.layout_specification?.x
      ?.size_uniform;
  const ySizeRangeDisabled =
    selectedContainer?.__data_specification?.mark_specification?.is_link_mark ||
    selectedContainer?.__data_specification?.layout_specification?.y?.stacking ||
    selectedContainer?.__data_specification?.layout_specification?.y
      ?.size_uniform;

  const xAnchorPositionDisabled =
    selectedContainer?.__data_specification?.mark_specification?.is_link_mark ||
    selectedContainer?.__data_specification?.layout_specification?.x?.stacking ||
    selectedContainer?.__data_specification?.layout_specification?.x
      ?.anchor_distribute !== "flexible";
  const yAnchorPositionDisabled =
    selectedContainer?.__data_specification?.mark_specification?.is_link_mark ||
    selectedContainer?.__data_specification?.layout_specification?.y?.stacking ||
    selectedContainer?.__data_specification?.layout_specification?.y
      ?.anchor_distribute !== "flexible";

  const linkDisabled =
    selectedContainer?.__data_specification?.mark_specification
      ?.link_mark_type !== "node_link_type";
  const nonPropertyDisabled =
    selectedContainer?.__data_specification?.mark_specification?.is_link_mark;

  const markDisabled = !selectedContainer?.if_leaf

  useEffect(() => {
    setApplyError("");
    setSelectedSpecType(selectedContainer?.if_leaf ? "mark" : "template");
  }, [selectedContainerId]);

  useEffect(() => {
    const selectedContainerChildrenIds = useChartStore.getState().selectedContainerChildren?.map(item => item.container_id) || [];

    if (selectedSpecType === "template") {
    const { dsl_container } = useChartStore.getState();
    const containers = Object.values(dsl_container).filter(item => item.template_id === selectedContainerId).map(item => R.pick(["container_id", "coordinate_system"], item));
      const dataToDisplay = filterDataByProperty([containers], [`container_${selectedContainerId}`])?.[0];
      
      setJsonText(JSON.stringify(dataToDisplay, null, 2));
    } else if (selectedSpecType === "mark") {
      if (dslData) {
        let filteredData = dslData;

        // 如果有选中的 container，过滤 dslData 中 template 属性等于选中 container 的数据
        if (selectedContainerId && dslContainer) {
          filteredData = Object.fromEntries(
            Object.entries(dslData).filter(
              ([key, value]) =>
                dslContainer[key]?.template_id === selectedContainerId,
            ),
          );
        }

        // 根据选中的属性过滤数据
        const dataToDisplay = filterDataByProperty(filteredData, selectedContainerChildrenIds);

        if (Object.keys(dataToDisplay).length > 0) {
          setJsonText(JSON.stringify(dataToDisplay, null, 2));
        } else {
          setJsonText("No data available for selected property");
        }
      }
    }
  }, [dslData, selectedContainerId, dslContainer, currentDataFormProp, selectedSpecType]);

  // Check if JSON is valid
  const isValidJson = () => {
    if (!jsonText) return false;
    if (typeof jsonText === "object") return true;
    try {
      JSON.parse(jsonText);
      return true;
    } catch (error) {
      return false;
    }
  };

  const jsonValid = isValidJson();

  // Handle JSON text changes
  const handleJsonChange = (text: string) => {
    setJsonText(text);
    setApplyError("");
  };

  return (
    <Card className="w-full h-full flex flex-col min-h-[200px]">
      <CardHeader className="p-4 border-b flex flex-row items-center">
        <CardTitle className="text-lg font-semibold">Data Control Panel</CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex-1 flex flex-col">
        <div className="flex mb-2 gap-1 items-center flex-wrap">
          <div
            className={`flex items-center space-x-2 px-3 py-1 rounded text-sm ${jsonValid
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
              }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${jsonValid ? "bg-green-500" : "bg-red-500"}`}
            ></div>
            <span>{jsonValid ? "Valid JSON" : "Invalid JSON"}</span>
          </div>
          {selectedContainerId && (
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded text-sm bg-yellow-100 text-yellow-800 border border-yellow-200`}
            >
              <div className={`w-2 h-2 rounded-full bg-yellow-500`}></div>
              <span>{selectedContainerId}</span>
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={!jsonValid || !selectedContainerId || isSaving || applying}
            onClick={async () => {
              setApplying(true); setApplyError('');
              try { await applyDataChanges(selectedSpecType, JSON.parse(jsonText)); }
              catch (error) { setApplyError(error instanceof Error ? error.message : String(error)); }
              finally { setApplying(false); }
            }}
            className="ml-auto"
          >
            {applying ? "Applying…" : "Apply Changes"}
          </Button>
        </div>
        <div className="flex mb-2 gap-1 items-center flex-wrap">
          {/* 新增：mark/template 选择器 */}
          <Select
            value={selectedSpecType}
            onValueChange={(value) => {
              setSelectedSpecType(value);
              useChartStore.setState(state => {
                state.currentDataFormProp = DataFormProp.ALL;
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mark" disabled={markDisabled}>Mark</SelectItem>
              <SelectItem value="template">Template</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={currentDataFormProp}
            onValueChange={(value: DataFormProp) => {
              useChartStore.setState({ currentDataFormProp: value });
            }}
          >
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="Select property" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DataFormProp.ALL}>All</SelectItem>
              {
                selectedContainer && selectedSpecType === "mark" && (
                  <>
                    <SelectItem
                      value={DataFormProp.X_SIZE_RANGE}
                      disabled={xSizeRangeDisabled}
                    >
                      x_size_range
                    </SelectItem>
                    <SelectItem
                      value={DataFormProp.Y_SIZE_RANGE}
                      disabled={ySizeRangeDisabled}
                    >
                      y_size_range
                    </SelectItem>
                    <SelectItem
                      value={DataFormProp.X_ANCHOR_POSITION}
                      disabled={xAnchorPositionDisabled}
                    >
                      x_anchor_position
                    </SelectItem>
                    <SelectItem
                      value={DataFormProp.Y_ANCHOR_POSITION}
                      disabled={yAnchorPositionDisabled}
                    >
                      y_anchor_position
                    </SelectItem>
                    <SelectItem
                      value={DataFormProp.NON_PROPERTY}
                      disabled={nonPropertyDisabled}
                    >
                      non_property
                    </SelectItem>
                    <SelectItem
                      value={DataFormProp.LINK_NODES}
                      disabled={linkDisabled}
                    >
                      link_nodes
                    </SelectItem>
                  </>
                )
              }
              {
                selectedContainer && selectedSpecType === "template" && (
                  <>
                    <SelectItem
                      value={DataFormProp.X_SIZE_RANGE}
                    >
                      x_size_range
                    </SelectItem>
                    <SelectItem
                      value={DataFormProp.Y_SIZE_RANGE}
                    >
                      y_size_range
                    </SelectItem>
                  </>
                )
              }
            </SelectContent>
          </Select>
        </div>
        {applyError && <p role="alert" className="text-sm text-red-700">{applyError}</p>}
        <textarea
          aria-label="Container data JSON"
          className={`w-full flex-1 border rounded p-3 text-sm font-mono resize-none ${jsonValid ? "border-gray-300" : "border-red-300"}`}
          placeholder="No DSL data available"
          value={jsonText ? jsonText : "No DSL data"}
          rows={10}
          onChange={(e) => handleJsonChange(e.target.value)}
        />
      </CardContent>
    </Card>
  );
};
