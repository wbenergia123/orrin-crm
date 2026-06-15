// frontend/src/pages/Clientes.tsx

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";

interface Cliente {
  id: string;
  telefone: string;
  nome: string | null;
  empresa: string | null;
  email: string | null;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  novo: "bg-gray-100 text-gray-700",
  contato_feito: "bg-yellow-100 text-yellow-700",
  reuniao_agendada: "bg-green-100 text-green-700",
  cliente: "bg-blue-100 text-blue-700",
  perdido: "bg-red-100 text-red-700",
};

export default function Clientes() {
  const queryClient = useQueryClient();
  const [novoCliente, setNovoCliente] = useState({
    telefone: "",
    nome: "",
    empresa: "",
    email: "",
  });
  const [error, setError] = useState("");

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const res = await axios.get("/api/clientes");
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (cliente: typeof novoCliente) => {
      return await axios.post("/api/clientes", cliente);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      setNovoCliente({ telefone: "", nome: "", empresa: "", email: "" });
      setError("");
    },
    onError: () => {
      setError("Erro ao adicionar cliente");
    },
  });

  const handleAdd = async () => {
    if (!novoCliente.telefone) {
      setError("Telefone é obrigatório");
      return;
    }
    createMutation.mutate(novoCliente);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-6 text-gray-800">Clientes</h1>

      {/* Form para adicionar cliente */}
      <div className="bg-white p-6 rounded-lg shadow mb-8 border border-gray-200">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Novo Cliente</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <input
            type="text"
            placeholder="Telefone (obrigatório)"
            value={novoCliente.telefone}
            onChange={(e) =>
              setNovoCliente({ ...novoCliente, telefone: e.target.value })
            }
            className="border border-gray-300 p-3 rounded bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Nome"
            value={novoCliente.nome}
            onChange={(e) =>
              setNovoCliente({ ...novoCliente, nome: e.target.value })
            }
            className="border border-gray-300 p-3 rounded bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Empresa"
            value={novoCliente.empresa}
            onChange={(e) =>
              setNovoCliente({ ...novoCliente, empresa: e.target.value })
            }
            className="border border-gray-300 p-3 rounded bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="email"
            placeholder="Email"
            value={novoCliente.email}
            onChange={(e) =>
              setNovoCliente({ ...novoCliente, email: e.target.value })
            }
            className="border border-gray-300 p-3 rounded bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={createMutation.isPending}
          className="w-full bg-blue-600 text-white px-6 py-3 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition"
        >
          {createMutation.isPending ? "Adicionando..." : "Adicionar Cliente"}
        </button>
      </div>

      {/* Lista de clientes */}
      <div>
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          Total: {clientes.length} clientes
        </h2>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhum cliente ainda
          </div>
        ) : (
          <div className="grid gap-4">
            {clientes.map((cliente: Cliente) => (
              <div
                key={cliente.id}
                className="bg-white p-4 rounded-lg shadow border border-gray-200 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">
                      {cliente.nome || "Sem nome"}
                    </h3>
                    <p className="text-sm text-gray-600">{cliente.empresa}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded ${
                      statusColors[cliente.status] || statusColors.novo
                    }`}
                  >
                    {cliente.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">📱 {cliente.telefone}</p>
                {cliente.email && (
                  <p className="text-sm text-gray-700">📧 {cliente.email}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
