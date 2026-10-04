import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError =
    error === "not-admin"
      ? "This account does not have admin access to Groomto."
      : undefined;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <LoginForm initialError={initialError} />
    </div>
  );
}
