import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Editor } from './pages/ChartV2/components/Editor';
import { Gallery } from './pages/ChartV2/components/Gallery';

const AppContent = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const togglePage = () => {
    // 使用相对路径，确保在HashRouter下正常工作
    navigate(location.pathname === '/' ? '/editor' : '/');
  };

  return (
    <div className="main w-screen h-screen">
      <div className="w-full h-full">
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/editor" element={<Editor />} />
        </Routes>
      </div>
      
      {/* Fixed toggle tag in bottom left corner */}
      <button
        onClick={togglePage}
        className="fixed bottom-4 left-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg hover:bg-primary/90 transition-all duration-300 transform hover:scale-105"
      >
        {location.pathname === '/' ? 'Go to Editor' : 'Go to Gallery'}
      </button>
    </div>
  );
};

const App = () => {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);

export default App;
