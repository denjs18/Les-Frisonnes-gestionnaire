import Image from "next/image";
import logo from "./brand/logo.webp";
import logoSmall from "./brand/logo-small.webp";

/** Le logo rond de la Fromagerie des Frisonnes (fond transparent). */
export function Logo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src={size <= 120 ? logoSmall : logo}
      alt="Fromagerie des Frisonnes"
      width={size}
      height={size}
      unoptimized
      draggable={false}
      className={`shrink-0 select-none ${className}`}
    />
  );
}
