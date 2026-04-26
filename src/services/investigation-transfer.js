function formatIsoDate(value) {
  if (!value) return 'Inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function mapClassicStatusToDri(status, targetType) {
  const value = String(status || '').trim();
  if (targetType === 'external') {
    switch (value) {
      case 'En cours':
      case 'En attente de preuves':
      case 'En surveillance':
        return value;
      case 'Bouclee':
        return 'Cloturee';
      case 'Suspendue':
      case 'Transmise a la Justice':
        return 'Archivee';
      default:
        return 'En cours';
    }
  }

  switch (value) {
    case 'En cours':
    case 'En attente de preuves':
    case 'En surveillance':
      return value;
    case 'Bouclee':
      return 'Cloturee';
    case 'Suspendue':
    case 'Transmise a la Justice':
      return 'Archivee';
    default:
      return 'En cours';
  }
}

function mapDriStatusToClassic(status) {
  switch (String(status || '').trim()) {
    case 'En cours':
    case 'En attente de preuves':
    case 'En surveillance':
      return String(status || '').trim() || 'En cours';
    case 'Sous couverture':
    case 'En territoire etranger':
      return 'En surveillance';
    case 'Cloturee':
      return 'Bouclee';
    case 'Archivee':
      return 'Suspendue';
    default:
      return 'En cours';
  }
}

function buildClassicTransferNotes(investigation) {
  const lines = [
    'Transfert depuis le panel des enquetes police classiques.',
    'Reference source : ' + String(investigation.id || '-'),
    'Auteur initial : ' + String(investigation.author || 'Inconnu'),
    'Ouverte le : ' + formatIsoDate(investigation.createdAt),
    'Mise a jour le : ' + formatIsoDate(investigation.updatedAt)
  ];

  const updates = Array.isArray(investigation.updates) ? investigation.updates : [];
  if (updates.length) {
    lines.push('');
    lines.push('Suivis importes :');
    updates.forEach((entry, index) => {
      lines.push(
        (index + 1) + '. [' + String(entry.kind || 'Suivi') + '] ' +
        String(entry.author || 'Inconnu') + ' - ' + formatIsoDate(entry.createdAt)
      );
      lines.push(String(entry.content || ''));
    });
  }

  const links = Array.isArray(investigation.links) ? investigation.links : [];
  if (links.length) {
    lines.push('');
    lines.push('Liens metier :');
    links.forEach((link, index) => {
      lines.push(
        (index + 1) + '. ' + String(link.linkLabel || link.linkType || 'Lien') +
        ' - ' + String(link.linkedLabel || link.linkedId || '-')
      );
    });
  }

  const attachments = Array.isArray(investigation.attachments) ? investigation.attachments : [];
  if (attachments.length) {
    lines.push('');
    lines.push('Pieces jointes referencees :');
    attachments.forEach((file, index) => {
      lines.push(
        (index + 1) + '. ' + String(file.filename || 'piece-jointe') +
        (file.caption ? ' - ' + String(file.caption) : '')
      );
    });
  }

  return lines.join('\n').trim();
}

function buildDriTransferEntry(item, sourceType) {
  const lines = [
    'Transfert depuis la DRI.',
    'Type source : ' + (sourceType === 'external' ? 'enquete externe' : 'enquete interne'),
    'Reference source : ' + String(item.id || '-'),
    'Auteur initial : ' + String(item.createdBy || 'Inconnu'),
    'Ouverte le : ' + formatIsoDate(item.createdAt),
    'Mise a jour le : ' + formatIsoDate(item.updatedAt)
  ];

  if (sourceType === 'external' && item.targetZone) {
    lines.push('Zone cible : ' + String(item.targetZone));
  }

  if (Array.isArray(item.assignedAgents) && item.assignedAgents.length) {
    lines.push('Agents attitres : ' + item.assignedAgents.join(', '));
  }

  if (Array.isArray(item.linkedNinjaIds) && item.linkedNinjaIds.length) {
    lines.push('Fiches ninja liees : ' + item.linkedNinjaIds.join(', '));
  }

  if (item.notes) {
    lines.push('');
    lines.push('Notes DRI :');
    lines.push(String(item.notes));
  }

  return lines.join('\n').trim();
}

module.exports = {
  buildClassicTransferNotes,
  buildDriTransferEntry,
  mapClassicStatusToDri,
  mapDriStatusToClassic
};
