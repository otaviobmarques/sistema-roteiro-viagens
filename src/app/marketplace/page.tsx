import Link from "next/link";
import { Logo, PinoAvatar } from "@/components/ui";

export const metadata = { title: "Marketplace de roteiros" };

export default function Marketplace() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
        <PinoAvatar mood="achei" size={64} />
        <h1 className="text-2xl font-extrabold">Marketplace de roteiros · em breve</h1>
        <p className="max-w-lg text-sm text-gray">Criadores e viajantes vão publicar roteiros prontos para você copiar e adaptar às suas datas. Enquanto isso, qualquer viagem pode virar uma página pública para compartilhar.</p>
        <Link href="/app" className="btn-primary">Voltar ao painel</Link>
      </div>
    </div>
  );
}
