import { useGameStore } from './store/gameStore';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Battle from './pages/Battle';

function App() {
  const { appPhase } = useGameStore();

  return (
    <>
      {appPhase === 'home' && <Home />}
      {appPhase === 'lobby' && <Lobby />}
      {appPhase === 'solo' && <Lobby />}
      {appPhase === 'battle' && <Battle />}
    </>
  );
}

export default App;
