import { Link, Navigate, useLocation } from 'react-router-dom';
import Loader from '../../components/common/Loader';
import LoginForm from '../../components/auth/LoginForm';
import { Logo } from '../../components/layout/Navbar';
import useAuth from '../../hooks/useAuth';

export default function AdminLogin() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <Loader fullScreen label="Checking your session" />;
  if (status === 'authenticated') {
    const from = location.state?.from?.pathname;
    return <Navigate to={from && from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin'} replace />;
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Logo />
        <div className="auth-card__head">
          <p className="auth-card__eyebrow">Admin</p>
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-card__text">Authorised access only.</p>
        </div>
        <LoginForm />
        <Link to="/" className="auth-back">← Back to the website</Link>
      </div>
    </main>
  );
}
