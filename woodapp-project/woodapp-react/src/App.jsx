import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CalculatorApp from './pages/calculator/CalculatorApp';
import AdminDashboard from './pages/admin/AdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CalculatorApp />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
