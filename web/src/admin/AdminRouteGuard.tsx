import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

export function AdminRouteGuard() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="admin-boot">
        <div className="admin-spinner" aria-hidden />
        <p>Betöltés…</p>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
