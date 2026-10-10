import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Clover } from "@/components/brand/Illustrations";
import { Card, Page, ScreenHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Aide" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-serif text-2xl font-bold">
        <Clover className="h-6 w-6 shrink-0" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

const COMMANDS: [string, string][] = [
  ["« suivant »", "passe à l'étape suivante"],
  ["« précédent »", "revient à l'étape d'avant"],
  ["« répète »", "redit l'étape en cours"],
  ["« pause »", "met en pause (seul « reprends » est alors écouté)"],
  ["« reprends »", "sort de la pause et redit l'étape"],
  ["« où j'en suis »", "dit le produit, l'étape et la quantité en cours"],
  ["« reprends à yaourt citron pour Biocité »", "va directement à ce produit et à ce client (sans client : au total du produit)"],
  ["« reprends à Biocité »", "va à ce client dans le produit en cours"],
  ["« produit 5 », « étape 3 », « reprends au début »", "va au produit n° 5 (celui affiché en haut), à l'étape 3 du produit en cours, ou au tout début"],
];

export default function HelpPage() {
  return (
    <>
      <ScreenHeader title="Aide" backHref="/" backLabel="Accueil" />
      <Page className="flex flex-col gap-4 text-base leading-relaxed">
        <Section title="Le principe">
          <p>
            Prépa Commandes lit votre tableau (les clients en lignes, les produits en colonnes) et vous dicte, produit par produit
            : d&apos;abord le <strong>total à sortir</strong>, puis la <strong>quantité pour chaque client</strong>. Vous avancez
            avec la voix (« suivant ») ou avec les gros boutons.
          </p>
        </Section>

        <Section title="Préparer le fichier">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Fichier <strong>Excel (.xlsx)</strong> ou <strong>CSV</strong>, une seule feuille.
            </li>
            <li>
              <strong>Ligne 1</strong> : le nom de chaque produit. <strong>Colonne A</strong> : le nom de chaque client.
            </li>
            <li>Une case vide vaut 0 : le client est sauté pour ce produit.</li>
            <li>
              Une quantité valide est un <strong>nombre entier de 0 à 50</strong>. Tout le reste est montré en{" "}
              <strong>orange</strong> à la vérification : un texte (« 3*0,2 »), un nombre à virgule, un nombre négatif ou
              supérieur à 50. Rien n&apos;est corrigé automatiquement.
            </li>
          </ul>
          <p className="font-bold">Ce qui est ignoré automatiquement (et que vous pouvez réactiver) :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>les produits dont le nom contient une étoile * (réglable) ;</li>
            <li>
              les colonnes sans titre (des notes), ou dont le titre est une formule ou un nombre (un total de poids, par exemple)
              ;
            </li>
            <li>les produits pour lesquels aucun client n&apos;a de quantité ;</li>
            <li>la ligne « TOTAL », les lignes sans nom ou dont le nom contient une étoile (« Bon d&apos;ici 17/10* ») ;</li>
            <li>les clients qui n&apos;ont aucune quantité à préparer.</li>
          </ul>
          <p>Les cellules qui contiennent une formule ne sont jamais prises pour des quantités.</p>
        </Section>

        <Section title="Importer le tableau en photo">
          <p>
            Si le bouton <strong>« Photo du tableau »</strong> est présent sur l&apos;écran d&apos;accueil, vous pouvez prendre le tableau en photo
            (papier ou écran) au lieu d&apos;importer un fichier : l&apos;appli le reconstitue. Sans ce bouton, la lecture de photo n&apos;est pas
            activée sur ce site (voir les Réglages).
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong>Prenez la photo</strong> : le tableau en entier, bien à plat, de face, avec une bonne lumière et sans reflet. Les chiffres
              doivent être lisibles à l&apos;œil nu. Photographiez seulement les clients et les produits de la semaine.
            </li>
            <li>
              <strong>Attendez</strong> 10 à 30 secondes : la photo est lue sur Internet. Le bouton « Annuler » abandonne la lecture.
            </li>
            <li>
              <strong>Comparez avec la photo</strong> : la lecture peut se tromper, surtout sur les chiffres qui se ressemblent (1 et 7, 3 et 8,
              5 et 6). Les cases dont elle n&apos;est <strong>pas sûre</strong> sont en <strong>orange</strong> : touchez-en une, regardez la
              photo (bouton « Voir la photo »), puis corrigez la quantité ou confirmez-la (« Oui, c&apos;est bien 5 »).
            </li>
            <li>
              <strong>Relisez aussi les cases qui ne sont pas orange</strong> : une erreur n&apos;est pas toujours signalée. Le bouton de départ
              s&apos;appelle « J&apos;ai comparé avec la photo : tout est correct, commencer » pour vous le rappeler.
            </li>
          </ol>
          <p>
            <strong>La ligne « TOTAL » sert de contrôle.</strong> Si elle figure sur la photo, l&apos;appli compare chaque total à la somme des
            quantités qu&apos;elle a lues. Un total en <strong>orange</strong> veut dire qu&apos;une quantité de cette colonne est mal lue ou mal
            placée (souvent décalée d&apos;une colonne) : regardez la colonne sur la photo, corrigez la quantité, ou gardez le total tel quel si
            tout est juste. L&apos;écart disparaît tout seul quand la somme tombe juste.
          </p>
          <p>
            Ensuite, tout se passe comme avec un fichier : les mêmes règles s&apos;appliquent (ligne « TOTAL », produits marqués *, colonnes sans
            titre…).
          </p>
          <p className="text-sm text-muted">
            <strong>À savoir.</strong> La photo est envoyée à Google (service Gemini) pour être lue. Avec l&apos;offre gratuite, Google peut
            s&apos;en servir pour améliorer ses produits : évitez de photographier des informations personnelles. L&apos;appli ne garde qu&apos;une
            copie réduite de la photo, sur ce téléphone, pour la comparer avec le tableau ; elle disparaît quand vous importez un autre tableau ou
            effacez les données. L&apos;offre gratuite est limitée (environ 20 photos par jour) : au-delà, importez un fichier Excel ou CSV, ou
            réessayez le lendemain.
          </p>
        </Section>

        <Section title="Vérifier">
          <ul className="list-disc space-y-1 pl-5">
            <li>Touchez une case pour la changer : boutons + et −, ou tapez le nombre.</li>
            <li>
              Une case <strong>orange</strong> est à corriger, ou à garder telle quelle si c&apos;est voulu. Le bouton « Tout est
              correct, commencer » reste grisé tant qu&apos;il en reste.
            </li>
            <li>
              Touchez le nom d&apos;un produit ou d&apos;un client pour l&apos;ignorer ou le réactiver. Les éléments ignorés sont
              grisés, avec la raison, et listés sous le tableau.
            </li>
          </ul>
        </Section>

        <Section title="Préparer">
          <p>
            L&apos;écran affiche le produit, la quantité en très grand et le client. En haut : « Produit 3/17 · Étape 4/9 ». Le
            petit tableau montre où l&apos;on en est. L&apos;étape « Total » donne la quantité à sortir pour tout le produit.
          </p>
          <p className="font-bold">Commandes vocales</p>
          <dl className="divide-y divide-line rounded-xl border border-line">
            {COMMANDS.map(([say, does]) => (
              <div key={say} className="px-3 py-2">
                <dt className="font-extrabold">{say}</dt>
                <dd className="text-muted">{does}</dd>
              </div>
            ))}
          </dl>
          <p>
            Seuls ces mots <strong>exacts</strong> sont pris en compte : une phrase qui les contient ne déclenche rien, et une
            commande répétée aussitôt est ignorée. Le texte entendu est affiché en bas de l&apos;écran. Le micro se coupe quelques
            instants pendant que l&apos;appli parle.
          </p>
          <p>
            « Reviens à » et « va à » marchent comme « reprends à ». Si plusieurs produits portent le même nom (« fromage blanc »),
            l&apos;appli les cite : précisez alors le produit, ou ajoutez le client.
          </p>
          <p>Sur ordinateur : flèches gauche et droite (précédent, suivant), R (répéter), P (pause).</p>
        </Section>

        <Section title="Reprendre à un endroit précis">
          <p>
            <strong>Sans la voix</strong> : touchez <strong>« Produit 3/17 · Étape 4/9 »</strong> en haut de l&apos;écran de
            préparation. Choisissez le produit, puis « Total à sortir » ou le client : l&apos;appli y va et le dit à voix haute.
          </p>
          <p>
            <strong>À la voix</strong> : « reprends à fromage blanc pour Biocité », « reprends à Biocité » (un client du produit en
            cours), « produit 5 », « étape 3 » ou « reprends au début ». Dites seulement « reprends à » pour entendre un exemple.
          </p>
        </Section>

        <Section title="Dans un endroit bruyant">
          <p>
            Le téléphone ne permet pas de régler le volume d&apos;écoute du micro. L&apos;appli propose à la place de baisser sa{" "}
            <strong>sensibilité</strong> : elle ignore alors ce que le micro entend mal, ce qui évite les fausses commandes dues aux
            ventilateurs ou aux conversations.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Touchez le bouton aux deux curseurs, à côté du badge « Micro » (ou ouvrez les Réglages).
            </li>
            <li>
              Choisissez <strong>Basse</strong> (un peu de bruit) ou <strong>Très basse</strong> (beaucoup de bruit).
            </li>
            <li>
              Essayez : dites « suivant ». L&apos;appli montre ce qu&apos;elle a entendu, avec un pourcentage, et si elle l&apos;aurait
              pris en compte. Rien ne bouge pendant l&apos;essai.
            </li>
          </ol>
          <p>
            Contrepartie : parlez plus près et nettement, et l&apos;appli réagit un peu moins vite. Si elle ignore trop de vos commandes,
            remontez d&apos;un niveau.
          </p>
        </Section>

        <Section title="Installer sur l'écran d'accueil">
          <div>
            <p className="font-bold">Android (Chrome)</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Ouvrez l&apos;adresse de l&apos;appli dans Chrome.</li>
              <li>
                Sur l&apos;écran d&apos;accueil de l&apos;appli, touchez <strong>« Installer l&apos;application »</strong> s&apos;il est
                proposé. Sinon, touchez le menu <strong>⋮</strong> (trois points, en haut à droite).
              </li>
              <li>
                Touchez <strong>« Installer l&apos;application »</strong> (ou « Ajouter à l&apos;écran d&apos;accueil »), puis{" "}
                <strong>Installer</strong>. L&apos;icône apparaît parmi vos applis.
              </li>
            </ol>
            <p className="mt-2 text-sm text-muted">
              Samsung Internet : menu ☰, puis « Ajouter la page à » et « Écran d&apos;accueil ». Firefox : menu ⋮, puis « Installer ».
            </p>
          </div>
          <div>
            <p className="font-bold">iPhone (Safari)</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Ouvrez l&apos;adresse de l&apos;appli dans Safari (pas dans un autre navigateur).</li>
              <li>
                Touchez le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut).
              </li>
              <li>
                Faites défiler et touchez <strong>« Sur l&apos;écran d&apos;accueil »</strong>, puis <strong>Ajouter</strong>.
              </li>
            </ol>
          </div>
        </Section>

        <Section title="Sur Android">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Utilisez Chrome</strong> : c&apos;est le navigateur qui écoute le mieux. Si l&apos;adresse s&apos;ouvre dans Facebook,
              Messenger ou Instagram, ouvrez-la plutôt dans Chrome (menu ⋮, puis « Ouvrir dans Chrome » ou « Ouvrir dans le
              navigateur »).
            </li>
            <li>
              <strong>Micro</strong> : au premier lancement, Android demande l&apos;autorisation : touchez « Autoriser ». Si vous avez
              refusé, touchez le cadenas à gauche de l&apos;adresse dans Chrome ; dans l&apos;appli installée, appuyez longuement sur son
              icône, puis « Infos sur l&apos;appli » &gt; Autorisations &gt; Micro.
            </li>
            <li>
              <strong>Voix</strong> : le téléphone doit avoir une voix française. Sinon, cherchez « Synthèse vocale » dans ses réglages et
              installez-la. L&apos;appli le signale à l&apos;écran quand elle ne peut pas parler.
            </li>
            <li>
              <strong>Le fichier</strong> : touchez « Importer un fichier », puis cherchez-le dans « Récents » ou « Téléchargements ». Un
              tableau Google Sheets doit d&apos;abord être téléchargé : Fichier &gt; Télécharger &gt; Microsoft Excel (.xlsx).
            </li>
            <li>
              <strong>Bouton Retour</strong> : il revient à l&apos;écran précédent. Pendant une préparation, il ramène au tableau, où
              « Reprendre la préparation en cours » vous remet exactement à l&apos;endroit où vous étiez.
            </li>
            <li>
              <strong>Petit bip</strong> : selon le téléphone, un bip peut accompagner la remise en route de l&apos;écoute. C&apos;est le
              téléphone qui le fait ; vous pouvez couper le micro dans les Réglages et n&apos;utiliser que les gros boutons.
            </li>
          </ul>
        </Section>

        <Section title="Limites à connaître">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              La <strong>reconnaissance vocale</strong> est moins fiable dans un endroit bruyant. Sur <strong>iPhone</strong>,
              elle est souvent indisponible, surtout quand l&apos;appli est installée sur l&apos;écran d&apos;accueil : utilisez
              alors les gros boutons.
            </li>
            <li>
              Sur Chrome, l&apos;écoute envoie le son à Google pour le transcrire : elle a besoin d&apos;Internet. Les boutons,
              eux, non.
            </li>
            <li>La voix qui parle, elle, fonctionne sans Internet si une voix française est installée sur l&apos;appareil.</li>
            <li>Il faut un navigateur récent : Chrome 111 ou plus pour Android (Play Store), Safari 16.4 ou plus pour iPhone.</li>
            <li>
              Tout est enregistré uniquement sur cet appareil (seule la photo d&apos;un tableau est envoyée à Google, le temps d&apos;être lue).
              Changer de téléphone demande de réimporter le tableau.
            </li>
          </ul>
        </Section>
      </Page>
    </>
  );
}
