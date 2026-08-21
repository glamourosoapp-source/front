// Página pública (sin login) con la bitácora de novedades para dirección.
// El gate de sesión vive en el layout de /dashboard, así que esta ruta, al
// colgar de la raíz, se abre con solo tener el link.
import {
  Bot,
  ClipboardList,
  Container,
  PackageSearch,
  Printer,
  Sparkles,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import type { ChangeGroup, ChangeTag } from "./updates";
import { RELEASES } from "./updates";
import "./novedades.css";

const GROUP_ICONS: Record<ChangeGroup["icon"], typeof ClipboardList> = {
  orders: ClipboardList,
  print: Printer,
  container: Container,
  delivery: Truck,
  catalog: PackageSearch,
  team: Users,
  bot: Bot,
  fix: Wrench,
};

const TAG_LABELS: Record<ChangeTag, string> = {
  nuevo: "Nuevo",
  mejora: "Mejora",
  correccion: "Corrección",
};

export default function NovedadesPage() {
  const [release, ...history] = RELEASES;

  return (
    <main className="news">
      <header className="news-hero">
        <div className="news-hero-bg" aria-hidden="true">
          <span className="news-hero-glow" />
          <span className="news-hero-bubble news-hero-bubble-1" />
          <span className="news-hero-bubble news-hero-bubble-2" />
          <span className="news-hero-bubble news-hero-bubble-3" />
        </div>

        <div className="news-hero-inner">
          <div className="news-hero-brand">
            <img
              className="news-hero-logo"
              src="/branding/glamouroso-logo-azul-sobre-blanco.svg"
              alt="Glamouroso"
              width={196}
              height={48}
            />
            <span className="news-hero-badge">
              <Sparkles size={14} aria-hidden="true" />
              Reporte semanal de la plataforma
            </span>
          </div>

          <div className="news-hero-copy">
            <h1 className="news-hero-title">Lo nuevo en el CRM</h1>
            <p className="news-hero-range">{release.range}</p>
            <p className="news-hero-summary">{release.summary}</p>
          </div>

          <ul className="news-stats">
            {release.stats.map((stat) => (
              <li className="news-stat" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="news-hero-mascot" aria-hidden="true">
          <img src="/branding/don-glamouroso.svg" alt="" width={128} height={213} />
        </figure>
      </header>

      <section className="news-section" aria-labelledby="destacados">
        <h2 className="news-section-title" id="destacados">
          Lo más importante
        </h2>
        <div className="news-highlights">
          {release.highlights.map((item) => (
            <article className="news-highlight" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <nav className="news-index" aria-label="Índice de temas">
        {release.groups.map((group) => (
          <a className="news-index-link" href={`#${group.id}`} key={group.id}>
            {group.title}
            <span>{group.items.length}</span>
          </a>
        ))}
      </nav>

      <section className="news-section" aria-labelledby="detalle">
        <h2 className="news-section-title" id="detalle">
          El detalle, por área
        </h2>

        <div className="news-groups">
          {release.groups.map((group) => {
            const Icon = GROUP_ICONS[group.icon];
            return (
              <article className="news-group" id={group.id} key={group.id}>
                <header className="news-group-head">
                  <span className="news-group-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.intro}</p>
                  </div>
                </header>

                <ul className="news-items">
                  {group.items.map((item) => (
                    <li className="news-item" key={item.title}>
                      <div className="news-item-head">
                        <h4>{item.title}</h4>
                        <span className={`news-tag news-tag-${item.tag}`}>
                          {TAG_LABELS[item.tag]}
                        </span>
                      </div>
                      <p className="news-item-what">{item.what}</p>
                      <p className="news-item-why">
                        <span>Para el negocio</span>
                        {item.why}
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {history.length > 0 ? (
        <section className="news-section" aria-labelledby="historial">
          <h2 className="news-section-title" id="historial">
            Semanas anteriores
          </h2>
          <ul className="news-history">
            {history.map((past) => (
              <li key={past.id}>
                <strong>{past.range}</strong>
                <span>{past.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="news-footer">
        <img
          src="/branding/glamouroso-logo-g-azul.svg"
          alt=""
          aria-hidden="true"
          width={26}
          height={34}
        />
        <p>
          Reporte del avance de la plataforma Glamouroso · {release.range}. Cada cambio descrito
          aquí ya está funcionando en producción.
        </p>
      </footer>
    </main>
  );
}
