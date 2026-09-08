import { DataModeControls } from './DataModeControls';
import { buildDataModeCandidate } from '../model/dataMode';
import { commitDocument } from '../model/document';
import type { DataMode } from '../model/dataSources';
import styles from '../editor.module.less';
import { useEffect, useRef, useState } from 'react';
import { D3Chart } from '../../D3Chart';
import { visualChart } from '../model/Chart';
import { loadData, resolveDataCategory } from '../utils';
import { loadDSLFile, saveDSLFile, usesLocalDSLService } from '@/services/dsl';
import { previewDocument } from '../model/previewDocument';
import { prepareDocumentEdit, validateRenderableDocument } from '../model/editor';
import type { ChartDocument } from '../model/document';
import { useSize } from 'ahooks';
import { migrateDocument } from '../model/document';
import { createSeededRandom } from '../model/seededRandom';

interface GalleryItem {
  id: string;
  baseFileName: string;
  title: string;
  imageSrc: string;
}

export const Gallery = () => {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [currentJsonData, setCurrentJsonData] = useState<string>('');
  const [isJsonValid, setIsJsonValid] = useState<boolean>(true);
  const [lastAppliedJson, setLastAppliedJson] = useState<string>('');

  const [dataMode, setDataMode] = useState<DataMode>('reference');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showJson, setShowJson] = useState(false);
  const loadSequence = useRef(0);
  const appliedDocument = useRef<ChartDocument | null>(null);
  const appliedJson = useRef('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [editError, setEditError] = useState('');
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewDOMRef = useRef<HTMLDivElement>(null);

  const previewSize = useSize(previewDOMRef.current);

  const width = previewSize?.width || 320;
  const height = previewSize?.height || 350;

  const previewW = Math.min(width, height);

  useEffect(() => {
    // 从 imagev3 自动收集图片：basic_charts 与 composite，并支持 png/jpg
    const basicImages = import.meta.glob('../../../imagev3/basic_charts/*.{png,jpg}', { eager: true }) as Record<string, any>;
    const compositeImages = import.meta.glob('../../../imagev3/composite/*.{png,jpg}', { eager: true }) as Record<string, any>;

    const toItem = (path: string, index: number): GalleryItem => {
      const file = path.split('/').pop() || '';
      const name = file.replace(/\.(png|jpg)$/i, '');
      const title = name.replace(/__/g, ' ').replace(/_/g, ' ');
      const imageSrc: string = (basicImages[path]?.default || compositeImages[path]?.default || '') as string;
      // 将 v3 基础图名映射为可加载数据的键；如果是复合图名则原样返回
      return {
        id: `item-${index}`,
        baseFileName: name,
        title,
        imageSrc,
      };
    };

    const basicItems: GalleryItem[] = Object.keys(basicImages).map((p, i) => toItem(p, i));
    const offset = basicItems.length;
    const compositeItems: GalleryItem[] = Object.keys(compositeImages).map((p, i) => toItem(p, offset + i));
    const items = [...basicItems, ...compositeItems];

    setGalleryItems(items);

    let stored: string | null = null;
    try { stored = sessionStorage.getItem('revis.gallery.selection'); } catch {}
    if (items.length > 0) void handleItemClick(items.find(i => i.baseFileName === stored) || items[0]);
    return () => {
      loadSequence.current++;
      if(editTimer.current) clearTimeout(editTimer.current);
    };
  }, []);

  const handleItemClick = async (item: GalleryItem) => {
    const request = ++loadSequence.current;
    if(editTimer.current) clearTimeout(editTimer.current);
    setSelectedItem(item);
    setIsLoading(true);
    setLoadError('');
    setEditError(''); setSaveMessage('');
    appliedDocument.current = null; setCurrentJsonData('');
    try {
      const data = await loadData(item.baseFileName, 'gallery');
      if (request !== loadSequence.current) return;
      if (!data) throw new Error('Chart data is unavailable.');
      const jsonString = JSON.stringify(data, null, 2);
      setCurrentJsonData(jsonString);
      if (!updateChartWithJson(jsonString)) throw new Error('This chart cannot be rendered. Check its DSL and reference data.');
      try { sessionStorage.setItem('revis.gallery.selection', item.baseFileName); } catch {}
    } catch(error) {
      if(request === loadSequence.current) setLoadError(error instanceof Error ? error.message : 'Unable to load chart.');
    } finally {
      if(request === loadSequence.current) setIsLoading(false);
    }
  };

  const handleJsonChange = (value: string) => {
    setCurrentJsonData(value);
    if(editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => updateChartWithJson(value), 250);
  };

  const updateChartWithJson = (jsonData?: string, prepared?: ChartDocument) => {
    const dataToUse = jsonData || currentJsonData;
    if (!dataToUse) return;
    if (!prepared && appliedDocument.current && appliedJson.current === dataToUse) return appliedDocument.current;
    try {
      const parsedData = JSON.parse(dataToUse);
      const document = prepared ? validateRenderableDocument(prepared) : appliedDocument.current
        ? prepareDocumentEdit(appliedDocument.current, parsedData)
        : validateRenderableDocument(parsedData);
      const random = createSeededRandom(document.metadata.generation_seed);
      const hasPersistedView =
        Object.keys(document.view_data.marks).length > 0
        || Object.keys(document.view_data.containers).length > 0;
      visualChart.setRandomGenerator(random.next);
      visualChart.reset();
      visualChart.parseDSL(document);
      if (hasPersistedView) {
        visualChart.restoreViewSnapshot(document.view_data);
      }
      visualChart.drawData();
      const appliedText = JSON.stringify(previewDocument(document), null, 2);
      appliedJson.current = appliedText;
      setCurrentJsonData(appliedText);
      setLastAppliedJson(appliedText);
      setDataMode(document.data_mode === 'generated' ? 'generated' : 'reference');
      appliedDocument.current = document;
      setIsJsonValid(true); setEditError('');
      return document;
    } catch (error) {
      setIsJsonValid(false);
      setEditError(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const resetToDefault = () => { if (selectedItem) void handleItemClick(selectedItem); };

  const saveAndRedraw = async () => {
    if (!selectedItem || isLoading || saving) return;
    if(editTimer.current) clearTimeout(editTimer.current);
    const applied = updateChartWithJson(currentJsonData);
    if (!applied) return;
    const fileName = selectedItem.baseFileName;
    const request = loadSequence.current;
    setSaving(true); setSaveMessage('');
    try {
      const category = await resolveDataCategory(fileName);
      if (!category) throw new Error('Chart data is unavailable.');
      const loaded = await loadDSLFile(category, `${fileName}.json`);
      const next = commitDocument(migrateDocument(loaded.content), applied, {source:'json'}).document;
      await saveDSLFile(category, `${fileName}.json`, next, loaded.hash);
      if (request === loadSequence.current) setSaveMessage(usesLocalDSLService
        ? 'Saved successfully.' : 'Saved for this tab until refresh. Export JSON to keep a copy.');
    } catch(error) {
      if (request === loadSequence.current) setEditError(error instanceof Error ? error.message : 'Save failed.');
    } finally { setSaving(false); }
  };

  const changeMode = (mode: DataMode) => {
    if(editTimer.current) clearTimeout(editTimer.current);
    const current = updateChartWithJson(currentJsonData);
    if (!current) throw new Error('Fix the DSL before generating data.');
    const candidate = buildDataModeCandidate(current, mode);
    const text = JSON.stringify(previewDocument(candidate), null, 2);
    const applied = updateChartWithJson(text, candidate);
    if (!applied) throw new Error('Unable to render the requested data mode.');
    setCurrentJsonData(text);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* 顶部导航 - 显示所有项目缩略图 */}
      <div className="flex flex-wrap overflow-y-auto p-4 bg-gray-50 border-b min-h-[140px] max-h-[300px]">
        {galleryItems.map((item) => (
          <div
            key={item.id}
            role="button" tabIndex={saving ? -1 : 0} aria-label={`Open ${item.title}`} aria-pressed={selectedItem?.id === item.id}
            onKeyDown={e => { if (!saving && (e.key === 'Enter' || e.key === ' ')) {e.preventDefault(); void handleItemClick(item);} }}
            className={`m-1 w-25 overflow-hidden cursor-pointer border-2 rounded-lg transition-all ${selectedItem?.id === item.id
              ? 'border-blue-500 shadow-lg scale-105'
              : 'border-gray-300 hover:border-gray-400'
              }`}
            onClick={() => { if(!saving) void handleItemClick(item); }}
          >
            <div className='w-24 h-24'>
              <img
                src={item.imageSrc}
                alt={item.title}
                className="w-full h-full object-contain rounded bg-white"
              />
            </div>
            <div className="text-xs text-center mt-1 truncate px-1">
              {item.title}
            </div>
          </div>
        ))}
      </div>

      {/* 主内容区域 - 三列分割 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：静态图片 */}
        <div className="flex-1 p-4 flex flex-col items-center justify-center bg-white border-r">
          {selectedItem && (
            <div className="text-center w-full flex flex-col items-center">
              <h2 className="text-xl font-bold mb-4">{selectedItem.title}</h2>
              <img
                src={selectedItem.imageSrc}
                alt={selectedItem.title}
                className="max-w-full max-h-80 object-contain shadow-lg rounded-lg mx-auto"
              />
            </div>
          )}
        </div>

        {/* 中间：D3 图表 */}
        <div className="flex-1 min-w-0 min-h-0 p-4 flex flex-col items-center justify-center bg-gray-50 border-r">
          <div className="text-center w-full h-full min-h-0 flex flex-col items-center">
            <h2 className="text-xl font-bold mb-4">D3 Visualization</h2>
            <DataModeControls mode={dataMode} onChange={changeMode} key={selectedItem?.id} disabled={saving||isLoading||!isJsonValid||!currentJsonData}/>
            <p className="text-xs text-gray-500 my-2">{usesLocalDSLService ? 'Preview changes; use Save to keep this data.' : 'Edits last for this session. Export JSON to keep a copy.'}</p>
            {isLoading && <p role="status">Loading chart…</p>}
            {loadError && <p role="alert">{loadError}</p>}
            <div ref={previewDOMRef} style={{visibility:isLoading || loadError ? 'hidden' : 'visible'}} className={`flex-1 min-h-0 w-full flex items-center justify-center editor-preview ${styles['gallery-preview']}`}>
              <D3Chart
                initSVG={(svg: SVGSVGElement) => {
                  visualChart.initSVGDOM(svg);
                }}
                style={{
                  width: previewW,
                  height: previewW,
                }}
              />
            </div>
          </div>
        </div>

        {/* 右侧：JSON 编辑器 */}
        <div className="flex-1 min-w-0 min-h-0 p-4 flex flex-col bg-white">
          {selectedItem && (
            <div className="flex flex-col h-full">
              <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
                <h2 className="text-xl font-bold">JSON Editor</h2>
                <div className="flex gap-2">
                  <button onClick={() => setShowJson(v => !v)} className="px-3 py-2 rounded text-sm">
                    {showJson ? 'Hide JSON' : 'Show JSON'}
                  </button>
                  <button disabled={saving || isLoading || !isJsonValid || !currentJsonData} onClick={() => {
                    if(editTimer.current) clearTimeout(editTimer.current);
                    const applied = updateChartWithJson(currentJsonData); if(!applied) return;
                    const url=URL.createObjectURL(new Blob([JSON.stringify(previewDocument(applied), null, 2)],{type:'application/json'}));
                    const link=document.createElement('a');link.href=url;link.download=`${selectedItem.baseFileName}.json`;link.click();URL.revokeObjectURL(url);
                  }} className="px-3 py-2 rounded text-sm">Export JSON</button>
                  <button
                    disabled={saving || isLoading}
                    onClick={resetToDefault}
                    className="px-3 py-2 rounded text-sm font-medium !bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    disabled={saving || isLoading || !isJsonValid || !currentJsonData}
                    onClick={saveAndRedraw}
                    className="px-3 py-2 rounded text-sm font-medium !bg-green-500 text-white hover:bg-green-600 cursor-pointer"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              {editError && <p role="alert" className="mb-2 text-sm text-red-700">{editError}</p>}
              {saveMessage && <p role="status" className="mb-2 text-sm text-green-700">{saveMessage}</p>}
              <div className="flex-1 min-h-0 relative">
                {showJson ? <textarea aria-label="Gallery DSL JSON" disabled={saving || isLoading}
                  value={currentJsonData}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className={`w-full h-full p-3 border rounded font-mono text-sm resize-none ${isJsonValid ? 'border-gray-300' : 'border-red-500'
                    }`}
                  placeholder="Edit JSON data here..."
                /> : <p className="p-4 text-sm text-gray-500">Open the JSON editor to edit this chart, or export its current data.</p>}
                {!isJsonValid && (
                  <div className="absolute bottom-2 left-2 text-red-500 text-xs bg-red-50 px-2 py-1 rounded">
                    Invalid DSL — changes not applied
                  </div>
                )}
                {isJsonValid && currentJsonData !== lastAppliedJson && (
                  <div className="absolute bottom-2 left-2 text-blue-500 text-xs bg-blue-50 px-2 py-1 rounded">
                    Changes pending
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                <p>• JSON changes are automatically applied when valid; Save before switching charts or opening Editor</p>
                <p>• Use "Reset" to reload the last saved data</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
