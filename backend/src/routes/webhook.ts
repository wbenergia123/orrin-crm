// backend/src/routes/webhook.ts

import { Router, Request, Response } from "express";
import { supabase } from "../services/supabase";
import { processarMensagemCliente, detectarIntencaoReuniao } from "../agents/pedro";

const router = Router();

router.post("/whatsapp", async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    // Validar estrutura esperada
    if (!data?.message?.text?.body) {
      return res.json({ result: "ok" });
    }

    const telefone = data.from;
    const mensagem = data.message.text.body;

    // Buscar ou criar cliente
    let { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("telefone", telefone)
      .single();

    if (!cliente) {
      const { data: novoCliente } = await supabase
        .from("clientes")
        .insert({ telefone, status: "novo" })
        .select()
        .single();
      cliente = novoCliente;
    }

    // Processar mensagem com Pedro
    const resposta = await processarMensagemCliente(cliente.id, mensagem);

    // Enviar resposta via UAZAPI
    await enviarViaUAZAPI(telefone, resposta);

    // Se detectou intenção de reunião, pode registrar para follow-up
    if (detectarIntencaoReuniao(mensagem)) {
      // Log para possível automação futura
      console.log(`[INTENÇÃO] Cliente ${cliente.id} quer agendar reunião`);
    }

    res.json({ result: "ok" });
  } catch (error) {
    console.error("Erro no webhook WhatsApp:", error);
    res.status(500).json({ error: "Erro ao processar mensagem" });
  }
});

// Health check
router.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Função auxiliar para enviar via UAZAPI
async function enviarViaUAZAPI(
  telefone: string,
  mensagem: string
): Promise<void> {
  try {
    const response = await fetch(
      `${process.env.UAZAPI_URL}/send-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.UAZAPI_TOKEN}`,
        },
        body: JSON.stringify({
          phone: telefone,
          message: mensagem,
        }),
      }
    );

    if (!response.ok) {
      console.error("Erro ao enviar mensagem UAZAPI:", response.statusText);
    }
  } catch (error) {
    console.error("Erro de conexão UAZAPI:", error);
  }
}

export default router;
