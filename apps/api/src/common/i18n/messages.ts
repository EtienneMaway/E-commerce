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
  // ─── Shops / branches ────────────────────────────────────────────────────
  {
    pattern: /^A branch with this name already exists$/,
    fr: () => 'Une boutique portant ce nom existe déjà',
  },
  {
    pattern: /^Make another branch the default before closing this one$/,
    fr: () => 'Définissez une autre boutique par défaut avant de fermer celle-ci',
  },
  {
    pattern: /^Reopen this branch before making it the default$/,
    fr: () => 'Rouvrez cette boutique avant de la définir par défaut',
  },
  {
    pattern: /^Move or release the employees at this branch before closing it$/,
    fr: () => 'Transférez ou libérez les employés de cette boutique avant de la fermer',
  },
  {
    pattern: /^The default branch cannot be deleted$/,
    fr: () => 'La boutique par défaut ne peut pas être supprimée',
  },
  {
    pattern: /^This branch has records — close it instead of deleting it$/,
    fr: () => 'Cette boutique a des enregistrements — fermez-la au lieu de la supprimer',
  },
  // ─── Business ownership ──────────────────────────────────────────────────
  {
    pattern: /^Only the owner can transfer this business$/,
    fr: () => "Seul le propriétaire peut transférer cette entreprise",
  },
  {
    pattern: /^Only the owner can cancel this transfer$/,
    fr: () => 'Seul le propriétaire peut annuler ce transfert',
  },
  {
    pattern: /^You already own this business$/,
    fr: () => 'Vous possédez déjà cette entreprise',
  },
  {
    pattern: /^No pending transfer for this business$/,
    fr: () => 'Aucun transfert en attente pour cette entreprise',
  },
  {
    pattern: /^That account does not exist$/,
    fr: () => "Ce compte n'existe pas",
  },
  {
    pattern: /^That account is closed$/,
    fr: () => 'Ce compte est fermé',
  },
  {
    pattern: /^An employee profile cannot own a business — they need their own account$/,
    fr: () =>
      "Un profil employé ne peut pas posséder une entreprise — il lui faut son propre compte",
  },
  // ─── Closing an account ──────────────────────────────────────────────────
  {
    pattern: /^Transfer your business to someone else before closing this account$/,
    fr: () => 'Transférez votre entreprise à quelqu\'un avant de fermer ce compte',
  },
  {
    pattern: /^Leave your job before closing this account$/,
    fr: () => 'Quittez votre emploi avant de fermer ce compte',
  },
  {
    pattern: /^Hand back the stock you are holding before closing this account$/,
    fr: () => 'Restituez le stock que vous détenez avant de fermer ce compte',
  },
  {
    pattern: /^Finish your pending handover before closing this account$/,
    fr: () => 'Terminez votre remise en attente avant de fermer ce compte',
  },
  {
    pattern: /^This employee is still holding stock — settle the handover first$/,
    fr: () => "Cet employé détient encore du stock — réglez d'abord la remise",
  },
  {
    pattern: /^This employee has a pending handover — approve or reject it first$/,
    fr: () => "Cet employé a une remise en attente — approuvez-la ou rejetez-la d'abord",
  },
  {
    pattern: /^Select a shop for this action$/,
    fr: () => 'Sélectionnez une boutique pour cette action',
  },
  {
    pattern: /^You are assigned to a different branch$/,
    fr: () => 'Vous êtes affecté à une autre boutique',
  },
  {
    pattern: /^Branch not found$/,
    fr: () => 'Boutique introuvable',
  },
  {
    pattern: /^This branch is closed — reopen it to make changes$/,
    fr: () => 'Cette boutique est fermée — rouvrez-la pour la modifier',
  },
  {
    pattern: /^No business found for this account$/,
    fr: () => 'Aucune entreprise trouvée pour ce compte',
  },
  {
    pattern: /^No business found for this employment$/,
    fr: () => "Aucune entreprise trouvée pour cet emploi",
  },
  {
    pattern: /^No branch found for this employment$/,
    fr: () => 'Aucune boutique trouvée pour cet emploi',
  },
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

  // ─── Sized products (carton with variants) ───────────────────────────────
  {
    pattern: /^Size not found$/,
    fr: () => 'Taille introuvable',
  },
  {
    pattern: /^Product group not found$/,
    fr: () => 'Groupe de produits introuvable',
  },
  {
    pattern: /^A product group named "(.+)" already exists$/,
    fr: (m) => `Un groupe de produits nommé "${m[1]}" existe déjà`,
  },
  {
    pattern: /^A simple product named "(.+)" already exists\. Choose a different name\.$/,
    fr: (m) => `Un produit simple nommé "${m[1]}" existe déjà. Choisissez un autre nom.`,
  },
  {
    pattern: /^A sized product named "(.+)" already exists\. Add stock from the sized-product form instead\.$/,
    fr: (m) =>
      `Un produit à tailles nommé "${m[1]}" existe déjà. Ajoutez le stock depuis le formulaire de produit à tailles.`,
  },
  {
    pattern: /^Size "(.+)" already exists in this group$/,
    fr: (m) => `La taille "${m[1]}" existe déjà dans ce groupe`,
  },
  {
    pattern: /^Duplicate size labels in the group$/,
    fr: () => 'Étiquettes de taille en double dans le groupe',
  },
  {
    pattern: /^Cannot remove a size that still has (\d+) pieces in stock/,
    fr: (m) =>
      `Impossible de retirer une taille qui a encore ${m[1]} pièces en stock. Vendez-la ou ajustez-la à zéro d'abord.`,
  },
  {
    pattern: /^Whole-carton selling is not enabled for this product$/,
    fr: () => "La vente au carton complet n'est pas activée pour ce produit",
  },
  {
    pattern: /^This product has no carton composition$/,
    fr: () => "Ce produit n'a pas de composition de carton",
  },
  {
    pattern: /^groupId is required for a carton sale$/,
    fr: () => 'groupId est requis pour une vente au carton',
  },
  {
    pattern: /^qtySold is required for a non-carton sale$/,
    fr: () => 'qtySold est requis pour une vente hors carton',
  },
  {
    pattern: /^Insufficient stock for size "(.+)"\. Need (\d+), have (\d+)\.$/,
    fr: (m) => `Stock insuffisant pour la taille "${m[1]}". Besoin de ${m[2]}, disponible ${m[3]}.`,
  },
  {
    pattern: /^Cannot allocate carton price/,
    fr: () => "Impossible de répartir le prix du carton — les tailles n'ont pas de prix de vente",
  },
  {
    pattern: /^Carton selling price must be higher than the carton buying price$/,
    fr: () => 'Le prix de vente du carton doit être supérieur au prix d’achat du carton',
  },
  {
    pattern: /^Group rename is not supported while there is active consigned/,
    fr: () =>
      'Le renommage du groupe est impossible tant que du stock consigné actif existe. Réglez ces consignations d’abord.',
  },
  {
    pattern: /^Another product already uses the name "(.+)"/,
    fr: (m) => `Un autre produit utilise déjà le nom "${m[1]}". Choisissez un autre nom.`,
  },

  // ─── Permissions (tier + role services) ──────────────────────────────────
  {
    pattern: /^Your role does not include this feature — ask your employer to enable it$/,
    fr: () =>
      "Votre rôle ne comprend pas cette fonctionnalité — demandez à votre employeur de l'activer",
  },
  {
    pattern: /^This action is not permitted for mini employees$/,
    fr: () => 'Cette action n\'est pas autorisée pour les mini-employés',
  },
  {
    pattern: /^This action is not permitted while acting on behalf of an employer$/,
    fr: () =>
      "Cette action n'est pas autorisée lorsque vous agissez pour le compte d'un employeur",
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
