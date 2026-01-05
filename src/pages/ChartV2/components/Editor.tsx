import { EditorSelector } from "./EditorSelector";
import { EditorForm } from "./EditorForm";
import { EditorTree } from "./EditorTree";
import { EditorPreview } from "./EditorPreview";
import { useEffect } from "react";
import { initChart } from "../model/editor";
import { DSLDataViewer } from "./DSLDataViewer";

export const Editor = () => {

  useEffect(() => {
    initChart();
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="flex-1 flex flex-col">
        <div className="h-1/2 p-2">
          <EditorSelector />
        </div>

        <div className="h-1/2 overflow-hidden p-2 min-h-[0px]">
        <EditorTree />
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-2">
          <EditorForm />
      </div>

      <div className="flex-1 flex flex-col">
        <div className="h-1/2 p-2">
        <EditorPreview />
        </div>

        <div className="flex-1 overflow-hidden p-2 min-h-[0px]">
          <DSLDataViewer />
        </div>
      </div>
    </div>
  );
}