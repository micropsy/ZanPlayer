import { useAppStore } from './services/store';
import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';

function App() {
  const theme = useAppStore(state => state.theme);
  const sidebarVisible = useAppStore(state => state.sidebarVisible);
  const setSidebarVisible = useAppStore(state => state.setSidebarVisible);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement !== null;
      setSidebarVisible(!isFullscreen);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [setSidebarVisible]);

  return (
    <div 
      ref={containerRef}
      className={`flex w-screen h-screen overflow-hidden ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
      }`}
    >
      {sidebarVisible && <Sidebar />}
      <div className="flex-1 relative">
        {!sidebarVisible && (
          <button
            onClick={() => setSidebarVisible(true)}
            className={`absolute top-4 left-4 z-50 p-2 rounded-lg ${
              theme === 'dark'
                ? 'bg-gray-800 hover:bg-gray-700 text-white'
                : 'bg-white hover:bg-gray-100 text-gray-900'
            } shadow-lg`}
          >
            <Menu className="w-6 h-6" />
          </button>
        )}
        <VideoPlayer />
      </div>
    </div>
  );
}

export default App;
