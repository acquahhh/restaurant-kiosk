import { LoginForm } from "./login-form";

export const metadata = { title: "Staff sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-sand px-6">
      <div className="w-full max-w-[420px] rounded-panel bg-canvas p-10 shadow-[0_1px_0_var(--color-sand-deep)]">
        <h1 className="text-3xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-2 text-lg text-ink-muted">Kitchen and management screens.</p>
        {error === "forbidden" ? (
          <p role="alert" className="mt-6 rounded-button bg-pepper-soft px-4 py-3 font-semibold text-pepper">
            Your account cannot open that screen.
          </p>
        ) : null}
        <LoginForm next={next ?? "/kitchen"} />
      </div>
    </main>
  );
}
