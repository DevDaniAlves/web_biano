import type { ReportsData } from "../whatsapp/waApi";

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}min ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(data: ReportsData) {
  const p = data.period?.label?.replace(/\s+/g, "_") ?? "periodo";
  return `relatorio_whatsapp_${p}_${new Date().toISOString().slice(0, 10)}`;
}

export function exportReportsCsv(data: ReportsData) {
  const lines: string[] = [];
  const push = (row: (string | number | null | undefined)[]) =>
    lines.push(row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));

  push(["Relatório WhatsApp", data.period?.label ?? ""]);
  push(["De", data.period?.from ?? ""]);
  push(["Até", data.period?.to ?? ""]);
  push([]);
  push(["Indicador", "Valor"]);
  push(["Atendimentos", data.attendances]);
  push(["Pegos de outros", data.takenFromOthers]);
  push(["Ofertas vencidas", data.expiredOffers]);
  push(["Tempo médio assumir", fmtDuration(data.avgAssumeSeconds)]);
  push(["Média avaliação", data.avgRating?.toFixed(2) ?? ""]);
  push(["Avaliações", data.ratingsCount]);
  push(["Mensagens", data.messagesInPeriod ?? data.messagesToday]);
  push([]);
  push(["Nota", "Qtd"]);
  Object.entries(data.ratingDistribution).forEach(([k, v]) => push([k, v]));
  push([]);
  push(["Vendedor", "Avaliações", "Média"]);
  data.ratingsBySeller.forEach((s) =>
    push([s.sellerName, s.count, s.avgRating?.toFixed(2) ?? ""])
  );
  push([]);
  push(["Vendedor", "Assumiu", "Tempo médio", "Pegos", "Vencidos"]);
  const offerMap = new Map(data.offerStatsBySeller.map((o) => [o.sellerId, o]));
  data.assumeBySeller.forEach((s) => {
    const o = offerMap.get(s.sellerId);
    push([s.sellerName, s.count, fmtDuration(s.avgSeconds), o?.taken ?? 0, o?.expired ?? 0]);
  });
  push([]);
  push(["Data", "Assumidos", "Avaliações", "Média nota", "Vencidos", "Pegos"]);
  data.seriesByDay.forEach((d) =>
    push([d.date, d.assumes, d.ratings, d.avgRating ?? "", d.expired, d.taken])
  );

  downloadBlob(
    new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `${stamp(data)}.csv`
  );
}

export async function exportReportsXlsx(data: ReportsData) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const resumo = [
    ["Relatório WhatsApp", data.period?.label ?? ""],
    ["De", data.period?.from ?? ""],
    ["Até", data.period?.to ?? ""],
    [],
    ["Indicador", "Valor"],
    ["Atendimentos", data.attendances],
    ["Pegos de outros", data.takenFromOthers],
    ["Ofertas vencidas", data.expiredOffers],
    ["Tempo médio assumir (s)", data.avgAssumeSeconds],
    ["Média avaliação", data.avgRating],
    ["Avaliações", data.ratingsCount],
    ["Mensagens", data.messagesInPeriod ?? data.messagesToday],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

  const ratings = [
    ["Nota", "Qtd"],
    ...Object.entries(data.ratingDistribution),
    [],
    ["Vendedor", "Avaliações", "Média"],
    ...data.ratingsBySeller.map((s) => [s.sellerName, s.count, s.avgRating]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ratings), "Avaliações");

  const sellers = [
    ["Vendedor", "Assumiu", "Tempo médio (s)", "Pegos", "Vencidos"],
    ...data.offerStatsBySeller.map((o) => {
      const a = data.assumeBySeller.find((x) => x.sellerId === o.sellerId);
      return [o.sellerName, a?.count ?? 0, a?.avgSeconds ?? "", o.taken, o.expired];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sellers), "Vendedores");

  const serie = [
    ["Data", "Assumidos", "Avaliações", "Média", "Vencidos", "Pegos"],
    ...data.seriesByDay.map((d) => [
      d.date,
      d.assumes,
      d.ratings,
      d.avgRating,
      d.expired,
      d.taken,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(serie), "Série diária");

  XLSX.writeFile(wb, `${stamp(data)}.xlsx`);
}

export async function exportReportsPdf(data: ReportsData) {
  const jspdf = await import("jspdf");
  const JsPDF = (jspdf as { default?: unknown; jsPDF?: unknown }).jsPDF ??
    (jspdf as { default: unknown }).default;
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default as (
    doc: InstanceType<typeof import("jspdf").jsPDF>,
    opts: Record<string, unknown>
  ) => void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (JsPDF as any)();
  doc.setFontSize(16);
  doc.text("Relatório WhatsApp — Calangus", 14, 18);
  doc.setFontSize(10);
  doc.text(`Período: ${data.period?.label ?? "—"}`, 14, 26);
  doc.text(
    `Atendimentos: ${data.attendances} · Pegos: ${data.takenFromOthers} · Vencidos: ${data.expiredOffers}`,
    14,
    32
  );
  doc.text(
    `Tempo médio assumir: ${fmtDuration(data.avgAssumeSeconds)} · Avaliação: ${
      data.avgRating != null ? data.avgRating.toFixed(1) : "—"
    } (${data.ratingsCount})`,
    14,
    38
  );

  autoTable(doc, {
    startY: 44,
    head: [["Vendedor", "Assumiu", "Tempo médio", "Pegos", "Vencidos"]],
    body: data.offerStatsBySeller.map((o) => {
      const a = data.assumeBySeller.find((x) => x.sellerId === o.sellerId);
      return [
        o.sellerName,
        String(a?.count ?? 0),
        fmtDuration(a?.avgSeconds ?? null),
        String(o.taken),
        String(o.expired),
      ];
    }),
  });

  const y1 = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 8;
  autoTable(doc, {
    startY: y1,
    head: [["Nota", "Qtd"]],
    body: Object.entries(data.ratingDistribution).map(([k, v]) => [`${k} ★`, String(v)]),
  });

  const y2 = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y1) + 8;
  autoTable(doc, {
    startY: y2,
    head: [["Vendedor", "Avaliações", "Média"]],
    body: data.ratingsBySeller.map((s) => [
      s.sellerName,
      String(s.count),
      s.avgRating != null ? s.avgRating.toFixed(1) : "—",
    ]),
  });

  doc.save(`${stamp(data)}.pdf`);
}
