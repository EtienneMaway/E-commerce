/**
 * French translations for all user-facing API error messages.
 * Keys are the original English messages (exact match or regex pattern).
 */

interface Translation {
  /** Regex to match the English message */
  pattern: RegExp;
  /** Returns the French version, with optional captured groups */
  fr: (match: RegExpMatchArray) => string;
}

export const FR_TRANSLATIONS: Translation[] = [
  // ─── Auth ────────────────────────────────────────────────────────────────
  {
    pattern: /^Email already registered$/,
    fr: () => 'Email déjà enregistré',
  },
  {
    pattern: /^Phone already registered$/,
    fr: () => 'Numéro de téléphone déjà enregistré',
  },
  {
    pattern: /^Username already taken$/,
    fr: () => "Nom d'utilisateur déjà utilisé",
  },
  {
    pattern: /^Invalid credentials$/,
    fr: () => 'Identifiants invalides',
  },
  {
    pattern: /^Token user not found$/,
    fr: () => 'Utilisateur introuvable',
  },
  {
    pattern: /^Unauthorized$/i,
    fr: () => 'Non autorisé',
  },
  {
    pattern: /^Account deleted$/,
    fr: () => 'Compte supprimé',
  },
  {
    pattern: /^Account pending deletion$/,
    fr: () => 'Compte en attente de suppression',
  },
  {
    pattern: /^Account is already pending deletion$/,
    fr: () => 'Le compte est déjà en attente de suppression',
  },
  {
    pattern: /^Account has already been anonymized and cannot be restored$/,
    fr: () => 'Le compte a déjà été anonymisé et ne peut plus être restauré',
  },
  {
    pattern: /^Grace period has expired$/,
    fr: () => 'Le délai de grâce a expiré',
  },
  {
    pattern: /^Current password is incorrect$/,
    fr: () => 'Le mot de passe actuel est incorrect',
  },
  {
    pattern: /^Password is incorrect$/,
    fr: () => 'Le mot de passe est incorrect',
  },
  {
    pattern: /^New password must differ from the current password$/,
    fr: () => 'Le nouveau mot de passe doit être différent de l’actuel',
  },
  {
    pattern: /^At least one of email or phone is required$/,
    fr: () => 'Au moins un e-mail ou un numéro de téléphone est requis',
  },
  {
    pattern: /^Employee profiles are managed by the employer$/,
    fr: () => 'Les profils des employés sont gérés par l’employeur',
  },
  {
    pattern: /^Employee profiles are deleted by the employer$/,
    fr: () => 'Les profils des employés sont supprimés par l’employeur',
  },
  {
    pattern: /^Mini-employee accounts do not use a password$/,
    fr: () => 'Les comptes mini-employés n’utilisent pas de mot de passe',
  },

  // ─── Inventory ───────────────────────────────────────────────────────────
  {
    pattern: /^Supplier user not found$/,
    fr: () => 'Fournisseur introuvable',
  },
  {
    pattern: /^You cannot be your own supplier$/,
    fr: () => 'Vous ne pouvez pas être votre propre fournisseur',
  },
  {
    pattern: /^Debtor user not found$/,
    fr: () => 'Débiteur introuvable',
  },
  {
    pattern: /^Insufficient stock\. Available: (\d+), requested: (\d+)$/,
    fr: (m) => `Stock insuffisant. Disponible : ${m[1]}, demandé : ${m[2]}`,
  },
  {
    pattern: /^No stock found for product "(.+)"$/,
    fr: (m) => `Aucun stock trouvé pour le produit "${m[1]}"`,
  },

  // ─── Sales ───────────────────────────────────────────────────────────────
  {
    pattern: /^Selling price is at or below unit cost\. Potential loss:/,
    fr: () => "Le prix de vente est inférieur ou égal au coût unitaire. Perte potentielle :",
  },

  // ─── Payments ────────────────────────────────────────────────────────────
  {
    pattern: /^No supplier debt record found for this supplier$/,
    fr: () => 'Aucune dette fournisseur trouvée pour ce fournisseur',
  },
  {
    pattern: /^No debtor credit record found for this debtor$/,
    fr: () => 'Aucun crédit débiteur trouvé pour ce débiteur',
  },
  {
    pattern: /^Payment amount must be greater than zero$/,
    fr: () => 'Le montant du paiement doit être supérieur à zéro',
  },

  // ─── Consignments ────────────────────────────────────────────────────────
  {
    pattern: /^Consignment not found$/,
    fr: () => 'Consignation introuvable',
  },
  {
    pattern: /^Only the supplier can cancel this consignment$/,
    fr: () => 'Seul le fournisseur peut annuler cette consignation',
  },
  {
    pattern: /^Only the debtor can confirm or reject this consignment$/,
    fr: () => 'Seul le débiteur peut confirmer ou rejeter cette consignation',
  },
  {
    pattern: /^Consignment is not pending$/,
    fr: () => "La consignation n'est pas en attente",
  },
  {
    pattern: /^You cannot consign to yourself$/,
    fr: () => 'Vous ne pouvez pas vous consigner à vous-même',
  },
  {
    pattern: /^Insufficient stock to consign/,
    fr: () => 'Stock insuffisant pour la consignation',
  },

  // ─── Currency ────────────────────────────────────────────────────────────
  {
    pattern: /^Exchange rate has not been set$/,
    fr: () => "Le taux de change n'a pas encore été défini",
  },
  {
    pattern: /^Exchange rate must be greater than zero$/,
    fr: () => 'Le taux de change doit être supérieur à zéro',
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────
  {
    pattern: /^No supplier relationship found$/,
    fr: () => 'Aucune relation fournisseur trouvée',
  },
  {
    pattern: /^No debtor relationship found$/,
    fr: () => 'Aucune relation débiteur trouvée',
  },

  // ─── Validation (class-validator) ────────────────────────────────────────
  {
    pattern: /^Forbidden resource$/i,
    fr: () => 'Accès refusé',
  },
  {
    pattern: /^Not Found$/i,
    fr: () => 'Ressource introuvable',
  },
];

/**
 * Translates an English error message to the target locale.
 * Returns the original message if no translation is found.
 */
export function translateMessage(message: string, locale: string): string {
  if (locale !== 'fr') return message;

  for (const entry of FR_TRANSLATIONS) {
    const match = message.match(entry.pattern);
    if (match) {
      return entry.fr(match);
    }
  }

  return message;
}
