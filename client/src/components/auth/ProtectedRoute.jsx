import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Loader from '../common/Loader';
import Button from '../common/Button';
import useAuth from '../../hooks/useAuth';

/**
 * Keeps non-admins away from the admin screens.
 *   <Route element={<ProtectedRoute />}> …admin routes… </Route>
 * This is only the FRONT door: the backend verifies the JWT and the admin role on every admin request too,
 * so removing or bypassing this component would still not give anyone access to data.
 */
export default function ProtectedRoute({ children, role = 'admin' }) {
  const { status, user, error, retry, logout } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <Loader fullScreen label="Checking your session" />;

  if (status === 'error') {
    return (
      <main className="auth-page">
        <div className="auth-card" role="alert">
          <h1 className="auth-card__title">Can't verify your session</h1>
          <p className="auth-card__text">{error}</p>
          <div className="auth-actions">
            <Button onClick={retry}>Try again</Button>
            <Button variant="ghost" onClick={logout}>Sign out</Button>
          </div>
        </div>
      </main>
    );
  }

  if (status !== 'authenticated' || user?.role !== role) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return children ?? <Outlet />;
}
