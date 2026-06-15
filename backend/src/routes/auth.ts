// backend/src/routes/auth.ts

import { Router } from "express";

const router = Router();

// Placeholder for auth routes
router.post("/login", (req, res) => {
  res.status(501).json({ error: "Não implementado" });
});

router.post("/register", (req, res) => {
  res.status(501).json({ error: "Não implementado" });
});

export default router;
