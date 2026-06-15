// backend/src/routes/clientes.ts

import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase";
import { Cliente } from "../types";

const router = Router();

// Listar clientes
router.get("/", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Buscar cliente por ID
router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Cliente não encontrado" });
  res.json(data);
});

// Criar cliente
router.post("/", async (req: Request, res: Response) => {
  const { telefone, nome, empresa, email } = req.body;

  if (!telefone) return res.status(400).json({ error: "Telefone é obrigatório" });

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      telefone,
      nome,
      empresa,
      email,
      status: "novo",
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Atualizar cliente
router.patch("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("clientes")
    .update(req.body)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Deletar cliente
router.delete("/:id", async (req: Request, res: Response) => {
  const { error } = await supabase
    .from("clientes")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Cliente deletado" });
});

export default router;
