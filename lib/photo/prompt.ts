/**
 * La consigne donnée à Gemini. Mise au point sur des photos de tableaux inventés (propres, de travers, floues, couchées, coupées)
 * puis sur un tableau de la taille du vrai (37 clients, 22 produits).
 *
 * La réponse est « creuse » : les colonnes sont numérotées, puis chaque ligne ne liste que ses cases non vides avec leur numéro de
 * colonne. Dans un grand tableau où presque tout est vide, demander toutes les cases une à une fait régulièrement décaler des lignes
 * entières d'une colonne (le modèle compte mal les cases vides) : 16 % de cases fausses, contre 2,5 % avec cette forme.
 */
export const PHOTO_PROMPT = `Tu lis la photo d'un tableau de commandes (feuille Excel imprimée, écran ou papier).
Les produits sont en colonnes et les clients en lignes : la première ligne contient les noms des produits, la première colonne les noms des clients.

ÉTAPE 1 - LES COLONNES. Liste TOUTES les colonnes du tableau, de gauche à droite, avec leur numéro : la colonne des noms de clients porte le numéro 0, la suivante 1, puis 2, etc. Pour chacune, recopie son titre exactement tel qu'il est écrit (majuscules, accents, étoiles *, virgules, points), ou "" si elle n'a pas de titre (notes, colonne de fin...). Un titre qui est un nombre (par exemple "975,45") est un titre comme un autre.

ÉTAPE 2 - LES LIGNES. Pour CHAQUE ligne du tableau située sous la ligne de titres (y compris une éventuelle ligne « TOTAL » et les lignes sans aucun chiffre), donne le texte de sa première colonne ("label"), puis la liste des cases NON VIDES de cette ligne avec le numéro de leur colonne. Pour chaque nombre ou texte, trouve sa colonne en suivant les traits verticaux du tableau jusqu'au titre en haut de la colonne : ne compte pas les cases vides, ne décale jamais. Ne liste jamais une case vide.

Règles :
- recopie EXACTEMENT, cellule par cellule : majuscules, accents, étoiles *, signes +, virgules et points (« 0,5 », « 0.5L », « 3*0,2 », « Bon d'ici 17/10* », « Amap Amboise +6l ») ;
- ne calcule rien, ne corrige rien, n'ajoute rien, n'interprète rien ;
- ignore ce qui est autour du tableau (titre, date, légende, marges, bureau) ;
- si la photo est penchée, floue ou en perspective, suis les traits du tableau pour associer chaque valeur à SA colonne et à SA ligne ;
- s'il y a plusieurs tableaux, recopie le plus grand ;
- si une partie du tableau est coupée ou illisible, recopie ce qui est visible et explique-le brièvement dans "message" ;
- si un chiffre ou un mot est difficile à lire, ou si une case vide pourrait cacher un chiffre très pâle, recopie ce que tu vois le mieux et signale la case dans "uncertain" ("row" : numéro de la ligne dans "rows", à partir de 0 ; "col" : numéro de colonne) ;
- si la photo ne montre aucun tableau lisible, renvoie "columns" et "rows" vides et explique dans "message".`;

/** Le format de réponse exigé de Gemini (JSON structuré). */
export const PHOTO_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    columns: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { col: { type: "INTEGER" }, title: { type: "STRING" } },
        required: ["col", "title"],
        propertyOrdering: ["col", "title"],
      },
    },
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          cells: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { col: { type: "INTEGER" }, text: { type: "STRING" } },
              required: ["col", "text"],
              propertyOrdering: ["col", "text"],
            },
          },
        },
        required: ["label", "cells"],
        propertyOrdering: ["label", "cells"],
      },
    },
    uncertain: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { row: { type: "INTEGER" }, col: { type: "INTEGER" } }, required: ["row", "col"] },
    },
    message: { type: "STRING" },
  },
  required: ["columns", "rows"],
  propertyOrdering: ["columns", "rows", "uncertain", "message"],
} as const;
