import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  return <Outlet />;
}

export function RedirectIfAuth() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/home" replace />;
  return <Outlet />;
}
