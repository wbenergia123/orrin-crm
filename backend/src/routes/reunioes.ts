// backend/src/routes/reunioes.ts

import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase";
import { Reuniao } from "../types";

const router = Router();

// Listar reuniões
router.get("/", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("reunioes")
    .select("*, clientes(*)")
    .order("data_hora", { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Buscar reunião por ID
router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("reunioes")
    .select("*, clientes(*)")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Reunião não encontrada" });
  res.json(data);
});

// Agendar reunião
router.post("/", async (req: Request, res: Response) => {
  const { cliente_id, data_hora } = req.body;

  if (!cliente_id || !data_hora) {
    return res
      .status(400)
      .json({ error: "cliente_id e data_hora são obrigatórios" });
  }

  const { data, error } = await supabase
    .from("reunioes")
    .insert({
      cliente_id,
      data_hora,
      status: "agendada",
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Atualizar status do cliente para reuniao_agendada
  await supabase
    .from("clientes")
    .update({ status: "reuniao_agendada" })
    .eq("id", cliente_id);

  res.status(201).json(data);
});

// Atualizar reunião
router.patch("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("reunioes")
    .update(req.body)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Deletar reunião
router.delete("/:id", async (req: Request, res: Response) => {
  const { error } = await supabase
    .from("reunioes")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Reunião deletada" });
});

export default router;
