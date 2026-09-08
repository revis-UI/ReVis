import { serializePreviewSVG } from '../model/svgExport';
import { CoordinateGuideControls } from './CoordinateGuideControls';
import { DataModeControls } from './DataModeControls';
import { changeDataMode } from '../model/editor';
import type { DataMode } from '../model/dataSources';
import { useRef, useEffect, useState } from 'react';
import { usesLocalDSLService } from '@/services/dsl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useChartStore, toggleShowContainers } from '../model/editor';
import { useShallow } from 'zustand/shallow';
import { useSize } from 'ahooks';
import styles from '../editor.module.less';
import { Download, FileJson } from 'lucide-react';
import { createSeededRandom } from '../model/seededRandom';

export const EditorPreview = () => {
  const [renderError, setRenderError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { chart, dslJson, showContainers, isSaving } = useChartStore(useShallow((state) => ({
    chart: state.chart,
    dslJson: state.dsl_json,
    showContainers: state.showContainers,
    isSaving: state.isSaving,
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
    const svgData = serializePreviewSVG(svgElement);
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
        setRenderError('');
        const random = createSeededRandom(dsl_json.metadata.generation_seed);
        chart.setRandomGenerator(random.next);
        chart.reset();
        chart.initSVGDOM(svgRef.current);
        chart.parseDSL(dsl_json);
        chart.restoreViewSnapshot(dsl_json.view_data);
        chart.drawData();
      } catch (error) {
        setRenderError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [chart, dslJson, svgSize]);

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
      <div className="px-4 py-2 border-b">
        <DataModeControls mode={(dslJson?.data_mode??'reference') as DataMode} onChange={changeDataMode} disabled={!dslJson||isSaving}/>
      </div>
      {!usesLocalDSLService && <p className="px-4 py-1 text-xs text-gray-500">Edits are saved in this tab until refresh. Download DSL JSON to keep them.</p>}
      {renderError && <p role="alert" className="px-4 text-red-700">{renderError}</p>}
      <CoordinateGuideControls />
      <CardContent className="flex flex-1 min-h-0 min-w-0 p-4 overflow-hidden bg-gray-50">

        <div ref={previewRef} className="flex flex-1 min-h-0 min-w-0 items-center justify-center">
          {!dslJson && (
            <div className="flex items-center justify-center h-full text-gray-500">
              No DSL data available for preview
            </div>
          )}
          <svg
            hidden={!dslJson || Boolean(renderError)}
            ref={svgRef}
            width={svgSize}
            height={svgSize}
            onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onContextMenuCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
            preserveAspectRatio="xMidYMid meet"
            className={`block shrink-0 border-0 max-w-full max-h-full editor-preview ${!showContainers && styles['editor-preview__non-container']}`}
          />
        </div>
      </CardContent>
    </Card>
  );
};
