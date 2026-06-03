"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clock,
  MessageCircle,
  PauseCircle,
  Search,
  Send,
  UserRound,
  Warehouse,
} from "lucide-react";
import { httpClient } from "@/services/http-client";
import { Conversation } from "@/types";
import "./inbox.css";

function initials(name?: string) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function roleLabel(role: string) {
  if (role === "user") return "Cliente";
  if (role === "assistant") return "IA";
  if (role === "staff") return "Equipo";
  return role;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "human" | "agent">("all");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const rows = await httpClient.get<Conversation[]>("/conversations");
    setConversations(rows);
    if (!selected && rows[0]) await openConversation(rows[0].id);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openConversation(id: string) {
    const detail = await httpClient.get<Conversation>(`/conversations/${id}`);
    setSelected(detail);
  }

  async function toggleAgent(conversation: Conversation) {
    const updated = await httpClient.patch<Conversation>(`/conversations/${conversation.id}/agent`, {
      isAgentActive: !conversation.isAgentActive,
    });
    setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    await load();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    await httpClient.post(`/conversations/${selected.id}/messages`, { text: draft.trim() });
    setDraft("");
    await openConversation(selected.id);
    await load();
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const name = conversation.contactName || conversation.customer?.name || conversation.contactPhone || "";
      const matchesSearch = !term || name.toLowerCase().includes(term) || String(conversation.contactPhone || "").includes(term);
      const matchesFilter =
        filter === "all" ||
        (filter === "human" && (conversation.needsHumanReview || !conversation.isAgentActive)) ||
        (filter === "agent" && conversation.isAgentActive);
      return matchesSearch && matchesFilter;
    });
  }, [conversations, filter, search]);

  const pendingCount = conversations.filter((conversation) => conversation.needsHumanReview || !conversation.isAgentActive).length;
  const selectedName = selected?.contactName || selected?.customer?.name || selected?.contactPhone || "Sin conversacion";
  const messages = selected?.messages || [];

  return (
    <div className="inbox-page">
      <section className="inbox-list">
        <div className="inbox-list-header">
          <div>
            <h1>Inbox</h1>
            <p>WhatsApp Kapso · agente IA</p>
          </div>
          <span className="status-dot" title="Backend conectado" />
        </div>

        <label className="inbox-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente o WhatsApp" />
        </label>

        <div className="inbox-tabs">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button>
          <button className={filter === "human" ? "active attention" : "attention"} onClick={() => setFilter("human")}>
            Humanas {pendingCount > 0 && <span>{pendingCount}</span>}
          </button>
          <button className={filter === "agent" ? "active" : ""} onClick={() => setFilter("agent")}>IA activa</button>
        </div>

        <div className="conversation-stack">
          {loading && <div className="empty-mini">Cargando conversaciones...</div>}
          {!loading && filtered.length === 0 && <div className="empty-mini">No hay conversaciones para este filtro.</div>}
          {filtered.map((conversation) => {
            const name = conversation.contactName || conversation.customer?.name || conversation.contactPhone || "Sin nombre";
            const isActive = selected?.id === conversation.id;
            return (
              <button className={isActive ? "conversation-card active" : "conversation-card"} key={conversation.id} onClick={() => openConversation(conversation.id)}>
                <span className="avatar">{initials(name)}</span>
                <span className="conversation-main">
                  <strong>{name}</strong>
                  <small>{conversation.contactPhone || "WhatsApp"}</small>
                  <em>{conversation.isAgentActive ? "Agente atendiendo" : "Atencion humana"}</em>
                </span>
                <span className="conversation-meta">
                  <small>{formatTime(conversation.lastMessageAt)}</small>
                  {conversation.needsHumanReview ? <span className="alert-dot" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="chat-pane">
        {selected ? (
          <>
            <header className="chat-topbar">
              <div className="contact-title">
                <span className="avatar large">{initials(selectedName)}</span>
                <div>
                  <h2>{selectedName}</h2>
                  <p>{selected.contactPhone} · WhatsApp</p>
                </div>
              </div>
              <div className="chat-actions">
                <span className={selected.isAgentActive ? "agent-chip active" : "agent-chip paused"}>
                  {selected.isAgentActive ? <Bot size={15} /> : <PauseCircle size={15} />}
                  {selected.isAgentActive ? "IA activa" : "Control humano"}
                </span>
                <button className="outline-action" onClick={() => toggleAgent(selected)}>
                  {selected.isAgentActive ? "Tomar control" : "Liberar a IA"}
                </button>
              </div>
            </header>

            <div className="message-feed">
              <div className="day-divider">Hoy</div>
              {messages.length === 0 ? (
                <div className="empty-thread">
                  <MessageCircle size={42} />
                  <strong>No hay mensajes todavia</strong>
                  <span>Cuando entre un mensaje desde Kapso aparecera aqui.</span>
                </div>
              ) : (
                messages.map((message) => {
                  const fromCustomer = message.role === "user";
                  const fromAgent = message.role === "assistant";
                  return (
                    <article className={fromCustomer ? "message-row incoming" : "message-row outgoing"} key={message.id}>
                      {fromCustomer && <span className="avatar mini">{initials(selectedName)}</span>}
                      <div className={fromCustomer ? "bubble received" : fromAgent ? "bubble agent" : "bubble staff"}>
                        <span className="bubble-role">{roleLabel(message.role)}</span>
                        <p>{message.content}</p>
                        <time>{formatTime(message.createdAt)}</time>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Responder por WhatsApp..." />
              <button aria-label="Enviar mensaje">
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="empty-thread full">
            <MessageCircle size={48} />
            <strong>Selecciona una conversacion</strong>
            <span>El historial y el control del agente apareceran aqui.</span>
          </div>
        )}
      </section>

      <aside className="contact-side">
        <div className="side-card customer-card">
          <span className="avatar large">{initials(selectedName)}</span>
          <h3>{selectedName}</h3>
          <p>{selected?.contactPhone || "Sin WhatsApp"}</p>
          <div className="side-status">
            <CheckCircle2 size={16} />
            Cliente identificado
          </div>
        </div>

        <div className="side-card">
          <h4>Resumen IA</h4>
          <p className="muted">
            {messages[0]?.content
              ? "El cliente esta conversando sobre productos de limpieza y pedidos por WhatsApp."
              : "Aun no hay suficientes mensajes para generar un resumen."}
          </p>
        </div>

        <div className="side-card">
          <h4>Operacion</h4>
          <div className="fact-row">
            <Warehouse size={16} />
            <span>Canal</span>
            <strong>Kapso</strong>
          </div>
          <div className="fact-row">
            <Bot size={16} />
            <span>Agente</span>
            <strong>{selected?.isAgentActive ? "Activo" : "Pausado"}</strong>
          </div>
          <div className="fact-row">
            <Clock size={16} />
            <span>Ultimo mensaje</span>
            <strong>{formatTime(selected?.lastMessageAt) || "N/A"}</strong>
          </div>
        </div>

        <div className="side-card">
          <h4>Sugerencias</h4>
          <button className="suggestion" onClick={() => setDraft("Claro, te ayudo a cerrar tu pedido. ¿Me confirmas direccion de entrega y metodo de pago?")}>
            Confirmar entrega y pago
          </button>
          <button className="suggestion" onClick={() => setDraft("Tenemos disponibilidad. ¿Cuantos litros o piezas necesitas agregar al pedido?")}>
            Pedir cantidad
          </button>
          <button className="suggestion" onClick={() => setDraft("Te comunico con una persona del equipo para revisar tu caso con detalle.")}>
            Escalar a humano
          </button>
        </div>

        <div className="side-card">
          <h4>Perfil CRM</h4>
          <div className="fact-row">
            <UserRound size={16} />
            <span>Pedidos</span>
            <strong>{selected?.customer?.totalOrders || 0}</strong>
          </div>
          <div className="fact-row">
            <MessageCircle size={16} />
            <span>Estado</span>
            <strong>{selected?.status || "N/A"}</strong>
          </div>
        </div>
      </aside>
    </div>
  );
}
