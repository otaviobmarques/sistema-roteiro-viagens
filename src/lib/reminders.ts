// Textos dos lembretes de cada marco da viagem e o e-mail com a cara do Rotta 365.
export const MILESTONES: Record<number, { title: (t: string) => string; body: string; push: string }> = {
  60: { title: (t) => `Faltam 2 meses para ${t}`, body: "Hora de resolver documentos, vistos e as reservas que esgotam.", push: "Documentos e reservas que esgotam: veja o que fazer agora." },
  30: { title: (t) => `Falta 1 mês para ${t}`, body: "Seguro viagem, vacinas, aviso de viagem no banco e a internet do celular.", push: "Seguro, vacinas, aviso no banco e internet: confira." },
  7: { title: (t) => `Falta 1 semana para ${t}`, body: "Mala, apps, mapas offline e comprovantes no celular.", push: "Mala, apps e mapas offline: sua lista da semana." },
  2: { title: (t) => `Faltam 2 dias para ${t}`, body: "Check-in online, cartões de embarque e documentos salvos no celular.", push: "Check-in online e documentos no celular." },
  0: { title: () => "É hoje! Boa viagem", body: "Chegue ao aeroporto com antecedência. O modo Hoje do app te guia em cada parada.", push: "Chegou o dia! Abra o modo Hoje do Rotta 365." },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export function reminderEmail(a: { name: string | null; tripTitle: string; milestone: number; tasks: { label: string; due_date: string | null }[]; url: string }) {
  const m = MILESTONES[a.milestone];
  const first = (a.name || "").split(" ")[0];
  const items = a.tasks.length
    ? `<p style="margin:16px 0 8px;font-size:14px;font-weight:700;color:#0a1f4c">O que ainda falta:</p><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#0a1f4c">${a.tasks.map((t) => `<li>${esc(t.label)}${t.due_date ? ` <span style="color:#5d6477">(até ${fmt(t.due_date)})</span>` : ""}</li>`).join("")}</ul>`
    : `<p style="margin:16px 0 0;font-size:14px;color:#138a5b"><b>Tudo em dia no seu checklist.</b> 👏</p>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><img src="https://rotta365.com.br/brand/logo-h.png" width="147" height="38" alt="Rotta 365" style="display:block;border:0"></td></tr>
<tr><td style="background:#fff;border:1px solid #e3e8f2;border-radius:16px;padding:28px">
<h1 style="margin:0 0 8px;font-size:21px;line-height:1.3;color:#0a1f4c">${esc(m.title(a.tripTitle))}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#0a1f4c">${first ? `Oi, ${esc(first)}! ` : ""}${esc(m.body)}</p>
${items}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="border-radius:12px;background:#205bff"><a href="${a.url}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#fff;text-decoration:none">Abrir meu checklist</a></td></tr></table>
</td></tr>
<tr><td style="padding:18px 8px 0;font-size:12px;color:#5d6477;text-align:center">Você recebe este lembrete porque tem uma viagem no Rotta 365.<br>Rotta 365 · <a href="https://rotta365.com.br" style="color:#5d6477">rotta365.com.br</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${m.title(a.tripTitle)}\n\n${m.body}\n\n${a.tasks.map((t) => `- ${t.label}${t.due_date ? ` (até ${fmt(t.due_date)})` : ""}`).join("\n")}\n\nAbrir: ${a.url}`;
  return { subject: m.title(a.tripTitle), html, text };
}
