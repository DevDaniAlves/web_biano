import { useState } from "react";
import { waApi } from "../whatsapp/waApi";
import "./ChangePasswordDialog.css";

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("A confirmação não confere");
      return;
    }
    setBusy(true);
    try {
      await waApi.changePassword(currentPassword, newPassword);
      setOk(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pwd-overlay" role="presentation" onClick={onClose}>
      <div
        className="pwd-dialog"
        role="dialog"
        aria-labelledby="pwd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pwd-title">Alterar senha</h2>
        {ok ? (
          <>
            <p className="pwd-ok">Senha atualizada.</p>
            <button type="button" onClick={onClose}>
              Fechar
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <label>
              Senha atual
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                required
              />
            </label>
            {error && <p className="pwd-error">{error}</p>}
            <div className="pwd-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
