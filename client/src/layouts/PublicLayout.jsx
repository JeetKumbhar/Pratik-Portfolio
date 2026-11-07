import { Outlet } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import PageTransition from '../components/layout/PageTransition';
import SeoManager from '../components/seo/SeoManager';

export default function PublicLayout() {
  return (
    <div className="public-layout">
      <SeoManager />
      <Navbar />
      <main className="public-layout__main">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}