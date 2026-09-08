import { createRoot } from 'react-dom/client';
import {lazy, Suspense, useEffect, useState} from 'react';
const Editor=lazy(()=>import('./pages/ChartV2/components/Editor').then(m=>({default:m.Editor})));
const Gallery=lazy(()=>import('./pages/ChartV2/components/Gallery').then(m=>({default:m.Gallery})));
const currentPage=()=>location.hash ? location.hash.replace(/^#\/?/,'') : location.pathname.slice(import.meta.env.BASE_URL.length);

const App = () => {
  const [page,setPage]=useState(currentPage);
  useEffect(()=>{const update=()=>setPage(currentPage());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  const isEditor=page.replace(/\/$/,'')==='editor';
  const togglePage = () => {
    if (!isEditor) {
      try {
        const selected = sessionStorage.getItem('revis.gallery.selection');
        if(selected) localStorage.setItem('vitejs-d3.editor.selected-dsl-file.v1', selected);
      } catch { /* Browsing still works when storage is unavailable. */ }
    }
    location.href=`${import.meta.env.BASE_URL}#/${isEditor?'':'editor'}`;
  };

  return (
    <div className="main w-screen h-screen">
      <div className="w-full h-full">
        <Suspense fallback={<p role="status">Loading…</p>}>
        {
          !isEditor ? <Gallery /> : null
        }
        {
          isEditor ? <Editor /> : null
        }
        </Suspense>
      </div>
      
      {/* Fixed toggle tag in bottom left corner */}
      <button
        onClick={togglePage}
        className="fixed bottom-4 left-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg hover:bg-primary/90 transition-all duration-300 transform hover:scale-105"
      >
        {!isEditor ? 'Go to Editor' : 'Go to Gallery'}
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);

export default App;
