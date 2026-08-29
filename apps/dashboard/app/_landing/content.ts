/**
 * Landing-page copy, EN + FR.
 *
 * Kept here rather than in `lib/i18n.ts` on purpose: that dictionary is ~2,700
 * lines of app strings, and importing it would pull the whole thing into the
 * one page that first-time visitors and Googlebot load. This file is the only
 * text the marketing page needs.
 *
 * The two locales are separate static routes (`/` and `/fr`) rather than a
 * client-side toggle, so each is independently crawlable and neither ships any
 * JavaScript to switch languages.
 *
 * On the copy: every claim below is a real behaviour of the product — supplier
 * stock really is deducted first, the price guard really does fire at cost, the
 * two rates really are separate columns in `exchange_rates`. Keep it that way.
 * Vague benefit language would date badly and, worse, would not be true.
 */

export type Locale = 'en' | 'fr';

export interface LandingContent {
  readonly htmlLang: string;
  readonly meta: { title: string; description: string };
  readonly nav: {
    signIn: string;
    register: string;
    otherLangLabel: string;
    otherLangHref: string;
    theme: string;
    /** Replaces sign-in / sign-up for a reader who already has a session. */
    dashboard: string;
  };
  readonly hero: {
    eyebrow: string;
    title: readonly [string, string];
    lead: string;
    ctaPrimary: string;
    ctaSecondary: string;
    notes: readonly string[];
  };
  /**
   * The hero's ledger extract. Illustrative figures, labelled as such — it
   * shows the shape of a trader's position (francs in the till, two rates, the
   * two sides of the credit book) rather than pretending to be real data or
   * a customer's screenshot.
   */
  readonly extract: {
    caption: string;
    rows: readonly { label: string; value: string; accent?: 'owed' | 'owe' | 'net' }[];
  };
  readonly flow: {
    index: string;
    kicker: string;
    title: string;
    lead: string;
    nodes: readonly { label: string; role: string; note: string }[];
    goods: string;
    money: string;
    points: readonly { term: string; def: string }[];
  };
  readonly ledger: {
    index: string;
    kicker: string;
    title: string;
    lead: string;
    items: readonly { term: string; def: string }[];
  };
  readonly field: {
    index: string;
    kicker: string;
    title: string;
    items: readonly { term: string; def: string }[];
  };
  readonly close: { title: string; lead: string; cta: string; secondary: string };
  readonly footer: { privacy: string; contact: string; rights: string; tagline: string };
}

const en: LandingContent = {
  htmlLang: 'en',
  meta: {
    title: 'KMB-Talk — stock, sales and credit in one book',
    description:
      'A stock and credit book for traders who buy on credit, sell on credit, and settle in francs and dollars. Works on a weak connection, on the phone and on the web.',
  },
  nav: { signIn: 'Sign in', register: 'Create account', otherLangLabel: 'Français', otherLangHref: '/fr', theme: 'Switch between light and dark', dashboard: 'Go to dashboard' },
  hero: {
    eyebrow: 'Stock · Sales · Credit',
    title: ['Know what you are owed.', 'Know what you owe.'],
    lead:
      'Traders rarely buy everything with cash. Goods arrive on credit, and they leave on credit. KMB-Talk keeps that whole web straight — every supplier, every debtor, every franc and every dollar — so you can answer “where do we stand?” without opening a notebook.',
    ctaPrimary: 'Create an account',
    ctaSecondary: 'Sign in',
    notes: ['Free to start', 'Works on a weak connection', 'English & Français'],
  },
  extract: {
    caption: 'Example figures',
    rows: [
      { label: 'Cash in till', value: '1 240 000 FC' },
      { label: 'System rate', value: '2 850 FC / $' },
      { label: 'Market rate', value: '2 910 FC / $' },
      { label: 'Owed to you', value: '$ 1 420.00', accent: 'owed' },
      { label: 'You owe', value: '$ 860.00', accent: 'owe' },
      { label: 'Net position', value: '$ 560.00', accent: 'net' },
    ],
  },
  flow: {
    index: '01',
    kicker: 'The part other tools miss',
    title: 'Stock you did not pay for yet',
    lead:
      'Most inventory apps assume you bought your stock outright. Yours often arrives from another trader on credit — and leaves the same way. That is three balances moving at once, and it is where a paper book starts to lie.',
    nodes: [
      { label: 'Supplier', role: 'Another trader', note: 'Gives you goods on credit' },
      { label: 'You', role: 'Your books', note: 'Hold stock from both sides' },
      { label: 'Debtor', role: 'Trader or seller', note: 'Takes goods on credit from you' },
    ],
    goods: 'Goods',
    money: 'Money owed',
    points: [
      {
        term: 'Received on credit',
        def: 'Record what a supplier handed you and what you agreed to pay. The balance you owe them moves in the same step — you never post a debt twice or forget one.',
      },
      {
        term: 'Sold, supplier stock first',
        def: 'When the same product sits in both piles, a sale draws down the supplier’s stock before your own. Debt clears before your capital does, which is the order that keeps you solvent.',
      },
      {
        term: 'Given on credit',
        def: 'Consign goods to another trader and nothing moves until they confirm receipt. On confirmation the stock leaves your shelf and lands on their books, with the balance to match.',
      },
    ],
  },
  ledger: {
    index: '02',
    kicker: 'What it keeps',
    title: 'A book that argues back',
    lead: 'Not a spreadsheet with your name on it. The rules that keep a trading book honest are built in.',
    items: [
      {
        term: 'Francs and dollars, reconciled',
        def:
          'Cash in the till is francs. Value is often reckoned in dollars. KMB-Talk holds both rates — the system rate your books run on and the market rate you actually pay when you change money — so profit and cash agree instead of quietly drifting apart.',
      },
      {
        term: 'A warning before you sell at a loss',
        def:
          'Price a sale at or below what the goods cost you and the app stops and shows the loss before it is recorded. You can still go ahead — sometimes you must — but never by accident.',
      },
      {
        term: 'People who sell for you',
        def:
          'Hand a batch of stock to someone selling in the street. When they come back, the app counts what sold, what is left and what cash is due, settles the cycle, and can pay commission on the value they moved.',
      },
      {
        term: 'Exactly what each person may touch',
        def:
          'An employee gets only the parts of the app you open for them. Pulling cash out and moving the exchange rate stay with the owner — no role can grant either.',
      },
    ],
  },
  field: {
    index: '03',
    kicker: 'Built for the counter, not the desk',
    title: 'It has to work where you work',
    items: [
      { term: 'When the signal drops', def: 'Sales are recorded on the phone and queued. They sync themselves in order when the connection comes back.' },
      { term: 'On a slow link', def: 'Screens paint from what was last loaded and refresh quietly behind you, instead of blocking on a spinner.' },
      { term: 'On paper', def: 'Print a receipt to a 58 mm Bluetooth thermal printer, or share it as a file when there is no printer.' },
      { term: 'Phone and web', def: 'The phone app for the counter and the road; the web dashboard for the long view — the same books, either way.' },
    ],
  },
  close: {
    title: 'Open your book',
    lead: 'Create an account, add what is on your shelf, and record the first sale. Nothing to install to try it on the web.',
    cta: 'Create an account',
    secondary: 'I already have one',
  },
  footer: {
    privacy: 'Privacy policy',
    contact: 'Contact',
    rights: 'All rights reserved.',
    tagline: 'Stock, sales and credit — in one place.',
  },
};

const fr: LandingContent = {
  htmlLang: 'fr',
  meta: {
    title: 'KMB-Talk — stock, ventes et crédit dans un seul carnet',
    description:
      'Un carnet de stock et de crédit pour les commerçants qui achètent à crédit, vendent à crédit et règlent en francs et en dollars. Fonctionne sur une connexion faible, sur téléphone et sur le web.',
  },
  nav: { signIn: 'Se connecter', register: 'Créer un compte', otherLangLabel: 'English', otherLangHref: '/', theme: 'Basculer entre clair et sombre', dashboard: 'Aller au tableau de bord' },
  hero: {
    eyebrow: 'Stock · Ventes · Crédit',
    title: ['Sachez ce qu’on vous doit.', 'Sachez ce que vous devez.'],
    lead:
      'Un commerçant paie rarement tout comptant. La marchandise arrive à crédit, et elle repart à crédit. KMB-Talk garde ce réseau au clair — chaque fournisseur, chaque débiteur, chaque franc et chaque dollar — pour répondre à « où en sommes-nous ? » sans ouvrir un cahier.',
    ctaPrimary: 'Créer un compte',
    ctaSecondary: 'Se connecter',
    notes: ['Gratuit pour commencer', 'Fonctionne en connexion faible', 'Français & English'],
  },
  extract: {
    caption: 'Chiffres d’exemple',
    rows: [
      { label: 'Caisse', value: '1 240 000 FC' },
      { label: 'Taux système', value: '2 850 FC / $' },
      { label: 'Taux du marché', value: '2 910 FC / $' },
      { label: 'On vous doit', value: '1 420,00 $', accent: 'owed' },
      { label: 'Vous devez', value: '860,00 $', accent: 'owe' },
      { label: 'Position nette', value: '560,00 $', accent: 'net' },
    ],
  },
  flow: {
    index: '01',
    kicker: 'Ce que les autres outils oublient',
    title: 'Du stock que vous n’avez pas encore payé',
    lead:
      'La plupart des applications de stock supposent que vous avez acheté la marchandise. La vôtre vient souvent d’un autre commerçant, à crédit — et elle repart de la même façon. Cela fait trois soldes qui bougent en même temps, et c’est là qu’un cahier commence à mentir.',
    nodes: [
      { label: 'Fournisseur', role: 'Un autre commerçant', note: 'Vous confie la marchandise à crédit' },
      { label: 'Vous', role: 'Vos livres', note: 'Détenez du stock des deux côtés' },
      { label: 'Débiteur', role: 'Commerçant ou vendeur', note: 'Prend votre marchandise à crédit' },
    ],
    goods: 'Marchandise',
    money: 'Dette',
    points: [
      {
        term: 'Reçu à crédit',
        def: 'Enregistrez ce que le fournisseur vous a remis et le prix convenu. Le solde que vous lui devez bouge dans le même geste — jamais une dette saisie deux fois, jamais une dette oubliée.',
      },
      {
        term: 'Vendu, stock fournisseur d’abord',
        def: 'Quand le même produit se trouve dans les deux piles, la vente entame d’abord le stock du fournisseur. La dette s’efface avant votre capital : c’est l’ordre qui vous garde solvable.',
      },
      {
        term: 'Donné à crédit',
        def: 'Confiez de la marchandise à un autre commerçant : rien ne bouge tant qu’il n’a pas confirmé. À la confirmation, le stock quitte votre étagère et arrive dans ses livres, avec le solde correspondant.',
      },
    ],
  },
  ledger: {
    index: '02',
    kicker: 'Ce qu’il retient',
    title: 'Un carnet qui vous contredit',
    lead: 'Pas un tableur à votre nom. Les règles qui gardent un livre de commerce honnête sont intégrées.',
    items: [
      {
        term: 'Francs et dollars, réconciliés',
        def:
          'La caisse est en francs. La valeur se compte souvent en dollars. KMB-Talk tient les deux taux — le taux système sur lequel tournent vos livres et le taux du marché que vous payez réellement pour changer — pour que le bénéfice et la caisse concordent au lieu de s’écarter en silence.',
      },
      {
        term: 'Une alerte avant de vendre à perte',
        def:
          'Fixez un prix égal ou inférieur au prix de revient et l’application s’arrête et affiche la perte avant d’enregistrer. Vous pouvez passer outre — parfois il le faut — mais jamais par inadvertance.',
      },
      {
        term: 'Ceux qui vendent pour vous',
        def:
          'Confiez un lot à quelqu’un qui vend dans la rue. À son retour, l’application compte ce qui s’est vendu, ce qui reste et l’argent dû, clôture le cycle, et peut verser une commission sur la valeur écoulée.',
      },
      {
        term: 'Exactement ce que chacun peut toucher',
        def:
          'Un employé n’obtient que les parties de l’application que vous lui ouvrez. Retirer de l’argent et modifier le taux de change restent au propriétaire — aucun rôle ne peut les accorder.',
      },
    ],
  },
  field: {
    index: '03',
    kicker: 'Conçu pour le comptoir, pas pour le bureau',
    title: 'Il doit marcher là où vous travaillez',
    items: [
      { term: 'Quand le réseau tombe', def: 'Les ventes sont enregistrées sur le téléphone et mises en file. Elles se synchronisent dans l’ordre dès le retour de la connexion.' },
      { term: 'Sur une liaison lente', def: 'Les écrans s’affichent à partir du dernier chargement et se rafraîchissent discrètement, au lieu de bloquer sur un cercle qui tourne.' },
      { term: 'Sur papier', def: 'Imprimez un reçu sur une imprimante thermique Bluetooth 58 mm, ou partagez-le en fichier s’il n’y a pas d’imprimante.' },
      { term: 'Téléphone et web', def: 'L’application mobile pour le comptoir et la route ; le tableau de bord web pour la vue d’ensemble — les mêmes livres des deux côtés.' },
    ],
  },
  close: {
    title: 'Ouvrez votre carnet',
    lead: 'Créez un compte, saisissez ce qui est sur l’étagère, et enregistrez la première vente. Rien à installer pour l’essayer sur le web.',
    cta: 'Créer un compte',
    secondary: 'J’en ai déjà un',
  },
  footer: {
    privacy: 'Politique de confidentialité',
    contact: 'Contact',
    rights: 'Tous droits réservés.',
    tagline: 'Stock, ventes et crédit — au même endroit.',
  },
};

export const content: Record<Locale, LandingContent> = { en, fr };
