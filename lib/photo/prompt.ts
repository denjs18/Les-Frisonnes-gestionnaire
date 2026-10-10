/** La consigne donnée à Gemini. Mise au point sur des photos de tableaux inventés (propres, de travers, floues, couchées, coupées). */
export const PHOTO_PROMPT = `Tu lis la photo d'un tableau de commandes (feuille Excel imprimée, écran ou papier).
Les produits sont en colonnes et les clients en lignes : la première ligne contient les noms des produits, la première colonne les noms des clients.

Recopie le tableau EXACTEMENT comme il est écrit, cellule par cellule :
- une ligne du résultat par ligne du tableau, y compris la ligne de titres, une éventuelle ligne « TOTAL » et les lignes de notes ;
- le même nombre de cellules dans chaque ligne ; une cellule vide devient une chaîne vide "" ;
- les textes restent tels quels : majuscules, accents, étoiles *, signes +, virgules et points (« 0,5 », « 0.5L », « 3*0,2 », « Bon d'ici 17/10* », « Amap Amboise +6l ») ;
- les colonnes sans titre (notes) sont recopiées aussi ;
- ignore ce qui est autour du tableau (titre, date, légende, marges, bureau) ;
- ne calcule rien, ne corrige rien, n'ajoute rien, n'interprète rien : si un chiffre ou un mot est difficile à lire, ou si une cellule vide pourrait cacher un chiffre très pâle, recopie ce que tu vois le mieux et signale la cellule dans "uncertain" (numéros de ligne et de colonne dans "rows", à partir de 0) ;
- si la photo est penchée, floue ou en perspective, suis les traits du tableau pour associer chaque nombre à SA colonne et à SA ligne ;
- s'il y a plusieurs tableaux, recopie le plus grand ;
- si une partie du tableau est coupée ou illisible, recopie ce qui est visible et explique-le brièvement dans "message" ;
- si la photo ne montre aucun tableau lisible, renvoie "rows": [] et explique dans "message".`;

/** Le format de réponse exigé de Gemini (JSON structuré). */
export const PHOTO_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
    uncertain: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { row: { type: "INTEGER" }, col: { type: "INTEGER" } }, required: ["row", "col"] },
    },
    message: { type: "STRING" },
  },
  required: ["rows"],
} as const;
