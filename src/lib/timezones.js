// Fuseaux horaires proposés au manager — sert aussi de proxy pour la "région IRL"
// affichée sur la fiche de club (ClubProfile.jsx).

export const TIMEZONES = [
  { group: 'France & DOM-TOM', options: [
    { value: 'Europe/Paris',        label: 'Paris (UTC+1/+2)'           },
    { value: 'America/Guadeloupe',  label: 'Guadeloupe (UTC−4)'         },
    { value: 'America/Martinique',  label: 'Martinique (UTC−4)'         },
    { value: 'America/Cayenne',     label: 'Guyane (UTC−3)'             },
    { value: 'Indian/Reunion',      label: 'La Réunion (UTC+4)'         },
    { value: 'Indian/Mayotte',      label: 'Mayotte (UTC+3)'            },
    { value: 'Pacific/Noumea',      label: 'Nouvelle-Calédonie (UTC+11)'},
    { value: 'Pacific/Tahiti',      label: 'Polynésie française (UTC−10)'},
  ]},
  { group: 'Europe', options: [
    { value: 'Europe/London',   label: 'Londres (UTC+0/+1)'    },
    { value: 'Europe/Brussels', label: 'Bruxelles (UTC+1/+2)'  },
    { value: 'Europe/Geneva',   label: 'Genève (UTC+1/+2)'     },
    { value: 'Europe/Madrid',   label: 'Madrid (UTC+1/+2)'     },
    { value: 'Europe/Lisbon',   label: 'Lisbonne (UTC+0/+1)'   },
    { value: 'Europe/Rome',     label: 'Rome (UTC+1/+2)'       },
    { value: 'Europe/Dublin',   label: 'Dublin (UTC+0/+1)'     },
  ]},
  { group: 'Amériques', options: [
    { value: 'America/Montreal',    label: 'Montréal (UTC−5/−4)'   },
    { value: 'America/New_York',    label: 'New York (UTC−5/−4)'   },
    { value: 'America/Chicago',     label: 'Chicago (UTC−6/−5)'    },
    { value: 'America/Denver',      label: 'Denver (UTC−7/−6)'     },
    { value: 'America/Los_Angeles', label: 'Los Angeles (UTC−8/−7)'},
    { value: 'America/Sao_Paulo',   label: 'São Paulo (UTC−3)'     },
  ]},
  { group: 'Afrique & Océan Indien', options: [
    { value: 'Africa/Casablanca',  label: 'Casablanca (UTC+1)'  },
    { value: 'Africa/Tunis',       label: 'Tunis (UTC+1)'       },
    { value: 'Africa/Algiers',     label: 'Alger (UTC+1)'       },
    { value: 'Africa/Abidjan',     label: 'Abidjan (UTC+0)'     },
    { value: 'Africa/Dakar',       label: 'Dakar (UTC+0)'       },
  ]},
  { group: 'Asie & Pacifique', options: [
    { value: 'Asia/Tokyo',    label: 'Tokyo (UTC+9)'      },
    { value: 'Asia/Dubai',    label: 'Dubaï (UTC+4)'      },
    { value: 'Asia/Beirut',   label: 'Beyrouth (UTC+2/+3)'},
    { value: 'Australia/Sydney', label: 'Sydney (UTC+10/+11)' },
  ]},
]

const FLAT_TIMEZONES = TIMEZONES.flatMap((g) => g.options)

export const timezoneLabel = (value) =>
  FLAT_TIMEZONES.find((o) => o.value === value)?.label ?? value ?? null
