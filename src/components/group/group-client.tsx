"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Link2, Copy, Check, MessageCircle, UserPlus, Trash2, Vote, Send, History, Plus, X, Lock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { memberName, type Member, type Role, type Trip } from "@/lib/types";
import { Avatar, EmptyState, Notice, Pill } from "@/components/ui";

export type PollFull = {
  id: string; trip_id: string; question: string; day_id: string | null; closes_at: string | null; closed: boolean; created_by: string | null; created_at: string;
  poll_options: { id: string; poll_id: string; label: string; lat: number | null; lng: number | null; position: number }[];
  poll_votes: { poll_id: string; option_id: string; user_id: string }[];
};
export type ChatMessage = { id: string; trip_id: string; author_id: string | null; is_pino: boolean; channel: string; body: string; created_at: string };
export type ActivityRow = { id: number; trip_id: string; user_id: string | null; action: string; created_at: string };
export type InviteRow = { token: string; trip_id: string; role: string; created_by: string; expires_at: string; uses: number };
type DayLite = { id: string; date: string | null; title: string | null; position: number };

const ROLE_LABEL: Record<Role, string> = { organizador: "Organizador", editor: "Editor", visualizador: "Visualizador" };

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function GroupClient(props: {
  trip: Trip; members: Member[]; userId: string; role: Role; canEdit: boolean;
  initialPolls: PollFull[]; initialMessages: ChatMessage[]; activity: ActivityRow[]; days: DayLite[]; initialInvites: InviteRow[];
}) {
  const { trip, userId, role } = props;
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [members, setMembers] = useState(props.members);
  const [error, setError] = useState<string | null>(null);
  const isOrganizer = role === "organizador";
  const nameByUser = useMemo(() => new Map(members.filter((m) => m.user_id).map((m) => [m.user_id!, memberName(m)])), [members]);

  const log = (action: string) => supabase.from("activity_log").insert({ trip_id: trip.id, user_id: userId, action });

  const reloadMembers = async () => {
    const { data } = await supabase.from("trip_members").select("*, profiles!trip_members_user_id_fkey(name, avatar_url, pix_key)").eq("trip_id", trip.id).order("joined_at");
    setMembers((data ?? []) as Member[]);
  };

  const updateMember = async (m: Member, patch: Partial<Member>, action: string) => {
    const { error } = await supabase.from("trip_members").update(patch).eq("id", m.id);
    if (error) return setError(error.message);
    await log(action);
    reloadMembers();
  };

  const transferOwnership = async (m: Member) => {
    if (!m.user_id) return;
    if (!confirm(`Transferir a organização da viagem para ${memberName(m)}? Você vira editor (RN-01).`)) return;
    const { error } = await supabase.from("trips").update({ owner_id: m.user_id }).eq("id", trip.id);
    if (error) return setError(error.message);
    await log(`transferiu a organização para ${memberName(m)}`);
    router.refresh();
    reloadMembers();
  };

  const removeMember = async (m: Member) => {
    const self = m.user_id === userId;
    if (!confirm(self ? "Sair desta viagem?" : `Remover ${memberName(m)} da viagem?`)) return;
    const { error } = await supabase.from("trip_members").delete().eq("id", m.id);
    if (error) return setError(error.message.includes("foreign") ? "Essa pessoa tem gastos lançados; exclua ou redistribua os gastos antes." : error.message);
    if (!self) await log(`removeu ${memberName(m)}`);
    if (self) { router.push("/app"); return; }
    reloadMembers();
  };

  const [guest, setGuest] = useState("");
  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest.trim()) return;
    const { error } = await supabase.from("trip_members").insert({ trip_id: trip.id, guest_name: guest.trim(), role: "visualizador", can_see_expenses: false, invited_by: userId });
    if (error) return setError(error.message);
    await log(`adicionou ${guest.trim()} como participante`);
    setGuest("");
    reloadMembers();
  };

  return (
    <div className="space-y-5">
      {error && <Notice tone="danger">{error} <button className="ml-2 underline" onClick={() => setError(null)}>ok</button></Notice>}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="card p-4" aria-labelledby="viajantes">
            <h2 id="viajantes" className="mb-3 text-lg font-bold">Viajantes <span className="mono text-sm text-gray">({members.length})</span></h2>
            <ul className="divide-y divide-line">
              {members.map((m) => {
                const self = m.user_id === userId;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={memberName(m)} url={m.profiles?.avatar_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{memberName(m)}{self && <span className="text-gray"> (você)</span>}</div>
                      <div className="flex flex-wrap gap-1 text-xs text-gray">
                        {m.user_id ? <span>no app desde {new Date(m.joined_at).toLocaleDateString("pt-BR")}</span> : <Pill>sem conta · só para dividir gastos</Pill>}
                        {m.role === "visualizador" && m.user_id && (m.can_see_expenses ? <Pill tone="ok">vê gastos</Pill> : <Pill><Lock size={10} /> não vê gastos</Pill>)}
                      </div>
                    </div>
                    {isOrganizer && m.role !== "organizador" && m.user_id ? (
                      <select className="input w-auto min-w-36" value={m.role} aria-label={`Papel de ${memberName(m)}`}
                        onChange={(e) => updateMember(m, { role: e.target.value as Role, can_see_expenses: e.target.value !== "visualizador" ? true : m.can_see_expenses }, `mudou ${memberName(m)} para ${ROLE_LABEL[e.target.value as Role]}`)}>
                        <option value="editor">Editor</option>
                        <option value="visualizador">Visualizador</option>
                      </select>
                    ) : (
                      <Pill tone={m.role === "organizador" ? "blue" : "neutral"}>{ROLE_LABEL[m.role]}</Pill>
                    )}
                    {isOrganizer && m.role === "visualizador" && m.user_id && (
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={m.can_see_expenses}
                        onChange={(e) => updateMember(m, { can_see_expenses: e.target.checked }, `${e.target.checked ? "liberou" : "bloqueou"} gastos para ${memberName(m)}`)} /> ver gastos</label>
                    )}
                    {isOrganizer && m.role !== "organizador" && m.user_id && (
                      <button className="btn-ghost btn-sm text-xs" onClick={() => transferOwnership(m)}>tornar organizador</button>
                    )}
                    {((isOrganizer && m.role !== "organizador") || (self && m.role !== "organizador")) && (
                      <button className="btn-ghost btn-sm w-9 px-0" onClick={() => removeMember(m)} aria-label={self ? "Sair da viagem" : `Remover ${memberName(m)}`}><Trash2 size={15} /></button>
                    )}
                  </li>
                );
              })}
            </ul>
            {isOrganizer && (
              <form onSubmit={addGuest} className="mt-3 flex gap-2">
                <input className="input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Nome de quem não tem conta (ex.: Tio João)" aria-label="Nome do participante sem conta" />
                <button className="btn-secondary shrink-0"><UserPlus size={15} /> Adicionar</button>
              </form>
            )}
          </section>

          <PollsPanel {...props} log={log} />
          <ChatPanel trip={trip} userId={userId} nameByUser={nameByUser} initial={props.initialMessages} />
        </div>

        <aside className="space-y-5">
          {isOrganizer ? <InvitePanel trip={trip} userId={userId} initial={props.initialInvites} log={log} /> : (
            <div className="card p-4 text-sm text-gray">Só o organizador cria convites. Peça o link para quem organiza a viagem.</div>
          )}
          <section className="card p-4" aria-labelledby="atividade">
            <h2 id="atividade" className="mb-3 flex items-center gap-2 font-bold"><History size={16} /> Atividade</h2>
            {props.activity.length === 0 ? <p className="text-sm text-gray">Nada por aqui ainda.</p> : (
              <ul className="space-y-2 text-sm">
                {props.activity.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <Avatar name={a.user_id ? nameByUser.get(a.user_id) ?? "?" : "?"} size={22} />
                    <div className="min-w-0 flex-1"><b>{a.user_id ? nameByUser.get(a.user_id) ?? "Alguém" : "Alguém"}</b> {a.action}</div>
                    <span className="shrink-0 text-xs text-gray">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function InvitePanel({ trip, userId, initial, log }: { trip: Trip; userId: string; initial: InviteRow[]; log: (a: string) => unknown }) {
  const supabase = supabaseBrowser();
  const [invites, setInvites] = useState(initial);
  const [role, setRole] = useState<"editor" | "visualizador">("editor");
  const [days, setDays] = useState(14);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = (t: string) => `${origin}/convite/${t}`;

  const create = async () => {
    setErr(null);
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await supabase.from("trip_invites").insert({ trip_id: trip.id, role, created_by: userId, expires_at: expires }).select("*").single();
    if (error) return setErr(error.message);
    await log(`criou um convite de ${role}`);
    setInvites([data as InviteRow, ...invites]);
  };
  const revoke = async (t: string) => {
    await supabase.from("trip_invites").delete().eq("token", t);
    setInvites(invites.filter((i) => i.token !== t));
  };
  const copy = async (t: string) => {
    await navigator.clipboard.writeText(link(t));
    setCopied(t);
    setTimeout(() => setCopied(null), 2000);
  };
  const whatsapp = (t: string) => `https://wa.me/?text=${encodeURIComponent(`Bora planejar "${trip.title}" juntos no Rotta 365? Entre pelo link: ${link(t)}`)}`;
  const active = invites.filter((i) => new Date(i.expires_at) > new Date());

  return (
    <section className="card p-4" aria-labelledby="convidar">
      <h2 id="convidar" className="mb-3 flex items-center gap-2 font-bold"><Link2 size={16} /> Convidar por link</h2>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">Papel</span>
          <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value as "editor" | "visualizador")}>
            <option value="editor">Editor</option><option value="visualizador">Visualizador</option>
          </select></label>
        <label><span className="label">Validade</span>
          <select className="input mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 dia</option><option value={7}>7 dias</option><option value={14}>14 dias</option><option value={30}>30 dias</option>
          </select></label>
      </div>
      <button className="btn-primary mt-3 w-full" onClick={create}><Plus size={15} /> Gerar link de convite</button>
      {err && <div className="mt-2"><Notice tone="danger">{err}</Notice></div>}
      {active.length > 0 && (
        <ul className="mt-4 space-y-2">
          {active.map((i) => (
            <li key={i.token} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-gray">
                <span><Pill tone="blue">{i.role === "editor" ? "Editor" : "Visualizador"}</Pill> até {new Date(i.expires_at).toLocaleDateString("pt-BR")} · {i.uses} uso(s)</span>
                <button className="underline" onClick={() => revoke(i.token)}>revogar</button>
              </div>
              <div className="mono mt-2 truncate text-[11px]">{link(i.token)}</div>
              <div className="mt-2 flex gap-2">
                <button className="btn-secondary btn-sm flex-1" onClick={() => copy(i.token)}>{copied === i.token ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}</button>
                <a className="btn-secondary btn-sm flex-1" href={whatsapp(i.token)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-gray">Quem abrir o link vê a prévia da viagem e entra depois de fazer login.</p>
    </section>
  );
}

function PollsPanel({ trip, userId, role, canEdit, initialPolls, days, log }: {
  trip: Trip; userId: string; role: Role; canEdit: boolean; initialPolls: PollFull[]; days: DayLite[]; log: (a: string) => unknown;
}) {
  const supabase = supabaseBrowser();
  const [polls, setPolls] = useState(initialPolls);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [dayId, setDayId] = useState("");
  const [tieFor, setTieFor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isOrganizer = role === "organizador";

  const reload = async () => {
    const { data } = await supabase.from("polls").select("*, poll_options(*), poll_votes(*)").eq("trip_id", trip.id).order("created_at", { ascending: false });
    setPolls((data ?? []) as PollFull[]);
  };

  useEffect(() => {
    const ch = supabase.channel(`polls:${trip.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "polls", filter: `trip_id=eq.${trip.id}` }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return setErr("Escreva a pergunta e pelo menos duas opções.");
    const { data: poll, error } = await supabase.from("polls").insert({ trip_id: trip.id, question: question.trim(), day_id: dayId || null, created_by: userId }).select("id").single();
    if (error) return setErr(error.message);
    const { error: e2 } = await supabase.from("poll_options").insert(opts.map((label, i) => ({ poll_id: poll.id, label, position: i })));
    if (e2) return setErr(e2.message);
    await log(`criou a enquete "${question.trim()}"`);
    setQuestion(""); setOptions(["", ""]); setDayId(""); setCreating(false);
    reload();
  };

  const vote = async (p: PollFull, optionId: string) => {
    const mine = p.poll_votes.find((v) => v.user_id === userId);
    const { error } = mine
      ? await supabase.from("poll_votes").update({ option_id: optionId }).eq("poll_id", p.id).eq("user_id", userId)
      : await supabase.from("poll_votes").insert({ poll_id: p.id, option_id: optionId, user_id: userId });
    if (error) return setErr(error.message);
    reload();
  };

  /** RN-10: ao encerrar, a vencedora entra no dia indicado; empate, decide o organizador. */
  const close = async (p: PollFull, chosen?: string) => {
    const counts = p.poll_options.map((o) => ({ o, n: p.poll_votes.filter((v) => v.option_id === o.id).length }));
    const max = Math.max(0, ...counts.map((c) => c.n));
    const top = counts.filter((c) => c.n === max);
    let winner = chosen ? p.poll_options.find((o) => o.id === chosen) : top.length === 1 ? top[0].o : undefined;
    if (!winner && max === 0 && !chosen) { setTieFor(p.id); return; }
    if (!winner) { setTieFor(p.id); return; }
    const { error } = await supabase.from("polls").update({ closed: true }).eq("id", p.id);
    if (error) return setErr(error.message);
    if (p.day_id) {
      const { data: last } = await supabase.from("itinerary_items").select("position").eq("day_id", p.day_id).order("position", { ascending: false }).limit(1).maybeSingle();
      const { error: e3 } = await supabase.from("itinerary_items").insert({
        trip_id: trip.id, day_id: p.day_id, kind: "lugar", title: winner.label, lat: winner.lat, lng: winner.lng, duration_min: 90,
        position: (last?.position ?? -1) + 1, why: `Escolhido pelo grupo na enquete "${p.question}".`, created_by: userId,
      });
      if (e3) setErr(`Enquete encerrada, mas não foi possível incluir no roteiro: ${e3.message}`);
    }
    await log(`encerrou a enquete "${p.question}" — venceu ${winner.label}${p.day_id ? " (incluída no roteiro)" : ""}`);
    setTieFor(null);
    winner = undefined;
    reload();
  };

  const dayLabel = (id: string | null) => {
    const d = days.find((x) => x.id === id);
    if (!d) return null;
    return `Dia ${d.position + 1}${d.date ? ` · ${d.date.split("-").reverse().slice(0, 2).join("/")}` : ""}`;
  };

  return (
    <section className="card p-4" aria-labelledby="enquetes">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="enquetes" className="flex items-center gap-2 text-lg font-bold"><Vote size={17} /> Enquetes</h2>
        {canEdit && <button className="btn-secondary btn-sm" onClick={() => setCreating((v) => !v)}>{creating ? <X size={14} /> : <Plus size={14} />} {creating ? "Cancelar" : "Nova enquete"}</button>}
      </div>
      {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
      {creating && (
        <form onSubmit={create} className="mb-4 space-y-2 rounded-xl border border-line bg-ice/60 p-3">
          <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Jantar de sábado: onde?" aria-label="Pergunta" />
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" value={o} onChange={(e) => setOptions(options.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Opção ${i + 1}`} aria-label={`Opção ${i + 1}`} />
              {options.length > 2 && <button type="button" className="btn-ghost w-11 px-0" onClick={() => setOptions(options.filter((_, k) => k !== i))} aria-label="Remover opção"><X size={15} /></button>}
            </div>
          ))}
          <button type="button" className="text-sm font-semibold text-blue" onClick={() => setOptions([...options, ""])}>+ opção</button>
          {days.length > 0 && (
            <label className="block"><span className="label">A vencedora entra no roteiro (opcional)</span>
              <select className="input mt-1" value={dayId} onChange={(e) => setDayId(e.target.value)}>
                <option value="">Não incluir automaticamente</option>
                {days.map((d) => <option key={d.id} value={d.id}>{dayLabel(d.id)}{d.title ? ` — ${d.title}` : ""}</option>)}
              </select></label>
          )}
          <button className="btn-primary w-full">Criar enquete</button>
        </form>
      )}
      {polls.length === 0 ? (
        <EmptyState title="Sem enquetes" text="Na dúvida entre dois lugares? Crie uma enquete e a opção vencedora pode entrar direto no roteiro." />
      ) : (
        <ul className="space-y-3">
          {polls.map((p) => {
            const total = p.poll_votes.length;
            const mine = p.poll_votes.find((v) => v.user_id === userId)?.option_id;
            const counts = p.poll_options.map((o) => p.poll_votes.filter((v) => v.option_id === o.id).length);
            const max = Math.max(0, ...counts);
            return (
              <li key={p.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{p.question}</div>
                  <div className="flex items-center gap-1.5 text-xs text-gray">
                    {dayLabel(p.day_id) && <Pill tone="teal">{dayLabel(p.day_id)}</Pill>}
                    <span className="mono">{total} voto(s)</span>
                    {p.closed && <Pill tone="ok">encerrada</Pill>}
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {[...p.poll_options].sort((a, b) => a.position - b.position).map((o) => {
                    const n = p.poll_votes.filter((v) => v.option_id === o.id).length;
                    const pct = total ? Math.round((n / total) * 100) : 0;
                    return (
                      <li key={o.id}>
                        <button disabled={p.closed} onClick={() => vote(p, o.id)} aria-pressed={mine === o.id}
                          className={clsx("relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-default",
                            mine === o.id ? "border-blue" : "border-line hover:border-blue/40")}>
                          <span className="absolute inset-y-0 left-0 bg-blue-50" style={{ width: `${pct}%` }} aria-hidden />
                          <span className="relative flex justify-between gap-2">
                            <span className={clsx(p.closed && n === max && max > 0 && "font-bold")}>{o.label}{mine === o.id && " ✓"}</span>
                            <span className="mono text-xs">{pct}%</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!p.closed && (isOrganizer || p.created_by === userId) && (
                  <div className="mt-2 text-right"><button className="btn-ghost btn-sm" onClick={() => close(p)}>Encerrar enquete</button></div>
                )}
                {tieFor === p.id && (
                  <div className="mt-2 rounded-lg border border-warn/30 bg-warn-50 p-2 text-sm">
                    <p className="mb-2">{max === 0 ? "Ninguém votou ainda. Escolha a opção vencedora:" : "Deu empate. Como organizador, escolha a vencedora:"}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.poll_options.filter((o, i) => max === 0 || counts[i] === max).map((o) => (
                        <button key={o.id} className="btn-secondary btn-sm" onClick={() => close(p, o.id)}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ChatPanel({ trip, userId, nameByUser, initial }: { trip: Trip; userId: string; nameByUser: Map<string, string>; initial: ChatMessage[] }) {
  const supabase = supabaseBrowser();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ch = supabase.channel(`chat:${trip.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `trip_id=eq.${trip.id}` }, (payload: { new: ChatMessage }) => {
        const m = payload.new;
        if (m.channel !== "grupo") return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await supabase.from("messages").insert({ trip_id: trip.id, author_id: userId, channel: "grupo", body }).select("*").single();
    if (error) { setErr(error.message); setText(body); return; }
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as ChatMessage]));
  };

  return (
    <section className="card flex flex-col p-4" aria-labelledby="chat">
      <h2 id="chat" className="mb-3 flex items-center gap-2 text-lg font-bold"><MessageCircle size={17} /> Conversa do grupo</h2>
      <div className="max-h-[380px] min-h-[160px] space-y-2 overflow-y-auto rounded-xl bg-ice/60 p-3" aria-live="polite">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-gray">Comece a conversa: combine horários, divida tarefas, mande ideias.</p>}
        {messages.map((m) => {
          const mine = m.author_id === userId;
          const name = m.author_id ? nameByUser.get(m.author_id) ?? "Alguém" : "Pino";
          return (
            <div key={m.id} className={clsx("flex gap-2", mine && "flex-row-reverse")}>
              {!mine && <Avatar name={name} size={26} />}
              <div className={clsx("max-w-[78%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-blue text-white" : "border border-line bg-white")}>
                {!mine && <div className="text-[11px] font-semibold text-gray">{name}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={clsx("mt-0.5 text-[10px]", mine ? "text-white/70" : "text-gray")}>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {err && <div className="mt-2"><Notice tone="danger">{err}</Notice></div>}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem" aria-label="Mensagem" maxLength={2000} />
        <button className="btn-primary w-11 shrink-0 px-0" aria-label="Enviar"><Send size={16} /></button>
      </form>
    </section>
  );
}
