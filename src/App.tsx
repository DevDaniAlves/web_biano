import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./admin/AdminLayout";
import { CatalogAdminPage, ConnectPage, ReportsPage } from "./admin/AdminPages";
import GestorApp from "./gestor/GestorApp";
import LoginPage, { RequireAuth } from "./pages/LoginPage";
import MetaEmbeddedCallback from "./pages/MetaEmbeddedCallback";
import PwaStart from "./pages/PwaStart";
import { Store } from "./pages/Store";
import WhatsAppPage, { QueuesTab, UsersTab } from "./whatsapp/WhatsAppPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Store />} />
      <Route path="/app" element={<PwaStart />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/whatsapp/meta/callback" element={<MetaEmbeddedCallback />} />
      <Route
        path="/atendimento"
        element={
          <RequireAuth>
            <WhatsAppPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="whatsapp/conversas" replace />} />
        <Route path="whatsapp/conversas" element={<WhatsAppPage embedded />} />
        <Route path="whatsapp/relatorios" element={<ReportsPage />} />
        <Route path="whatsapp/filas" element={<QueuesTab />} />
        <Route path="whatsapp/conectar" element={<ConnectPage />} />
        <Route path="whatsapp/usuarios" element={<UsersTab />} />
        <Route path="catalogo" element={<CatalogAdminPage />} />
        <Route path="gestor" element={<GestorApp embedded />} />
      </Route>
      <Route path="/gestor" element={<Navigate to="/admin/gestor" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
