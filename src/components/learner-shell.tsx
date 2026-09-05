import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { auth, signOut } from "@/lib/auth";

export async function LearnerShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <AppShell
      userName={session.user.name}
      userEmail={session.user.email}
      isAdmin={session.user.role === "ADMIN"}
      signOutAction={signOutAction}
    >
      {children}
    </AppShell>
  );
}
