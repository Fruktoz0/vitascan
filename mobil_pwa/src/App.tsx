import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useProfileStore } from './stores/profileStore';
import { ensurePushSubscription } from './services/pushSubscribe';
import AppShell from './layout/AppShell';
import { RedirectIfAuth, RequireAuth } from './layout/AuthGate';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import DayNutrientPage from './pages/DayNutrientPage';
import FoodLibraryPage from './pages/FoodLibraryPage';
import ScannerPage from './pages/ScannerPage';
import ProfilePage from './pages/ProfilePage';
import PersonalDataPage from './pages/PersonalDataPage';
import GoalsPage from './pages/GoalsPage';
import AiRecognizePage from './pages/AiRecognizePage';
import BodyMeasurementsPage from './pages/BodyMeasurementsPage';
import BodyPartLogPage from './pages/BodyPartLogPage';
import BodyMeasurementNewPage from './pages/BodyMeasurementNewPage';
import BodyFatLogPage from './pages/BodyFatLogPage';
import BodyFatNewPage from './pages/BodyFatNewPage';
import FitnessPage from './pages/FitnessPage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import WeightLogPage from './pages/WeightLogPage';
import WeightNewPage from './pages/WeightNewPage';
import WaterLogPage from './pages/WaterLogPage';
import WaterNewPage from './pages/WaterNewPage';
import FastingPage from './pages/FastingPage';
import NotificationsPage from './pages/NotificationsPage';
import DatePickerPage from './pages/DatePickerPage';
import DataVaultPage from './pages/DataVaultPage';
import AdminPage from './pages/AdminPage';
import MenuPage from './pages/MenuPage';
import RecipesPage from './pages/RecipesPage';
import RecipeCreatePage from './pages/RecipeCreatePage';
import RecipeReviewPage from './pages/RecipeReviewPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeImportPage from './pages/RecipeImportPage';
import HomeCardsPage from './pages/HomeCardsPage';
import SharingPage from './pages/SharingPage';

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

  useEffect(() => {
    if (!isAuthenticated) return;
    void ensurePushSubscription();
  }, [isAuthenticated]);

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
            <Route path="/home/breakdown/:metric" element={<DayNutrientPage />} />
            <Route path="/food-library" element={<FoodLibraryPage />} />
            <Route path="/body" element={<BodyMeasurementsPage />} />
            <Route path="/fitness" element={<FitnessPage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/menu/profile" element={<ProfilePage />} />
            <Route path="/menu/home-cards" element={<HomeCardsPage />} />
            <Route path="/menu/sharing" element={<SharingPage />} />
            <Route path="/profile" element={<Navigate to="/menu/profile" replace />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/recipes/new" element={<RecipeCreatePage />} />
            <Route path="/recipes/import" element={<RecipeImportPage />} />
            <Route path="/recipes/review" element={<RecipeReviewPage />} />
            <Route path="/recipes/:id/edit" element={<RecipeReviewPage />} />
            <Route path="/recipes/:id" element={<RecipeDetailPage />} />
            <Route path="/date-picker" element={<DatePickerPage />} />
            <Route path="/data-vault" element={<DataVaultPage />} />
          </Route>
          <Route path="/personal-data" element={<PersonalDataPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/ai-recognize" element={<AiRecognizePage />} />
          <Route path="/body/new" element={<BodyMeasurementNewPage />} />
          <Route path="/body/fat/new" element={<BodyFatNewPage />} />
          <Route path="/body/fat" element={<BodyFatLogPage />} />
          <Route path="/body/:part" element={<BodyPartLogPage />} />
          <Route path="/fitness/workout/:id" element={<WorkoutDetailPage />} />
          <Route path="/weight" element={<WeightLogPage />} />
          <Route path="/weight/new" element={<WeightNewPage />} />
          <Route path="/water" element={<WaterLogPage />} />
          <Route path="/water/new" element={<WaterNewPage />} />
          <Route path="/fasting" element={<FastingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// csak teszt kellős