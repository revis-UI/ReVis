import { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useChartStore, toggleShowContainers } from '../model/editor';
import { useShallow } from 'zustand/shallow';
import { useSize } from 'ahooks';
import styles from '../editor.module.less';
import { Download, FileJson } from 'lucide-react';

export const EditorPreview = () => {
  const previewRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { chart, dslJson, showContainers } = useChartStore(useShallow((state) => ({
    chart: state.chart,
    dslJson: state.dsl_json,
    showContainers: state.showContainers,
  })));

  const size = useSize(previewRef);
  const svgSize = Math.min(size?.width || 0, size?.height || 0);

  // Download DSL JSON function
  const downloadDSLJson = () => {
    if (!dslJson) return;

    const jsonString = JSON.stringify(dslJson, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dsl-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download SVG function
  const downloadSVG = () => {
    if (!svgRef.current) return;

    const svgElement = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const { dsl_json } = useChartStore.getState();
    if (svgRef.current && dsl_json && svgSize) {
      try {
        chart.initSVGDOM(svgRef.current);

        chart.parseDSL(dsl_json);
        chart.drawData();
      } catch (error) {
        console.error('Error rendering chart preview:', error);
      }
    }
  }, [svgSize]);

  return (
    <Card className="flex flex-col h-full w-full min-h-0">
      <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Visualization Result Panel</CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadDSLJson}
            disabled={!dslJson}
            title="Download DSL JSON"
          >
            <FileJson className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadSVG}
            disabled={!svgRef.current}
            title="Download SVG"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant={showContainers ? "primary" : "outline"}
            size="sm"
            onClick={toggleShowContainers}
          >
            {showContainers ? "Hide Containers" : "Show Containers"}
          </Button>
        </div>
      </CardHeader>
      <CardContent ref={previewRef} className="flex-1 p-4 overflow-auto bg-gray-50">

        <div className="w-full h-full min-h-[200px]">
          {!dslJson && (
            <div className="flex items-center justify-center h-full text-gray-500">
              No DSL data available for preview
            </div>
          )}
          <svg
            ref={svgRef}
            width={svgSize}
            height={svgSize}
            onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onContextMenuCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className={`border-0 max-w-full max-h-full editor-preview ${!showContainers && styles['editor-preview__non-container']}`}
          />
        </div>
      </CardContent>
    </Card>
  );
};