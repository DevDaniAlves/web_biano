import { Navigate, Route, Routes } from "react-router-dom";
import { Store } from "./pages/Store";
import { Checkout } from "./pages/Checkout";
import { OrderDone } from "./pages/OrderDone";
import GestorApp from "./gestor/GestorApp";
import WhatsAppPage from "./whatsapp/WhatsAppPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Store />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/pedido-ok" element={<OrderDone />} />
      <Route path="/gestor" element={<GestorApp />} />
      <Route path="/atendimento" element={<WhatsAppPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
