import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import CalculatorApp from './pages/calculator/CalculatorApp';
import AdminDashboard from './pages/admin/AdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CalculatorApp />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admindashboard" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
