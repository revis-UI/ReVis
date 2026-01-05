import { useSize } from 'ahooks';
import { useEffect, useRef } from 'react';

export interface D3ChartInterface {
  initSVG: (svg: SVGSVGElement) => void;
  style?: React.CSSProperties;
}

export const D3Chart = (props: D3ChartInterface) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    props.initSVG(svgRef.current);
  }, []);

  const size = useSize(divRef);

  return (
    <div
      ref={divRef}
      className="w-full h-full flex items-center justify-center object-contain shadow-lg rounded-lg"
      style={props.style}
    >
      <svg
        ref={svgRef}
        style={{
          width: Math.min(size?.width || 0, size?.height || 0),
          height: Math.min(size?.width || 0, size?.height || 0)
        }}
      />
    </div>
  );
};