import { z } from "zod";
import { MAX_INSTRUCTIONS_LENGTH, MAX_QUANTITY_PER_LINE } from "./cart";

/**
 * What the kiosk sends to the server. It carries ids and choices only, never
 * prices: the server reprices everything from the database.
 */
export const placeOrderSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(64),
    orderType: z.enum(["dine_in", "takeaway"]),
    tableNumber: z.string().max(8).nullable(),
    customerName: z.string().trim().max(30),
    customerPhone: z.string().regex(/^(0[235]\d{8})?$/),
    paymentMethod: z.enum(["mobile_money", "card", "cash"]),
    momoNetwork: z.enum(["mtn", "telecel", "airteltigo"]).nullable(),
    momoPhone: z.string().regex(/^(0[235]\d{8})?$/),
    lines: z
      .array(
        z.object({
          menuItemId: z.string().min(1).max(64),
          quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
          selections: z.record(z.string().max(128), z.array(z.string().max(128)).max(20)),
          instructions: z.string().max(MAX_INSTRUCTIONS_LENGTH),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((v, ctx) => {
    if (v.orderType === "dine_in" && !v.tableNumber)
      ctx.addIssue({ code: "custom", path: ["tableNumber"], message: "Table number is required for dine in." });
    if (v.orderType === "takeaway" && v.customerName.length < 2)
      ctx.addIssue({ code: "custom", path: ["customerName"], message: "Name is required for takeaway." });
    if (v.paymentMethod === "mobile_money" && (!v.momoNetwork || !v.momoPhone))
      ctx.addIssue({ code: "custom", path: ["momoPhone"], message: "Mobile Money number and network are required." });
  });

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; code: "invalid" | "unavailable" | "not_connected" | "server_error"; message: string };
