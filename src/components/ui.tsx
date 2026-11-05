import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { badge } from "@/lib/domain/score";
import { initials } from "@/lib/types";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={clsx("inline-flex items-center", className)} aria-label="Rotta 365 — início">
      <Image src="/brand/logo-h.png" alt="Rotta 365" width={146} height={37} priority />
    </Link>
  );
}

export type PinoMood = "oi" | "achei" | "partiu";
export function PinoAvatar({ mood = "oi", size = 36, className }: { mood?: PinoMood; size?: number; className?: string }) {
  return <Image src={`/brand/pino-${mood}.png`} alt="Pino" width={size} height={size} className={clsx("shrink-0 rounded-full", className)} />;
}

export function PinoFull({ size = 220, className }: { size?: number; className?: string }) {
  return <Image src="/brand/pino.png" alt="Pino, o pin explorador" width={size} height={Math.round(size * 1.115)} className={className} />;
}

export function ScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score == null) return null;
  const b = badge(score);
  return (
    <span
      title={b ? `${b.label} · score para você` : "score para você"}
      className={clsx(
        "mono inline-flex min-w-9 items-center justify-center rounded-lg px-1.5 py-0.5 text-xs font-semibold",
        b?.tone === "top" ? "bg-blue text-white" : b?.tone === "good" ? "bg-blue-50 text-blue" : "bg-ice text-gray",
        className,
      )}
    >
      {Number(score).toFixed(1)}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "blue" | "teal" | "warn" | "danger" | "ok"; className?: string }) {
  const tones = {
    neutral: "bg-ice text-gray border-line",
    blue: "bg-blue-50 text-blue border-blue/20",
    teal: "bg-teal-50 text-[#0b7f84] border-teal/30",
    warn: "bg-warn-50 text-warn border-warn/30",
    danger: "bg-danger-50 text-danger border-danger/30",
    ok: "bg-ok-50 text-ok border-ok/30",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", tones[tone], className)}>{children}</span>;
}

export function Avatar({ name, url, size = 28, className }: { name?: string | null; url?: string | null; size?: number; className?: string }) {
  const colors = ["#205BFF", "#11C2C8", "#0A1F4C", "#7B61FF", "#F59E0B"];
  const c = colors[(name || "?").charCodeAt(0) % colors.length];
  if (url) return <img src={url} alt={name || ""} width={size} height={size} className={clsx("rounded-full object-cover ring-2 ring-white", className)} style={{ width: size, height: size }} />;
  return (
    <span className={clsx("inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white", className)} style={{ width: size, height: size, background: c, fontSize: size * 0.4 }} aria-label={name || ""}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, text, action, mood = "oi" }: { title: string; text?: string; action?: React.ReactNode; mood?: PinoMood }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <PinoAvatar mood={mood} size={56} />
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="max-w-md text-sm text-gray">{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-line bg-white px-3 py-2.5", className)}>
      <div className="label">{label}</div>
      <div className="mono mt-0.5 text-lg font-semibold text-navy">{value}</div>
      {hint && <div className="text-xs text-gray">{hint}</div>}
    </div>
  );
}

export function PageTitle({ eyebrow, title, actions, children }: { eyebrow?: string; title: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold text-navy md:text-[28px]">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "danger" | "blue" | "ok"; children: React.ReactNode }) {
  const t = { warn: "border-warn/30 bg-warn-50 text-[#7a5212]", danger: "border-danger/30 bg-danger-50 text-danger", blue: "border-blue/20 bg-blue-50 text-navy", ok: "border-ok/30 bg-ok-50 text-ok" }[tone];
  return <div className={clsx("rounded-xl border px-3 py-2.5 text-sm", t)}>{children}</div>;
}
