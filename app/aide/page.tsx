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
          <p>Sur ordinateur : flèches gauche et droite (précédent, suivant), R (répéter), P (pause).</p>
        </Section>

        <Section title="Installer sur l'écran d'accueil">
          <div>
            <p className="font-bold">Android (Chrome)</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Ouvrez l&apos;adresse de l&apos;appli dans Chrome.</li>
              <li>
                Touchez le menu <strong>⋮</strong> (trois points, en haut à droite).
              </li>
              <li>
                Touchez <strong>« Installer l&apos;application »</strong> (ou « Ajouter à l&apos;écran d&apos;accueil »), puis{" "}
                <strong>Installer</strong>.
              </li>
            </ol>
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
            <li>Tout est enregistré uniquement sur cet appareil. Changer de téléphone demande de réimporter le fichier.</li>
          </ul>
        </Section>
      </Page>
    </>
  );
}
