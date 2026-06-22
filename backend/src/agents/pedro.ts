import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../services/supabase";

const client = new Anthropic();

export async function processarMensagemCliente(
  clienteId: string,
  mensagemCliente: string
): Promise<string> {
  // Buscar histórico de conversas
  const { data: conversas } = await supabase
    .from("conversas")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: true })
    .limit(10);

  // Buscar dados do cliente
  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .single();

  // Buscar configuração de prompt
  const { data: config } = await supabase
    .from("configuracoes")
    .select("prompt_pedro")
    .single();

  const systemPrompt = config?.prompt_pedro || "Você é Pedro, agente de prospecção.";

  // Montar contexto de conversa
  const mensagens = (conversas || []).map((c) => ({
    role: c.tipo_remetente === "agente" ? "assistant" : "user",
    content: c.tipo_remetente === "agente" ? c.mensagem_agente : c.mensagem_cliente,
  }));

  mensagens.push({
    role: "user",
    content: mensagemCliente,
  });

  // Chamar Claude
  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 150, // Manter respostas curtas
    system: systemPrompt,
    messages: mensagens as any,
  });

  const respostaAgente =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Salvar conversa
  await supabase.from("conversas").insert({
    cliente_id: clienteId,
    mensagem_cliente: mensagemCliente,
    mensagem_agente: respostaAgente,
    tipo_remetente: "agente",
    modo_humano: false,
  });

  // Atualizar status do cliente
  await supabase
    .from("clientes")
    .update({
      status: "contato_feito",
      ultimo_contato_at: new Date().toISOString(),
    })
    .eq("id", clienteId);

  return respostaAgente;
}

// Função para detectar intenção de agendar reunião
export function detectarIntencaoReuniao(mensagem: string): boolean {
  const palavrasChave = [
    "topo",
    "pode ser",
    "sim",
    "vamos",
    "marcar",
    "agenda",
    "segunda",
    "terça",
    "quarta",
    "quinta",
    "sexta",
    "horário",
    "quando",
    "que horas",
    "amanhã",
    "próxima semana",
  ];
  return palavrasChave.some((palavra) =>
    mensagem.toLowerCase().includes(palavra)
  );
}
