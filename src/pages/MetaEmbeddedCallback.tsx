import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

/** Redirect OAuth do Cadastro incorporado Meta (CoEx / Business App). */
export default function MetaEmbeddedCallback() {
  const [params] = useSearchParams();
  const entries = useMemo(() => [...params.entries()], [params]);
  const error = params.get("error") || params.get("error_message") || params.get("error_description");
  const code = params.get("code");

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, sans-serif",
        color: "#111",
      }}
    >
      <h1 style={{ color: error ? "#c00" : "#0a7", fontSize: "1.35rem" }}>
        {error ? "Cadastro Meta — erro" : "Cadastro Meta — retorno OK"}
      </h1>
      <p style={{ color: "#444", lineHeight: 1.5 }}>
        Callback do cadastro incorporado (WhatsApp Business App → Cloud API). Guarde os dados abaixo
        para configurar o BIANO.
      </p>

      {error ? (
        <div
          style={{
            background: "#fee",
            border: "1px solid #ecc",
            borderRadius: 8,
            padding: "0.85rem 1rem",
            marginTop: "1rem",
          }}
        >
          <strong>Erro:</strong> {error}
        </div>
      ) : code ? (
        <div
          style={{
            background: "#eefaf3",
            border: "1px solid #cde",
            borderRadius: 8,
            padding: "0.85rem 1rem",
            marginTop: "1rem",
          }}
        >
          <strong>Code recebido.</strong> Próximo passo: trocar por token permanente (usuário do
          sistema / Graph API).
        </div>
      ) : (
        <div
          style={{
            background: "#f6f6f6",
            borderRadius: 8,
            padding: "0.85rem 1rem",
            marginTop: "1rem",
          }}
        >
          Sem <code>code</code> na URL. Se o fluxo terminou no celular, confira o redirect URI na
          Meta.
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1.25rem" }}>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ padding: "0.5rem 0", color: "#666" }}>
                Sem parâmetros na URL
              </td>
            </tr>
          ) : (
            entries.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0.5rem 0.5rem 0.5rem 0",
                    width: "30%",
                    color: "#555",
                    fontWeight: 600,
                    verticalAlign: "top",
                  }}
                >
                  {k}
                </th>
                <td style={{ padding: "0.5rem 0", wordBreak: "break-all" }}>
                  <code style={{ fontSize: "0.85rem" }}>{v}</code>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p style={{ marginTop: "1.75rem" }}>
        <Link to="/admin/whatsapp/conectar">Ir para Conectar WhatsApp</Link>
      </p>
    </main>
  );
}
