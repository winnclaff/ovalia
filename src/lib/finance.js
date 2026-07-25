// Constantes de gestion financière : staff technique + infrastructures.
// ⚠️ Les formules de coût/salaire sont dupliquées (avec ce même commentaire)
// dans supabase/functions/nightly-tick/index.ts et simulate-match/index.ts
// (Deno ne peut pas importer ce fichier). Garder les deux en synchro.

export const COACH_SIGNING_FEE = 10000
export const COACH_MAX_LEVEL = 5

export const COACH_ROLES = [
  {
    key: 'head_coach',
    label: 'Entraîneur principal',
    baseSalary: 4000,
    effect: (level) => `+${level * 10}% sur tout l'entraînement collectif`,
  },
  {
    key: 'forwards_coach',
    label: 'Coach des avants',
    baseSalary: 2500,
    effect: (level) => `+${level * 15}% sur l'entraînement du groupe Avants`,
  },
  {
    key: 'backs_coach',
    label: 'Coach des arrières',
    baseSalary: 2500,
    effect: (level) => `+${level * 15}% sur l'entraînement des groupes Arrières et Charnière`,
  },
  {
    key: 'medic',
    label: 'Kinésithérapeute',
    baseSalary: 2000,
    effect: (level) => `Réduit la durée des blessures (niveau ${level})`,
  },
]

export const coachSalary = (baseSalary, level) => baseSalary * level

// Coût pour passer de `currentLevel` à `currentLevel + 1`.
export const coachUpgradeCost = (currentLevel) => 20000 * currentLevel

export const BUILDINGS = [
  {
    key: 'stadium_level',
    label: 'Stade',
    baseCost: 50000,
    minLevel: 1,
    maxLevel: 5,
    effect: (level) => `Capacité ${STADIUM_CAPACITY(level).toLocaleString('fr-FR')} places → revenus billetterie`,
  },
  {
    key: 'training_facility_level',
    label: "Centre d'entraînement",
    baseCost: 40000,
    minLevel: 0,
    maxLevel: 5,
    effect: (level) => level === 0
      ? 'Non construit — requis pour l\'entraînement individuel'
      : `+${level * 5}% sur tout l'entraînement collectif`,
  },
  {
    key: 'medical_center_level',
    label: 'Centre médical',
    baseCost: 35000,
    minLevel: 0,
    maxLevel: 5,
    effect: (level) => level === 0
      ? 'Non construit'
      : `Réduit la durée des blessures (niveau ${level})`,
  },
  {
    key: 'academy_level',
    label: 'Centre de formation',
    baseCost: 25000,
    minLevel: 1,
    maxLevel: 5,
    effect: (level) => `Plus de jeunes talents, et de meilleure qualité (niveau ${level})`,
  },
  {
    key: 'merchandising_level',
    label: 'Boutique',
    baseCost: 20000,
    minLevel: 1,
    maxLevel: 5,
    effect: (level) => `+${Math.round((level - 1) * 25)}% de revenus merchandising`,
  },
]

// Coût pour passer de `currentLevel` à `currentLevel + 1` (arrondi à la centaine).
export const buildingUpgradeCost = (baseCost, currentLevel) =>
  Math.round((baseCost * Math.pow(currentLevel + 1, 1.6)) / 100) * 100

export const STADIUM_CAPACITY = (level) => 3000 + level * 1500

export const fmt = (n) =>
  (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
