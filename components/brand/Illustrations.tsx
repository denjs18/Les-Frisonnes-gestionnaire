/**
 * Dessins au trait de la fromagerie, dans l'esprit du logo : trait noir fin, aplats verts, jaune fromage.
 * Ils sont décoratifs (cachés aux lecteurs d'écran) et gardent les mêmes couleurs en clair comme en sombre :
 * sur fond sombre, ils se détachent comme des autocollants.
 */
import { useId, type ReactNode, type SVGProps } from "react";

const INK = "#1c1a16";
const GRASS = "#48a858";
const GRASS_DARK = "#2d7a3b";
const HILL_FAR = "#d6ead0";
const HILL_NEAR = "#a9d6a2";
const CHEESE = "#f6cf45";
const CHEESE_LIGHT = "#fbe38f";
const CHEESE_DARK = "#e2b52b";
const CREAM = "#f8eecb";
const WOOD = "#d8b685";
const WOOD_DARK = "#bd9560";

type SvgProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">;

function Svg({ viewBox, children, ...props }: SvgProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

/** Style commun : trait noir fin, bouts arrondis. */
const LINE = { stroke: INK, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* ------------------------------------------------------------------ */
/* La vache (de profil, tournée vers la gauche, un trèfle dans la bouche) */
/* ------------------------------------------------------------------ */

function CowArt() {
  return (
    <g fill="#fff" {...LINE}>
      {/* jambes éloignées */}
      <path d="M91 99 C91 110 92 122 92 133 L100 133 C100 122 100 110 101 100 Z" />
      <path d="M142 100 C146 108 142 122 143 133 L152 133 C153 122 156 110 154 101 Z" />
      {/* queue */}
      <path d="M178 58 C190 60 195 72 192 90 L191 99" fill="none" />
      <path d="M187 99 C187 108 195 109 196 99 C194 95 188 95 187 99 Z" fill={INK} />
      {/* corps, cou et tête d'un seul trait */}
      <path d="M84 52 C100 47 120 53 140 51 C156 49 170 51 177 59 C184 66 185 80 180 92 C178 98 172 101 165 101 L150 102 C138 106 120 103 104 101 C94 100 84 99 76 95 C72 92 70 88 70 84 C66 82 60 84 54 84 C46 86 38 82 38 74 C38 66 40 58 44 52 C47 46 54 42 62 43 C70 44 78 48 84 52 Z" />
      {/* pis */}
      <path d="M138 102 C136 113 150 116 153 103" />
      <path d="M142 113 v4 M148 114 v4" fill="none" />
      {/* taches : juste cernées, comme sur le logo */}
      <path d="M100 56 C110 52 123 55 124 64 C125 70 118 72 119 78 C112 85 102 81 99 72 C96 66 96 60 100 56 Z" />
      <path d="M134 70 C142 62 158 62 162 72 C165 80 152 80 150 88 C142 95 132 87 132 80 C130 76 132 72 134 70 Z" />
      <path d="M80 62 C86 58 91 62 90 68 C86 72 80 68 80 62 Z" />
      <path d="M164 55 C172 54 178 60 176 68 C170 66 166 62 164 55 Z" />
      {/* jambes proches et sabots */}
      <path d="M72 96 C72 108 73 121 73 134 L82 134 C82 121 83 108 85 97 Z" />
      <path d="M158 99 C167 107 160 121 162 134 L171 134 C172 121 178 110 175 100 Z" />
      <g fill={INK} strokeWidth={1}>
        <rect x="72" y="134" width="11" height="5" rx="2" />
        <rect x="161" y="134" width="11" height="5" rx="2" />
        <rect x="91" y="133" width="10" height="4.5" rx="2" />
        <rect x="142" y="133" width="11" height="4.5" rx="2" />
      </g>
      {/* oreille, corne, visage */}
      <path d="M62 44 C66 36 76 34 82 38 C78 46 68 48 62 44 Z" />
      <path d="M57 41 C55 36 58 32 63 33" fill="none" />
      <path d="M40 70 q2 -2 4 0 M41 77 q5 3 10 0" fill="none" />
      <path d="M48 56 q2.5 -2.5 5 0 M56 53 q2.5 -2.5 5 0" fill="none" />
      {/* trèfle dans la bouche */}
      <g strokeWidth={1.3}>
        <circle cx="27" cy="74" r="3.6" fill={GRASS} />
        <circle cx="23" cy="79" r="3.6" fill={GRASS} />
        <circle cx="31" cy="80" r="3.6" fill={GRASS} />
        <path d="M28 77 L38 76" fill="none" />
      </g>
      <GrassBand x1={44} x2={188} y={142} />
    </g>
  );
}

/** Une bande d'herbe en petites bosses, avec quelques trèfles. */
function GrassBand({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const bumps: string[] = [];
  let x = x1;
  let up = true;
  while (x < x2) {
    const w = 11 + ((Math.round(x) * 7) % 5);
    bumps.push(`C ${x + w * 0.2} ${y - (up ? 9 : 6)}, ${x + w * 0.8} ${y - (up ? 9 : 6)}, ${x + w} ${y - 3}`);
    x += w;
    up = !up;
  }
  const d = `M ${x1} ${y} ${bumps.join(" ")} L ${x} ${y} Z`;
  const clovers: ReactNode[] = [];
  for (let cx = x1 + 18; cx < x2 - 10; cx += 40) {
    clovers.push(
      <g key={cx} fill={GRASS_DARK} strokeWidth={0.9}>
        <circle cx={cx} cy={y - 3} r={2.1} />
        <circle cx={cx + 4} cy={y - 1} r={2.1} />
      </g>,
    );
  }
  return (
    <g>
      <path d={d} fill={GRASS} />
      {clovers}
    </g>
  );
}

export function Cow(props: SvgProps) {
  return (
    <Svg viewBox="0 0 200 150" {...props}>
      <CowArt />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Les fromages : une meule, une part, deux petits fromages ronds      */
/* ------------------------------------------------------------------ */

function SmallCheese({ x, y }: { x: number; y: number }) {
  return (
    <g fill={CREAM}>
      <path
        d={`M${x - 13} ${y} v8 C${x - 13} ${y + 12} ${x - 5} ${y + 14} ${x} ${y + 14} S${x + 13} ${y + 12} ${x + 13} ${y + 8} V${y} Z`}
      />
      <ellipse cx={x} cy={y} rx="13" ry="5" fill="#fffaf0" />
    </g>
  );
}

function CheeseBoardArt() {
  return (
    <g {...LINE}>
      {/* planche */}
      <path d="M6 100 L234 100 L228 112 L12 112 Z" fill={WOOD} />
      <path d="M40 104 H62 M118 107 H146 M160 104 H180" fill="none" strokeWidth={1.1} stroke={WOOD_DARK} />

      {/* meule entière */}
      <g>
        <path d="M14 66 C14 82 36 96 70 96 C104 96 126 82 126 66 L126 56 L14 56 Z" fill={CHEESE_DARK} />
        <ellipse cx="70" cy="56" rx="56" ry="22" fill={CHEESE} />
        <ellipse cx="70" cy="56" rx="45" ry="16.5" fill={CHEESE_LIGHT} strokeWidth={1.1} />
        <path d="M30 70 v7 M52 80 v8 M76 83 v8 M100 78 v8 M118 68 v6" fill="none" strokeWidth={1.1} />
        <g fill={CHEESE_DARK} strokeWidth={0}>
          <circle cx="52" cy="52" r="1.6" />
          <circle cx="88" cy="50" r="1.6" />
          <circle cx="72" cy="60" r="1.6" />
          <circle cx="102" cy="58" r="1.6" />
        </g>
      </g>

      {/* part de fromage à trous */}
      <g>
        <path d="M118 96 L118 70 L176 52 L176 92 Z" fill={CHEESE} />
        <path d="M118 70 L176 52 L196 62 L138 82 Z" fill={CHEESE_LIGHT} />
        <path d="M176 52 L196 62 L196 100 L176 92 Z" fill={CHEESE_DARK} />
        <g fill={CHEESE_DARK} strokeWidth={1.2}>
          <circle cx="134" cy="84" r="5" />
          <circle cx="156" cy="72" r="6" />
          <circle cx="166" cy="86" r="3.6" />
          <circle cx="146" cy="92" r="2.8" />
        </g>
      </g>

      {/* deux petits fromages ronds */}
      <SmallCheese x={214} y={94} />
      <SmallCheese x={198} y={103} />
    </g>
  );
}

export function Cheeses(props: SvgProps) {
  return (
    <Svg viewBox="0 0 240 120" {...props}>
      <CheeseBoardArt />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* La grange et l'arbre                                               */
/* ------------------------------------------------------------------ */

function BarnArt() {
  return (
    <g {...LINE}>
      {/* silo */}
      <g>
        <path d="M118 112 V50 C118 38 140 38 140 50 V112 Z" fill="#ece7d6" />
        <path d="M118 66 H140 M118 84 H140 M118 98 H140" fill="none" strokeWidth={1.1} />
      </g>
      {/* murs */}
      <rect x="14" y="52" width="98" height="60" fill="#fff" />
      <path d="M30 56 V112 M46 56 V112 M82 56 V112 M98 56 V112" fill="none" strokeWidth={1} stroke="#cfc7b2" />
      {/* toit */}
      <path d="M6 58 L63 10 L120 58 Z" fill={GRASS_DARK} />
      <path d="M63 10 V58 M34 34 L48 58 M92 34 L78 58" fill="none" strokeWidth={1.1} stroke="#bfe3c1" />
      {/* lucarne du grenier */}
      <rect x="54" y="30" width="18" height="16" rx="1.5" fill="#fff" />
      <path d="M54 38 H72 M63 30 V46" fill="none" strokeWidth={1.2} />
      {/* grande porte */}
      <rect x="44" y="72" width="38" height="40" fill="#fff" />
      <path d="M44 72 L82 112 M82 72 L44 112 M63 72 V112" fill="none" strokeWidth={1.3} />
    </g>
  );
}

function TreeArt() {
  return (
    <g {...LINE}>
      <path d="M20 112 C20 100 22 90 22 80 L30 80 C30 90 32 100 32 112 Z" fill={WOOD} />
      <g fill={GRASS}>
        <circle cx="26" cy="58" r="22" />
        <circle cx="10" cy="72" r="14" />
        <circle cx="42" cy="72" r="14" />
      </g>
      <path d="M26 80 C24 72 22 68 18 64 M26 80 C28 70 32 66 36 62" fill="none" strokeWidth={1.1} />
    </g>
  );
}

export function Barn(props: SvgProps) {
  return (
    <Svg viewBox="0 0 148 116" {...props}>
      <BarnArt />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* La scène : la ferme, les vaches et les fromages                     */
/* ------------------------------------------------------------------ */

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} {...LINE} strokeWidth={1.3} fill="#fff">
      <path d="M0 14 C-4 6 6 0 12 4 C14 -4 28 -4 30 4 C38 0 46 8 40 14 Z" />
    </g>
  );
}

export function FarmScene(props: SvgProps) {
  const clipId = `scene-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Svg viewBox="0 0 400 190" {...props}>
      {/* ciel */}
      <g {...LINE} strokeWidth={1.3}>
        <circle cx="52" cy="36" r="14" fill={CHEESE} />
        <path d="M52 12 v6 M52 54 v6 M28 36 h6 M70 36 h6 M35 19 l4 4 M65 49 l4 4 M69 19 l-4 4 M39 49 l-4 4" fill="none" />
      </g>
      <Cloud x={150} y={22} s={1.1} />
      <Cloud x={300} y={14} s={0.8} />

      {/* collines : aplats rognés aux coins arrondis, puis seulement la ligne du dessus */}
      <defs>
        <clipPath id={clipId}>
          <rect width="400" height="190" rx="22" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d="M0 122 C60 96 140 96 214 116 C284 134 346 104 400 112 V190 H0 Z" fill={HILL_FAR} />
        <path d="M0 152 C80 134 180 142 260 152 C320 160 370 148 400 150 V190 H0 Z" fill={HILL_NEAR} />
        <g {...LINE} strokeWidth={1.3} fill="none">
          <path d="M0 122 C60 96 140 96 214 116 C284 134 346 104 400 112" />
          <path d="M0 152 C80 134 180 142 260 152 C320 160 370 148 400 150" />
        </g>
      </g>

      {/* ferme et arbre, sur la colline du fond */}
      <g transform="translate(246 24) scale(0.92)">
        <BarnArt />
      </g>
      <g transform="translate(196 38) scale(0.82)">
        <TreeArt />
      </g>

      {/* les vaches */}
      <g transform="translate(168 112) scale(0.34)">
        <g transform="translate(200 0) scale(-1 1)">
          <CowArt />
        </g>
      </g>
      <g transform="translate(6 76) scale(0.72)">
        <CowArt />
      </g>

      {/* les fromages, sur leur planche, au premier plan */}
      <g transform="translate(236 131) scale(0.5)">
        <CheeseBoardArt />
      </g>
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Petites icônes de la fromagerie (pour les listes et les titres)     */
/* ------------------------------------------------------------------ */

export function CheeseIcon(props: SvgProps) {
  return (
    <Svg viewBox="0 0 48 48" {...props}>
      <g {...LINE} strokeWidth={2}>
        <path d="M5 34 L5 22 L35 10 L43 14 L43 34 Z" fill={CHEESE} />
        <path d="M5 22 L35 10 L43 14 L13 26 Z" fill={CHEESE_LIGHT} />
        <path d="M5 34 H43" fill="none" />
        <g fill={CHEESE_DARK} strokeWidth={1.6}>
          <circle cx="16" cy="30" r="2.6" />
          <circle cx="30" cy="26" r="3.2" />
          <circle cx="36" cy="31" r="1.8" />
        </g>
      </g>
    </Svg>
  );
}

/** Tête de vache vue de face : lisible même en tout petit. */
export function CowIcon(props: SvgProps) {
  return (
    <Svg viewBox="0 0 48 48" {...props}>
      <g {...LINE} strokeWidth={2} fill="#fff">
        {/* cornes et oreilles */}
        <path d="M17 12 C15 7 12 6 9 8 M31 12 C33 7 36 6 39 8" fill="none" />
        <path d="M15 18 C9 14 3 16 4 21 C6 25 11 24 15 23 Z" />
        <path d="M33 18 C39 14 45 16 44 21 C42 25 37 24 33 23 Z" />
        {/* tête */}
        <path d="M15 14 C15 9 33 9 33 14 C36 22 36 30 33 36 C30 42 18 42 15 36 C12 30 12 22 15 14 Z" />
        {/* tache sur le front */}
        <path d="M26 13 C31 12 34 17 32 21 C28 23 24 18 26 13 Z" />
        {/* museau */}
        <ellipse cx="24" cy="35" rx="8" ry="5.5" fill={CREAM} />
        <path d="M20 39.2 q4 2.4 8 0" fill="none" strokeWidth={1.4} />
      </g>
      <g fill={INK}>
        <circle cx="19" cy="24" r="1.7" />
        <circle cx="29" cy="25" r="1.7" />
        <circle cx="21.5" cy="35" r="1.1" />
        <circle cx="26.5" cy="35" r="1.1" />
      </g>
    </Svg>
  );
}

export function Clover(props: SvgProps) {
  return (
    <Svg viewBox="0 0 32 32" {...props}>
      <g stroke={INK} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill={GRASS}>
        <circle cx="16" cy="9" r="6" />
        <circle cx="9" cy="18" r="6" />
        <circle cx="23" cy="18" r="6" />
        <path d="M16 20 C16 25 18 28 22 30" fill="none" />
      </g>
    </Svg>
  );
}
