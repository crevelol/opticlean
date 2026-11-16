import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useAppState } from '../shared/hooks/AppStateProvider';
import { useAuth } from '../shared/hooks/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { Spinner } from '../shared/components/Icon';

// Cada pantalla se descarga solo al visitarla (code splitting por ruta).
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const InventoryPage = lazy(() =>
  import('../features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const ReceptionPage = lazy(() =>
  import('../features/reception/ReceptionPage').then((m) => ({ default: m.ReceptionPage })),
);
const WarehousePage = lazy(() =>
  import('../features/warehouse/WarehousePage').then((m) => ({ default: m.WarehousePage })),
);
const OrdersPage = lazy(() =>
  import('../features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })),
);
const NewOrderPage = lazy(() =>
  import('../features/orders/NewOrderPage').then((m) => ({ default: m.NewOrderPage })),
);
const PurchasesPage = lazy(() =>
  import('../features/purchases/PurchasesPage').then((m) => ({ default: m.PurchasesPage })),
);
const LogisticsPage = lazy(() =>
  import('../features/logistics/LogisticsPage').then((m) => ({ default: m.LogisticsPage })),
);
const RoutesPage = lazy(() =>
  import('../features/logistics/RoutesPage').then((m) => ({ default: m.RoutesPage })),
);
const RouteHistoryPage = lazy(() =>
  import('../features/logistics/RouteHistoryPage').then((m) => ({ default: m.RouteHistoryPage })),
);
const ClientsPage = lazy(() =>
  import('../features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })),
);
const TraceabilityPage = lazy(() =>
  import('../features/traceability/TraceabilityPage').then((m) => ({
    default: m.TraceabilityPage,
  })),
);
const ReportsPage = lazy(() =>
  import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const WarehousesAdminPage = lazy(() =>
  import('../features/warehouses/WarehousesAdminPage').then((m) => ({
    default: m.WarehousesAdminPage,
  })),
);
const FamiliesPage = lazy(() =>
  import('../features/families/FamiliesPage').then((m) => ({ default: m.FamiliesPage })),
);

function LoadingShell({ label = 'Cargando operación…' }: { label?: string }) {
  return (
    <div className="app-loading" role="status">
      <Spinner />
      <p>{label}</p>
    </div>
  );
}

function ProtectedApp() {
  const { loading: authLoading, user } = useAuth();
  const { loading, error, refresh } = useAppState();

  if (authLoading) return <LoadingShell label="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (loading) return <LoadingShell />;
  if (error) {
    return (
      <div className="page" style={{ padding: 40 }}>
        <p>{error}</p>
        <p className="subtle">Asegúrate de que el backend esté en ejecución.</p>
        <button type="button" className="btn primary" onClick={() => void refresh()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="inventario" element={<InventoryPage />} />
        <Route path="recepcion" element={<ReceptionPage />} />
        <Route path="bodega" element={<WarehousePage />} />
        <Route path="bodegas" element={<WarehousesAdminPage />} />
        <Route path="familias" element={<FamiliesPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route path="pedidos/nuevo" element={<NewOrderPage />} />
        <Route path="compras" element={<PurchasesPage />} />
        <Route path="logistica" element={<LogisticsPage />} />
        <Route path="logistica/rutas" element={<RoutesPage />} />
        <Route path="logistica/historial" element={<RouteHistoryPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="trazabilidad" element={<TraceabilityPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/bodega" replace />} />
      </Route>
    </Routes>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}
