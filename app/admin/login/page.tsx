import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdminUser } from "@/lib/auth/check-admin";

export const metadata: Metadata = {
  title: "Admin sign in",
};

export default async function AdminLoginPage() {
  // If already signed in as the admin, skip the form.
  const user = await getAdminUser();
  if (user) {
    redirect("/admin");
  }

  return (
    <main className="bg-muted/30 flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Qissa admin</CardTitle>
          <CardDescription>Sign in with the admin email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
