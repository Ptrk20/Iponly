"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Leaf } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { loginInputSchema, registrationInputSchema } from "@/lib/validations/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const parsed = registering
      ? registrationInputSchema.safeParse({ name, email, password, confirmPassword })
      : loginInputSchema.safeParse({ email, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the information and try again.");
      return;
    }

    startTransition(async () => {
      try {
        if (registering) {
          const result = await authClient.signUp.email({ name, email, password });
          if (result.error) {
            setError("We couldn’t create your account. Check your details and try again.");
            return;
          }
          router.replace("/onboarding");
        } else {
          const result = await authClient.signIn.email({ email, password });
          if (result.error) {
            setError("Email or password is incorrect. Please try again.");
            return;
          }
          router.replace("/");
        }
        router.refresh();
      } catch {
        setError("Iponly couldn’t connect. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="auth-page">
      <div aria-hidden="true" className="auth-decoration auth-decoration-one" />
      <div aria-hidden="true" className="auth-decoration auth-decoration-two" />
      <section aria-labelledby="auth-title" className="auth-card">
        <Link aria-label="Iponly home" className="auth-brand" href="/login">
          <span className="auth-brand-mark"><Leaf aria-hidden="true" size={21} /></span>
          <span>Iponly</span>
        </Link>
        <p className="auth-tagline">Ipon. Budget. Bayad. Gala.</p>
        <div className="auth-heading">
          <p className="eyebrow">{registering ? "A clearer start" : "Your money, in view"}</p>
          <h1 id="auth-title">{registering ? "Create your account" : "Welcome back"}</h1>
          <p>{registering ? "Start organizing your ipon, budget, bayarin, and travel plans." : "Let’s check in on your ipon."}</p>
        </div>

        <form className="auth-form" noValidate onSubmit={submit}>
          {registering ? <label className="form-field"><span>Name</span><input autoComplete="name" maxLength={80} name="name" required /></label> : null}
          <label className="form-field"><span>Email</span><input autoComplete="email" inputMode="email" maxLength={254} name="email" required type="email" /></label>
          <label className="form-field"><span>Password</span><span className="password-control"><input autoComplete={registering ? "new-password" : "current-password"} maxLength={128} minLength={10} name="password" required type={showPassword ? "text" : "password"} /><button aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} type="button">{showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}</button></span>{registering ? <small>Use at least 10 characters.</small> : null}</label>
          {registering ? <label className="form-field"><span>Confirm password</span><span className="password-control"><input autoComplete="new-password" maxLength={128} name="confirmPassword" required type={showConfirmation ? "text" : "password"} /><button aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"} onClick={() => setShowConfirmation(!showConfirmation)} type="button">{showConfirmation ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}</button></span></label> : null}
          {error ? <p aria-live="assertive" className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary auth-submit" disabled={pending} type="submit">{pending ? "Please wait…" : registering ? "Create account" : "Log in"}</button>
        </form>

        <p className="auth-switch">{registering ? "Already have an account?" : "New to Iponly?"} <Link href={registering ? "/login" : "/register"}>{registering ? "Log in" : "Create an account"}</Link></p>
        <p className="auth-security-note">Your account details are protected. Never share your password with anyone.</p>
      </section>
    </div>
  );
}