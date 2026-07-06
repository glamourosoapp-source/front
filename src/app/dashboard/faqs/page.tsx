"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { FAQ, ListResponse } from "@/types";
import { toast } from "sonner";

export default function FAQsPage() {
  const { can } = usePermissions();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<FAQ[]>([]);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<FAQ | null>(null);
  const load = () => httpClient.get<ListResponse<FAQ>>("/faqs", { search: searchText, category, limit: 100 }).then((r) => setFaqs(r.items));
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(faq: FAQ) {
    setEditing(faq);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      question: String(form.get("question")),
      answer: String(form.get("answer")),
      category: String(form.get("category") || "general"),
      isActive: String(form.get("isActive") || "true") === "true",
    };
    try {
      if (editing) {
        await httpClient.put(`/faqs/${editing.id}`, payload);
        toast.success("FAQ actualizada con éxito");
      } else {
        await httpClient.post("/faqs", payload);
        toast.success("FAQ creada con éxito");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error("Error al guardar la FAQ");
    }
  }

  async function search() {
    try {
      const results = await httpClient.get<FAQ[]>("/faqs/search", { q: query, limit: 5 });
      setMatches(results);
      if (results.length > 0) {
        toast.success(`Se encontraron ${results.length} coincidencias`);
      } else {
        toast.info("No se encontraron coincidencias para la consulta");
      }
    } catch (err) {
      toast.error("Error al buscar respuesta");
    }
  }

  async function remove(faq: FAQ) {
    try {
      await httpClient.delete(`/faqs/${faq.id}`);
      toast.success("FAQ eliminada con éxito");
      await load();
    } catch (err) {
      toast.error("Error al eliminar la FAQ");
    }
  }

  async function handleBackfill() {
    const toastId = toast.loading("Regenerando embeddings vectoriales...");
    try {
      await httpClient.post("/faqs/backfill");
      toast.success("Embeddings regenerados con éxito", { id: toastId });
      await load();
    } catch (err) {
      toast.error("Error al regenerar embeddings", { id: toastId });
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">FAQs IA</h1>
          <p className="page-kicker">Base de conocimiento para responder conversaciones de WhatsApp con contexto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" onClick={() => setSearchOpen(true)}>Probar busqueda</Button>
          {can("faqs", "create") ? (
            <Button variant="contained" onClick={openCreate}>Nueva FAQ</Button>
          ) : null}
        </div>
      </div>
      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Conocimiento cargado</h2>
            <p className="page-kicker">Preguntas disponibles para busqueda semantica.</p>
          </div>
          <span className="pill">{faqs.length} FAQs</span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_auto_auto]">
          <input className="input" placeholder="Buscar pregunta o respuesta" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          <input className="input" placeholder="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Button variant="outlined" onClick={load}>Filtrar</Button>
          {can("faqs", "update") ? (
            <Button color="secondary" variant="outlined" onClick={handleBackfill}>Regenerar</Button>
          ) : null}
        </div>
        <DataTable
          rows={faqs}
          getKey={(row) => row.id}
          getDeleteLabel={(row) => row.question}
          onEdit={can("faqs", "update") ? openEdit : undefined}
          onDelete={can("faqs", "delete") ? remove : undefined}
          columns={[
            { key: "question", label: "Pregunta" },
            { key: "category", label: "Categoria" },
            { key: "embeddingStatus", label: "Embedding", render: (r) => <span className="pill">{r.embeddingStatus}</span> },
          ]}
        />
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <form onSubmit={save}>
          <DialogTitle>{editing ? "Editar FAQ" : "Nueva FAQ"}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField name="category" label="Categoria" defaultValue={editing?.category || "general"} fullWidth />
            <TextField name="question" label="Pregunta" defaultValue={editing?.question || ""} fullWidth multiline minRows={2} required />
            <TextField name="answer" label="Respuesta" defaultValue={editing?.answer || ""} fullWidth multiline minRows={5} required />
            <TextField select name="isActive" label="Estado" defaultValue="true" fullWidth>
              <MenuItem value="true">Activa</MenuItem>
              <MenuItem value="false">Inactiva</MenuItem>
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">Guardar</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Buscar como agente</DialogTitle>
        <DialogContent className="form-grid" dividers>
          <TextField value={query} onChange={(e) => setQuery(e.target.value)} label="Consulta" placeholder="Ej. hacen entregas en zona norte?" fullWidth />
          <Button variant="contained" onClick={search}>Buscar respuesta</Button>
          {matches.map((faq) => (
            <article className="card" key={faq.id}>
              <strong>{faq.question}</strong>
              <p>{faq.answer}</p>
              <span className="pill">score {faq.score}</span>
            </article>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
