import type { Metadata } from 'next';
import Link from 'next/link';
import { alternatesPair } from '../../_landing/seo';

/**
 * Instructions publiques de suppression de compte — version française de
 * `/delete-account`. Voir la version anglaise pour le raisonnement : Google Play
 * exige une URL accessible sans connexion, et les chiffres cités ici viennent du
 * code (ACCOUNT_DELETION_GRACE_DAYS et `UsersService.purgeExpiredAccounts`).
 * Les deux pages doivent évoluer ensemble.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Supprimer votre compte KMB-Talk',
  description:
    "Comment demander la suppression de votre compte KMB-Talk, quelles données sont effacées, lesquelles sont conservées, et sous quel délai.",
  alternates: alternatesPair('/delete-account', '/fr/delete-account', '/fr/delete-account'),
};

const SUPPORT_EMAIL = 'support@kmb-talk.com';

export default function FrenchDeleteAccountPage() {
  return (
    <main className="policy">
      <article className="policy-body">
        <p className="policy-lang">
          <Link href="/delete-account">English</Link>
        </p>

        <h1>Supprimer votre compte KMB-Talk</h1>

        <p>
          Cette page explique comment demander la suppression de votre compte{' '}
          <strong>KMB-Talk</strong> et de ses données. Elle s&apos;applique à
          l&apos;application mobile KMB-Talk et au tableau de bord web KMB-Talk, qui
          partagent un même compte.
        </p>

        <h2>Supprimer votre compte depuis l&apos;application</h2>
        <p>
          Le plus rapide est de le faire depuis l&apos;application ; la suppression prend
          effet immédiatement.
        </p>

        <h3>Sur l&apos;application mobile</h3>
        <ol>
          <li>Ouvrez KMB-Talk et connectez-vous.</li>
          <li>Touchez l&apos;icône de profil (👤) en haut à droite de l&apos;écran d&apos;accueil.</li>
          <li>Sur l&apos;écran Compte, touchez <strong>Supprimer le compte</strong>.</li>
          <li>
            Tapez <strong>DELETE</strong> dans le champ, saisissez votre mot de passe et
            confirmez.
          </li>
        </ol>

        <h3>Sur le tableau de bord web</h3>
        <ol>
          <li>Connectez-vous et ouvrez <strong>Paramètres</strong>.</li>
          <li>
            Descendez jusqu&apos;à <strong>Supprimer le compte</strong>, en bas de la page.
          </li>
          <li>
            Tapez <strong>DELETE</strong> dans le champ, saisissez votre mot de passe et
            confirmez.
          </li>
        </ol>

        <h2>Si vous ne pouvez pas vous connecter</h2>
        <p>
          Écrivez à <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> depuis
          l&apos;adresse enregistrée sur le compte, avec pour objet{' '}
          <strong>Supprimer mon compte</strong>. Indiquez le nom d&apos;utilisateur ou le
          numéro de téléphone du compte afin qu&apos;il puisse être identifié. Les demandes
          sont traitées sous 30 jours.
        </p>

        <h2>Ce qui se passe, et quand</h2>
        <p>
          Votre compte est fermé <strong>immédiatement</strong> et vous êtes déconnecté. Suit
          un <strong>délai de grâce de 7 jours</strong>, afin qu&apos;une suppression faite
          par erreur puisse être annulée : reconnectez-vous durant ces 7 jours et la
          restauration du compte vous sera proposée. Rien n&apos;est effacé définitivement
          avant la fin de ces 7 jours.
        </p>

        <h2>Ce qui est supprimé</h2>
        <p>Passé le délai de grâce de 7 jours, les éléments suivants sont effacés définitivement :</p>
        <ul>
          <li>Votre nom</li>
          <li>Votre nom d&apos;utilisateur</li>
          <li>Votre adresse e-mail</li>
          <li>Votre numéro de téléphone</li>
          <li>Votre date de naissance</li>
          <li>Votre mot de passe</li>
        </ul>
        <p>
          Vous ne pouvez plus vous connecter et vous n&apos;êtes plus trouvable par les autres
          utilisateurs de l&apos;application.
        </p>

        <h2>Ce qui est conservé, et pourquoi</h2>
        <p>
          Les opérations auxquelles <strong>une autre personne participe également</strong>{' '}
          sont conservées dans les livres de cette personne, votre identité étant remplacée
          par un marqueur anonyme. Cela couvre les ventes, les dettes et créances, les
          paiements, les mouvements de stock et les consignations.
        </p>
        <p>
          La raison en est que ces enregistrements ne sont pas seulement les vôtres. Si un
          fournisseur vous a remis des marchandises à crédit, supprimer votre compte ne peut
          pas effacer son relevé de ce qui lui était dû — cela détruirait la comptabilité
          d&apos;un autre commerçant. Ce qui est supprimé, c&apos;est le lien entre ces
          enregistrements et vous : ils subsistent comme écritures au nom d&apos;un ancien
          utilisateur anonyme.
        </p>
        <p>
          Ces enregistrements anonymisés ne portent ni nom, ni nom d&apos;utilisateur, ni
          adresse e-mail, ni numéro de téléphone, ni date de naissance, et sont conservés
          aussi longtemps que le compte de la contrepartie existe.
        </p>

        <h2>Questions</h2>
        <p>
          Écrivez à <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Voir également
          notre <Link href="/fr/privacy">Politique de confidentialité</Link>.
        </p>
      </article>
    </main>
  );
}
