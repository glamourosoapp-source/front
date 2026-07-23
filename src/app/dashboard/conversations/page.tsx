"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MessageCircle,
  Mic,
  Paperclip,
  PauseCircle,
  Search,
  Send,
  Trash2,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { getApiErrorMessage, httpClient } from "@/services/http-client";
import { useConversationStream, type ConnectionState } from "@/hooks/useConversationStream";
import { usePermissions } from "@/lib/permissions";
import { Conversation } from "@/types";
import type { ConversationMessage, ConversationPatch, MessageMedia } from "@glamouroso/shared/entities";
import { toast } from "sonner";
import "./inbox.css";

// Si el agente marco "escribiendo..." pero nunca llega su respuesta (fallo de
// eve, respuesta vacia, sesion desfasada), apagamos el indicador tras este
// tiempo para que los puntitos no queden animados para siempre.
const TYPING_WATCHDOG_MS = 75_000;

interface PendingAttachment {
  dataBase64: string;
  mimeType: string;
  fileName: string;
  previewUrl: string;
}

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

function dayLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoy";
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "long" }).format(date);
}

// Convierte el patch realtime (null-able) a los campos de Conversation, mapeando
// null -> undefined y descartando lo que no vive en la entidad (derivationReason).
function patchToConversation(patch: ConversationPatch): Partial<Conversation> {
  return {
    isAgentActive: patch.isAgentActive,
    needsHumanReview: patch.needsHumanReview,
    status: patch.status,
    contactName: patch.contactName ?? undefined,
    lastMessageAt: patch.lastMessageAt ?? undefined,
  };
}

function roleLabel(role: string) {
  if (role === "user") return "Cliente";
  if (role === "assistant") return "IA";
  if (role === "staff") return "Equipo";
  return role;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop()! : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MediaBubble({ media, onImageClick }: { media: MessageMedia; onImageClick: (url: string) => void }) {
  if (media.type === "image" || media.type === "sticker") {
    return (
      <img
        src={media.url}
        alt={media.caption || media.fileName || "imagen"}
        className="bubble-media-image"
        onClick={() => onImageClick(media.url)}
      />
    );
  }
  if (media.type === "audio") {
    return <audio controls src={media.url} className="bubble-media-audio" />;
  }
  if (media.type === "video") {
    return <video controls src={media.url} className="bubble-media-video" />;
  }
  return (
    <a className="bubble-media-file" href={media.url} target="_blank" rel="noreferrer" download>
      <FileText size={20} />
      <span>{media.fileName || "Archivo"}</span>
      <Download size={16} />
    </a>
  );
}

export default function ConversationsPage() {
  const { can } = usePermissions();
  const canDelete = can("conversations", "delete");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const selectedRef = useRef<Conversation | null>(null);
  selectedRef.current = selected;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "human" | "agent">("all");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [recording, setRecording] = useState(false);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, boolean>>({});
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await httpClient.get<Conversation[]>("/conversations");
    setConversations(rows);
    if (!selectedRef.current && rows[0]) await openConversation(rows[0].id);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  // Limpia los timers del watchdog de "escribiendo..." al desmontar.
  useEffect(() => {
    const timers = typingTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  async function openConversation(id: string) {
    const detail = await httpClient.get<Conversation>(`/conversations/${id}`);
    setConfirmDelete(false);
    setSelected(detail);
  }

  // Recarga la lista y el detalle abierto SIN el spinner de carga. Se usa para
  // ponerse al dia tras reconectar el SSE (mensajes perdidos durante la caida) y
  // ante eventos de conversaciones que no estan en la lista.
  const reloadSilent = useCallback(async () => {
    try {
      const rows = await httpClient.get<Conversation[]>("/conversations");
      setConversations(rows);
      const current = selectedRef.current;
      if (current) {
        const detail = await httpClient.get<Conversation>(`/conversations/${current.id}`);
        setSelected(detail);
      }
    } catch {
      /* best-effort: si falla, el proximo evento o accion recargara */
    }
  }, []);

  // --- Tiempo real (SSE) ---
  const handleStreamEvent = useCallback((event: { type: string } & Record<string, unknown>) => {
    if (event.type === "agent_typing") {
      const conversationId = event.conversationId as string;
      const on = event.on as boolean;
      setTypingByConversation((prev) => ({ ...prev, [conversationId]: on }));

      // Watchdog: reinicia cualquier timer previo; si "on", programa el apagado.
      const timers = typingTimersRef.current;
      const existing = timers.get(conversationId);
      if (existing) {
        clearTimeout(existing);
        timers.delete(conversationId);
      }
      if (on) {
        timers.set(
          conversationId,
          setTimeout(() => {
            timers.delete(conversationId);
            setTypingByConversation((prev) => ({ ...prev, [conversationId]: false }));
          }, TYPING_WATCHDOG_MS)
        );
      }
      return;
    }
    if (event.type === "conversation_updated") {
      const conversationId = event.conversationId as string;
      const update = patchToConversation(event.patch as ConversationPatch);
      // Refleja control del agente / derivacion / status en vivo (sin recargar).
      setSelected((current) =>
        current?.id === conversationId ? { ...current, ...update } : current
      );
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          reloadSilent().catch(() => undefined);
          return prev;
        }
        return prev.map((c) => (c.id === conversationId ? { ...c, ...update } : c));
      });
      return;
    }
    if (event.type === "message_created") {
      const conversationId = event.conversationId as string;
      const message = event.message as ConversationMessage;

      // Si llega un mensaje, el agente dejó de escribir
      if (message.role !== "user") {
        setTypingByConversation((prev) => ({ ...prev, [conversationId]: false }));
        const timer = typingTimersRef.current.get(conversationId);
        if (timer) {
          clearTimeout(timer);
          typingTimersRef.current.delete(conversationId);
        }
      }

      // Anexar al hilo abierto (dedupe por id, reemplaza optimista temporal)
      if (selectedRef.current?.id === conversationId) {
        setSelected((current) => {
          if (!current) return current;
          const existing = current.messages || [];
          if (existing.some((m) => m.id === message.id)) return current;
          const withoutTemp = existing.filter(
            (m) => !(m.id.startsWith("temp-") && m.role === message.role && m.content === message.content)
          );
          return { ...current, messages: [...withoutTemp, message] };
        });
      }

      // Mover la conversación al tope de la lista
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          reloadSilent().catch(() => undefined);
          return prev;
        }
        const updated = { ...prev[idx], lastMessageAt: message.createdAt };
        return [updated, ...prev.filter((c) => c.id !== conversationId)];
      });
    }
  }, [reloadSilent]);

  // Al reconectar (segundo "open" en adelante) recargamos para recuperar los
  // mensajes que llegaron mientras el stream estuvo caido (backoff hasta 30s).
  const hasConnectedRef = useRef(false);
  const handleConnState = useCallback(
    (state: ConnectionState) => {
      setConnState(state);
      if (state === "open") {
        if (hasConnectedRef.current) reloadSilent().catch(() => undefined);
        hasConnectedRef.current = true;
      }
    },
    [reloadSilent]
  );

  useConversationStream({ onEvent: handleStreamEvent, onState: handleConnState });

  // Auto-scroll al fondo cuando cambian los mensajes o el typing
  const messages = useMemo(() => selected?.messages || [], [selected]);
  const isTyping = selected ? typingByConversation[selected.id] : false;
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  async function toggleAgent(conversation: Conversation) {
    const updated = await httpClient.patch<Conversation>(`/conversations/${conversation.id}/agent`, {
      isAgentActive: !conversation.isAgentActive,
    });
    setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  }

  async function deleteConversation() {
    if (!selected || deleting || !canDelete) return;
    setDeleting(true);
    const id = selected.id;
    try {
      await httpClient.delete(`/conversations/${id}`);
      setConfirmDelete(false);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setSelected(null);
      setDraft("");
      setAttachment(null);
      toast.success("Conversacion eliminada");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar la conversacion"));
    } finally {
      setDeleting(false);
    }
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("El archivo supera el límite de 16 MB");
      return;
    }
    const dataBase64 = await fileToBase64(file);
    setAttachment({
      dataBase64,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
    });
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => chunks.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `nota-voz-${Date.now()}.webm`, { type: blob.type });
        const dataBase64 = await fileToBase64(file);
        setAttachment({
          dataBase64,
          mimeType: file.type,
          fileName: file.name,
          previewUrl: URL.createObjectURL(blob),
        });
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || sending) return;
    const text = draft.trim();
    if (!text && !attachment) return;

    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ConversationMessage = {
      id: tempId,
      role: "staff",
      content: text || (attachment ? attachment.fileName : ""),
      createdAt: new Date().toISOString(),
      metadata: attachment
        ? { media: { type: "document", url: attachment.previewUrl, fileName: attachment.fileName, mimeType: attachment.mimeType } }
        : undefined,
    };
    setSelected((current) =>
      current ? { ...current, messages: [...(current.messages || []), optimistic] } : current
    );

    try {
      await httpClient.post(`/conversations/${selected.id}/messages`, {
        text: text || undefined,
        attachment: attachment
          ? { dataBase64: attachment.dataBase64, mimeType: attachment.mimeType, fileName: attachment.fileName }
          : undefined,
      });
      setDraft("");
      setAttachment(null);
      // El mensaje real llega por SSE y reemplaza al optimista; recargamos el detalle como respaldo
      await openConversation(selected.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo enviar el mensaje"));
      setSelected((current) =>
        current ? { ...current, messages: (current.messages || []).filter((m) => m.id !== tempId) } : current
      );
    } finally {
      setSending(false);
    }
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

  const connLabel =
    connState === "open" ? "En vivo" : connState === "connecting" ? "Conectando..." : "Reconectando...";

  return (
    <div className="inbox-page">
      <section className="inbox-list">
        <div className="inbox-list-header">
          <div>
            <h1>Inbox</h1>
            <p>WhatsApp Kapso · agente IA</p>
          </div>
          <span className={`status-dot ${connState !== "open" ? "offline" : ""}`} title={connLabel} />
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
                  <em>
                    {typingByConversation[conversation.id]
                      ? "Escribiendo..."
                      : conversation.isAgentActive
                        ? "Agente atendiendo"
                        : "Atencion humana"}
                  </em>
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
                {canDelete ? (
                  <button
                    type="button"
                    className="outline-action danger"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                    aria-label="Eliminar conversacion"
                    title="Eliminar conversacion"
                  >
                    <Trash2 size={15} />
                    Eliminar
                  </button>
                ) : null}
              </div>
            </header>

            <div className="message-feed">
              {messages.length === 0 ? (
                <div className="empty-thread">
                  <MessageCircle size={42} />
                  <strong>No hay mensajes todavia</strong>
                  <span>Cuando entre un mensaje desde Kapso aparecera aqui.</span>
                </div>
              ) : (
                messages.map((message, index) => {
                  const fromCustomer = message.role === "user";
                  const fromAgent = message.role === "assistant";
                  const media = message.metadata?.media as MessageMedia | undefined;
                  const showDay =
                    index === 0 || dayLabel(messages[index - 1].createdAt) !== dayLabel(message.createdAt);
                  return (
                    <div key={message.id}>
                      {showDay && <div className="day-divider">{dayLabel(message.createdAt)}</div>}
                      <article className={fromCustomer ? "message-row incoming" : "message-row outgoing"}>
                        {fromCustomer && <span className="avatar mini">{initials(selectedName)}</span>}
                        <div className={fromCustomer ? "bubble received" : fromAgent ? "bubble agent" : "bubble staff"}>
                          <span className="bubble-role">{roleLabel(message.role)}</span>
                          {media && <MediaBubble media={media} onImageClick={setLightboxUrl} />}
                          {message.content && !(media && message.content === `[${media.type}]`) && (
                            <p>{message.content}</p>
                          )}
                          <time>{formatTime(message.createdAt)}</time>
                        </div>
                      </article>
                    </div>
                  );
                })
              )}

              {isTyping && (
                <article className="message-row outgoing">
                  <div className="bubble agent typing-bubble">
                    <span className="typing-dots"><span /><span /><span /></span>
                  </div>
                </article>
              )}
              <div ref={feedEndRef} />
            </div>

            {attachment && (
              <div className="composer-attachment">
                {attachment.mimeType.startsWith("image/") ? (
                  <img src={attachment.previewUrl} alt={attachment.fileName} />
                ) : attachment.mimeType.startsWith("audio/") ? (
                  <audio controls src={attachment.previewUrl} />
                ) : (
                  <span className="composer-attachment-file"><FileText size={16} /> {attachment.fileName}</span>
                )}
                <button type="button" onClick={() => setAttachment(null)} aria-label="Quitar adjunto">
                  <X size={16} />
                </button>
              </div>
            )}

            <form className="composer" onSubmit={sendMessage}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                style={{ display: "none" }}
                onChange={handlePickFile}
              />
              <button
                type="button"
                className="composer-icon"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Adjuntar archivo"
                title="Adjuntar archivo"
              >
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                className={recording ? "composer-icon recording" : "composer-icon"}
                onClick={toggleRecording}
                aria-label={recording ? "Detener grabación" : "Grabar audio"}
                title={recording ? "Detener grabación" : "Grabar audio"}
              >
                <Mic size={18} />
              </button>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={recording ? "Grabando audio..." : "Responder por WhatsApp..."}
                disabled={sending || recording}
              />
              <button aria-label="Enviar mensaje" disabled={sending || recording}>
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

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" aria-label="Cerrar"><X size={22} /></button>
          <img src={lightboxUrl} alt="vista previa" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {confirmDelete && selected ? (
        <div className="confirm-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>Eliminar conversacion</h3>
            <p>
              Se borrara el historial con <strong>{selectedName}</strong>. Los pedidos vinculados se
              conservan. Esta accion no se puede deshacer.
            </p>
            <div className="confirm-actions">
              <button type="button" className="outline-action" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
              <button type="button" className="outline-action danger" disabled={deleting} onClick={deleteConversation}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
