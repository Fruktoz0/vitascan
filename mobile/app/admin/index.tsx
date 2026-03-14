import { Redirect } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import AdminPanelScreen from '../../src/screens/admin/AdminPanelScreen';

export default function AdminRoute() {
  const user = useAuthStore((s) => s.user);

  // Csak ADMIN role-lal érhető el
  if (user?.role !== 'ADMIN') {
    return <Redirect href="/(tabs)/home" />;
  }

  return <AdminPanelScreen />;
}
