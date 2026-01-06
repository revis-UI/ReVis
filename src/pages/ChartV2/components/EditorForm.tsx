import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useChartStore, changeDslJson, handleChangeContainer, applyContainerChanges } from '../model/editor';
import { MarkType } from '../../../utils/mark';
import { useShallow } from 'zustand/shallow';
import * as R from 'ramda';

// Reusable Layout Editor Component
const LayoutEditor = ({
  type,
  layout,
  title,
  path,
  handleFormFieldUpdate
}: {
  type: 'x' | 'y' | 'radius' | 'angle' | 'source' | 'target';
  layout: any;
  title: string;
  path: string;
  handleFormFieldUpdate: (fieldPath: string, value: any, context?: any) => void;
}) => (
  <div className="border border-gray-200 rounded-lg p-4">
    <h5 className="text-sm font-medium text-gray-700 mb-3">{title}</h5>
    <div className="grid grid-cols-2 gap-4">
      {/* Stacking Switch (Always visible) */}
      <div className="space-y-2">
        <Label htmlFor={`${type}_stacking`}>Stacking</Label>
        <Switch
          id={`${type}_stacking`}
          checked={layout.stacking}
          onCheckedChange={(checked) => handleFormFieldUpdate(`${path}.stacking`, checked, {
            layoutType: type
          })}
        />
      </div>

      {/* Fields shown when stacking is true */}
      {layout.stacking && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${type}_stacking_direction`}>Stacking Direction</Label>
            <Select
              value={layout.stacking_direction}
              onValueChange={(value) => handleFormFieldUpdate(`${path}.stacking_direction`, value, {
                layoutType: type
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select stacking direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="min">Min</SelectItem>
                <SelectItem value="max">Max</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}_subdividing`}>Subdividing</Label>
            <Switch
              id={`${type}_subdividing`}
              checked={layout.subdividing}
              onCheckedChange={(checked) => handleFormFieldUpdate(`${path}.subdividing`, checked, {
                layoutType: type
              })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}_2d_flatten`}>2D Flatten</Label>
            <Switch
              id={`${type}_2d_flatten`}
              checked={layout["2D_flatten"]}
              onCheckedChange={(checked) => handleFormFieldUpdate(`${path}.2D_flatten`, checked, {
                layoutType: type
              })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}_size_range`}>Size Range</Label>
            <Input
              id={`${type}_size_range`}
              value={Array.isArray(layout.size_range)
                ? layout.size_range.join(', ')
                : layout.size_range || ''}
              onChange={(e) => handleFormFieldUpdate(`${path}.size_range`, e.target.value.split(',').map(item => parseFloat(item.trim())), {
                layoutType: type
              })}
              placeholder="[0, 100] or 50"
            />
          </div>
        </>
      )}

      {/* Fields shown when stacking is false */}
      {!layout.stacking && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${type}_anchor`}>Anchor</Label>
            <Select
              value={layout.anchor}
              onValueChange={(value) => handleFormFieldUpdate(`${path}.anchor`, value, {
                layoutType: type
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select anchor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stacking_decided">Stacking Decided</SelectItem>
                <SelectItem value="min">Min</SelectItem>
                <SelectItem value="max">Max</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}_size_uniform`}>Size Uniform</Label>
            <Switch
              id={`${type}_size_uniform`}
              checked={layout.size_uniform}
              onCheckedChange={(checked) => handleFormFieldUpdate(`${path}.size_uniform`, checked, {
                layoutType: type
              })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}_size_range`}>Size Range</Label>
            <Input
              id={`${type}_size_range`}
              value={Array.isArray(layout.size_range)
                ? layout.size_range.join(', ')
                : layout.size_range || ''}
              onChange={(e) => handleFormFieldUpdate(`${path}.size_range`, e.target.value.split(',').map(item => parseFloat(item.trim())), {
                layoutType: type
              })}
              placeholder="[0, 100] or 50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}_anchor_distribute`}>Anchor Distribute</Label>
            <Select
              value={layout.anchor_distribute || ''}
              onValueChange={(value) => handleFormFieldUpdate(`${path}.anchor_distribute`, value, {
                layoutType: type
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select anchor distribute" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_value">Fixed Value</SelectItem>
                <SelectItem value="uniform_interval">Uniform Interval</SelectItem>
                <SelectItem value="flexible">Flexible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Anchor Interval only shows when anchor_distribute is uniform_interval */}
          {layout.anchor_distribute === "uniform_interval" && (
            <div className="space-y-2">
              <Label htmlFor={`${type}_anchor_interval`}>Anchor Interval</Label>
              <Input
                id={`${type}_anchor_interval`}
                type="number"
                value={layout.anchor_interval || ''}
                onChange={(e) => handleFormFieldUpdate(`${path}.anchor_interval`, e.target.value, {
                  layoutType: type
                })}
                placeholder="10"
              />
            </div>
          )}
          {/* Anchor Start only shows when anchor_distribute is uniform_interval or fixed_value */}
          {(layout.anchor_distribute === "uniform_interval" || layout.anchor_distribute === "fixed_value") && (
            <div className="space-y-2">
              <Label htmlFor={`${type}_anchor_start`}>Anchor Start</Label>
              <Input
                id={`${type}_anchor_start`}
                type="number"
                value={layout.anchor_start || ''}
                onChange={(e) => handleFormFieldUpdate(`${path}.anchor_start`, e.target.value, {
                  layoutType: type
                })}
                placeholder="0"
              />
            </div>
          )}
        </>
      )}

    </div>
  </div>
);

export const EditorForm = () => {
  const [mode, setMode] = useState<'json' | 'form'>('form');
  const [jsonText, setJsonText] = useState('');
  const [isValidJson, setIsValidJson] = useState(true);
  const { dslJson, allContainers, selectedContainerId, selectedContainer, selectedContainerChildren } = useChartStore(useShallow((state) => ({
    dslJson: state.dsl_json,
    allContainers: state.allContainers,
    selectedContainerId: state.selectedContainerId,
    selectedContainer: state.selectedContainer,
    selectedContainerChildren: state.selectedContainerChildren,
  })));

  // Update local JSON text when store changes
  useEffect(() => {
    if (dslJson && Object.keys(dslJson).length > 0) {
      const formattedJson = JSON.stringify(dslJson, null, 2);
      setJsonText(formattedJson);
      setIsValidJson(true);
    }
  }, [dslJson]);

  // Handle JSON text changes with validation
  const handleJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsedJson = JSON.parse(text);

      // Validate JSON structure
      const validateDslJson = (json: any): boolean => {
        if (!json || typeof json !== 'object') return false;
        if (!json.container_id || typeof json.container_id !== 'string') return false;
        if (!json.coordinate || !['cartesian', 'polar'].includes(json.coordinate)) return false;
        if (typeof json.if_leaf !== 'boolean') return false;
        return true;
      };

      if (validateDslJson(parsedJson)) {
        changeDslJson(parsedJson);
        setIsValidJson(true);
      } else {
        console.error('Invalid DSL JSON structure');
        setIsValidJson(false);
      }
    } catch (error) {
      // Invalid JSON syntax
      console.error('Invalid JSON syntax:', error);
      setIsValidJson(false);
    }
  };


  // Handle form mode field updates with comprehensive mapping to DSL JSON
  const handleFormFieldUpdate = (fieldPath: string, value: any, context?: {
    containerId?: string;
    dataSpecField?: string;
    layoutType?: 'x' | 'y' | 'radius' | 'angle';
    specType?: 'data' | 'temp'; // 新增：指定是 __data_specification 还是 __temp_specification
  }) => {
    useChartStore.setState((state) => {
      if (selectedContainer) {
        const specType = context?.specType || 'data';
        const specField = specType === 'data' ? '__data_specification' : '__temp_specification';

        // 如果字段路径以 __data_specification 开头，替换为对应的 specField
        let actualFieldPath = fieldPath;
        if (fieldPath.startsWith('__data_specification')) {
          actualFieldPath = fieldPath.replace('__data_specification', specField);
        } else if (fieldPath.startsWith('__temp_specification')) {
          actualFieldPath = fieldPath.replace('__temp_specification', specField);
        }

        const res = R.set(R.lensPath(actualFieldPath.split('.')), value, selectedContainer);
        state.selectedContainer = res;
      }
    });
  };

  // Handle Instance Container field updates
  const handleChildContainerUpdate = (childContainerId: string, fieldPath: string, value: any) => {
    useChartStore.setState((state) => {
      // Find the Instance Container in the selected container's children
      const childIndex = state.selectedContainerChildren?.findIndex((child: any) => child.container_id === childContainerId);
      if (childIndex !== undefined && childIndex !== -1) {
        // Update the Instance Container's field
        const updatedChildren = [...state.selectedContainerChildren];
        const updatedChild = R.set(R.lensPath(fieldPath.split('.')), value, updatedChildren[childIndex]);
        updatedChildren[childIndex] = updatedChild;

        // Update the selected container with the modified children
        state.selectedContainerChildren = updatedChildren;
      }
    });
  };

  // 渲染数据规格表单的通用函数
  const renderDataSpecificationForm = (specData: any, specType: 'data' | 'temp') => {
    if (!specData) return null;

    return (
      <Card className='pt-2 pb-4 px-0'>
        <CardHeader>
          <CardTitle>{specType === 'data' ? 'Data Spec' : 'Template Spec'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Data Type */}
          {
            !specData?.mark_specification?.is_link_mark ? (
              <div className="space-y-2">
                <Label htmlFor={`${specType}_data_type`}>Data Type</Label>
                <Select
                  value={specData.data_structure.data_type}
                  onValueChange={(value) => handleFormFieldUpdate('__data_specification.data_structure.data_type', value, { specType })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select data type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1D_LIST">1D List</SelectItem>
                    <SelectItem value="2D_LIST">2D List</SelectItem>
                    <SelectItem value="2D_MATRIX">2D Matrix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null
          }

          {/* Primary Data Size */}
          {
            !specData?.mark_specification?.is_link_mark ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${specType}_primary_dimension`}>Primary Dimension</Label>
                    <Input
                      id={`${specType}_primary_dimension`}
                      value={specData.data_structure.data_size.primary.dimension || ''}
                      onChange={(e) => handleFormFieldUpdate('__data_specification.data_structure.data_size.primary.dimension', e.target.value, { specType })}
                      placeholder="x"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${specType}_primary_number`}>Primary Number</Label>
                    <Input
                      id={`${specType}_primary_number`}
                      type="number"
                      value={specData.data_structure.data_size.primary.number || ''}
                      onChange={(e) => handleFormFieldUpdate('__data_specification.data_structure.data_size.primary.number', e.target.value, { specType })}
                      placeholder="60"
                    />
                  </div>
                </div>

                {/* Primary Explanation */}
                <div className="space-y-2">
                  <Label htmlFor={`${specType}_primary_explanation`}>Primary Explanation</Label>
                  <Input
                    id={`${specType}_primary_explanation`}
                    value={specData.data_structure.data_size.primary.explanation || ''}
                    onChange={(e) => handleFormFieldUpdate('__data_specification.data_structure.data_size.primary.explanation', e.target.value, { specType })}
                    placeholder="Description of primary data"
                  />
                </div>

                {/* Secondary Data Size */}
                {specData.data_structure.data_type !== '1D_LIST' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${specType}_secondary_dimension`}>Secondary Dimension</Label>
                        <Input
                          id={`${specType}_secondary_dimension`}
                          value={specData.data_structure.data_size.secondary?.dimension || ''}
                          onChange={(e) => handleFormFieldUpdate('__data_specification.data_structure.data_size.secondary.dimension', e.target.value, { specType })}
                          placeholder="y"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${specType}_secondary_number`}>Secondary Number</Label>
                        <Input
                          id={`${specType}_secondary_number`}
                          value={Array.isArray(specData.data_structure.data_size.secondary?.number)
                            ? specData.data_structure.data_size.secondary.number.join(', ')
                            : specData.data_structure.data_size.secondary?.number || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            // 尝试解析为数组或数字
                            if (value.includes(',')) {
                              // 如果是逗号分隔的字符串，解析为数字数组
                              const _value = value.endsWith(',') ? `${value}0` : value;
                              const arrayValue = _value.split(',').map(item => parseFloat(item.trim())).filter(num => !isNaN(num));
                              handleFormFieldUpdate('__data_specification.data_structure.data_size.secondary.number', arrayValue, { specType });
                            } else {
                              // 如果是单个数字，解析为数字
                              const numValue = parseFloat(value);
                              handleFormFieldUpdate('__data_specification.data_structure.data_size.secondary.number', isNaN(numValue) ? value : numValue, { specType });
                            }
                          }}
                          placeholder="40 或 10, 20, 30"
                        />
                      </div>
                    </div>

                    {/* Secondary Explanation */}
                    <div className="space-y-2">
                      <Label htmlFor={`${specType}_secondary_explanation`}>Secondary Explanation</Label>
                      <Input
                        id={`${specType}_secondary_explanation`}
                        value={specData.data_structure.data_size.secondary?.explanation || ''}
                        onChange={(e) => handleFormFieldUpdate('__data_specification.data_structure.data_size.secondary.explanation', e.target.value, { specType })}
                        placeholder="Description of secondary data"
                      />
                    </div>
                  </>
                )}
              </>
            ) : null}

          {/* Link Number Input - Only show when link_mark_type is node_link_type */}
          {specData?.mark_specification?.link_mark_type === 'node_link_type' && (
            <div className="space-y-2">
              <Label htmlFor={`${specType}_link_number`}>Link Number</Label>
              <Input
                id={`${specType}_link_number`}
                type="number"
                value={specData?.mark_specification?.link_number || ''}
                onChange={(e) => handleFormFieldUpdate('__data_specification.mark_specification.link_number', parseInt(e.target.value), { specType })}
                placeholder="Enter link number"
              />
            </div>
          )}

          {/* Layout Specification */}
          <CardTitle>Layout Specification</CardTitle>
          {/* Render Layout Editors */}
          {specData.layout_specification.x && (
            <LayoutEditor
              type="x"
              layout={specData.layout_specification.x}
              title="X Layout"
              path="__data_specification.layout_specification.x"
              handleFormFieldUpdate={(fieldPath, value, context) => handleFormFieldUpdate(fieldPath, value, { ...context, specType })}
            />
          )}

          {specData.layout_specification.y && (
            <LayoutEditor
              type="y"
              layout={specData.layout_specification.y}
              title="Y Layout"
              path="__data_specification.layout_specification.y"
              handleFormFieldUpdate={(fieldPath, value, context) => handleFormFieldUpdate(fieldPath, value, { ...context, specType })}
            />
          )}

          {specData.layout_specification.radius && (
            <LayoutEditor
              type="radius"
              layout={specData.layout_specification.radius}
              title="Radius Layout"
              path="__data_specification.layout_specification.radius"
              handleFormFieldUpdate={(fieldPath, value, context) => handleFormFieldUpdate(fieldPath, value, { ...context, specType })}
            />
          )}

          {specData.layout_specification.angle && (
            <LayoutEditor
              type="angle"
              layout={specData.layout_specification.angle}
              title="Angle Layout"
              path="__data_specification.layout_specification.angle"
              handleFormFieldUpdate={(fieldPath, value, context) => handleFormFieldUpdate(fieldPath, value, { ...context, specType })}
            />
          )}

          {/* Source and Target editors */}
          {
            specData?.mark_specification?.link_mark_type === 'node_link_type' && (
              <div className="space-y-4">
                {/* Source Editor */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-3">Source Links</h5>
                  {specData.layout_specification.source ? (
                    <div className="space-y-3">
                      {specData.layout_specification.source.map((item: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <Input
                            placeholder="Container ID"
                            value={item.container_id || ''}
                            onChange={(e) => {
                              const updatedSource = [...(specData?.layout_specification?.source || [])];
                              updatedSource[index] = { ...updatedSource[index], container_id: e.target.value };
                              handleFormFieldUpdate('__data_specification.layout_specification.source', updatedSource, { specType });
                            }}
                            className="flex-1"
                          />
                          <Select
                            value={item.linked_object || ''}
                            onValueChange={(value) => {
                              const updatedSource = [...(specData?.layout_specification?.source || [])];
                              updatedSource[index] = { ...updatedSource[index], linked_object: value as "mark" | "container" };
                              handleFormFieldUpdate('__data_specification.layout_specification.source', updatedSource, { specType });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Linked Object" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="container">Container</SelectItem>
                              <SelectItem value="mark">Mark</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              const updatedSource = [...(specData?.layout_specification?.source || [])].filter((_: any, i: number) => i !== index);
                              handleFormFieldUpdate('__data_specification.layout_specification.source', updatedSource, { specType });
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const updatedSource = [...(specData?.layout_specification?.source || []), { container_id: '', linked_object: 'container' }];
                          handleFormFieldUpdate('__data_specification.layout_specification.source', updatedSource, { specType });
                        }}
                      >
                        Add Source Link
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleFormFieldUpdate('__data_specification.layout_specification.source', [{ container_id: '', linked_object: 'container' }], { specType });
                      }}
                    >
                      Add Source Links
                    </Button>
                  )}
                </div>

                {/* Target Editor */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-3">Target Links</h5>
                  {specData.layout_specification.target ? (
                    <div className="space-y-3">
                      {specData.layout_specification.target.map((item: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <Input
                            placeholder="Container ID"
                            value={item.container_id || ''}
                            onChange={(e) => {
                              const updatedTarget = [...(specData?.layout_specification?.target || [])];
                              updatedTarget[index] = { ...updatedTarget[index], container_id: e.target.value };
                              handleFormFieldUpdate('__data_specification.layout_specification.target', updatedTarget, { specType });
                            }}
                            className="flex-1"
                          />
                          <Select
                            value={item.linked_object || ''}
                            onValueChange={(value) => {
                              const updatedTarget = [...(specData?.layout_specification?.target || [])];
                              updatedTarget[index] = { ...updatedTarget[index], linked_object: value as "container" | "mark" };
                              handleFormFieldUpdate('__data_specification.layout_specification.target', updatedTarget, { specType });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Linked Object" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="container">Container</SelectItem>
                              <SelectItem value="mark">Mark</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              const updatedTarget = [...(specData?.layout_specification?.target || [])].filter((_: any, i: number) => i !== index);
                              handleFormFieldUpdate('__data_specification.layout_specification.target', updatedTarget, { specType });
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const updatedTarget = [...(specData?.layout_specification?.target || []), { container_id: '', linked_object: 'container' }];
                          handleFormFieldUpdate('__data_specification.layout_specification.target', updatedTarget, { specType });
                        }}
                      >
                        Add Target Link
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleFormFieldUpdate('__data_specification.layout_specification.target', [{ container_id: '', linked_object: 'container' }], { specType });
                      }}
                    >
                      Add Target Links
                    </Button>
                  )}
                </div>
              </div>
            )
          }
        </CardContent>
      </Card>
    );
  };

  return (
    <Card className="flex flex-col h-full w-full min-h-0">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <CardTitle className="text-lg font-semibold">DSL Editor</CardTitle>
        <div className="flex space-x-2">
          <Button
            variant={'outline'}
            size="sm"
            onClick={() => setMode(mode === 'form' ? 'json' : 'form')}
          >
            {mode === 'form' ? 'JSON Mode' : 'Form Mode'}
          </Button>
          {
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedContainer}
              onClick={() => applyContainerChanges()}
              className="ml-auto"
            >
              Apply Changes
            </Button>
          }
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-4 overflow-auto">
        {mode === 'form' ? (
          <div className="space-y-4">
            {/* Container Selector */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Select Container to Edit
              </label>
              <Select
                value={selectedContainerId || ''}
                onValueChange={(value) => handleChangeContainer(value)}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Select coordinate system" />
                </SelectTrigger>
                <SelectContent>
                  {allContainers.map((container) => (
                    <SelectItem key={container.container_id} value={container.container_id}>
                      {container.container_id} - {container.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Container Cards - Show when no container is selected */}
            {!selectedContainerId && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">All Containers</h3>
                <div className="grid grid-cols-1 gap-3">
                  {allContainers.map((container) => (
                    <div
                      key={container.container_id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-colors cursor-pointer"
                      onClick={() => handleChangeContainer(container.container_id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              ID: {container.container_id}
                            </span>
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${container.if_leaf
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                              }`}>
                              {container.if_leaf ? 'Leaf' : 'Container'}
                            </span>
                            {
                              container.mark_type && (
                                <span className='inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800'>{container.mark_type}</span>
                              )
                            }
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {container.description}
                          </p>
                          <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                            <span>Coordinate: {container.coordinate}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Container Editor - Show when a container is selected */}
            {selectedContainer && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm bg-blue-100 px-2 py-1 rounded font-medium text-gray-800">
                    {selectedContainerId}
                  </h3>
                  <Button
                    variant="secondary"
                    onClick={() => handleChangeContainer(null)}
                  >
                    Back to All Containers
                  </Button>
                </div>

                {/* Basic Container Properties */}
                <div className="space-y-4">
                  {/* <h4 className="text-md font-medium text-gray-700">Basic Properties</h4> */}

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={selectedContainer.description || ''}
                      onChange={(e) => handleFormFieldUpdate('description', e.target.value)}
                      placeholder="Enter container description"
                    />
                  </div>

                  {/* Coordinate */}
                  <div className="space-y-2">
                    <Label htmlFor="coordinate">Coordinate</Label>
                    <Select
                      value={selectedContainer.coordinate}
                      onValueChange={(value) => handleFormFieldUpdate('coordinate', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select coordinate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cartesian">Cartesian</SelectItem>
                        <SelectItem value="polar">Polar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mark Type */}
                  {selectedContainer.if_leaf && (
                    <div className="space-y-2">
                      <Label htmlFor="mark_type">Mark Type</Label>
                      <Select
                        value={selectedContainer.__data_specification?.mark_specification.mark_type || ''}
                        onValueChange={(value) => handleFormFieldUpdate('__data_specification.mark_specification.mark_type', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select mark type" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(MarkType).map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                
                {
                  selectedContainer && (
                    <div key={selectedContainer.container_id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-sm font-medium text-gray-700">
                          Coordinate System: {selectedContainer.container_id}
                        </h5>
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {selectedContainer.coordinate}
                        </span>
                      </div>

                      {selectedContainer.coordinate === 'cartesian' ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-x1`}>X1</Label>
                            <Input
                              id={`${selectedContainer.container_id}-x1`}
                              value={selectedContainer.coordinate_system.x1 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.x1', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-x2`}>X2</Label>
                            <Input
                              id={`${selectedContainer.container_id}-x2`}
                              value={selectedContainer.coordinate_system.x2 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.x2', e.target.value)}
                              placeholder="100"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-y1`}>Y1</Label>
                            <Input
                              id={`${selectedContainer.container_id}-y1`}
                              value={selectedContainer.coordinate_system.y1 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.y1', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-y2`}>Y2</Label>
                            <Input
                              id={`${selectedContainer.container_id}-y2`}
                              value={selectedContainer.coordinate_system.y2 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.y2', e.target.value)}
                              placeholder="100"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-a1`}>A1 (Start Angle)</Label>
                            <Input
                              id={`${selectedContainer.container_id}-a1`}
                              value={selectedContainer.coordinate_system.a1 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.a1', e.target.value)}
                              placeholder="-90"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-a2`}>A2 (End Angle)</Label>
                            <Input
                              id={`${selectedContainer.container_id}-a2`}
                              value={selectedContainer.coordinate_system.a2 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.a2', e.target.value)}
                              placeholder="270"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-r1`}>R1 (Inner Radius)</Label>
                            <Input
                              id={`${selectedContainer.container_id}-r1`}
                              value={selectedContainer.coordinate_system.r1 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.r1', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${selectedContainer.container_id}-r2`}>R2 (Outer Radius)</Label>
                            <Input
                              id={`${selectedContainer.container_id}-r2`}
                              value={selectedContainer.coordinate_system.r2 || ''}
                              onChange={(e) => handleFormFieldUpdate('coordinate_system.r2', e.target.value)}
                              placeholder="50"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
                

                {renderDataSpecificationForm(selectedContainer.__temp_specification, 'temp')}


                {/* Instance Container Fields - Moved to the end */}
                {selectedContainer?.__temp_specification && (
                  <div className="space-y-4">
                    <h4 className="text-md font-medium text-gray-700">Instance Container</h4>

                    {selectedContainerChildren.length > 0 ? (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto">
                        {selectedContainerChildren.map((child, index) => (
                          <div key={child.container_id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-sm font-medium text-gray-700">
                                Instance Container: {child.container_id}
                              </h5>
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {child.coordinate}
                              </span>
                            </div>

                            {child.coordinate === 'cartesian' ? (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-x1`}>X1</Label>
                                  <Input
                                    id={`${child.container_id}-x1`}
                                    value={child.coordinate_system.x1 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.x1', parseFloat(e.target.value))}
                                    placeholder="0"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-x2`}>X2</Label>
                                  <Input
                                    id={`${child.container_id}-x2`}
                                    value={child.coordinate_system.x2 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.x2', parseFloat(e.target.value))}
                                    placeholder="100"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-y1`}>Y1</Label>
                                  <Input
                                    id={`${child.container_id}-y1`}
                                    value={child.coordinate_system.y1 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.y1', parseFloat(e.target.value))}
                                    placeholder="0"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-y2`}>Y2</Label>
                                  <Input
                                    id={`${child.container_id}-y2`}
                                    value={child.coordinate_system.y2 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.y2', parseFloat(e.target.value))}
                                    placeholder="100"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-a1`}>A1 (Start Angle)</Label>
                                  <Input
                                    id={`${child.container_id}-a1`}
                                    value={child.coordinate_system.a1 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.a1', parseFloat(e.target.value))}
                                    placeholder="-90"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-a2`}>A2 (End Angle)</Label>
                                  <Input
                                    id={`${child.container_id}-a2`}
                                    value={child.coordinate_system.a2 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.a2', parseFloat(e.target.value))}
                                    placeholder="270"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-r1`}>R1 (Inner Radius)</Label>
                                  <Input
                                    id={`${child.container_id}-r1`}
                                    value={child.coordinate_system.r1 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.r1', parseFloat(e.target.value))}
                                    placeholder="0"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${child.container_id}-r2`}>R2 (Outer Radius)</Label>
                                  <Input
                                    id={`${child.container_id}-r2`}
                                    value={child.coordinate_system.r2 || ''}
                                    onChange={(e) => handleChildContainerUpdate(child.container_id, 'coordinate_system.r2', parseFloat(e.target.value))}
                                    placeholder="50"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        No Instance Containers found
                      </div>
                    )}
                  </div>
                )}
                
                {renderDataSpecificationForm(selectedContainer.__data_specification, 'data')}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* JSON validation status */}
            <div className="flex items-center mb-2">
              <div className={`flex items-center space-x-2 px-3 py-1 rounded text-sm ${isValidJson
                ? 'bg-green-100 text-green-800 border border-green-200'
                : 'bg-red-100 text-red-800 border border-red-200'
                }`}>
                <div className={`w-2 h-2 rounded-full ${isValidJson ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                <span>{isValidJson ? 'Valid JSON' : 'Invalid JSON'}</span>
              </div>
            </div>

            <textarea
              className={`w-full flex-1 border rounded p-3 text-sm font-mono resize-none ${isValidJson
                ? 'border-gray-300 focus:border-blue-500'
                : 'border-red-300 focus:border-red-500'
                }`}
              placeholder="Enter your JSON configuration here..."
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={10}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};