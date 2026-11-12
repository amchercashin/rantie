import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { PwaUpdatePrompt } from '@/components/pwa-update-prompt';
import { SyncProvider } from '@/contexts/sync-context';
import { FeedbackProvider } from '@/components/ds/feedback';

const MainPage = lazy(() => import('@/pages/main-page').then((m) => ({ default: m.MainPage })));
const CategoryPage = lazy(() => import('@/pages/category-page').then((m) => ({ default: m.CategoryPage })));
const AssetDetailPage = lazy(() => import('@/pages/asset-detail-page').then((m) => ({ default: m.AssetDetailPage })));
const DataPage = lazy(() => import('@/pages/data-page').then((m) => ({ default: m.DataPage })));
const SettingsPage = lazy(() => import('@/pages/settings-page').then((m) => ({ default: m.SettingsPage })));
const PaymentsPage = lazy(() => import('@/pages/payments-page').then((m) => ({ default: m.PaymentsPage })));
const GuidePage = lazy(() => import('@/pages/guide-page').then((m) => ({ default: m.GuidePage })));
const Welcome = lazy(() => import('@/components/onboarding/welcome').then((m) => ({ default: m.Welcome })));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <FeedbackProvider>
          <PwaUpdatePrompt />
          <SyncProvider>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<MainPage />} />
                <Route path="/category/:type" element={<CategoryPage />} />
                <Route path="/asset/:id" element={<AssetDetailPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/guide" element={<GuidePage />} />
                <Route path="*" element={<MainPage />} />
              </Routes>
              <Welcome />
            </Suspense>
          </SyncProvider>
        </FeedbackProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
