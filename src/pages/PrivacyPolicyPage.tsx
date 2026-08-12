import { Link } from "react-router-dom";

/** Página pública para URL de Política de Privacidade (Meta App Review). */
export default function PrivacyPolicyPage() {
  const updated = "12 de agosto de 2026";

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1.25rem 3rem",
        fontFamily: "system-ui, sans-serif",
        color: "#1a1a1a",
        lineHeight: 1.55,
      }}
    >
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/">← Calangus</Link>
      </p>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.35rem" }}>
        Política de Privacidade
      </h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        Calangus Moda Jovem · Última atualização: {updated}
      </p>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>1. Quem somos</h2>
        <p>
          A Calangus Moda Jovem (“nós”) opera o aplicativo e sistemas de atendimento
          (incluindo integração com WhatsApp Business Platform / Meta) para comunicação
          com clientes sobre pedidos, catálogo, cobrança de parcelas e suporte.
        </p>
        <p>
          Contato:{" "}
          <a href="mailto:contato@calangusmodajovem.com">contato@calangusmodajovem.com</a>
        </p>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>2. Dados que podemos tratar</h2>
        <ul>
          <li>Nome, telefone e identificadores de conversa no WhatsApp</li>
          <li>Conteúdo das mensagens trocadas no atendimento</li>
          <li>Dados de cobrança/parcela necessários ao lembrete de pagamento (quando aplicável)</li>
          <li>Dados técnicos de uso do sistema (logs de envio, horários, status de entrega)</li>
        </ul>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>3. Finalidades</h2>
        <ul>
          <li>Atender clientes via WhatsApp e canais digitais</li>
          <li>Enviar lembretes de parcelas e informações relacionadas à compra</li>
          <li>Operar, proteger e melhorar nossos sistemas</li>
          <li>Cumprir obrigações legais e regulatórias</li>
        </ul>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>4. Compartilhamento</h2>
        <p>
          Podemos utilizar provedores de infraestrutura e a plataforma Meta/WhatsApp para
          entrega de mensagens. Não vendemos dados pessoais. O compartilhamento ocorre apenas
          quando necessário à prestação do serviço ou por exigência legal.
        </p>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>5. Retenção e segurança</h2>
        <p>
          Mantemos os dados pelo tempo necessário às finalidades acima ou conforme a lei.
          Adotamos medidas razoáveis de segurança técnica e organizacional.
        </p>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>6. Seus direitos</h2>
        <p>
          Nos termos da LGPD, você pode solicitar acesso, correção, eliminação ou informações
          sobre o tratamento dos seus dados, pelo e-mail{" "}
          <a href="mailto:contato@calangusmodajovem.com">contato@calangusmodajovem.com</a>.
        </p>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.15rem" }}>7. WhatsApp / Meta</h2>
        <p>
          Ao interagir conosco pelo WhatsApp, também se aplicam as políticas da Meta Platforms.
          O uso da API oficial do WhatsApp Business ocorre sob as regras e termos da Meta.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.15rem" }}>8. Alterações</h2>
        <p>
          Esta política pode ser atualizada. A data no topo indica a versão vigente.
        </p>
      </section>
    </main>
  );
}
