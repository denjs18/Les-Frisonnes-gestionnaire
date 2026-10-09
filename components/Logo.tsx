/** Le logo de l'appli : un pot de yaourt coché. Le même dessin sert d'icône (public/icons). */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} role="img" aria-label="Prépa Commandes" className="shrink-0">
      <rect width="512" height="512" rx="112" fill="#1d4ed8" />
      <g transform="translate(256 256) scale(1.3) translate(-256 -286)">
        <path d="M178 204h156l-20 196a14 14 0 0 1-14 12H212a14 14 0 0 1-14-12z" fill="#ffffff" />
        <rect x="164" y="160" width="184" height="46" rx="16" fill="#fde047" />
        <path d="M222 304l28 28 54-64" fill="none" stroke="#1d4ed8" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
