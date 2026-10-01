import { Routes, Route } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import Home from '../pages/Home/Home';

const Placeholder = ({ title }) => (
  <div className="container" style={{ padding: '80px 24px' }}><h1>{title}</h1></div>
);

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<Placeholder title="About" />} />
        <Route path="/portfolio" element={<Placeholder title="Portfolio" />} />
        <Route path="/services" element={<Placeholder title="Services" />} />
        <Route path="/booking" element={<Placeholder title="Booking" />} />
        <Route path="/blog" element={<Placeholder title="Blog" />} />
        <Route path="/contact" element={<Placeholder title="Contact" />} />
      </Route>
    </Routes>
  );
}