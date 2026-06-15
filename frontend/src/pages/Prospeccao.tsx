// frontend/src/pages/Prospeccao.tsx

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

interface Cliente {
  id: string;
  status: string;
  created_at: string;
}

export default function Prospeccao() {
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const res = await axios.get("/api/clientes");
      return res.data;
    },
  });

  const { data: reunioes = [] } = useQuery({
    queryKey: ["reunioes"],
    queryFn: async () => {
      const res = await axios.get("/api/reunioes");
      return res.data;
    },
  });

  // Calcular métricas
  const stats = {
    total_leads: clientes.length,
    contato_feito: clientes.filter((c) => c.status !== "novo").length,
    reunioes_agendadas: clientes.filter(
      (c) => c.status === "reuniao_agendada"
    ).length,
    clientes_convertidos: clientes.filter((c) => c.status === "cliente").length,
    taxa_conversao:
      clientes.length > 0
        ? ((clientes.filter((c) => c.status === "cliente").length /
            clientes.length) *
          100).toFixed(1)
        : "0",
    taxa_resposta:
      clientes.length > 0
        ? ((clientes.filter((c) => c.status !== "novo").length /
            clientes.length) *
          100).toFixed(1)
        : "0",
  };

  // Dados para gráfico de funil
  const funnelData = [
    { name: "Novos", value: clientes.filter((c) => c.status === "novo").length },
    { name: "Contato", value: stats.contato_feito },
    { name: "Reunião", value: stats.reunioes_agendadas },
    { name: "Cliente", value: stats.clientes_convertidos },
  ];

  // Dados para gráfico de conversão por dia
  const clientesPorDia = clientes.reduce(
    (acc, cliente) => {
      const data = new Date(cliente.created_at).toLocaleDateString("pt-BR");
      const existing = acc.find((d) => d.data === data);
      if (existing) {
        existing.clientes += 1;
      } else {
        acc.push({ data, clientes: 1 });
      }
      return acc;
    },
    [] as { data: string; clientes: number }[]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-gray-800">Dashboard de Prospecção</h1>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200 shadow-sm">
          <p className="text-gray-600 text-sm font-medium">Total de Leads</p>
          <p className="text-4xl font-bold text-blue-700 mt-2">{stats.total_leads}</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-lg border border-yellow-200 shadow-sm">
          <p className="text-gray-600 text-sm font-medium">Contatos Feitos</p>
          <p className="text-4xl font-bold text-yellow-700 mt-2">{stats.contato_feito}</p>
          <p className="text-xs text-gray-500 mt-1">{stats.taxa_resposta}% de resposta</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200 shadow-sm">
          <p className="text-gray-600 text-sm font-medium">Reuniões Agendadas</p>
          <p className="text-4xl font-bold text-green-700 mt-2">{stats.reunioes_agendadas}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200 shadow-sm">
          <p className="text-gray-600 text-sm font-medium">Clientes Convertidos</p>
          <p className="text-4xl font-bold text-purple-700 mt-2">{stats.clientes_convertidos}</p>
        </div>

        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-6 rounded-lg border border-pink-200 shadow-sm">
          <p className="text-gray-600 text-sm font-medium">Taxa de Conversão</p>
          <p className="text-4xl font-bold text-pink-700 mt-2">{stats.taxa_conversao}%</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-lg border border-indigo-200 shadow-sm">
          <p className="text-gray-600 text-sm font-medium">Reuniões Totais</p>
          <p className="text-4xl font-bold text-indigo-700 mt-2">{reunioes.length}</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Funil de Vendas */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Funil de Vendas</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" name="Quantidade" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Clientes por Dia */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Leads por Dia</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={clientesPorDia}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="clientes" stroke="#10b981" name="Novos Leads" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resumo de Ações */}
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Resumo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-blue-50 rounded border-l-4 border-blue-500">
            <p className="font-semibold text-gray-800">Próximos Passos</p>
            <p className="text-gray-600 mt-1">
              {stats.contato_feito === stats.total_leads
                ? "✅ Todos os leads contatados!"
                : `📞 ${stats.total_leads - stats.contato_feito} leads para contatar`}
            </p>
          </div>

          <div className="p-4 bg-green-50 rounded border-l-4 border-green-500">
            <p className="font-semibold text-gray-800">Meta</p>
            <p className="text-gray-600 mt-1">
              {stats.taxa_conversao >= 10
                ? "🎯 Meta de conversão atingida!"
                : `📈 ${(10 - parseFloat(stats.taxa_conversao as string)).toFixed(1)}% até meta`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
