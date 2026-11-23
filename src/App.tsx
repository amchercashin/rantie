import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/error-boundary';
import { PwaUpdatePrompt } from '@/components/pwa-update-prompt';
import { SyncProvider } from '@/contexts/sync-context';
import { FeedbackProvider } from '@/components/ds/feedback';
import { MainPage } from '@/pages/main-page';
import { CategoryPage } from '@/pages/category-page';
import { AssetDetailPage } from '@/pages/asset-detail-page';
import { DataPage } from '@/pages/data-page';
import { SettingsPage } from '@/pages/settings-page';
import { PaymentsPage } from '@/pages/payments-page';
import { GoalPage } from '@/pages/goal-page';
import { GuidePage } from '@/pages/guide-page';

const Welcome = lazy(() => import('@/components/onboarding/welcome').then((m) => ({ default: m.Welcome })));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <FeedbackProvider>
          <PwaUpdatePrompt />
          <SyncProvider>
            <Routes>
              <Route path="/" element={<MainPage />} />
              <Route path="/category/:type" element={<CategoryPage />} />
              <Route path="/asset/:id" element={<AssetDetailPage />} />
              <Route path="/goal" element={<GoalPage />} />
              <Route path="/data" element={<DataPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/guide" element={<GuidePage />} />
              <Route path="*" element={<MainPage />} />
            </Routes>
            <Suspense fallback={null}>
              <Welcome />
            </Suspense>
          </SyncProvider>
        </FeedbackProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
