import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { redeem } from "../services/gift-cards";

const redeemBody = z.object({ code: z.string().min(4), amountCents: z.number().int().positive() });

export const giftCardsRouter = Router();

giftCardsRouter.use(requireAuth);

giftCardsRouter.post("/redeem", async (req, res) => {
  const body = redeemBody.parse(req.body);
  const card = await redeem(body.code, body.amountCents);
  res.json(card);
});
