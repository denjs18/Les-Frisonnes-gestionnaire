import type { Metadata } from "next";
import { EndScreen } from "@/components/end/EndScreen";

export const metadata: Metadata = { title: "Terminé" };

export default function Page() {
  return <EndScreen />;
}
