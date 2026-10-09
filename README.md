# Prépa Commandes

Application web (installable sur le téléphone) pour **préparer des commandes de produits laitiers à la voix**.
À partir d'un tableau Excel (clients en lignes, produits en colonnes), elle dicte produit par produit :
d'abord le **total à sortir**, puis la **quantité pour chaque client**. On avance en disant « suivant »
ou avec de gros boutons (les mains sont souvent occupées et l'endroit bruyant).

Tout se passe dans le navigateur : pas de compte, pas de base de données, pas de variable d'environnement.
Le fichier est lu sur l'appareil et n'est envoyé nulle part ; la préparation en cours est enregistrée
dans le navigateur (`localStorage`) pour pouvoir être reprise.

## Fonctionnement

1. **Accueil** : importer le fichier `.xlsx` ou `.csv`, ou reprendre la préparation en cours.
2. **Vérification** : le tableau est modifiable (boutons +/- ou saisie). Les valeurs douteuses sont en **orange** ;
   le bouton « Tout est correct, commencer » reste grisé tant qu'il en reste.
3. **Préparation** : « Produit 3/15 · Étape 4/10 », la quantité en très grand, le client, un mini-tableau
   et quatre gros boutons (Suivant, Précédent, Répéter, Pause).
4. **Fin** : récapitulatif, « Recommencer », « Retour au tableau ».
5. **Réglages** : voix et vitesse, micro, taille du texte, thème sombre, ignorer les `*`,
   table d'alias de prononciation (« FB » se dit « fromage blanc »).

### Le fichier attendu

- Ligne 1 : le nom des produits (une colonne par produit). Colonne A : le nom des clients.
- **Ignorés automatiquement** (et réactivables à la vérification) : les produits dont le nom contient `*`
  (réglable), les colonnes sans titre ou dont le titre est une formule, les produits sans aucune quantité,
  la ligne `TOTAL`, les lignes sans nom ou dont le nom contient `*`, les clients sans aucune quantité.
- Une cellule vide vaut 0 (client sauté). Une **formule n'est jamais une quantité**.
- Quantité valide = entier de 0 à 50. Le reste (texte comme `3*0,2`, décimal, négatif, plus de 50) est signalé
  en orange et **jamais converti automatiquement**. Dans un CSV, `2,5` reste du texte (et non 25).

### Commandes vocales

`suivant` · `précédent` · `répète` · `pause` · `reprends` · `où j'en suis` · `reprends à <produit> pour <client>`.
Seuls ces mots **exacts** sont pris en compte (une phrase qui les contient ne déclenche rien) et une commande
répétée aussitôt est ignorée. Le texte entendu est affiché à l'écran.

## Limites

- **La reconnaissance vocale est moins fiable dans un endroit bruyant**, et sur **iPhone** elle est souvent
  indisponible (surtout quand l'appli est installée sur l'écran d'accueil). Les gros boutons fonctionnent toujours.
- Sur Chrome, l'écoute envoie le son à Google pour le transcrire : elle a besoin d'Internet (les boutons, non).
- Le micro se coupe quelques instants pendant que l'appli parle, pour ne pas s'écouter elle-même.
- L'appli s'ouvre hors connexion une fois chargée une première fois (la voix qui parle marche sans Internet si
  une voix française est installée sur l'appareil).

## Développement

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests unitaires (Vitest)
npm run lint
npm run build      # build de production
npm run test:e2e   # tests Playwright en format téléphone (après npm run build)
```

Node 22 ou plus récent. Les tests de bout en bout utilisent de fausses API vocales ; si Playwright n'a pas son
navigateur, indiquer celui à utiliser : `CHROMIUM_PATH=/chemin/vers/chrome npm run test:e2e`.

### Organisation

| Dossier | Contenu |
| --- | --- |
| `lib/` | Toute la logique, sans interface : lecture du fichier, règles d'exclusion, valeurs douteuses, étapes, texte parlé, commandes vocales, sauvegarde, écoute et parole |
| `lib/import/` | Les **importeurs** (fichier Excel/CSV). Tous produisent un `RawGrid` : le reste de l'appli n'en dépend pas |
| `app/`, `components/`, `hooks/` | Les écrans (une adresse par écran) et la voix côté interface |
| `tests/` | Tests unitaires (dont `exemple.test.ts`, qui lit `exemple/Classeur1.xlsx`) |
| `e2e/` | Tests Playwright (390 px, voix simulée, hors connexion) |
| `vendor/` | SheetJS 0.20.3 (la version publiée sur npm est ancienne et vulnérable) |

## Déploiement (Vercel)

Importer le dépôt sur vercel.com (« Add New… > Project ») : Next.js est détecté, **aucune variable d'environnement**,
puis « Deploy ».

## Évolution prévue : lire une photo du tableau

Non réalisée pour l'instant, mais prévue : il suffira d'ajouter un importeur dans `lib/import/` (interface
`TableImporter`) qui transforme la photo en `RawGrid` (par exemple avec Gemini), puis de l'ajouter à la liste `importers`.
Cela demandera une clé d'API et donc une variable d'environnement, ce que l'appli n'utilise pas aujourd'hui.
