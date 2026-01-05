import { createRoot } from 'react-dom/client';
import { Editor } from './pages/ChartV2/components/Editor';
import { Gallery } from './pages/ChartV2/components/Gallery';

const App = () => {
  const pathname = location.pathname;

  const togglePage = () => {
    if (pathname === '/') {
      location.href = '/editor';
    } else {
      location.href = '/';
    }
  };

  return (
    <div className="main w-screen h-screen">
      <div className="w-full h-full">
        {
          pathname === '/' ? <Gallery /> : null
        }
        {
          pathname === '/editor' ? <Editor /> : null
        }
      </div>
      
      {/* Fixed toggle tag in bottom left corner */}
      <button
        onClick={togglePage}
        className="fixed bottom-4 left-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg hover:bg-primary/90 transition-all duration-300 transform hover:scale-105"
      >
        {pathname === '/' ? 'Go to Editor' : 'Go to Gallery'}
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);

export default App;
