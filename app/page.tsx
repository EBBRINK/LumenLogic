import { redirect } from "next/navigation";
import { bewaakRoute } from "@/lib/route-toegang";

// De wortel leest niets en toont niets — hij stuurt door naar /projects. Toch staat hij in
// de allowlist en bewaakt hij zichzelf (3.2a): "de bestemming controleert het wel" is
// precies het soort redenering waar deny-by-default vanaf moet. Uitgelogd komt hier nu
// dezelfde /login-redirect uit als overal.
export default async function Home() {
  await bewaakRoute("/");
  redirect("/projects");
}
