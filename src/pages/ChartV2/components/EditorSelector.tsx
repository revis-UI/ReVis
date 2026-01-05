import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import React, {  useEffect, useRef, useState } from 'react';
import { getImagePath } from '../utils';
import { changeDslFile,  useChartStore } from '../model/editor';
import { useShallow } from 'zustand/shallow';
import * as d3 from 'd3';
import { JSON_FILES } from '@/generated/json-files';
import { useSize } from 'ahooks';
import { Upload } from 'lucide-react';

export const EditorSelector: React.FC = () => {

  // Get the visualChart instance and update function from context
 const { dsl_file, selectedContainerId, hoveredContainerId, chart } =
  useChartStore(useShallow((state) => ({
    dsl_file: state.dsl_file,
    selectedContainerId: state.selectedContainerId,
    hoveredContainerId: state.hoveredContainerId,
    chart: state.chart,
  })));
  const imageRef = useRef<HTMLImageElement>(null);

  const [imageSrc, setImageSrc] = useState('');

  useEffect(() => {
    getImagePath(dsl_file).then((path) => setImageSrc(path));
  }, [dsl_file]);

  // Upload image function
  const handleUploadImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result) {
            setImageSrc(result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };
  
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useSize(imageRef);
  const svgSize = Math.max(size?.width || 0, size?.height || 0);

 
  useEffect(() => {
    if (!svgRef.current) return;

    const overlay = d3.select(svgRef.current);
    // Always clear previous overlay first
    overlay.selectAll('*').remove();

    // Hover-only highlight: draw overlay only when hovering a container
    if (hoveredContainerId) {
      chart.drawContainer(hoveredContainerId, overlay);
    }
    // When not hovering, keep overlay cleared to restore normal state
  }, [hoveredContainerId, chart, dsl_file]);

  return (
    <Card className="flex flex-col h-full w-full min-h-0">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <CardTitle className="text-lg font-semibold">Image Preview Panel</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleUploadImage}
            title="Upload reference image"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Select value={dsl_file} onValueChange={changeDslFile}>
            <SelectTrigger className="w-[200px]" size="sm">
              <SelectValue placeholder="Select chart type" />
            </SelectTrigger>
            <SelectContent>
              {JSON_FILES.map((chart) => (
                <SelectItem key={chart} value={chart}>
                  {chart.replace(/_/g, ' ').replace(/\d+__/g, '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      {dsl_file && (
        <CardContent className="flex-1 p-4 overflow-hidden">
          <div className="relative flex items-center justify-center h-full w-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt={`${dsl_file} reference`}
                className="max-h-full max-w-full object-contain"
              />
            )}

            {/* 图片加载失败时的占位符 */}
            {!imageSrc && (
              <div className="flex flex-col items-center justify-center text-gray-400">
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">No reference image available</div>
              </div>
            )}
            <svg
              ref={svgRef}
              width={svgSize}
              height={svgSize}
              className={`absolute border-0`}
            />
          </div>
        </CardContent>)}
    </Card>
  );
};