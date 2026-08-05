import { Navigate } from "react-router-dom";
import { homePathForSession } from "../auth";

/** Entrada do ícone na tela inicial: CRM se logado, login se não. */
export default function PwaStart() {
  return <Navigate to={homePathForSession()} replace />;
}
