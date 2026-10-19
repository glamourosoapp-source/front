"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { landingRouteFor } from "@/lib/permissions";
import { resolvePermissions } from "@glamouroso/shared";
import { getApiErrorMessage } from "@/services/http-client";
import { canUseSupervisorApp } from "@/lib/session";
import "./login.css";

/**
 * Con `?app=supervisor` es el login de la app del supervisor de caja: guarda
 * la sesión en su propia llave (`lib/session.ts`), así que entrar en la PC de
 * la tienda no cierra la caja del cajero. Quien no tiene esa app (un cajero)
 * entra normal a su pantalla con la sesión principal.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const supervisorApp = useSearchParams().get("app") === "supervisor";
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      if (supervisorApp) {
        // Quien tiene la app del supervisor queda en su llave. Un cajero (o
        // cualquier otro) que escribe aquí sus datos entra normal a su pantalla,
        // con la sesión principal: no se le rechaza ni se queda como supervisor.
        await login(String(form.get("email")), String(form.get("password")), {
          space: (user) => (canUseSupervisorApp(user) ? "supervisor" : "main"),
        });
        if (useAuthStore.getState().space === "supervisor") {
          router.push("/supervisor");
          return;
        }
      } else {
        await login(String(form.get("email")), String(form.get("password")));
      }
      // Un cajero, fábrica o franquicia no tienen dashboard: entran a su propia
      // pantalla. El resto sigue aterrizando en /dashboard como siempre.
      const user = useAuthStore.getState().user;
      router.push(
        landingRouteFor(resolvePermissions(user?.role, user?.profile?.permissions ?? null))
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo iniciar sesión"));
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
            <h2 className="page-title login-card-title">{supervisorApp ? "Supervisor de caja" : "Bienvenido de nuevo"}</h2>
            <p className="page-kicker">
              {supervisorApp
                ? "Entra con tu usuario de supervisor. Si en esta computadora está abierta la caja, sigue abierta con su cajero."
                : "Ingresa a tu panel de pedidos, clientes y WhatsApp IA."}
            </p>
          </div>

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
            {loading ? "Ingresando..." : "Entrar"}
          </button>

          {supervisorApp && (
            <a className="login-switch" href="/login">
              ¿Vas a la caja o al panel? Entra aquí
            </a>
          )}
        </form>
      </section>
    </main>
  );
}
