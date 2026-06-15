// frontend/src/pages/Reunioes.tsx

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface Cliente {
  id: string;
  nome: string | null;
  empresa: string | null;
  telefone: string;
}

interface Reuniao {
  id: string;
  cliente_id: string;
  data_hora: string;
  status: string;
  notas: string | null;
  link_reuniao?: string;
  clientes?: Cliente;
}

const statusColors = {
  agendada: "bg-yellow-100 text-yellow-700",
  confirmada: "bg-blue-100 text-blue-700",
  cancelada: "bg-red-100 text-red-700",
  realizada: "bg-green-100 text-green-700",
};

export default function Reunioes() {
  const { data: reunioes = [], isLoading } = useQuery({
    queryKey: ["reunioes"],
    queryFn: async () => {
      const res = await axios.get("/api/reunioes");
      return res.data;
    },
  });

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Separar reuniões por status
  const reunioesOrdenadas = [...reunioes].sort(
    (a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-6 text-gray-800">Reuniões Agendadas</h1>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Carregando...</div>
      ) : reunioesOrdenadas.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow border border-gray-200 text-center">
          <p className="text-gray-500 text-lg">Nenhuma reunião agendada</p>
          <p className="text-gray-400 text-sm mt-2">
            Comece adicionando clientes e agendando reuniões
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-blue-700 font-semibold">
              Total: {reunioesOrdenadas.length} reunião(ões) agendada(s)
            </p>
          </div>

          <div className="grid gap-4">
            {reunioesOrdenadas.map((reuniao: Reuniao) => (
              <div
                key={reuniao.id}
                className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-lg transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-800">
                      {reuniao.clientes?.nome || "Cliente sem nome"}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {reuniao.clientes?.empresa || "Sem empresa"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      📱 {reuniao.clientes?.telefone}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded whitespace-nowrap ${
                      statusColors[reuniao.status] || statusColors.agendada
                    }`}
                  >
                    {reuniao.status}
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <p className="text-base font-semibold text-gray-800 mb-2">
                    📅 {formatarData(reuniao.data_hora)}
                  </p>

                  {reuniao.link_reuniao && (
                    <p className="text-sm text-gray-600 mb-2">
                      🔗{" "}
                      <a
                        href={reuniao.link_reuniao}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        Link da reunião
                      </a>
                    </p>
                  )}

                  {reuniao.notas && (
                    <div className="bg-gray-50 p-3 rounded mt-3 border-l-4 border-gray-300">
                      <p className="text-sm text-gray-700">
                        <strong>Notas:</strong> {reuniao.notas}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
