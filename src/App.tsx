import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import EarningsCallDetail from './pages/EarningsCallDetail';

function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/earnings/:company/:eventTicker" element={<EarningsCallDetail />} />
      </Routes>
    </div>
  );
}

export default App;
