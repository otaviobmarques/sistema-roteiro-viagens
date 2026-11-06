// Chegada pelo link "Esqueci minha senha": a pessoa já está logada pelo link e só escolhe a nova senha.
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { ChangePassword } from "@/components/account/change-password";

export const metadata = { title: "Nova senha" };

export default async function NewPasswordPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Conta" title="Crie sua nova senha" />
      <div className="card space-y-4 p-5">
        <p className="text-sm text-gray">Você entrou pelo link do e-mail. Escolha uma nova senha para os próximos acessos.</p>
        <ChangePassword />
        <Link href="/app" className="btn-ghost w-full">Ir para meus roteiros</Link>
      </div>
    </div>
  );
}
