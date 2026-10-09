import type { Metadata } from "next";
import { PrepScreen } from "@/components/prep/PrepScreen";

export const metadata: Metadata = { title: "Préparation" };

export default function Page() {
  return <PrepScreen />;
}
