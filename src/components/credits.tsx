// Créditos: site pela Agência RedBOX e sistema pela Domma Tecnologia (logos originais).
/* eslint-disable @next/next/no-img-element */

export function DommaLogo({ dark = false, className = "h-7" }: { dark?: boolean; className?: string }) {
  return <img src={dark ? "/brand/domma-branco.png" : "/brand/domma.png"} alt="Domma Tecnologia" className={`${className} w-auto`} />;
}

/** Rodapé completo (site e login): Agência RedBOX + Domma Tecnologia. */
export function Credits({ dark = false, size = "lg", className = "" }: { dark?: boolean; size?: "lg" | "md"; className?: string }) {
  const h = size === "lg" ? "h-9" : "h-7";
  return (
    <div className={`flex flex-wrap items-center gap-x-10 gap-y-4 text-xs ${dark ? "text-white/70" : "text-gray"} ${className}`}>
      <span className="inline-flex items-center gap-3">Site por <img src={dark ? "/brand/redbox-branco.png" : "/brand/redbox.png"} alt="Agência RedBOX" className={`${h} w-auto`} /></span>
      <span className="inline-flex items-center gap-3">Sistema desenvolvido por <DommaLogo dark={dark} className={h} /></span>
    </div>
  );
}

/** Crédito curto dentro do app. */
export function SystemCredit({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-[10px] text-gray ${className}`}>
      <span>Sistema por</span>
      <DommaLogo className="h-5" />
    </div>
  );
}
