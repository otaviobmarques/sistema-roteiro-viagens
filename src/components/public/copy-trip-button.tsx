"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function CopyTripButton({ tripId, slug }: { tripId: string; slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [start, setStart] = useState("");

  const copy = async () => {
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) {
      router.push(`/entrar?next=${encodeURIComponent(`/v/${slug}`)}`);
      return;
    }
    const { data: newId, error } = await sb.rpc("copy_trip", { p_trip: tripId, p_start: start || null });
    setBusy(false);
    if (error) setErr(error.message);
    else router.push(`/app/viagem/${newId}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5 text-sm">
        Minhas datas
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md bg-white px-2 py-1 text-navy" aria-label="Data de início da sua viagem" />
      </label>
      <button className="btn bg-white text-blue hover:bg-blue-50" onClick={copy} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" size={16} /> : <Copy size={16} />} Copiar este roteiro
      </button>
      {err && <span className="text-sm text-white">{err}</span>}
    </div>
  );
}
