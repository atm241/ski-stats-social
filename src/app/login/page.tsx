import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="mb-1 font-display text-3xl font-bold">Make your skier</h1>
      <p className="mb-6 text-ink-soft">Pick a name and an avatar. You can upload your ski days next.</p>
      <LoginForm />
    </div>
  );
}
