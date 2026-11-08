"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null, email: "" });
  const field =
    "mt-2 h-14 w-full rounded-button border-2 border-sand-deep bg-canvas px-4 text-lg outline-none focus:border-palm";
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="font-semibold">Email</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} className={field} />
      </label>
      <label className="block">
        <span className="font-semibold">Password</span>
        <input name="password" type="password" autoComplete="current-password" required autoFocus={Boolean(state.error)} className={field} />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-button bg-pepper-soft px-4 py-3 font-semibold text-pepper">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-button bg-palm text-lg font-semibold text-white active:bg-palm-deep disabled:bg-sand-deep disabled:text-ink-muted"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
