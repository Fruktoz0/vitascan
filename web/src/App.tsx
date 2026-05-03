import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRouteGuard } from './admin/AdminRouteGuard';
import { AdminLoginPage } from './admin/AdminLoginPage';
import { AdminLayout } from './admin/AdminLayout';
import { DashboardPage } from './admin/pages/DashboardPage';
import { FoodsPage } from './admin/pages/FoodsPage';
import { UsersPage } from './admin/pages/UsersPage';
import { DatabaseLayout } from './admin/DatabaseLayout';
import { DatabaseOverviewPage } from './admin/pages/DatabaseOverviewPage';
import { DatabaseRestorePage } from './admin/pages/DatabaseRestorePage';
import { DatabaseDataUpdatePage } from './admin/pages/DatabaseDataUpdatePage';
import { TokenCleanupPage } from './admin/pages/TokenCleanupPage';

function HomePage() {
  return (
    <div className="home-simple">
      <h1>VitaScan</h1>
      <p>Rögzítés és táplálkozás-követés. Az admin felület kezelőinek:</p>
      <a href="/admin/login">Admin belépés →</a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<AdminRouteGuard />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="foods" element={<FoodsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="token-cleanup" element={<TokenCleanupPage />} />
          <Route path="database" element={<DatabaseLayout />}>
            <Route index element={<DatabaseOverviewPage />} />
            <Route path="rendszer-visszaallitas" element={<DatabaseRestorePage />} />
            <Route path="frissites" element={<DatabaseDataUpdatePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
