// backend/src/index.ts

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import clientesRouter from "./routes/clientes";
import reunioesRouter from "./routes/reunioes";
import webhookRouter from "./routes/webhook";
import authRouter from "./routes/auth";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Rotas
app.use("/api/clientes", clientesRouter);
app.use("/api/reunioes", reunioesRouter);
app.use("/api/webhook", webhookRouter);
app.use("/api/auth", authRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
  console.log(
    `📡 Webhook disponível em http://localhost:${PORT}/api/webhook/whatsapp`
  );
});

export default app;
