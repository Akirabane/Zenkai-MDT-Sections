const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const membersRepo = require('../repositories/membres');

function resolveAgentIdentity(user) {
  const pseudoHRP = user && (user.linkedMembre || user.pseudo);
  const membre = pseudoHRP ? membersRepo.findByPseudoHRP(pseudoHRP) : null;
  const fullName = (membre && membre.nomRP ? membre.nomRP : '').trim();
  const parts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];

  let agentPrenom = '';
  let agentNom = '';

  if (parts.length >= 2) {
    agentPrenom = parts[0];
    agentNom = parts.slice(1).join(' ');
  } else if (parts.length === 1) {
    agentNom = parts[0];
  } else if (user && user.pseudo) {
    agentNom = user.pseudo;
  }

  return {
    agentPrenom,
    agentNom,
    agentGrade: membre && (membre.rang || membre.grade) ? (membre.rang || membre.grade) : '',
    linkedMembre: membre || null
  };
}

function extractImageParts(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64')
  };
}

function buildSuspectPhotoAttachment(record) {
  const uploadedPhoto = extractImageParts(record.suspectPhoto);
  if (uploadedPhoto) {
    const extension = uploadedPhoto.mimeType === 'image/png'
      ? 'png'
      : uploadedPhoto.mimeType === 'image/webp'
        ? 'webp'
        : 'jpg';

    return {
      buffer: uploadedPhoto.buffer,
      mimeType: uploadedPhoto.mimeType,
      filename: `suspect-photo.${extension}`,
      usedPlaceholder: false
    };
  }

  return {
    buffer: fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'casier-placeholder.png')),
    mimeType: 'image/png',
    filename: 'suspect-photo-placeholder.png',
    usedPlaceholder: true
  };
}

function formatCasierDiscordMessage(record, options = {}) {
  const lines = [];
  const suspectFullName = [record.suspectNom, record.suspectPrenom].filter(Boolean).join(' ').trim();
  const agentFullName = [record.agentPrenom, record.agentNom].filter(Boolean).join(' ').trim();
  const updateNotice = options.updateNotice === true;
  const missingPhotoNotice = options.missingPhotoNotice === true;
  const sanctionAlert = options.sanctionAlert || null;

  lines.push('> **==============================**');
  lines.push("> **\uD83D\uDCC4 RAPPORT D'INCIDENT**");
  lines.push('> **==============================**');

  if (updateNotice) {
    lines.push('> **Mention :** Rapport d incident mis a jour');
  }
  if (missingPhotoNotice) {
    lines.push('> **Mention :** Photo non fournie');
  }
  if (sanctionAlert && sanctionAlert.message) {
    lines.push('> **Mention :** ' + sanctionAlert.message);
  }
  if (updateNotice || missingPhotoNotice || (sanctionAlert && sanctionAlert.message)) {
    lines.push('> ');
  }

  lines.push(`> **Suspect :** ${suspectFullName || 'Non renseigne'}`);
  if (record.suspectGrade) lines.push(`> **Grade :** ${record.suspectGrade}`);
  if (record.date) lines.push(`> **Date :** ${record.date}`);
  lines.push('> ');
  lines.push(`> **Agent :** ${agentFullName || 'Non renseigne'}`);
  if (record.agentGrade) lines.push(`> **Grade Agent :** ${record.agentGrade}`);
  lines.push('> ');
  lines.push("> ***__Rapport d'incident :__***");
  lines.push(`> *${record.rapport || 'Aucun rapport redige.'}*`);
  lines.push('> ');
  lines.push('> ***__Peine Appliquee :__***');

  if (Array.isArray(record.delits) && record.delits.length > 0) {
    for (const delit of record.delits) {
      const peineSuffix = record.peine ? ` (${record.peine})` : '';
      lines.push(`> ***${delit}${peineSuffix}*`);
    }
  } else if (record.peine) {
    lines.push(`> *${record.peine}*`);
  } else {
    lines.push('> *Aucun delit selectionne.*');
  }

  if (sanctionAlert && sanctionAlert.summary) {
    lines.push('> ');
    lines.push('> ***__Cumul disciplinaire :__***');
    lines.push('> *' + sanctionAlert.summary + '*');
  }

  lines.push('> ');
  lines.push('> **==============================**');
  return lines.join('\n');
}

function splitDiscordMessage(message, maxLength = 1900) {
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks = [];
  let current = '';

  for (const line of message.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    let remaining = line;
    while (remaining.length > maxLength) {
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    current = remaining;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function postDiscordWebhook(webhookUrl, options) {
  return new Promise((resolve, reject) => {
    const target = new URL(webhookUrl);
    const method = 'POST';

    let bodyBuffer;
    const headers = {
      'User-Agent': 'Police-Konoha-Webhook/1.0'
    };

    if (options.multipartParts) {
      const boundary = `----KonohaBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
      const buffers = [];

      for (const part of options.multipartParts) {
        const disposition = [`form-data; name="${part.name}"`];
        if (part.filename) {
          disposition.push(`filename="${part.filename}"`);
        }

        buffers.push(Buffer.from(`--${boundary}\r\n`));
        buffers.push(Buffer.from(`Content-Disposition: ${disposition.join('; ')}\r\n`));
        if (part.contentType) {
          buffers.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`));
        }
        buffers.push(Buffer.from('\r\n'));
        buffers.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value)));
        buffers.push(Buffer.from('\r\n'));
      }

      buffers.push(Buffer.from(`--${boundary}--\r\n`));
      bodyBuffer = Buffer.concat(buffers);
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    } else {
      bodyBuffer = Buffer.from(JSON.stringify(options.jsonBody || {}), 'utf8');
      headers['Content-Type'] = 'application/json';
    }

    headers['Content-Length'] = String(bodyBuffer.length);

    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method,
      headers
    }, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('error', reject);
    request.write(bodyBuffer);
    request.end();
  });
}

async function publishCasierToDiscord(webhookUrl, record, options = {}) {
  const photoAttachment = buildSuspectPhotoAttachment(record);
  const message = formatCasierDiscordMessage(record, {
    updateNotice: options.updateNotice === true,
    missingPhotoNotice: photoAttachment.usedPlaceholder,
    sanctionAlert: options.sanctionAlert || null
  });
  const chunks = splitDiscordMessage(message);

  for (let index = 0; index < chunks.length; index += 1) {
    const content = chunks[index];
    let response;

    if (index === 0) {
      response = await postDiscordWebhook(webhookUrl, {
        multipartParts: [
          {
            name: 'payload_json',
            contentType: 'application/json',
            value: JSON.stringify({
              username: 'Rapport Incident Konoha',
              allowed_mentions: { parse: [] },
              content,
              embeds: [
                {
                  color: 0xb8922a,
                  image: { url: `attachment://${photoAttachment.filename}` }
                }
              ]
            })
          },
          {
            name: 'files[0]',
            filename: photoAttachment.filename,
            contentType: photoAttachment.mimeType,
            value: photoAttachment.buffer
          }
        ]
      });
    } else {
      response = await postDiscordWebhook(webhookUrl, {
        jsonBody: {
          username: 'Rapport Incident Konoha',
          allowed_mentions: { parse: [] },
          content
        }
      });
    }

    if (!response.ok) {
      throw new Error(`Discord webhook HTTP ${response.status}: ${response.body}`);
    }
  }

  return {
    chunks: chunks.length,
    content: message,
    usedPlaceholder: photoAttachment.usedPlaceholder
  };
}

function formatComplaintDiscordMessage(record, options = {}) {
  const lines = [];
  const plaintiffFull = [record.plaintiffPrenom, record.plaintiffNom].filter(Boolean).join(' ').trim();
  const accusedFull = [record.accusedPrenom, record.accusedNom].filter(Boolean).join(' ').trim();
  const officerFull = [record.officerPrenom, record.officerNom].filter(Boolean).join(' ').trim();
  const isUpdate = options.updateNotice === true;

  lines.push('> **==============================**');
  lines.push('> **📋 DEPOT DE PLAINTE**');
  lines.push('> **==============================**');

  if (isUpdate) {
    lines.push('> **Mention :** Plainte mise a jour');
    lines.push('> ');
  }

  lines.push(`> **Plaignant :** ${plaintiffFull || 'Non renseigne'}`);
  if (record.plaintiffGrade) lines.push(`> **Grade :** ${record.plaintiffGrade}`);
  lines.push('> ');
  lines.push(`> **A l encontre de :** ${accusedFull || 'Non renseigne'}`);
  lines.push('> ');
  lines.push(`> **Policier redacteur :** ${officerFull || 'Non renseigne'}`);
  if (record.officerGradeSection) lines.push(`> **Grade section :** ${record.officerGradeSection}`);
  if (record.date) lines.push(`> **Date des faits :** ${record.date}`);
  if (record.objet) lines.push(`> **Objet :** ${record.objet}`);
  lines.push('> ');
  lines.push('> ***__Corps de la plainte :__***');
  lines.push(`> *${record.body || 'Aucun contenu.'}*`);
  lines.push('> ');
  lines.push('> **==============================**');

  return lines.join('\n');
}

async function publishComplaintToDiscord(webhookUrl, record, options = {}) {
  const isUpdate = options.updateNotice === true;
  const existingThreadId = options.existingThreadId || null;
  const message = formatComplaintDiscordMessage(record, { updateNotice: isUpdate });
  const chunks = splitDiscordMessage(message);

  const accusedFull = [record.accusedPrenom, record.accusedNom].filter(Boolean).join(' ').trim() || 'Inconnu';
  // thread_name max 100 chars (Discord limit)
  const threadName = `Plainte contre -> ${accusedFull}`.slice(0, 100);

  let resolvedUrl = webhookUrl;
  let returnedThreadId = existingThreadId;

  // Si un thread existe déjà pour cet accusé, poster dedans directement
  if (existingThreadId) {
    const u = new URL(webhookUrl);
    u.searchParams.set('thread_id', existingThreadId);
    resolvedUrl = u.toString();
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const payload = {
      username: 'Plaintes — Police Militaire de Konoha',
      allowed_mentions: { parse: [] },
      content: chunks[index]
    };

    // Premier message sans thread existant : créer le fil
    // wait=true oblige Discord à retourner le message créé (avec channel_id = thread_id)
    let postUrl = resolvedUrl;
    if (index === 0 && !existingThreadId) {
      payload.thread_name = threadName;
      const u = new URL(resolvedUrl);
      u.searchParams.set('wait', 'true');
      postUrl = u.toString();
    }

    const response = await postDiscordWebhook(postUrl, { jsonBody: payload });

    if (!response.ok) {
      throw new Error(`Discord webhook HTTP ${response.status}: ${response.body}`);
    }

    // Récupère le thread_id depuis la réponse du premier message (nouveau thread)
    if (index === 0 && !existingThreadId) {
      const rawBody = (response.body || '').trim();
      if (!rawBody) {
        console.warn('[publishComplaintToDiscord] body vide recu de Discord (status=%d) — thread non persiste', response.status);
      } else {
        try {
          const parsed = JSON.parse(rawBody);
          const threadId = parsed.channel_id || (parsed.thread && parsed.thread.id);
          if (threadId) {
            returnedThreadId = threadId;
            const u = new URL(webhookUrl);
            u.searchParams.set('thread_id', threadId);
            resolvedUrl = u.toString();
          } else {
            console.warn('[publishComplaintToDiscord] channel_id absent de la reponse Discord body=%s', rawBody);
          }
        } catch (parseErr) {
          console.error('[publishComplaintToDiscord] Impossible de parser la reponse Discord:', parseErr.message, 'body=%s', rawBody);
        }
      }
    }
  }

  return { chunks: chunks.length, content: message, threadId: returnedThreadId };
}

module.exports = {
  formatCasierDiscordMessage,
  publishCasierToDiscord,
  formatComplaintDiscordMessage,
  publishComplaintToDiscord,
  resolveAgentIdentity
};
