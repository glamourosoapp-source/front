"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        await login(String(form.get("email")), String(form.get("password")));
      } else {
        await register({
          organizationName: "Glamouroso",
          name: String(form.get("name")),
          email: String(form.get("email")),
          password: String(form.get("password")),
        });
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion");
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">G</div>
        <h1>Glamouroso CRM</h1>
        <p>Pedidos, clientes, WhatsApp IA y campanas.</p>
        {mode === "register" && <input className="input" name="name" placeholder="Nombre" required />}
        <input className="input" name="email" placeholder="Correo" type="email" required />
        <input className="input" name="password" placeholder="Password" type="password" minLength={6} required />
        {error && <span className="login-error">{error}</span>}
        <button className="button" type="submit">{mode === "login" ? "Entrar" : "Crear cuenta"}</button>
        <button className="link-button" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Crear primer admin" : "Ya tengo cuenta"}
        </button>
      </form>
    </main>
  );
}
