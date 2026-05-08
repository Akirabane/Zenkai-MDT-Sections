const SECTION_META = {
  police: {
    displayName: 'Police Militaire',
    features: {
      codePenal: true,
      dri: true,
      plaintes: true,
      patrouilles: true,
      justicePanel: true,
      registre: true,
    },
    labels: {
      casiers: 'Casiers',
      casier: 'Casier',
      rapport: 'Rapport de patrouille',
      rapportShort: 'Patrouille',
      registre: 'Registre police',
      dri: 'DRI',
      dri_full: 'Division de Renseignement Interne',
    },
  },
  medical: {
    displayName: 'Section médicale',
    features: {
      codePenal: false,
      dri: false,
      plaintes: false,
      patrouilles: false,
      justicePanel: false,
      registre: false,
    },
    labels: {
      casiers: 'Dossiers patients',
      casier: 'Dossier patient',
      rapport: 'Rapport médical',
      rapportShort: 'Rapport médical',
      registre: 'Registre médical',
      dri: 'Cellule médicale',
      dri_full: 'Cellule médicale',
    },
  },
  scientifique: {
    displayName: 'Section scientifique',
    features: {
      codePenal: false,
      dri: true,
      plaintes: false,
      patrouilles: false,
      justicePanel: false,
      registre: false,
    },
    labels: {
      casiers: 'Dossiers forensiques',
      casier: 'Dossier forensique',
      rapport: "Rapport d'analyse",
      rapportShort: 'Analyse',
      registre: 'Registre scientifique',
      dri: "Cellule d'analyse",
      dri_full: "Cellule d'analyse et d'investigations",
    },
  },
  economie: {
    displayName: 'Section économique',
    features: {
      codePenal: false,
      dri: false,
      plaintes: false,
      patrouilles: false,
      justicePanel: false,
      registre: true,
    },
    labels: {
      casiers: 'Dossiers économiques',
      casier: 'Dossier économique',
      rapport: 'Rapport économique',
      rapportShort: 'Audit',
      registre: 'Registre économique',
      dri: 'Cellule économique',
      dri_full: 'Cellule économique',
    },
  },
};

function getSectionMeta(section) {
  return SECTION_META[section] || SECTION_META.police;
}

module.exports = { SECTION_META, getSectionMeta };
