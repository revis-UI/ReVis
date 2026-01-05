import { useEffect, useRef, useState } from 'react';
import { D3Chart } from '../../D3Chart';
import { visualChart } from '../model/Chart';
import { loadData,  } from '../utils';
import { useSize } from 'ahooks';

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

  const previewDOMRef = useRef<HTMLDivElement>(null);

  const previewSize = useSize(previewDOMRef.current);

  const width = previewSize?.width || 320;
  const height = (previewSize?.height || 350) - 30;

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

    // 默认选择第一个项目并加载对应数据
    if (items.length > 0) {
      const first = items[0];
      setSelectedItem(first);
      loadData(first.baseFileName, 'gallery').then(data => {
        if (data) {
          const jsonString = JSON.stringify(data, null, 2);
          setCurrentJsonData(jsonString);
          setIsJsonValid(true);
          updateChartWithJson(jsonString);
        }
      });
    }
  }, []);

  // 图片路径直接使用 glob 返回的 imageSrc

  const handleItemClick = async (item: GalleryItem) => {
    setSelectedItem(item);
    const data = await loadData(item.baseFileName, 'gallery');
    if (data) {
      const jsonString = JSON.stringify(data, null, 2);
      setCurrentJsonData(jsonString);
      setIsJsonValid(true);
      // 切换项目时自动应用 JSON 数据
      updateChartWithJson(jsonString);
    }
  };

  const handleJsonChange = (value: string) => {
    setCurrentJsonData(value);
    try {
      JSON.parse(value);
      setIsJsonValid(true);
      // 如果 JSON 有效且与上次应用的不同，自动更新图表
      if (value !== lastAppliedJson) {
        updateChartWithJson(value);
      }
    } catch (error) {
      setIsJsonValid(false);
    }
  };

  const updateChartWithJson = (jsonData?: string) => {
    const dataToUse = jsonData || currentJsonData;
    if (!isJsonValid || !dataToUse) return;
    try {
      const parsedData = JSON.parse(dataToUse);
      visualChart.reset();
      visualChart.parseDSL(parsedData);
      visualChart.drawData();
      setLastAppliedJson(dataToUse);
    } catch (error) {
      console.error('Failed to update chart with JSON:', error);
    }
  };

  const resetToDefault = async () => {
    if (!selectedItem) return;

    const data = await loadData(selectedItem.baseFileName, 'gallery');
    if (data) {
      const jsonString = JSON.stringify(data, null, 2);
      setCurrentJsonData(jsonString);
      setIsJsonValid(true);
      updateChartWithJson(jsonString);
    }
  };

  const saveAndRedraw = async () => {
    if (!selectedItem || !isJsonValid) return;

    try {
      // 重新绘制图表
      updateChartWithJson(currentJsonData);

      // 更新对应的JSON文件
      const parsedData = JSON.parse(currentJsonData);
      const jsonString = JSON.stringify(parsedData, null, 2);

      // 确定文件路径
      const fileName = selectedItem.baseFileName;
      let filePath = '';

      // 检查文件在哪个目录下
      try {
        await import(`../../../datav3/basic_charts/${fileName}.json`);
        filePath = `src/datav3/basic_charts/${fileName}.json`;
      } catch (e) {
        try {
          await import(`../../../datav3/composite/${fileName}.json`);
          filePath = `src/datav3/composite/${fileName}.json`;
        } catch (e2) {
          console.error('Cannot find JSON file for:', fileName);
          return;
        }
      }

      // 调用API保存文件
      try {
        const response = await fetch(`http://localhost:3000/api/save-json?file=${encodeURIComponent(filePath)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: jsonString,
        });

        if (response.ok) {
          alert('Saved successfully!');
        } else {
          const errorData = await response.json();
          alert('Failed to save file: ' + (errorData.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('API call failed:', error);
        alert('Failed to connect to server. Please ensure the server is running on port 3000.');
      }
    } catch (error) {
      console.error('Save failed:', error);
      alert('Save failed: ' + error);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* 顶部导航 - 显示所有项目缩略图 */}
      <div className="flex flex-wrap overflow-y-auto p-4 bg-gray-50 border-b min-h-[140px] max-h-[300px]">
        {galleryItems.map((item) => (
          <div
            key={item.id}
            className={`m-1 w-25 overflow-hidden cursor-pointer border-2 rounded-lg transition-all ${selectedItem?.id === item.id
              ? 'border-blue-500 shadow-lg scale-105'
              : 'border-gray-300 hover:border-gray-400'
              }`}
            onClick={() => handleItemClick(item)}
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
      <div className="flex-1 flex">
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
        <div className="flex-1 p-4 flex flex-col items-center justify-center bg-gray-50 border-r">
          <div ref={previewDOMRef} className="text-center w-full h-full flex flex-col items-center justify-center">
            <h2 className="text-xl font-bold mb-4">D3 Visualization</h2>
            <div className="mx-auto editor-preview">
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
        <div className="flex-1 p-4 flex flex-col bg-white">
          {selectedItem && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">JSON Editor</h2>
                <div className="flex gap-2">
                  <button
                    onClick={resetToDefault}
                    className="px-3 py-2 rounded text-sm font-medium !bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    onClick={saveAndRedraw}
                    className="px-3 py-2 rounded text-sm font-medium !bg-green-500 text-white hover:bg-green-600 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
              <div className="flex-1 relative">
                <textarea
                  value={currentJsonData}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className={`w-full h-full p-3 border rounded font-mono text-sm resize-none ${isJsonValid ? 'border-gray-300' : 'border-red-500'
                    }`}
                  placeholder="Edit JSON data here..."
                />
                {!isJsonValid && (
                  <div className="absolute bottom-2 left-2 text-red-500 text-xs bg-red-50 px-2 py-1 rounded">
                    Invalid JSON
                  </div>
                )}
                {isJsonValid && currentJsonData !== lastAppliedJson && (
                  <div className="absolute bottom-2 left-2 text-blue-500 text-xs bg-blue-50 px-2 py-1 rounded">
                    Changes pending
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                <p>• JSON changes are automatically applied when valid</p>
                <p>• Use "Reset" to restore original JSON data</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
