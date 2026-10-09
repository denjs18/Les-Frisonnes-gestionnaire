import type { Metadata } from "next";
import { VerifyScreen } from "@/components/verify/VerifyScreen";

export const metadata: Metadata = { title: "Vérification" };

export default function Page() {
  return <VerifyScreen />;
}
