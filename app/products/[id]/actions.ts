"use server";
// J-03: pricerequest op een gated product → een lead (met lead-event). De human-gate blijft:
// dit maakt alleen een lead aan voor opvolging, er gaat niets automatisch naar buiten.
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { createLead } from "@/lib/repo/disclosure";
import { getSession } from "@/lib/session";

export async function requestPriceAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "").trim() || null;
  const brandId = String(formData.get("brandId") ?? "").trim() || null;
  if (!productId) return;
  const session = await getSession();
  await createLead(db, {
    productId,
    brandId,
    userEmail: session?.user?.email ?? null,
  });
  // Terug naar de kaart met een bevestiging; de prijs blijft gated (extern), maar de aanvraag
  // staat nu als lead klaar voor Brink.
  redirect(`/products/${productId}?pricerequest=sent`);
}
