import { Sidebar } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';

function App() {
  return (
    <div className="flex w-screen h-screen bg-gray-900 overflow-hidden">
      <Sidebar />
      <div className="flex-1">
        <VideoPlayer />
      </div>
    </div>
  );
}

export default App;
