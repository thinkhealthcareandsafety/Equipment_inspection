import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { DialogProvider } from './components/Dialogs.tsx';
import { IS_DEMO } from './lib/demo.ts';

// The hosted demo runs inside a frame whose URL it cannot change, so it routes in memory.
const Router = IS_DEMO ? MemoryRouter : BrowserRouter;
import { Shell } from './components/Shell.tsx';
import { ToastProvider } from './components/ui.tsx';
import { can, useSession } from './lib/hooks.ts';
import { startSync } from './lib/sync.ts';
import { Login } from './pages/Login.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Sites } from './pages/Sites.tsx';
import { BuildingPage } from './pages/Building.tsx';
import { AssetPage } from './pages/Asset.tsx';
import { InspectionPage } from './pages/Inspection.tsx';
import { Inspections } from './pages/Inspections.tsx';
import { Reports } from './pages/Reports.tsx';
import { Team } from './pages/Team.tsx';
import { Admin } from './pages/Admin.tsx';
import type { Role } from '@think/shared';

export function App() {
  const session = useSession();
  useEffect(() => { if (session) startSync(); }, [session]);
  return (
    <ToastProvider>
      <DialogProvider>
      <Router>
        {!session ? <Routes><Route path="*" element={<Login />} /></Routes> : (
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="sites" element={<Sites />} />
              <Route path="sites/:buildingId" element={<BuildingPage />} />
              <Route path="assets/:assetId" element={<AssetPage />} />
              <Route path="inspections" element={<Guard ok={can.inspect}><Inspections /></Guard>} />
              <Route path="inspections/:inspectionId" element={<InspectionPage />} />
              <Route path="defects" element={<Navigate to="/reports?view=defects" replace />} />
              <Route path="reports" element={<Reports />} />
              <Route path="team" element={<Guard ok={can.team}><Team /></Guard>} />
              <Route path="admin" element={<Guard ok={can.admin}><Admin /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        )}
      </Router>
      </DialogProvider>
    </ToastProvider>
  );
}

function Guard({ ok, children }: { ok: (r: Role) => boolean; children: ReactNode }) {
  const s = useSession();
  return s && ok(s.user.role) ? <>{children}</> : <Navigate to="/" replace />;
}
