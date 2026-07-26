// Règles de négociation salariale — partagées entre le marché (Recrutement.jsx)
// et le renouvellement de contrat (Effectif.jsx).

export const CONTRACT_DURATIONS = [3, 6, 12, 18, 24]

// Salaire "attendu" par un joueur selon son niveau général.
export const expectedSalary = (overall) => Math.round((overall * 80 + 1000) / 500) * 500

// En dessous de 70% du salaire attendu, refus certain ; entre 70% et 100%,
// chance d'acceptation linéaire ; au-dessus, acceptation garantie.
export const acceptanceChance = (salary, expected) => {
  const ratio = expected > 0 ? salary / expected : 1
  if (ratio >= 1) return 1
  if (ratio <= 0.7) return 0
  return (ratio - 0.7) / 0.3
}

export const acceptanceLabel = (chance) =>
  chance >= 0.9 ? 'Offre généreuse'
  : chance >= 0.5 ? 'Bonne chance d\'acceptation'
  : chance > 0 ? 'Risque de refus élevé'
  : 'Refus certain'

export const acceptanceColor = (chance) =>
  chance >= 0.9 ? '#1B7A4A' : chance >= 0.5 ? '#F5820D' : '#e74c3c'
