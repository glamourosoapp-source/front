"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
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
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <section className="login-showcase" aria-hidden="true">
        <div className="login-showcase-bg">
          <span className="login-showcase-bubble login-showcase-bubble-1" />
          <span className="login-showcase-bubble login-showcase-bubble-2" />
          <span className="login-showcase-bubble login-showcase-bubble-3" />
          <span className="login-showcase-glow" />
        </div>

        <div className="login-showcase-copy">
          <span className="login-showcase-badge">
            <Sparkles size={14} />
            CRM WhatsApp IA
          </span>
          <h1 className="page-title login-showcase-title">
            Todo tu negocio,
            <br />
            una sola familia.
          </h1>
          <p className="page-kicker login-showcase-kicker">
            Pedidos, clientes, catalogo y campanas de WhatsApp con IA en un solo lugar.
          </p>
        </div>

        <figure className="login-showcase-family">
          <img src="/branding/familia-glamouroso.svg" alt="" width={480} height={368} />
        </figure>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <img
            className="login-logo"
            src="/branding/glamouroso-logo-azul-sobre-blanco.svg"
            alt="Glamouroso"
          />
          <div>
            <h2 className="page-title login-card-title">
              {mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
            </h2>
            <p className="page-kicker">
              {mode === "login"
                ? "Ingresa a tu panel de pedidos, clientes y WhatsApp IA."
                : "Configura el primer acceso admin de Glamouroso."}
            </p>
          </div>

          {mode === "register" && (
            <input className="input" name="name" placeholder="Nombre" required />
          )}
          <input className="input" name="email" placeholder="Correo" type="email" required />
          <input
            className="input"
            name="password"
            placeholder="Password"
            type="password"
            minLength={6}
            required
          />

          {error && <span className="login-error">{error}</span>}

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          <button
            className="link-button"
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Crear primer admin" : "Ya tengo cuenta"}
          </button>
        </form>
      </section>
    </main>
  );
}
