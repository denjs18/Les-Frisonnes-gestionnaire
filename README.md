# Prépa Commandes

Application web (installable sur le téléphone) pour **préparer des commandes de produits laitiers à la voix**.
À partir d'un tableau Excel (clients en lignes, produits en colonnes), elle dicte produit par produit :
d'abord le **total à sortir**, puis la **quantité pour chaque client**. On avance en disant « suivant »
ou avec de gros boutons (les mains sont souvent occupées et l'endroit bruyant).

Tout se passe dans le navigateur : pas de compte, pas de base de données. Le fichier est lu sur l'appareil et
n'est envoyé nulle part ; la préparation en cours est enregistrée dans le navigateur (`localStorage`) pour pouvoir
être reprise. Seule exception, **facultative** : la lecture d'une **photo du tableau** passe par un petit service
sur Internet (voir « Photo du tableau » plus bas) ; sans clé pour ce service, l'appli reste 100 % locale.

## Fonctionnement

1. **Accueil** : importer le fichier `.xlsx` ou `.csv` (ou, si le site est configuré pour cela, **une photo du tableau**),
   ou reprendre la préparation en cours. Un bouton « Installer l'application » (Android) ou les étapes pour l'ajouter à
   l'écran d'accueil sont proposés.
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

`suivant` · `précédent` · `répète` · `pause` · `reprends` · `où j'en suis`, et pour reprendre à un endroit précis :
`reprends à <produit> pour <client>` (aussi « reviens à », « va à »…), `reprends à <client>` (un client du produit en cours),
`produit 5`, `étape 3`, `reprends au début`.
Seuls ces mots **exacts** sont pris en compte (une phrase qui les contient ne déclenche rien) et une commande
répétée aussitôt est ignorée. Le texte entendu est affiché à l'écran.

Les noms sont retrouvés sans tenir compte du pluriel, des accents, des mots coupés ou collés autrement (« bio cité »), ni
d'une faute d'une lettre ; les nombres dits en toutes lettres valent les chiffres (« quatre saisons » = « 4 saisons »).
Quand plusieurs produits conviennent (« fromage blanc » : FB 0,5 et FB 1), l'appli les cite et demande de préciser.

**Sans la voix**, toucher « Produit 3/17 · Étape 4/9 » en haut de l'écran de préparation ouvre « Aller à… » : on choisit le produit,
puis le total ou un client.

### Micro et bruit

Le navigateur ne donne pas accès au volume d'écoute du micro. Le réglage **Sensibilité** (Normale, Basse, Très basse) change à la
place l'exigence de l'appli. En Basse et Très basse, seuls comptent les résultats *définitifs* du micro (jamais un résultat
provisoire resté stable), avec un seuil de confiance de 0,6 ou 0,8 et sans les hypothèses de secours ; un résultat sans confiance
indiquée est gardé. Réglable dans les Réglages et sur l'écran de préparation (bouton aux deux curseurs, à côté du badge du micro),
avec un essai en direct : texte entendu, pourcentage, pris en compte ou non. Les seuils sont dans `lib/voice/sensitivity.ts`, à
ajuster d'après les essais sur place (ventilateurs, chambre froide).

## Android et iPhone

L'appli est pensée pour les deux ; **Chrome sur Android est le meilleur cas** (c'est lui qui fournit la reconnaissance vocale).

- **Installation** : sur Android, Chrome propose l'installation et l'accueil affiche un gros bouton « Installer l'application »
  (sinon les étapes du menu, adaptées à Chrome, Samsung Internet ou Firefox). Sur iPhone, les étapes de Safari sont affichées.
  Dans le navigateur intégré d'une autre appli (Facebook, Messenger…), l'accueil conseille d'ouvrir l'adresse dans Chrome ou Safari.
- **Choix du fichier** : sur Android, le sélecteur n'est pas filtré par type (il grise sinon certains `.xlsx` reçus par WhatsApp ou
  par e-mail) ; le contenu est vérifié après le choix, avec un message clair pour un PDF ou une photo.
- **Clavier** : la page se réduit quand le clavier s'ouvre (`interactive-widget=resizes-content`), les fenêtres du bas restent visibles,
  et la touche « OK » du clavier numérique range le clavier.
- **Bouton Retour d'Android** : en pleine préparation, il ramène au tableau, où « Reprendre la préparation en cours » est le gros
  bouton ; « Recommencer depuis le début » demande confirmation. Tirer l'écran vers le bas ne recharge pas la page.
- **Voix** : si le téléphone n'a pas de voix française, ou si la reconnaissance vocale est indisponible (application Google absente,
  micro refusé…), l'écran de préparation l'explique sur une ligne dépliable, sans pousser les gros boutons hors de l'écran.
  Un résultat final qui n'est que l'écho d'une commande déjà exécutée n'est pas exécuté deux fois.
- **Texte très agrandi** par les réglages du téléphone : les gros boutons se réduisent à la largeur de l'écran au lieu de déborder.

Il faut un navigateur récent : Chrome 111 ou plus sur Android, Safari 16.4 ou plus sur iPhone.

## Identité visuelle

Le style reprend le logo de la Fromagerie des Frisonnes : trait noir fin, vert du trèfle (`#48a858`, assombri en
`#2d7a3b` pour que le texte blanc des boutons reste très lisible), papier crème, jaune « fromage » pour le total et la
pause, titres en serif comme le lettrage du logo (aucune police à télécharger).

- Les dessins de la ferme, des vaches et des fromages sont des SVG dans `components/brand/Illustrations.tsx`.
  Ils ne sont pas sur l'écran de préparation, qui reste sobre.
- Le logo (`components/brand/logo*.webp`) et les icônes de l'application (`public/icons/`, `app/favicon.ico`) viennent de la
  capture fournie. Avec un fichier de meilleure qualité, il suffit de remplacer le logo et de régénérer les icônes.
- Les couleurs sont dans `app/globals.css` (clair et sombre). `tests/contrast.test.ts` vérifie qu'elles gardent un fort
  contraste : à relancer après toute retouche de la palette.

## Limites

- **La reconnaissance vocale est moins fiable dans un endroit bruyant**, et sur **iPhone** elle est souvent
  indisponible (surtout quand l'appli est installée sur l'écran d'accueil). Les gros boutons fonctionnent toujours.
- Sur **Android**, selon le téléphone, un petit « bip » peut accompagner la remise en route de l'écoute ; Firefox, Samsung Internet
  et les navigateurs intégrés aux applis n'offrent pas (ou mal) la reconnaissance vocale : utiliser Chrome.
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
npm run test:e2e   # tests Playwright sur 3 téléphones (après npm run build)
```

Node 22 (fixé dans `package.json` : c'est aussi la version utilisée par Vercel, avec laquelle tout est testé). Les tests de bout en bout utilisent de fausses API vocales ; si Playwright n'a pas son
navigateur, indiquer celui à utiliser : `CHROMIUM_PATH=/chemin/vers/chrome npm run test:e2e`.

Les tests de bout en bout jouent trois profils (voir `playwright.config.ts`) : un téléphone de 390 px (tous les tests), un
**Pixel 7** (Chrome sur Android : le parcours complet et `e2e/android.spec.ts`) et un **Android d'entrée de gamme** de 360 × 640. Ils
vérifient notamment, avec les contrôles de Chrome (`Page.getInstallabilityErrors`), que rien n'empêche l'installation. Ce qu'un
ordinateur ne peut pas jouer reste à essayer sur un vrai téléphone : la reconnaissance vocale de Google, les voix installées, le
sélecteur de fichiers d'Android et l'installation elle-même.

### Organisation

| Dossier | Contenu |
| --- | --- |
| `lib/` | Toute la logique, sans interface : lecture du fichier, règles d'exclusion, valeurs douteuses, étapes, texte parlé, commandes vocales, sauvegarde, écoute et parole, détection du téléphone (`platform.ts`), installation (`install.ts`) |
| `lib/import/` | Les **importeurs** (fichier Excel/CSV, et `photo.ts` pour une photo lue). Tous aboutissent à un `RawGrid` : le reste de l'appli n'en dépend pas |
| `lib/photo/`, `app/api/lire-photo/` | La lecture d'une photo : consigne et appel à Gemini (serveur), mise en forme de la réponse, envoi et réduction de la photo (téléphone), messages d'erreur |
| `app/`, `components/`, `hooks/` | Les écrans (une adresse par écran) et la voix côté interface ; `components/brand/` : logo et dessins |
| `tests/` | Tests unitaires (dont `exemple.test.ts`, qui lit `exemple/Classeur1.xlsx`) |
| `e2e/` | Tests Playwright (390 px, profils Android, voix simulée, hors connexion) |
| `vendor/` | SheetJS 0.20.3 (la version publiée sur npm est ancienne et vulnérable) |

## Déploiement (Vercel)

Importer le dépôt sur vercel.com (« Add New… > Project ») : Next.js est détecté, **aucune variable d'environnement n'est
obligatoire**, puis « Deploy ». Les variables de la photo (ci-dessous) sont facultatives.

## Photo du tableau (facultatif)

Un bouton **« Photo du tableau »** permet de prendre le tableau en photo au lieu d'importer un fichier. Il n'apparaît que si le
site connaît une clé pour la lire ; sans clé, l'accueil est exactement celui d'avant (les Réglages indiquent si la lecture est
activée).

### Comment ça marche

1. Le téléphone redresse la photo, la réduit (2000 px, JPEG) et l'envoie à `POST /api/lire-photo`, une fonction de Vercel
   (`app/api/lire-photo/route.ts`).
2. Le serveur la transmet à l'**API Gemini** de Google avec la clé secrète, une consigne de **transcription fidèle** (rien n'est
   corrigé ni calculé : `*`, `+`, `0,5`, `3*0,2`, ligne TOTAL… sont recopiés tels quels) et une réponse JSON stricte : les lignes du
   tableau, la liste des cases dont la lecture est **incertaine**, et une remarque éventuelle (photo coupée, floue…).
3. L'appli suit alors le même chemin qu'un fichier (`RawGrid` → `buildModel` → règles d'exclusion), avec en plus :
   - les cases incertaines sont **orange** tant qu'on ne les a ni corrigées ni confirmées (« Oui, c'est bien 5 ») ;
   - une copie réduite de la photo est gardée **sur le téléphone** (`localStorage`) et se consulte à la vérification (« Voir la
     photo »), y compris depuis une case douteuse ; elle disparaît quand on importe un autre tableau ou qu'on efface les données ;
   - le bouton de départ devient « J'ai comparé avec la photo : tout est correct, commencer » : une erreur de lecture n'est pas
     toujours signalée, la comparaison avec la photo reste indispensable.

### Réglage sur Vercel

*Settings > Environment Variables* du projet (cocher *Production*), puis **Redeploy** : une variable n'est prise en compte que par
les déploiements faits après son ajout.

| Variable | Rôle |
| --- | --- |
| `GEMINI_API_KEY` | **Clé de l'API Gemini** (Google AI Studio). Sans elle, la lecture de photo est désactivée. À créer en « Sensitive ». Jamais dans le code ni dans le dépôt. |
| `GEMINI_MODEL` | Facultatif : modèles à essayer, séparés par des virgules (sinon la liste de `lib/photo/gemini.ts`). |
| `PHOTO_ACCESS_CODE` | Facultatif : code demandé avant chaque lecture (champ « Code d'accès » sur l'accueil, retenu sur le téléphone). Protège l'offre gratuite si l'adresse du site circule. |

En local : un fichier `.env.local` (ignoré par git) contenant `GEMINI_API_KEY=…`, puis `npm run dev`.

### Robustesse et sécurité

- La clé reste côté serveur (en-tête `x-goog-api-key`, jamais dans une adresse) ; ni elle, ni le code d'accès, ni la photo n'apparaissent
  dans les réponses ou les journaux.
- Le serveur n'accepte que les demandes venues du site lui-même, de vraies images (reconnues à leurs premiers octets : JPEG, PNG,
  WebP) de 4 Mo au plus, et vérifie le code d'accès (comparaison à temps constant). Ce sont les limites de Vercel (4,5 Mo par envoi,
  60 s par lecture) qui fixent ces valeurs.
- **Plusieurs modèles sont essayés l'un après l'autre** : l'offre gratuite plafonne chaque modèle séparément (environ 20 demandes par
  jour), Google en retire régulièrement et les modèles sont parfois saturés (503). Un modèle saturé, épuisé, retiré ou trop lent
  (20 s) fait passer au suivant, dans un budget de 52 s ; une clé refusée ou une photo refusée arrêtent tout de suite.
- Les erreurs sont expliquées en français et proposent l'import d'un fichier (limite du jour atteinte, service saturé, pas de réseau…).
- Un tableau lu est limité à 300 lignes × 100 colonnes.

### À savoir

- Avec l'offre **gratuite**, Google peut utiliser les données envoyées pour améliorer ses produits : la photo d'un tableau de commandes
  (noms de clients, quantités) y est envoyée. Une offre payante change ces conditions.
- La lecture est de **bonne qualité mais pas infaillible** (chiffres qui se ressemblent, écriture à la main). Les cases incertaines
  sont signalées, pas toutes les erreurs : c'est pourquoi l'appli demande de comparer avec la photo.
- Tests : `tests/photo-*.test.ts` (réponse de Gemini simulée : repli entre modèles, erreurs, sécurité de la route, conversion en
  tableau, cases douteuses, sauvegarde) et `e2e/photo.spec.ts` (parcours complet avec un faux service de lecture). La lecture réelle par
  Gemini se vérifie à la main avec de vraies photos.
