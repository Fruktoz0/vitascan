import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import AppShell from './layout/AppShell';
import { RedirectIfAuth, RequireAuth } from './layout/AuthGate';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import FoodLibraryPage from './pages/FoodLibraryPage';
import ScannerPage from './pages/ScannerPage';
import ProfilePage from './pages/ProfilePage';
import PersonalDataPage from './pages/PersonalDataPage';
import GoalsPage from './pages/GoalsPage';
import AiRecognizePage from './pages/AiRecognizePage';
import BodyMeasurementsPage from './pages/BodyMeasurementsPage';
import BodyPartLogPage from './pages/BodyPartLogPage';
import BodyMeasurementNewPage from './pages/BodyMeasurementNewPage';
import FitnessPage from './pages/FitnessPage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import WeightLogPage from './pages/WeightLogPage';
import WeightNewPage from './pages/WeightNewPage';
import WaterLogPage from './pages/WaterLogPage';
import WaterNewPage from './pages/WaterNewPage';
import NotificationsPage from './pages/NotificationsPage';
import DatePickerPage from './pages/DatePickerPage';
import DataVaultPage from './pages/DataVaultPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadProfile = useProfileStore((s) => s.load);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (isAuthenticated) loadProfile();
  }, [isAuthenticated, loadProfile]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

        <Route element={<RedirectIfAuth />}>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/food-library" element={<FoodLibraryPage />} />
            <Route path="/body" element={<BodyMeasurementsPage />} />
            <Route path="/fitness" element={<FitnessPage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/date-picker" element={<DatePickerPage />} />
            <Route path="/data-vault" element={<DataVaultPage />} />
          </Route>
          <Route path="/personal-data" element={<PersonalDataPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/ai-recognize" element={<AiRecognizePage />} />
          <Route path="/body/new" element={<BodyMeasurementNewPage />} />
          <Route path="/body/:part" element={<BodyPartLogPage />} />
          <Route path="/fitness/workout/:id" element={<WorkoutDetailPage />} />
          <Route path="/weight" element={<WeightLogPage />} />
          <Route path="/weight/new" element={<WeightNewPage />} />
          <Route path="/water" element={<WaterLogPage />} />
          <Route path="/water/new" element={<WaterNewPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
// test