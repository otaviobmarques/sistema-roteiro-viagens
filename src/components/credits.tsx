// Créditos: site pela Agência RedBOX e sistema pela Domma Tecnologia.
/* eslint-disable @next/next/no-img-element */

export function DommaMark({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap leading-none ${className}`}>
      <b className={`font-extrabold tracking-tight ${dark ? "text-white" : "text-[#1D1238]"}`}>Domma</b>
      <span className="text-[0.62em] font-bold uppercase tracking-[0.25em] text-[#6B5BFF]">Tecnologia</span>
    </span>
  );
}

/** Rodapé completo (site): Agência RedBOX + Domma Tecnologia. */
export function Credits({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] ${dark ? "text-white/70" : "text-gray"} ${className}`}>
      <span className="inline-flex items-center gap-2">Site por <img src={dark ? "/brand/redbox-branco.png" : "/brand/redbox.png"} alt="Agência RedBOX" className="h-3.5 w-auto" /></span>
      <span className="inline-flex items-center gap-2">Sistema desenvolvido por <DommaMark dark={dark} className="text-[13px]" /></span>
    </div>
  );
}

/** Linha curta para dentro do app. */
export function SystemCredit({ className = "" }: { className?: string }) {
  return <div className={`text-center text-[10px] text-gray ${className}`}>Sistema desenvolvido por <DommaMark className="text-[11px]" /></div>;
}
