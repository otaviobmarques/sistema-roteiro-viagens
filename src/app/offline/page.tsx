import Link from "next/link";
import { Logo, PinoAvatar } from "@/components/ui";

export const metadata = { title: "Sem conexão" };

export default function Offline() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <PinoAvatar size={72} />
      <h1 className="text-2xl font-extrabold">Sem internet por aqui</h1>
      <p className="text-sm text-gray">
        Tudo bem: as páginas que você já abriu, como o roteiro e o modo Hoje, continuam disponíveis. Assim que a conexão voltar, eu atualizo tudo sozinho.
      </p>
      <Link href="/app" className="btn-primary">Abrir meu painel</Link>
    </div>
  );
}
