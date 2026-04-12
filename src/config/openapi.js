function jsonResponse(description, schema) {
  return {
    description,
    content: {
      'application/json': {
        schema
      }
    }
  };
}

function jsonBody(schema, required = true) {
  return {
    required,
    content: {
      'application/json': {
        schema
      }
    }
  };
}

function bearerSecurity() {
  return [{ BearerAuth: [] }];
}

function pathParam(name, description, example) {
  return {
    in: 'path',
    name,
    required: true,
    description,
    schema: { type: 'string', example }
  };
}

function buildOpenApi() {
  const errorSchema = {
    type: 'object',
    properties: {
      error: { type: 'string', example: 'Non authentifie' }
    },
    required: ['error']
  };

  const membreSchema = {
    type: 'object',
    properties: {
      pseudoHRP: { type: 'string', example: 'Akirabane' },
      nomRP: { type: 'string', nullable: true, example: 'Joshi Akibane' },
      rang: { type: 'string', nullable: true, example: 'Inspecteur' },
      grade: { type: 'string', nullable: true, example: 'Chunin' },
      chakra: { type: 'string', nullable: true, example: 'Raiton / Suiton' },
      specialisation: { type: 'string', nullable: true, example: 'Traqueur' },
      division: { type: 'string', nullable: true, example: 'DRI' },
      dateArrivee: { type: 'string', nullable: true, example: '08/04/2026' },
      notes: { type: 'string', nullable: true, example: 'Equipe de nuit' }
    },
    required: ['pseudoHRP']
  };

  const authPayloadSchema = {
    type: 'object',
    properties: {
      token: { type: 'string' },
      pseudo: { type: 'string', example: 'Akirabane' },
      permission: { type: 'string', enum: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE', 'GUEST'], example: 'ADMIN' },
      policeRole: { type: 'boolean', example: true },
      linkedMembre: { type: 'string', nullable: true, example: 'Akirabane' }
    },
    required: ['token', 'pseudo', 'permission', 'policeRole']
  };

  const capabilitiesSchema = {
    type: 'object',
    properties: {
      isGuest: { type: 'boolean', example: false },
      isAdmin: { type: 'boolean', example: true },
      isJustice: { type: 'boolean', example: false },
      isPolice: { type: 'boolean', example: true },
      rankLevel: { type: 'integer', example: 99 },
      normalizedRank: { type: 'string', example: 'admin' },
      canViewHierarchy: { type: 'boolean', example: true },
      canViewRegister: { type: 'boolean', example: true },
      canViewCodePenal: { type: 'boolean', example: true },
      canViewIncidentReportPage: { type: 'boolean', example: true },
      canViewPatrolReportPage: { type: 'boolean', example: true },
      canCreateIncidentReport: { type: 'boolean', example: true },
      canCreatePatrolReport: { type: 'boolean', example: true },
      canUsePoliceService: { type: 'boolean', example: true },
      canGeneratePoliceCard: { type: 'boolean', example: true },
      canCreateComplaints: { type: 'boolean', example: true },
      canViewComplaints: { type: 'boolean', example: true },
      canManageComplaints: { type: 'boolean', example: true },
      canCreateInvestigations: { type: 'boolean', example: true },
      canViewInvestigations: { type: 'boolean', example: true },
      canManageInvestigations: { type: 'boolean', example: true },
      canCreatePoliceAcademies: { type: 'boolean', example: true },
      canViewPoliceAcademies: { type: 'boolean', example: true },
      canManagePoliceAcademies: { type: 'boolean', example: false },
      canViewDashboard: { type: 'boolean', example: true },
      canViewReports: { type: 'boolean', example: true },
      canManageReports: { type: 'boolean', example: true },
      canDeleteDossiers: { type: 'boolean', example: true },
      canViewHistory: { type: 'boolean', example: true },
      canEditHierarchy: { type: 'boolean', example: true },
      canEditRegister: { type: 'boolean', example: true },
      canAddRegisterMembers: { type: 'boolean', example: true },
      canEditCodePenal: { type: 'boolean', example: true },
      canManagePoliceRanks: { type: 'boolean', example: true }
    }
  };

  const authMeSchema = {
    type: 'object',
    properties: {
      pseudo: { type: 'string', example: 'Akirabane' },
      permission: { type: 'string', enum: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE', 'GUEST'], example: 'ADMIN' },
      policeRole: { type: 'boolean', example: true },
      linkedMembre: { type: 'string', nullable: true, example: 'Akirabane' },
      capabilities: { $ref: '#/components/schemas/Capabilities' }
    },
    required: ['pseudo', 'permission', 'policeRole', 'capabilities']
  };

  const adminUserSchema = {
    type: 'object',
    properties: {
      pseudo: { type: 'string', example: 'Akirabane' },
      permission: { type: 'string', enum: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE'], example: 'ADMIN' },
      policeRole: { type: 'boolean', example: true },
      linkedMembre: { type: 'string', nullable: true, example: 'Akirabane' },
      createdAt: { type: 'string', format: 'date-time', example: '2026-04-08T18:20:00.000Z' },
      capabilities: { $ref: '#/components/schemas/Capabilities' }
    },
    required: ['pseudo', 'permission', 'policeRole', 'createdAt', 'capabilities']
  };

  const registrySaveSchema = {
    type: 'object',
    properties: {
      version: { type: 'integer', example: 1 },
      lastUpdated: { type: 'string', format: 'date-time', nullable: true },
      membres: {
        type: 'array',
        items: { $ref: '#/components/schemas/Membre' }
      }
    },
    required: ['membres']
  };

  const casierCapabilitiesSchema = {
    type: 'object',
    properties: {
      canView: { type: 'boolean', example: true },
      canManage: { type: 'boolean', example: true },
      canDeleteDossiers: { type: 'boolean', example: true }
    },
    required: ['canView', 'canManage', 'canDeleteDossiers']
  };

  const codePenalSchema = {
    type: 'object',
    properties: {
      lexique: {
        type: 'object',
        properties: {
          detention: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Detention' },
              description: { type: 'string', example: 'Privation de liberte a duree definie.' }
            }
          },
          cellule: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Cellule' },
              description: { type: 'string', example: 'Temps de cellule exprime en minutes.' }
            }
          },
          avertissement: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Avertissement' },
              description: { type: 'string', example: 'x2 avert = signalement' },
              thresholdForSignalement: { type: 'integer', example: 2 }
            }
          },
          signalement: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Signalement' },
              description: { type: 'string', example: 'Escalade disciplinaire declenchee apres seuil.' },
              thresholdForJugement: { type: 'integer', example: 1 }
            }
          },
          jugement: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'Jugement' },
              description: { type: 'string', example: 'Instruction judiciaire interne ou passage devant l autorite competente.' }
            }
          },
          tig: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'TIG' },
              description: { type: 'string', example: 'Travaux d interet general.' }
            }
          },
          rules: {
            type: 'object',
            properties: {
              propagateEscalationToDossiers: { type: 'boolean', example: true }
            }
          }
        }
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'c' },
            cssClass: { type: 'string', example: 'section-c' },
            title: { type: 'string', example: 'C - Infractions Civiles' },
            shortTitle: { type: 'string', example: 'C - Civiles' },
            color: { type: 'string', example: '#68b046' },
            codePrefix: { type: 'string', example: 'C1' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'C1.1' },
                  infraction: { type: 'string', example: "Trouble a l'ordre public" },
                  description: { type: 'string', example: 'Cris, chahut, bagarre verbale' },
                  peine: { type: 'string', example: 'Avert + 5 000r + TIG' }
                },
                required: ['code', 'infraction', 'description', 'peine']
              }
            }
          },
          required: ['id', 'cssClass', 'title', 'rows']
        }
      }
    },
    required: ['sections']
  };

  const reportPayloadSchema = {
    type: 'object',
    properties: {
      reportType: { type: 'string', enum: ['incident', 'patrol'], example: 'incident' },
      suspectNom: { type: 'string', example: 'Test' },
      suspectPrenom: { type: 'string', example: 'Titi' },
      suspectGrade: { type: 'string', example: 'Chunin' },
      suspectPhoto: { type: 'string', example: 'data:image/png;base64,...' },
      agentNom: { type: 'string', example: 'Akibane' },
      agentPrenom: { type: 'string', example: 'Joshi' },
      agentGrade: { type: 'string', example: 'Inspecteur' },
      date: { type: 'string', example: '08/04/2026' },
      rapport: { type: 'string', example: 'Patrouille effectuee sans incident majeur.' },
      delits: {
        type: 'array',
        items: { type: 'string' },
        example: ['C1.1 — Trouble a l ordre public']
      },
      peine: { type: 'string', example: 'Avert + 5 000r' },
      graveEvent: { type: 'boolean', example: true },
      graveEventDetails: { type: 'string', example: 'Attroupement hostile a la porte nord.' }
    }
  };

  const penaltyTotalsSchema = {
    type: 'object',
    properties: {
      avertissements: { type: 'integer', example: 2 },
      signalements: { type: 'integer', example: 1 },
      tig: { type: 'integer', example: 1 },
      detention: { type: 'integer', example: 0 },
      jugement: { type: 'integer', example: 0 },
      confiscations: { type: 'integer', example: 1 },
      celluleMinutes: { type: 'integer', example: 15 },
      amendeRyo: { type: 'integer', example: 5000 },
      avertEquivalent: { type: 'integer', example: 2 }
    }
  };

  const reportRecordSchema = {
    allOf: [
      { $ref: '#/components/schemas/ReportPayload' },
      {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'f36de059f596becf' },
          timestamp: { type: 'string', format: 'date-time', example: '2026-04-08T18:20:00.000Z' },
          author: { type: 'string', example: 'Akirabane' },
          peineDetails: {
            type: 'object',
            properties: {
              totals: { $ref: '#/components/schemas/PenaltyTotals' },
              derivedFromLexique: { type: 'boolean', example: true }
            }
          }
        },
        required: ['id', 'timestamp', 'author']
      }
    ]
  };

  const dossierSchema = {
    type: 'object',
    properties: {
      dossierId: { type: 'string', example: 'test|titi' },
      suspectNom: { type: 'string', example: 'Test' },
      suspectPrenom: { type: 'string', example: 'Titi' },
      suspectGrade: { type: 'string', example: 'Chunin' },
      suspectPhoto: { type: 'string', example: 'data:image/png;base64,...' },
      latestTimestamp: { type: 'string', format: 'date-time', example: '2026-04-08T19:00:00.000Z' },
      reportCount: { type: 'integer', example: 2 },
      complaintCount: { type: 'integer', example: 1 },
      totals: { $ref: '#/components/schemas/PenaltyTotals' },
      complaints: {
        type: 'array',
        items: { $ref: '#/components/schemas/Complaint' }
      },
      history: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true
        }
      },
      reports: {
        type: 'array',
        items: { $ref: '#/components/schemas/ReportRecord' }
      }
    },
    required: ['dossierId', 'reportCount', 'reports']
  };

  const complaintSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'plainte-a1b2c3d4xyz' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-04-14T10:12:00.000Z' },
      author: { type: 'string', example: 'Akirabane' },
      officerNom: { type: 'string', example: 'Akibane' },
      officerPrenom: { type: 'string', example: 'Joshi' },
      officerGradeSection: { type: 'string', example: 'Chunin Patrouilleur' },
      plaintiffNom: { type: 'string', example: 'Uchiha' },
      plaintiffPrenom: { type: 'string', example: 'Shinra' },
      plaintiffGrade: { type: 'string', example: 'Chunin' },
      accusedNom: { type: 'string', example: 'Kurokaze' },
      accusedPrenom: { type: 'string', example: 'Ryu' },
      date: { type: 'string', example: '14/04/2026' },
      objet: { type: 'string', example: 'C - Infractions Civiles' },
      body: { type: 'string', example: 'Le plaignant signale des faits repetes survenus pres de la porte sud.' },
      updatedAt: { type: 'string', format: 'date-time', nullable: true },
      linkedDossierId: { type: 'string', nullable: true, example: 'uchiha|shinra' },
      linkedDossierName: { type: 'string', nullable: true, example: 'Shinra Uchiha' },
      linkedDossierMatchScore: { type: 'number', nullable: true, example: 0.92 }
    },
    required: ['id', 'timestamp', 'author', 'officerNom', 'officerPrenom', 'officerGradeSection', 'plaintiffNom', 'plaintiffPrenom', 'plaintiffGrade', 'accusedNom', 'accusedPrenom', 'date', 'objet', 'body']
  };

  const complaintMetaSchema = {
    type: 'object',
    properties: {
      gradeOptions: {
        type: 'array',
        items: { type: 'string' },
        example: ['Genin Confirme', 'Chunin', 'Konin']
      },
      objectOptions: {
        type: 'array',
        items: { type: 'string' },
        example: ['C - Infractions Civiles', 'N - Infractions Ninja']
      },
      officerProfile: {
        type: 'object',
        properties: {
          officerNom: { type: 'string', example: 'Akibane' },
          officerPrenom: { type: 'string', example: 'Joshi' },
          officerGradeSection: { type: 'string', example: 'Chunin Patrouilleur' }
        }
      }
    }
  };

  const investigationUpdateRecordSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'enq-note-ab12cd34' },
      investigationId: { type: 'string', example: 'enq-ab12cd34' },
      kind: { type: 'string', example: 'Suivi' },
      content: { type: 'string', example: 'Poursuite des auditions de voisinage.' },
      author: { type: 'string', example: 'Akirabane' },
      createdAt: { type: 'string', format: 'date-time', example: '2026-04-17T12:10:00.000Z' }
    },
    required: ['id', 'investigationId', 'kind', 'content', 'author', 'createdAt']
  };

  const investigationLinkOptionSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'uchiha|shinra' },
      label: { type: 'string', example: 'Shinra Uchiha' },
      meta: { type: 'object', additionalProperties: true }
    },
    required: ['id', 'label', 'meta']
  };

  const investigationLinkRecordSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'enq-link-ab12cd34' },
      investigationId: { type: 'string', example: 'enq-ab12cd34' },
      linkType: { type: 'string', enum: ['dossier', 'complaint', 'incident_report', 'patrol_report'], example: 'dossier' },
      linkLabel: { type: 'string', example: 'Dossier' },
      linkedId: { type: 'string', example: 'uchiha|shinra' },
      linkedLabel: { type: 'string', example: 'Shinra Uchiha' },
      linkedMeta: { type: 'object', additionalProperties: true },
      createdBy: { type: 'string', example: 'Akirabane' },
      createdAt: { type: 'string', format: 'date-time', example: '2026-04-17T12:15:00.000Z' }
    },
    required: ['id', 'investigationId', 'linkType', 'linkLabel', 'linkedId', 'linkedLabel', 'linkedMeta', 'createdBy', 'createdAt']
  };

  const investigationAttachmentRecordSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'enq-file-ab12cd34' },
      investigationId: { type: 'string', example: 'enq-ab12cd34' },
      filename: { type: 'string', example: 'photo-scene.png' },
      mimeType: { type: 'string', example: 'image/png' },
      relativePath: { type: 'string', example: 'uploads/investigations/enq-ab12cd34/enq-file-ab12cd34-photo-scene.png' },
      url: { type: 'string', example: '/uploads/investigations/enq-ab12cd34/enq-file-ab12cd34-photo-scene.png' },
      caption: { type: 'string', example: 'Porte fracturée à l entrée nord.' },
      uploadedBy: { type: 'string', example: 'Akirabane' },
      uploadedAt: { type: 'string', format: 'date-time', example: '2026-04-17T12:20:00.000Z' }
    },
    required: ['id', 'investigationId', 'filename', 'mimeType', 'relativePath', 'url', 'caption', 'uploadedBy', 'uploadedAt']
  };

  const investigationSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'enq-ab12cd34' },
      title: { type: 'string', example: 'Trafic discret au pont nord' },
      status: { type: 'string', example: 'En cours' },
      assignedAgent: { type: 'string', example: 'soullera' },
      author: { type: 'string', example: 'Akirabane' },
      summary: { type: 'string', example: 'Enquête ouverte après plusieurs signalements concordants.' },
      createdAt: { type: 'string', format: 'date-time', example: '2026-04-17T11:45:00.000Z' },
      updatedAt: { type: 'string', format: 'date-time', example: '2026-04-17T12:20:00.000Z' },
      closedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
      updates: { type: 'array', items: { $ref: '#/components/schemas/InvestigationUpdateRecord' } },
      links: { type: 'array', items: { $ref: '#/components/schemas/InvestigationLinkRecord' } },
      attachments: { type: 'array', items: { $ref: '#/components/schemas/InvestigationAttachmentRecord' } },
      updateCount: { type: 'integer', example: 3 },
      linkCount: { type: 'integer', example: 2 },
      attachmentCount: { type: 'integer', example: 1 }
    },
    required: ['id', 'title', 'status', 'assignedAgent', 'author', 'summary', 'createdAt', 'updatedAt', 'updates', 'links', 'attachments', 'updateCount', 'linkCount', 'attachmentCount']
  };

  const investigationMetaSchema = {
    type: 'object',
    properties: {
      statuses: { type: 'array', items: { type: 'string' }, example: ['En cours', 'En attente de preuves', 'Bouclee'] },
      updateKinds: { type: 'array', items: { type: 'string' }, example: ['Suivi', 'Temoignage', 'Note interne'] },
      assignableAgents: { type: 'array', items: { type: 'string' }, example: ['soullera', 'Akirabane'] },
      linkTypeLabels: {
        type: 'object',
        additionalProperties: { type: 'string' },
        example: {
          dossier: 'Dossier',
          complaint: 'Plainte',
          incident_report: 'Rapport d incident',
          patrol_report: 'Rapport de patrouille'
        }
      },
      dossierOptions: { type: 'array', items: { $ref: '#/components/schemas/InvestigationLinkOption' } },
      complaintOptions: { type: 'array', items: { $ref: '#/components/schemas/InvestigationLinkOption' } },
      incidentReportOptions: { type: 'array', items: { $ref: '#/components/schemas/InvestigationLinkOption' } },
      patrolReportOptions: { type: 'array', items: { $ref: '#/components/schemas/InvestigationLinkOption' } }
    },
    required: ['statuses', 'updateKinds', 'assignableAgents', 'linkTypeLabels', 'dossierOptions', 'complaintOptions', 'incidentReportOptions', 'patrolReportOptions']
  };

  const policeAcademySchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'pa-ab12cd34xyz567' },
      sessionId: { type: 'string', nullable: true, example: 'pas-ab12cd34xyz567' },
      status: { type: 'string', enum: ['active', 'completed'], example: 'completed' },
      author: { type: 'string', example: 'Akirabane' },
      officerNom: { type: 'string', example: 'Akibane' },
      officerPrenom: { type: 'string', example: 'Joshi' },
      officerGradeSection: { type: 'string', example: 'Inspecteur' },
      startedAt: { type: 'string', format: 'date-time', example: '2026-04-15T13:00:00.000Z' },
      completedAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-15T13:42:10.000Z' },
      durationSeconds: { type: 'integer', example: 2530 },
      candidateNom: { type: 'string', example: 'Uchiha' },
      candidatePrenom: { type: 'string', example: 'Shinra' },
      candidateAge: { type: 'string', example: '17' },
      chakraNature: { type: 'string', example: 'Katon' },
      kg: { type: 'string', example: 'Aucun' },
      armyRank: { type: 'string', example: 'Genin Confirme' },
      epreuve1: { type: 'string', example: 'Reussie' },
      epreuve2: { type: 'string', example: 'Non reussie' },
      epreuve3: { type: 'string', example: 'Reussie' },
      commentaire: { type: 'string', example: 'Evaluation serieuse avec bonne tenue generale.' },
      outcome: { type: 'string', nullable: true, enum: ['success', 'failure', ''], example: 'success' },
      updatedAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-15T13:42:10.000Z' }
    },
    required: ['id', 'status', 'author', 'officerNom', 'officerPrenom', 'officerGradeSection', 'startedAt', 'durationSeconds']
  };

  const policeAcademySessionSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'pas-ab12cd34xyz567' },
      status: { type: 'string', enum: ['active', 'completed'], example: 'active' },
      author: { type: 'string', example: 'Akirabane' },
      officerNom: { type: 'string', example: 'Akibane' },
      officerPrenom: { type: 'string', example: 'Joshi' },
      officerGradeSection: { type: 'string', example: 'Inspecteur' },
      startedAt: { type: 'string', format: 'date-time', example: '2026-04-15T13:00:00.000Z' },
      completedAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-15T13:42:10.000Z' },
      durationSeconds: { type: 'integer', example: 2530 },
      finalizedBy: { type: 'string', nullable: true, example: 'Akirabane' },
      updatedAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-15T13:42:10.000Z' }
    },
    required: ['id', 'status', 'author', 'officerNom', 'officerPrenom', 'officerGradeSection', 'startedAt', 'durationSeconds']
  };

  const policeAcademyActiveSessionSchema = {
    type: 'object',
    properties: {
      session: {
        oneOf: [
          { $ref: '#/components/schemas/PoliceAcademySession' },
          { type: 'null' }
        ]
      },
      candidateCount: { type: 'integer', example: 3 }
    },
    required: ['session', 'candidateCount']
  };

  const policeAcademySessionDetailsSchema = {
    type: 'object',
    properties: {
      session: { $ref: '#/components/schemas/PoliceAcademySession' },
      candidates: {
        type: 'array',
        items: { $ref: '#/components/schemas/PoliceAcademy' }
      }
    },
    required: ['session', 'candidates']
  };

  const policeAcademyFinalizeResponseSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      session: { $ref: '#/components/schemas/PoliceAcademySession' },
      candidates: {
        type: 'array',
        items: { $ref: '#/components/schemas/PoliceAcademy' }
      },
      enrolled: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidateId: { type: 'string', example: 'pa-ab12cd34xyz567' },
            pseudoHRP: { type: 'string', example: 'shinra-uchiha' },
            nomRP: { type: 'string', example: 'Shinra Uchiha' }
          }
        }
      },
      enrollmentErrors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidateId: { type: 'string', example: 'pa-ab12cd34xyz567' },
            reason: { type: 'string', example: 'insert_failed' }
          }
        }
      }
    },
    required: ['success', 'session', 'candidates', 'enrolled', 'enrollmentErrors']
  };

  const policeAcademyMetaSchema = {
    type: 'object',
    properties: {
      options: {
        type: 'object',
        properties: {
          chakraOptions: { type: 'array', items: { type: 'string' } },
          kgOptions: { type: 'array', items: { type: 'string' } },
          armyRankOptions: { type: 'array', items: { type: 'string' } },
          epreuveOptions: { type: 'array', items: { type: 'string' } }
        }
      },
      officerProfile: {
        type: 'object',
        properties: {
          officerNom: { type: 'string', example: 'Akibane' },
          officerPrenom: { type: 'string', example: 'Joshi' },
          officerGradeSection: { type: 'string', example: 'Inspecteur' }
        }
      }
    },
    required: ['options', 'officerProfile']
  };

  const historyItemSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 12 },
      timestamp: { type: 'string', format: 'date-time', example: '2026-04-08T19:10:00.000Z' },
      actorPseudo: { type: 'string', example: 'Akirabane' },
      actorPermission: { type: 'string', example: 'ADMIN' },
      action: { type: 'string', example: 'report_update' },
      entityType: { type: 'string', example: 'report' },
      entityId: { type: 'string', example: 'f36de059f596becf' },
      targetLabel: { type: 'string', example: 'Test Titi' },
      metadata: { type: 'object', additionalProperties: true }
    }
  };

  const serviceSessionSchema = {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 14 },
      pseudo: { type: 'string', example: 'Akirabane' },
      startedAt: { type: 'string', format: 'date-time' },
      endedAt: { type: 'string', format: 'date-time', nullable: true },
      status: { type: 'string', enum: ['active', 'closed'], example: 'closed' },
      durationSeconds: { type: 'integer', example: 8040 },
      note: { type: 'string', example: '' }
    }
  };

  const dashboardStatsSchema = {
    type: 'object',
    properties: {
      period: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          label: { type: 'string', example: '07/04/2026 au 13/04/2026' },
          nextResetAt: { type: 'string', format: 'date-time', nullable: true },
          generatedAt: { type: 'string', format: 'date-time' }
        }
      },
      totalReports: { type: 'integer', example: 18 },
      totalIncidents: { type: 'integer', example: 12 },
      totalPatrols: { type: 'integer', example: 6 },
      totalComplaints: { type: 'integer', example: 4 },
      totalInvestigations: { type: 'integer', example: 5 },
      totalPoliceAcademies: { type: 'integer', example: 3 },
      dossiersCount: { type: 'integer', example: 5 },
      topAgents: { type: 'array', items: { type: 'object', additionalProperties: true } },
      topDelits: { type: 'array', items: { type: 'object', additionalProperties: true } },
      topComplaintObjects: { type: 'array', items: { type: 'object', additionalProperties: true } },
      topInvestigationStatuses: { type: 'array', items: { type: 'object', additionalProperties: true } },
      topAcademyOfficers: { type: 'array', items: { type: 'object', additionalProperties: true } },
      activityByDivision: { type: 'array', items: { type: 'object', additionalProperties: true } },
      recentComplaints: { type: 'array', items: { type: 'object', additionalProperties: true } },
      recentInvestigations: { type: 'array', items: { type: 'object', additionalProperties: true } },
      recentPoliceAcademies: { type: 'array', items: { type: 'object', additionalProperties: true } },
      recentPublications: { type: 'array', items: { type: 'object', additionalProperties: true } },
      latestReports: { type: 'array', items: { type: 'object', additionalProperties: true } },
      perDay: { type: 'array', items: { type: 'object', additionalProperties: true } },
      complaintSeries: { type: 'array', items: { type: 'object', additionalProperties: true } },
      investigationSeries: { type: 'array', items: { type: 'object', additionalProperties: true } },
      academySeries: { type: 'array', items: { type: 'object', additionalProperties: true } },
      serviceSeries: { type: 'array', items: { type: 'object', additionalProperties: true } },
      serviceLeaderboard: { type: 'array', items: { type: 'object', additionalProperties: true } },
      recentServiceHistory: { type: 'array', items: { type: 'object', additionalProperties: true } },
      resetConfig: { type: 'object', additionalProperties: true },
      summary: { type: 'object', additionalProperties: true }
    }
  };

  const statsSnapshotSchema = {
    type: 'object',
    properties: {
      meta: { type: 'object', additionalProperties: true },
      summary: { type: 'object', additionalProperties: true },
      stats: { $ref: '#/components/schemas/DashboardStats' }
    }
  };

  const statusHeartbeatSchema = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ok' },
      service: { type: 'string', example: 'police-konoha' },
      version: { type: 'string', example: '1.0.0' },
      time: { type: 'string', format: 'date-time' }
    },
    required: ['status', 'service', 'version', 'time']
  };

  const statusOverviewSchema = {
    type: 'object',
    properties: {
      generatedAt: { type: 'string', format: 'date-time' },
      summary: { type: 'object', additionalProperties: true },
      runtime: { type: 'object', additionalProperties: true },
      totals: { type: 'object', additionalProperties: true },
      presence: { type: 'object', additionalProperties: true },
      backups: { type: 'object', additionalProperties: true },
      counters: { type: 'object', additionalProperties: true },
      series: { type: 'object', additionalProperties: true },
      recentEvents: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true
        }
      }
    },
    required: ['generatedAt', 'summary', 'runtime', 'totals', 'presence', 'backups', 'counters', 'series', 'recentEvents']
  };

  const publicPresenceSchema = {
    type: 'object',
    properties: {
      enLigne: { type: 'integer', example: 2 },
      absents: { type: 'integer', example: 1 },
      visiteurs: { type: 'integer', example: 4 },
      shinobis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pseudo: { type: 'string', example: 'Akirabane' },
            statut: { type: 'string', enum: ['en_ligne', 'absent'], example: 'en_ligne' },
            police: { type: 'boolean', example: true },
            permission: { type: 'string', enum: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE', 'GUEST'], example: 'ADMIN' },
            count: { type: 'integer', example: 1 }
          }
        }
      }
    }
  };

  const internalPresenceSchema = {
    type: 'object',
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pseudo: { type: 'string', example: 'Akirabane' },
            status: { type: 'string', enum: ['active', 'away', 'mobile'], example: 'mobile' },
            policeRole: { type: 'boolean', example: true },
            permission: { type: 'string', enum: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE', 'GUEST'], example: 'ADMIN' },
            count: { type: 'integer', example: 1 }
          }
        }
      },
      guestCount: { type: 'integer', example: 3 }
    }
  };

  const driNinjaSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'nin-ab12cd34' },
      fullName: { type: 'string', example: 'Uchiha Madara' },
      category: { type: 'string', enum: ['Membre de clan', 'Sans clan', 'Deserteur (nukenin)'], example: 'Deserteur (nukenin)' },
      clan: { type: 'string', example: 'Uchiha' },
      rank: { type: 'string', enum: ['D', 'C', 'B', 'A', 'S', 'X'], example: 'S' },
      section: { type: 'string', example: 'Forces Speciales' },
      nature: { type: 'string', example: 'Katon' },
      kekkaiGenkai: { type: 'string', example: 'Mokuton' },
      artefact: { type: 'string', example: 'Aucun' },
      photoDataUrl: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      createdBy: { type: 'string', nullable: true, example: 'Akirabane' }
    },
    required: ['id', 'fullName', 'category', 'clan', 'rank', 'section', 'nature', 'kekkaiGenkai', 'artefact']
  };

  const driArtifactSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'art-ab12cd34' },
      name: { type: 'string', example: 'Samehada' },
      holderName: { type: 'string', nullable: true, example: 'Inconnu' },
      status: { type: 'string', enum: ['Localise', 'Sous surveillance', 'Perdu', 'Confisque', 'Detenu', 'Inconnu'], example: 'Perdu' },
      classification: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      createdBy: { type: 'string', nullable: true, example: 'Akirabane' }
    },
    required: ['id', 'name', 'status']
  };

  const driInvestigationSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'dri-int-ab12cd34' },
      title: { type: 'string', example: 'Operation Sombre Horizon' },
      status: { type: 'string', example: 'En cours' },
      assignedAgents: { type: 'array', items: { type: 'string' } },
      linkedNinjaIds: { type: 'array', items: { type: 'string' }, description: 'Enquetes internes uniquement' },
      targetZone: { type: 'string', nullable: true, description: 'Enquetes externes uniquement' },
      summary: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      createdBy: { type: 'string', nullable: true, example: 'Akirabane' },
      createdAt: { type: 'string', format: 'date-time' },
      updateCount: { type: 'integer', example: 3 },
      attachmentCount: { type: 'integer', example: 1 },
      linkCount: { type: 'integer', example: 2 },
      updates: { type: 'array', items: { $ref: '#/components/schemas/InvestigationUpdateRecord' } },
      links: { type: 'array', items: { $ref: '#/components/schemas/InvestigationLinkRecord' } },
      attachments: { type: 'array', items: { $ref: '#/components/schemas/InvestigationAttachmentRecord' } }
    },
    required: ['id', 'title', 'status']
  };

  const notificationSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'notif-ab12cd34' },
      recipientPseudo: { type: 'string', example: 'Akirabane' },
      kind: { type: 'string', example: 'investigation_assignment' },
      title: { type: 'string', example: 'Nouvelle affectation d enquete' },
      body: { type: 'string', example: 'Tu as ete ajoute a l enquete "Operation X" par Soullera.' },
      entityType: { type: 'string', nullable: true, example: 'investigation' },
      entityId: { type: 'string', nullable: true, example: 'inv-ab12cd34' },
      read: { type: 'boolean', example: false },
      createdAt: { type: 'string', format: 'date-time' },
      metadata: { type: 'object', additionalProperties: true, nullable: true }
    },
    required: ['id', 'kind', 'title', 'body', 'read', 'createdAt']
  };

  const loginHallEntrySchema = {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'peer-abc123' },
      pseudo: { type: 'string', nullable: true, example: 'Akirabane' },
      type: { type: 'string', enum: ['police', 'guest'], example: 'police' },
      updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'type', 'updatedAt']
  };

  const driMetaSchema = {
    type: 'object',
    properties: {
      ninjaCategories: { type: 'array', items: { type: 'string' } },
      ninjaClans: { type: 'array', items: { type: 'string' } },
      ninjaRanks: { type: 'array', items: { type: 'string' } },
      ninjaSections: { type: 'array', items: { type: 'string' } },
      ninjaNatures: { type: 'array', items: { type: 'string' } },
      ninjaKekkaiGenkai: { type: 'array', items: { type: 'string' } },
      artifactNames: { type: 'array', items: { type: 'string' } },
      artifactStatuses: { type: 'array', items: { type: 'string' } },
      internalStatuses: { type: 'array', items: { type: 'string' } },
      externalStatuses: { type: 'array', items: { type: 'string' } }
    }
  };

  const tags = [
    { name: 'Auth', description: 'Authentification, avatar et capacites utilisateur' },
    { name: 'Admin', description: 'Gestion comptes, liaisons et administration' },
    { name: 'Registre', description: 'Membres, rangs et synchronisation registre' },
    { name: 'Code Penal', description: 'Lecture et edition du code penal et de son lexique' },
    { name: 'Presence', description: 'Presence des shinobis et visiteurs' },
    { name: 'Rapports', description: 'Rapports d incident, patrouille, dossiers et publications Discord' },
    { name: 'Plaintes', description: 'Depot, consultation et gestion des plaintes internes' },
    { name: 'Enquetes', description: 'Creation, suivi, pieces jointes et rapprochements d enquete' },
    { name: 'Police Academie', description: 'Sessions, candidats, finalisation et historique Police Academie' },
    { name: 'DRI', description: 'Division du Renseignement Interieur — fiches ninja, artefacts, enquetes internes et externes' },
    { name: 'Notifications', description: 'Notifications in-app par utilisateur' },
    { name: 'Login Hall', description: 'Presence en temps reel sur la page de connexion (SSE)' },
    { name: 'Historique', description: 'Audit des modifications staff' },
    { name: 'Service', description: 'Prise de service et sessions agent' },
    { name: 'System', description: 'Sante et metriques systeme' },
    { name: 'Docs', description: 'Specification OpenAPI machine-readable' }
  ];

  const components = {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      Error: errorSchema,
      AuthPayload: authPayloadSchema,
      AuthMe: authMeSchema,
      AdminUser: adminUserSchema,
      Capabilities: capabilitiesSchema,
      CasierCapabilities: casierCapabilitiesSchema,
      Membre: membreSchema,
      RegistrySavePayload: registrySaveSchema,
      CodePenal: codePenalSchema,
      ReportPayload: reportPayloadSchema,
      ReportRecord: reportRecordSchema,
      ReportDossier: dossierSchema,
      Complaint: complaintSchema,
      ComplaintMeta: complaintMetaSchema,
      Investigation: investigationSchema,
      InvestigationMeta: investigationMetaSchema,
      InvestigationLinkOption: investigationLinkOptionSchema,
      InvestigationUpdateRecord: investigationUpdateRecordSchema,
      InvestigationLinkRecord: investigationLinkRecordSchema,
      InvestigationAttachmentRecord: investigationAttachmentRecordSchema,
      PoliceAcademy: policeAcademySchema,
      PoliceAcademySession: policeAcademySessionSchema,
      PoliceAcademyActiveSession: policeAcademyActiveSessionSchema,
      PoliceAcademySessionDetails: policeAcademySessionDetailsSchema,
      PoliceAcademyFinalizeResponse: policeAcademyFinalizeResponseSchema,
      PoliceAcademyMeta: policeAcademyMetaSchema,
      PenaltyTotals: penaltyTotalsSchema,
      HistoryItem: historyItemSchema,
      ServiceSession: serviceSessionSchema,
      DashboardStats: dashboardStatsSchema,
      StatsSnapshot: statsSnapshotSchema,
      StatusHeartbeat: statusHeartbeatSchema,
      StatusOverview: statusOverviewSchema,
      PublicPresence: publicPresenceSchema,
      InternalPresence: internalPresenceSchema,
      DriNinja: driNinjaSchema,
      DriArtifact: driArtifactSchema,
      DriInvestigation: driInvestigationSchema,
      DriMeta: driMetaSchema,
      Notification: notificationSchema,
      LoginHallEntry: loginHallEntrySchema
    }
  };

  const paths = {};

  Object.assign(paths, {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Retourne l etat du service, SQLite et les backups',
        description: 'Route interne surtout utile en verification locale ou via reverse proxy. Si le NGINX de production ne la publie pas, utilise plutot /api/v1/status/heartbeat ou la page Status_Systeme.html.',
        responses: {
          '200': jsonResponse('Service operationnel', {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              service: { type: 'string', example: 'police-konoha' },
              version: { type: 'string', example: '1.0.0' },
              environment: { type: 'string', example: 'production' },
              time: { type: 'string', format: 'date-time' },
              uptimeSeconds: { type: 'integer', example: 18342 },
              sqlite: { type: 'object', additionalProperties: true },
              data: { type: 'object', additionalProperties: true },
              backups: { type: 'object', additionalProperties: true }
            }
          }),
          '503': jsonResponse('SQLite indisponible', errorSchema)
        }
      }
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Creer un compte police avec code secret',
        requestBody: jsonBody({
          type: 'object',
          properties: {
            pseudo: { type: 'string', example: 'Soullera' },
            password: { type: 'string', example: 'Konoha#2026!' },
            secret: { type: 'string', example: 'T4ig#Kz9mR' }
          },
          required: ['pseudo', 'password', 'secret']
        }),
        responses: {
          '200': jsonResponse('Compte cree et token emis', { $ref: '#/components/schemas/AuthPayload' }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '403': jsonResponse('Code secret invalide', errorSchema),
          '409': jsonResponse('Pseudo deja pris', errorSchema)
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Connexion classique',
        requestBody: jsonBody({
          type: 'object',
          properties: {
            pseudo: { type: 'string', example: 'Akirabane' },
            password: { type: 'string', example: 'Konoha#2026!' }
          },
          required: ['pseudo', 'password']
        }),
        responses: {
          '200': jsonResponse('Connexion reussie', { $ref: '#/components/schemas/AuthPayload' }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Identifiants incorrects', errorSchema),
          '429': jsonResponse('Trop de tentatives de connexion', errorSchema),
          '503': jsonResponse('Compte Justice non configure sur le serveur', errorSchema)
        }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Deconnexion et revocation du token courant',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Utilisateur deconnecte', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Recupere le profil courant et les capacites calculees',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Profil courant', { $ref: '#/components/schemas/AuthMe' }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/profile/avatar': {
      post: {
        tags: ['Auth'],
        summary: 'Met a jour la photo de profil du compte courant',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            avatar: { type: 'string', example: 'data:image/png;base64,...' }
          },
          required: ['avatar']
        }),
        responses: {
          '200': jsonResponse('Avatar enregistre', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '400': jsonResponse('Avatar invalide ou trop volumineux', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/profile/avatar/{pseudo}': {
      get: {
        tags: ['Auth'],
        summary: 'Recupere l avatar par pseudo compte',
        security: bearerSecurity(),
        parameters: [pathParam('pseudo', 'Pseudo du compte', 'Akirabane')],
        responses: {
          '200': jsonResponse('Avatar trouve', {
            type: 'object',
            properties: {
              avatar: { type: 'string', example: 'data:image/png;base64,...' }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '404': jsonResponse('Aucun avatar', errorSchema)
        }
      }
    },
    '/auth/profile/avatar-by-hrp/{pseudoHRP}': {
      get: {
        tags: ['Auth'],
        summary: 'Recupere l avatar par pseudo HRP lie',
        security: bearerSecurity(),
        parameters: [pathParam('pseudoHRP', 'Pseudo HRP dans le registre', 'Akirabane')],
        responses: {
          '200': jsonResponse('Avatar trouve', {
            type: 'object',
            properties: {
              avatar: { type: 'string', example: 'data:image/png;base64,...' }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '404': jsonResponse('Aucun avatar', errorSchema)
        }
      }
    },
    '/auth/can-edit-cp': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut modifier le code penal',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacite code penal', {
            type: 'object',
            properties: {
              canEdit: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/can-manage-ranks': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut modifier les grades/rangs police',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacite grades', {
            type: 'object',
            properties: {
              canManage: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/can-add-registry-members': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut ajouter de nouveaux membres au registre',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacite ajout registre', {
            type: 'object',
            properties: {
              canAdd: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/can-manage-casiers': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut gerer les rapports, incidents et dossiers',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacite rapports', { $ref: '#/components/schemas/CasierCapabilities' }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/can-view-history': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut voir l historique staff',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacite historique', {
            type: 'object',
            properties: {
              canView: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/can-manage-complaints': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut creer, consulter ou gerer les plaintes',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacites plaintes', {
            type: 'object',
            properties: {
              canCreate: { type: 'boolean', example: true },
              canView: { type: 'boolean', example: true },
              canManage: { type: 'boolean', example: false }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/can-manage-investigations': {
      get: {
        tags: ['Auth'],
        summary: 'Indique si le compte peut creer, consulter ou gerer les enquetes',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacites enquetes', {
            type: 'object',
            properties: {
              canCreate: { type: 'boolean', example: true },
              canView: { type: 'boolean', example: true },
              canManage: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/auth/capabilities': {
      get: {
        tags: ['Auth'],
        summary: 'Retourne la matrice de permissions calculee pour le compte courant',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Capacites detaillees', { $ref: '#/components/schemas/Capabilities' }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'Liste les comptes internes',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Utilisateurs internes', {
            type: 'array',
            items: { $ref: '#/components/schemas/AdminUser' }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux administrateurs', errorSchema)
        }
      }
    },
    '/admin/users/{pseudo}/link': {
      post: {
        tags: ['Admin'],
        summary: 'Lie un compte a un membre du registre',
        security: bearerSecurity(),
        parameters: [pathParam('pseudo', 'Pseudo du compte', 'Soullera')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            pseudoHRP: { type: 'string', nullable: true, example: 'Soullera' }
          }
        }),
        responses: {
          '200': jsonResponse('Compte lie', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux administrateurs', errorSchema),
          '404': jsonResponse('Utilisateur ou personnage introuvable', errorSchema),
          '409': jsonResponse('Personnage deja lie a un autre compte', errorSchema)
        }
      }
    },
    '/admin/users/{pseudo}/permission': {
      post: {
        tags: ['Admin'],
        summary: 'Change la permission d un compte',
        security: bearerSecurity(),
        parameters: [pathParam('pseudo', 'Pseudo du compte', 'Soullera')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            permission: { type: 'string', enum: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE'], example: 'UPDATE' }
          },
          required: ['permission']
        }),
        responses: {
          '200': jsonResponse('Permission modifiee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              pseudo: { type: 'string', example: 'Soullera' },
              permission: { type: 'string', example: 'UPDATE' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Impossible de retirer le dernier administrateur', errorSchema),
          '404': jsonResponse('Utilisateur introuvable', errorSchema)
        }
      }
    },
    '/admin/users/{pseudo}/police': {
      post: {
        tags: ['Admin'],
        summary: 'Active ou desactive le role police du compte',
        security: bearerSecurity(),
        parameters: [pathParam('pseudo', 'Pseudo du compte', 'Soullera')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            policeRole: { type: 'boolean', example: true }
          },
          required: ['policeRole']
        }),
        responses: {
          '200': jsonResponse('Role police mis a jour', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              pseudo: { type: 'string', example: 'Soullera' },
              policeRole: { type: 'boolean', example: true }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux administrateurs', errorSchema),
          '404': jsonResponse('Utilisateur introuvable', errorSchema)
        }
      }
    },
    '/admin/users/{pseudo}/dri': {
      post: {
        tags: ['Admin'],
        summary: 'Attribue ou retire le role DRI d un compte',
        security: bearerSecurity(),
        parameters: [pathParam('pseudo', 'Pseudo du compte', 'Akirabane')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            driRole: { type: 'string', nullable: true, description: 'Role DRI ou null pour retirer', example: 'agent' }
          },
          required: ['driRole']
        }),
        responses: {
          '200': jsonResponse('Role DRI mis a jour', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              pseudo: { type: 'string', example: 'Akirabane' },
              driRole: { type: 'string', nullable: true, example: 'agent' }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Admin requis', errorSchema),
          '404': jsonResponse('Utilisateur introuvable', errorSchema)
        }
      }
    },
    '/admin/users/{pseudo}': {
      delete: {
        tags: ['Admin'],
        summary: 'Supprime un compte',
        security: bearerSecurity(),
        parameters: [pathParam('pseudo', 'Pseudo du compte', 'Soullera')],
        responses: {
          '200': jsonResponse('Compte supprime', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Dernier administrateur protege', errorSchema),
          '404': jsonResponse('Utilisateur introuvable', errorSchema)
        }
      }
    },
    '/admin/codepenal': {
      get: {
        tags: ['Code Penal'],
        summary: 'Lit le code penal en mode edition staff',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Code penal courant', { $ref: '#/components/schemas/CodePenal' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Rang insuffisant', errorSchema)
        }
      },
      post: {
        tags: ['Code Penal'],
        summary: 'Sauvegarde le code penal (route legacy compatible)',
        security: bearerSecurity(),
        requestBody: jsonBody({ $ref: '#/components/schemas/CodePenal' }),
        responses: {
          '200': jsonResponse('Code penal sauvegarde', {
            type: 'object',
            properties: {
              ok: { type: 'boolean', example: true }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Rang insuffisant', errorSchema)
        }
      }
    },
    '/api/v1/codepenal/history': {
      get: {
        tags: ['Code Penal'],
        summary: 'Historique des modifications du code penal',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Historique des versions sauvegardees', {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                savedAt: { type: 'string', format: 'date-time' },
                savedBy: { type: 'string', nullable: true },
                data: { $ref: '#/components/schemas/CodePenal' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux editeurs du code penal', errorSchema)
        }
      }
    },
    '/api/v1/codepenal': {
      get: {
        tags: ['Code Penal'],
        summary: 'Lit le code penal vivant via l API authentifiee',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Code penal courant', { $ref: '#/components/schemas/CodePenal' }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      },
      put: {
        tags: ['Code Penal'],
        summary: 'Met a jour le code penal et son lexique',
        security: bearerSecurity(),
        requestBody: jsonBody({ $ref: '#/components/schemas/CodePenal' }),
        responses: {
          '200': jsonResponse('Code penal sauvegarde', {
            type: 'object',
            properties: {
              ok: { type: 'boolean', example: true }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Rang insuffisant', errorSchema)
        }
      }
    }
  });

  Object.assign(paths, {
    '/save': {
      post: {
        tags: ['Registre'],
        summary: 'Remplace le registre complet et journalise les changements staff',
        security: bearerSecurity(),
        requestBody: jsonBody({ $ref: '#/components/schemas/RegistrySavePayload' }),
        responses: {
          '200': jsonResponse('Registre sauvegarde', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux grades autorises', errorSchema)
        }
      }
    },
    '/presence/ping': {
      post: {
        tags: ['Presence'],
        summary: 'Ping de presence pour un utilisateur connecte',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'away', 'mobile'], example: 'active' },
            clientId: { type: 'string', example: 'desktop-main' }
          }
        }),
        responses: {
          '200': jsonResponse('Presence mise a jour', { $ref: '#/components/schemas/InternalPresence' }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/presence/guest-ping': {
      post: {
        tags: ['Presence'],
        summary: 'Ping de presence pour un visiteur',
        requestBody: jsonBody({
          type: 'object',
          properties: {
            guestId: { type: 'string', example: 'guest-42' }
          },
          required: ['guestId']
        }),
        responses: {
          '200': jsonResponse('Visiteur mis a jour', { $ref: '#/components/schemas/InternalPresence' }),
          '400': jsonResponse('Validation echouee', errorSchema)
        }
      }
    },
    '/presence/list': {
      get: {
        tags: ['Presence'],
        summary: 'Presence interne detaillee (utilisateurs + visiteurs)',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Presence detaillee', { $ref: '#/components/schemas/InternalPresence' }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/codepenal.json': {
      get: {
        tags: ['Code Penal'],
        summary: 'Lecture publique du code penal',
        responses: {
          '200': jsonResponse('Code penal public', { $ref: '#/components/schemas/CodePenal' })
        }
      }
    },
    '/api/v1/public/codepenal': {
      get: {
        tags: ['Code Penal'],
        summary: 'Lecture publique proxifiee du code penal',
        responses: {
          '200': jsonResponse('Code penal public', { $ref: '#/components/schemas/CodePenal' })
        }
      }
    },
    '/api/v1/membres': {
      get: {
        tags: ['Registre'],
        summary: 'Liste publique des membres avec filtres',
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Recherche libre' },
          { in: 'query', name: 'rang', schema: { type: 'string' }, description: 'Filtre exact sur le rang section' },
          { in: 'query', name: 'grade', schema: { type: 'string' }, description: 'Filtre exact sur le grade armee' },
          { in: 'query', name: 'division', schema: { type: 'string' }, description: 'Filtre exact sur la division' },
          { in: 'query', name: 'specialisation', schema: { type: 'string' }, description: 'Filtre partiel sur la specialisation' },
          { in: 'query', name: 'chakra', schema: { type: 'string' }, description: 'Filtre partiel sur les natures de chakra' },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['pseudo', 'grade', 'rang', 'division', 'date'], example: 'pseudo' } }
        ],
        responses: {
          '200': jsonResponse('Membres publics', {
            type: 'object',
            properties: {
              total: { type: 'integer', example: 22 },
              lastUpdated: { type: 'string', format: 'date-time', nullable: true },
              membres: {
                type: 'array',
                items: { $ref: '#/components/schemas/Membre' }
              }
            }
          })
        }
      }
    },
    '/api/v1/membres/{pseudoHRP}': {
      get: {
        tags: ['Registre'],
        summary: 'Recupere la fiche publique d un membre',
        parameters: [pathParam('pseudoHRP', 'Pseudo HRP', 'Akirabane')],
        responses: {
          '200': jsonResponse('Fiche publique', { $ref: '#/components/schemas/Membre' }),
          '404': jsonResponse('Ninja introuvable', errorSchema)
        }
      }
    },
    '/api/v1/membres/grade': {
      post: {
        tags: ['Registre'],
        summary: 'Met a jour uniquement le grade armee via pseudo Discord / pseudo HRP le plus proche',
        description: 'Accessible avec un JWT autorise ou avec le bearer statique GRADE_BOT_TOKEN.',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            discordPseudo: { type: 'string', example: 'Akirabane' },
            grade: { type: 'string', example: 'Chunin' }
          },
          required: ['discordPseudo', 'grade']
        }),
        responses: {
          '200': jsonResponse('Grade mis a jour', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              query: { type: 'string', example: 'Akirabane' },
              matchType: { type: 'string', enum: ['exact', 'prefix', 'contains', 'closest'], example: 'exact' },
              score: { type: 'number', example: 1 },
              membre: { $ref: '#/components/schemas/Membre' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Token invalide', errorSchema),
          '403': jsonResponse('Acces refuse', errorSchema),
          '404': jsonResponse('Membre introuvable', errorSchema)
        }
      }
    },
    '/api/v1/rangs': {
      get: {
        tags: ['Registre'],
        summary: 'Recupere la hierarchie groupee par rang section',
        responses: {
          '200': jsonResponse('Hierarchie groupee', {
            type: 'object',
            properties: {
              totalMembres: { type: 'integer', example: 22 },
              lastUpdated: { type: 'string', format: 'date-time', nullable: true },
              rangs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    rang: { type: 'string', example: 'Inspecteur' },
                    effectif: { type: 'integer', example: 3 },
                    membres: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Membre' }
                    }
                  }
                }
              }
            }
          })
        }
      }
    },
    '/api/v1/presence': {
      get: {
        tags: ['Presence'],
        summary: 'Presence publique resumee',
        responses: {
          '200': jsonResponse('Presence publique', { $ref: '#/components/schemas/PublicPresence' })
        }
      }
    },
    '/api/v1/stats': {
      get: {
        tags: ['System'],
        summary: 'Statistiques globales publiques du registre',
        responses: {
          '200': jsonResponse('Stats publiques', {
            type: 'object',
            properties: {
              totalMembres: { type: 'integer', example: 22 },
              enLigneActuel: { type: 'integer', example: 4 },
              lastUpdated: { type: 'string', format: 'date-time', nullable: true },
              parRang: { type: 'object', additionalProperties: { type: 'integer' } },
              parDivision: { type: 'object', additionalProperties: { type: 'integer' } },
              parSpecialisation: { type: 'object', additionalProperties: { type: 'integer' } }
            }
          })
        }
      }
    },
    '/api/status-monitor/heartbeat': {
      get: {
        tags: ['System'],
        summary: 'Heartbeat public du monitor autonome',
        description: 'Expose l etat minimum du service police-status, independamment du MDT principal.',
        responses: {
          '200': jsonResponse('Monitor public joignable', { $ref: '#/components/schemas/StatusHeartbeat' })
        }
      }
    },
    '/api/status-monitor/overview': {
      get: {
        tags: ['System'],
        summary: 'Vue publique detaillee du monitor autonome',
        description: 'Supervision publique servie par le service police-status, utile meme si le MDT principal est arrete.',
        responses: {
          '200': jsonResponse('Vue publique du monitor', { $ref: '#/components/schemas/StatusOverview' })
        }
      }
    },
    '/api/v1/status/heartbeat': {
      get: {
        tags: ['System'],
        summary: 'Heartbeat minimal du service, accessible via /api/v1',
        responses: {
          '200': jsonResponse('Service joignable', { $ref: '#/components/schemas/StatusHeartbeat' })
        }
      }
    },
    '/api/v1/status/overview': {
      get: {
        tags: ['System'],
        summary: 'Vue detaillee de supervision applicative',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Supervision detaillee', { $ref: '#/components/schemas/StatusOverview' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve au commandement, a la Justice et aux administrateurs', errorSchema)
        }
      }
    }
  });

  Object.assign(paths, {
    '/api/v1/casier/save': {
      post: {
        tags: ['Rapports'],
        summary: 'Cree un rapport d incident ou de patrouille',
        description: 'Un incident alimente automatiquement le dossier du suspect. Les patrouilles ne sont pas publiables sur Discord.',
        security: bearerSecurity(),
        requestBody: jsonBody({ $ref: '#/components/schemas/ReportPayload' }),
        responses: {
          '200': jsonResponse('Rapport cree', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              arrestId: { type: 'string', example: 'f36de059f596becf' },
              record: { $ref: '#/components/schemas/ReportRecord' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers', errorSchema)
        }
      }
    },
    '/api/v1/casier/records': {
      get: {
        tags: ['Rapports'],
        summary: 'Liste les rapports avec filtres',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' } },
          { in: 'query', name: 'author', schema: { type: 'string' } },
          { in: 'query', name: 'suspect', schema: { type: 'string' } },
          { in: 'query', name: 'grade', schema: { type: 'string' } },
          { in: 'query', name: 'delit', schema: { type: 'string' } },
          { in: 'query', name: 'type', schema: { type: 'string', enum: ['incident', 'patrol'] } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', example: '01/04/2026' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', example: '08/04/2026' } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['newest', 'oldest', 'suspect', 'author', 'type'], example: 'newest' } }
        ],
        responses: {
          '200': jsonResponse('Rapports filtres', {
            type: 'object',
            properties: {
              records: {
                type: 'array',
                items: { $ref: '#/components/schemas/ReportRecord' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+ police et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/casier/dossiers': {
      get: {
        tags: ['Rapports'],
        summary: 'Retourne les dossiers incident regroupes par accuse + les patrouilles',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' } },
          { in: 'query', name: 'author', schema: { type: 'string' } },
          { in: 'query', name: 'suspect', schema: { type: 'string' } },
          { in: 'query', name: 'grade', schema: { type: 'string' } },
          { in: 'query', name: 'delit', schema: { type: 'string' } },
          { in: 'query', name: 'type', schema: { type: 'string', enum: ['incident', 'patrol'] } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', example: '01/04/2026' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', example: '08/04/2026' } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['newest', 'oldest', 'suspect', 'author', 'type'], example: 'newest' } }
        ],
        responses: {
          '200': jsonResponse('Dossiers et patrouilles', {
            type: 'object',
            properties: {
              dossiers: {
                type: 'array',
                items: { $ref: '#/components/schemas/ReportDossier' }
              },
              patrols: {
                type: 'array',
                items: { $ref: '#/components/schemas/ReportRecord' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+ police et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/casier/records/{id}': {
      put: {
        tags: ['Rapports'],
        summary: 'Modifie un rapport existant',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant du rapport', 'f36de059f596becf')],
        requestBody: jsonBody({ $ref: '#/components/schemas/ReportPayload' }),
        responses: {
          '200': jsonResponse('Rapport mis a jour', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              record: { $ref: '#/components/schemas/ReportRecord' }
            }
          }),
          '400': jsonResponse('Type de rapport non modifiable', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+ police et administrateurs', errorSchema),
          '404': jsonResponse('Rapport introuvable', errorSchema)
        }
      },
      delete: {
        tags: ['Rapports'],
        summary: 'Supprime un rapport individuel',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant du rapport', 'f36de059f596becf')],
        responses: {
          '200': jsonResponse('Rapport supprime', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+ police et administrateurs', errorSchema),
          '404': jsonResponse('Rapport introuvable', errorSchema)
        }
      }
    },
    '/api/v1/casier/dossiers/{dossierId}': {
      delete: {
        tags: ['Rapports'],
        summary: 'Supprime un dossier complet et tout son historique d incidents',
        security: bearerSecurity(),
        parameters: [pathParam('dossierId', 'Identifiant du dossier', 'test|titi')],
        responses: {
          '200': jsonResponse('Dossier supprime', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              deletedReports: { type: 'integer', example: 3 }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Suppression reservee aux Lieutenants-Jonins, Commandants et administrateurs', errorSchema),
          '404': jsonResponse('Casier introuvable', errorSchema)
        }
      }
    },
    '/api/v1/casier/publish/{id}': {
      post: {
        tags: ['Rapports'],
        summary: 'Publie un rapport d incident sur Discord',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant du rapport', 'f36de059f596becf')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            updateNotice: { type: 'boolean', example: true }
          }
        }, false),
        responses: {
          '200': jsonResponse('Rapport publie', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              chunks: { type: 'integer', example: 1 }
            }
          }),
          '400': jsonResponse('Seuls les rapports d incident peuvent etre publies', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers', errorSchema),
          '404': jsonResponse('Rapport introuvable', errorSchema),
          '502': jsonResponse('Publication Discord impossible', errorSchema),
          '503': jsonResponse('Webhook Discord non configure', errorSchema)
        }
      }
    },
    '/api/v1/casier/stats': {
      get: {
        tags: ['Rapports'],
        summary: 'Dashboard hebdomadaire en cours des rapports et prises de service',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Stats dashboard de la periode active', { $ref: '#/components/schemas/DashboardStats' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+', errorSchema)
        }
      }
    },
    '/api/v1/casier/stats/history': {
      get: {
        tags: ['Rapports'],
        summary: 'Liste les snapshots hebdomadaires archives du dashboard',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Archives disponibles', {
            type: 'object',
            properties: {
              snapshots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'stats-police_2026-03-31_to_2026-04-07.json' },
                    label: { type: 'string', example: '31/03/2026 au 06/04/2026' },
                    periodStart: { type: 'string', format: 'date-time' },
                    periodEnd: { type: 'string', format: 'date-time' },
                    createdAt: { type: 'string', format: 'date-time' },
                    totals: { type: 'object', additionalProperties: true }
                  }
                }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+', errorSchema)
        }
      }
    },
    '/api/v1/casier/stats/history/{snapshotId}': {
      get: {
        tags: ['Rapports'],
        summary: 'Recupere un snapshot archive du dashboard',
        security: bearerSecurity(),
        parameters: [pathParam('snapshotId', 'Nom du snapshot archive', 'stats-police_2026-03-31_to_2026-04-07.json')],
        responses: {
          '200': jsonResponse('Snapshot detaille', { $ref: '#/components/schemas/StatsSnapshot' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+', errorSchema),
          '404': jsonResponse('Archive introuvable', errorSchema)
        }
      }
    },
    '/api/v1/complaints/meta': {
      get: {
        tags: ['Plaintes'],
        summary: 'Retourne les metadonnees utiles au formulaire de plainte',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Meta plainte', { $ref: '#/components/schemas/ComplaintMeta' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers, a la Justice et aux administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/complaints': {
      get: {
        tags: ['Plaintes'],
        summary: 'Liste les plaintes avec filtres',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Recherche libre auteur/plaignant/objet/corps' },
          { in: 'query', name: 'objet', schema: { type: 'string' }, description: 'Filtre exact sur l objet de plainte' },
          { in: 'query', name: 'author', schema: { type: 'string' }, description: 'Filtre partiel sur le pseudo auteur' },
          { in: 'query', name: 'plaintiff', schema: { type: 'string' }, description: 'Filtre partiel sur le plaignant' },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['newest', 'oldest'], example: 'newest' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', example: 50 } }
        ],
        responses: {
          '200': jsonResponse('Plaintes filtrees', {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/Complaint' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers, a la Justice et aux administrateurs', errorSchema)
        }
      },
      post: {
        tags: ['Plaintes'],
        summary: 'Enregistre une nouvelle plainte',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            officerNom: { type: 'string', example: 'Akibane' },
            officerPrenom: { type: 'string', example: 'Joshi' },
            officerGradeSection: { type: 'string', example: 'Chunin Patrouilleur' },
            plaintiffNom: { type: 'string', example: 'Uchiha' },
            plaintiffPrenom: { type: 'string', example: 'Shinra' },
            plaintiffGrade: { type: 'string', example: 'Chunin' },
            accusedNom: { type: 'string', example: 'Kurokaze' },
            accusedPrenom: { type: 'string', example: 'Ryu' },
            date: { type: 'string', example: '14/04/2026' },
            objet: { type: 'string', example: 'C - Infractions Civiles' },
            body: { type: 'string', example: 'Le plaignant detaille ici les faits, leur contexte et les personnes impliquees.' }
          },
          required: ['officerNom', 'officerPrenom', 'officerGradeSection', 'plaintiffNom', 'plaintiffPrenom', 'plaintiffGrade', 'accusedNom', 'accusedPrenom', 'date', 'objet', 'body']
        }),
        responses: {
          '200': jsonResponse('Plainte creee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              complaint: { $ref: '#/components/schemas/Complaint' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/complaints/{id}': {
      put: {
        tags: ['Plaintes'],
        summary: 'Modifie uniquement le corps d une plainte',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de plainte', 'plainte-a1b2c3d4xyz')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            body: { type: 'string', example: 'Corps de plainte corrige par un inspecteur ou administrateur.' }
          },
          required: ['body']
        }),
        responses: {
          '200': jsonResponse('Plainte modifiee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              complaint: { $ref: '#/components/schemas/Complaint' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Modification reservee aux inspecteurs+ police et aux administrateurs', errorSchema),
          '404': jsonResponse('Plainte introuvable', errorSchema)
        }
      },
      delete: {
        tags: ['Plaintes'],
        summary: 'Supprime une plainte',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de plainte', 'plainte-a1b2c3d4xyz')],
        responses: {
          '200': jsonResponse('Plainte supprimee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Suppression reservee aux inspecteurs+ police et aux administrateurs', errorSchema),
          '404': jsonResponse('Plainte introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/meta': {
      get: {
        tags: ['Enquetes'],
        summary: 'Retourne les metadonnees utiles au module Enquetes',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Meta enquetes', { $ref: '#/components/schemas/InvestigationMeta' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+, a la Justice et aux administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/investigations': {
      get: {
        tags: ['Enquetes'],
        summary: 'Liste les enquetes avec filtres',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Recherche libre sur titre, statut, auteur, resume et agent assigne' },
          { in: 'query', name: 'status', schema: { type: 'string' }, description: 'Filtre exact sur le statut d enquete' },
          { in: 'query', name: 'assignedAgent', schema: { type: 'string' }, description: 'Filtre partiel sur l agent assigne' },
          { in: 'query', name: 'author', schema: { type: 'string' }, description: 'Filtre partiel sur l auteur' },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['updated', 'created', 'oldest'] }, description: 'updated par defaut' },
          { in: 'query', name: 'limit', schema: { type: 'integer', example: 80 } }
        ],
        responses: {
          '200': jsonResponse('Enquetes filtrees', {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/Investigation' } }
            },
            required: ['items']
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+, a la Justice et aux administrateurs', errorSchema)
        }
      },
      post: {
        tags: ['Enquetes'],
        summary: 'Cree une nouvelle enquete',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            title: { type: 'string', example: 'Trafic discret au pont nord' },
            status: { type: 'string', example: 'En cours' },
            assignedAgent: { type: 'string', example: 'soullera' },
            summary: { type: 'string', example: 'Ouverture d enquete apres recoupement de plusieurs signalements.' }
          },
          required: ['title']
        }),
        responses: {
          '200': jsonResponse('Enquete creee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'investigation']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Creation reservee aux inspecteurs+ et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}': {
      get: {
        tags: ['Enquetes'],
        summary: 'Retourne une enquete complete',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34')],
        responses: {
          '200': jsonResponse('Detail d enquete', {
            type: 'object',
            properties: {
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['investigation']
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+, a la Justice et aux administrateurs', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      },
      put: {
        tags: ['Enquetes'],
        summary: 'Met a jour les informations generales d une enquete',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            title: { type: 'string', example: 'Trafic discret au pont nord' },
            status: { type: 'string', example: 'En attente de preuves' },
            assignedAgent: { type: 'string', example: 'soullera' },
            summary: { type: 'string', example: 'Surveillance maintenue dans l attente d une preuve materielle.' }
          }
        }),
        responses: {
          '200': jsonResponse('Enquete mise a jour', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'investigation']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Modification reservee aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      },
      delete: {
        tags: ['Enquetes'],
        summary: 'Supprime une enquete',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34')],
        responses: {
          '200': jsonResponse('Enquete supprimee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            },
            required: ['success']
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Suppression reservee aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/updates': {
      post: {
        tags: ['Enquetes'],
        summary: 'Ajoute une entree de suivi, temoignage ou note interne',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            kind: { type: 'string', example: 'Suivi' },
            content: { type: 'string', example: 'Poursuite des auditions de voisinage.' }
          },
          required: ['kind', 'content']
        }),
        responses: {
          '200': jsonResponse('Entree ajoutee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              entry: { $ref: '#/components/schemas/InvestigationUpdateRecord' },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'entry', 'investigation']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Ajout de suivi reserve aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/links': {
      post: {
        tags: ['Enquetes'],
        summary: 'Ajoute une liaison vers un dossier, une plainte ou un rapport',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            linkType: { type: 'string', enum: ['dossier', 'complaint', 'incident_report', 'patrol_report'], example: 'dossier' },
            linkedId: { type: 'string', example: 'uchiha|shinra' },
            linkedLabel: { type: 'string', example: 'Shinra Uchiha' },
            linkedMeta: { type: 'object', additionalProperties: true, example: { reportCount: 3, suspectGrade: 'Chunin' } }
          },
          required: ['linkType', 'linkedId', 'linkedLabel']
        }),
        responses: {
          '200': jsonResponse('Liaison ajoutee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              link: { $ref: '#/components/schemas/InvestigationLinkRecord' },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'link', 'investigation']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Ajout de lien reserve aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/links/{linkId}': {
      delete: {
        tags: ['Enquetes'],
        summary: 'Supprime une liaison d enquete',
        security: bearerSecurity(),
        parameters: [
          pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34'),
          pathParam('linkId', 'Identifiant de liaison', 'enq-link-ab12cd34')
        ],
        responses: {
          '200': jsonResponse('Liaison supprimee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              removed: { $ref: '#/components/schemas/InvestigationLinkRecord' },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'removed', 'investigation']
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Suppression de lien reservee aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete ou liaison introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/attachments': {
      post: {
        tags: ['Enquetes'],
        summary: 'Ajoute une piece jointe image a une enquete',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            filename: { type: 'string', example: 'photo-scene' },
            mimeType: { type: 'string', example: 'image/png' },
            dataUrl: { type: 'string', example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...' },
            caption: { type: 'string', example: 'Porte fracturée à l entrée nord.' }
          },
          required: ['filename', 'mimeType', 'dataUrl']
        }),
        responses: {
          '200': jsonResponse('Piece jointe ajoutee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              attachment: { $ref: '#/components/schemas/InvestigationAttachmentRecord' },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'attachment', 'investigation']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Ajout de piece jointe reserve aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/transfer-to-dri': {
      post: {
        tags: ['Enquetes'],
        summary: 'Transfère une enquête police vers le module DRI',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de l enquete', 'inv-ab12cd34')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            targetType: { type: 'string', enum: ['internal', 'external'], example: 'internal', description: 'Type de module DRI cible' }
          },
          required: ['targetType']
        }),
        responses: {
          '200': jsonResponse('Enquete transferee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              targetType: { type: 'string', example: 'internal' },
              item: { $ref: '#/components/schemas/DriInvestigation' }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Reserve aux agents DRI', errorSchema),
          '404': jsonResponse('Enquete introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/attachments/{attachmentId}': {
      delete: {
        tags: ['Enquetes'],
        summary: 'Supprime une piece jointe d enquete',
        security: bearerSecurity(),
        parameters: [
          pathParam('id', 'Identifiant d enquete', 'enq-ab12cd34'),
          pathParam('attachmentId', 'Identifiant de piece jointe', 'enq-file-ab12cd34')
        ],
        responses: {
          '200': jsonResponse('Piece jointe supprimee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              removed: { $ref: '#/components/schemas/InvestigationAttachmentRecord' },
              investigation: { $ref: '#/components/schemas/Investigation' }
            },
            required: ['success', 'removed', 'investigation']
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Suppression de piece jointe reservee aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Enquete ou piece jointe introuvable', errorSchema)
        }
      }
    },
    '/api/v1/investigations/{id}/attachments/{attachmentId}/file': {
      get: {
        tags: ['Enquetes'],
        summary: 'Telechargement direct d une piece jointe d enquete',
        security: bearerSecurity(),
        parameters: [
          pathParam('id', 'Identifiant de l enquete', 'inv-ab12cd34'),
          pathParam('attachmentId', 'Identifiant de la piece jointe', 'att-ab12cd34')
        ],
        responses: {
          '200': {
            description: 'Fichier binaire de la piece jointe',
            content: {
              'image/*': { schema: { type: 'string', format: 'binary' } },
              'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
            }
          },
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux chefs d unite+', errorSchema),
          '404': jsonResponse('Piece jointe introuvable', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/meta': {
      get: {
        tags: ['Police Academie'],
        summary: 'Retourne les metadonnees utiles au module Police Academie',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Meta Police Academie', { $ref: '#/components/schemas/PoliceAcademyMeta' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+, a la Justice et aux administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/police-academies': {
      get: {
        tags: ['Police Academie'],
        summary: 'Liste les candidats Police Academie archives ou les lignes d une session',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Recherche libre sur recrue, commentaire ou grade' },
          { in: 'query', name: 'officer', schema: { type: 'string' }, description: 'Filtre partiel sur l evaluateur' },
          { in: 'query', name: 'candidate', schema: { type: 'string' }, description: 'Filtre partiel sur la recrue' },
          { in: 'query', name: 'sessionId', schema: { type: 'string', example: 'pas-ab12cd34xyz567' }, description: 'Retourne les candidats d une session precise' },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['newest', 'oldest'], example: 'newest' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', example: 50 } }
        ],
        responses: {
          '200': jsonResponse('Candidats Police Academie filtres', {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/PoliceAcademy' } }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+, a la Justice et aux administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/sessions/active': {
      get: {
        tags: ['Police Academie'],
        summary: 'Retourne la session Police Academie active du redacteur courant',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Session active courante', { $ref: '#/components/schemas/PoliceAcademyActiveSession' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Creation reservee aux inspecteurs+ et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/sessions': {
      post: {
        tags: ['Police Academie'],
        summary: 'Cree ou reprend une session moderne multi-candidats',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            officerNom: { type: 'string', example: 'Akibane' },
            officerPrenom: { type: 'string', example: 'Joshi' },
            officerGradeSection: { type: 'string', example: 'Inspecteur' }
          },
          required: ['officerNom', 'officerPrenom', 'officerGradeSection']
        }),
        responses: {
          '200': jsonResponse('Session creee ou reprise', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              session: { $ref: '#/components/schemas/PoliceAcademySession' },
              resumed: { type: 'boolean', example: false }
            },
            required: ['success', 'session', 'resumed']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Creation reservee aux inspecteurs+ et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/sessions/{id}': {
      get: {
        tags: ['Police Academie'],
        summary: 'Retourne une session Police Academie et ses candidats',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de session Police Academie', 'pas-ab12cd34xyz567')],
        responses: {
          '200': jsonResponse('Detail de session Police Academie', { $ref: '#/components/schemas/PoliceAcademySessionDetails' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux inspecteurs+, a la Justice et aux administrateurs', errorSchema),
          '404': jsonResponse('Session de Police Academie introuvable', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/sessions/{id}/finalize': {
      post: {
        tags: ['Police Academie'],
        summary: 'Finalise une session et marque chaque candidat en reussite ou echec',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de session Police Academie', 'pas-ab12cd34xyz567')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  candidateId: { type: 'string', example: 'pa-ab12cd34xyz567' },
                  outcome: { type: 'string', enum: ['success', 'failure'], example: 'success' }
                },
                required: ['candidateId', 'outcome']
              }
            }
          },
          required: ['results']
        }),
        responses: {
          '200': jsonResponse('Session finalisee', { $ref: '#/components/schemas/PoliceAcademyFinalizeResponse' }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Finalisation reservee aux inspecteurs+ createurs de la session et aux administrateurs', errorSchema),
          '404': jsonResponse('Session de Police Academie introuvable', errorSchema),
          '409': jsonResponse('Cette Police Academie est deja finalisee', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/rows': {
      post: {
        tags: ['Police Academie'],
        summary: 'Ajoute un candidat dans une session ou cree une ligne archivee',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            sessionId: { type: 'string', nullable: true, example: 'pas-ab12cd34xyz567' },
            officerNom: { type: 'string', example: 'Akibane' },
            officerPrenom: { type: 'string', example: 'Joshi' },
            officerGradeSection: { type: 'string', example: 'Inspecteur' },
            candidateNom: { type: 'string', example: 'Uchiha' },
            candidatePrenom: { type: 'string', example: 'Shinra' },
            candidateAge: { type: 'string', example: '17' },
            chakraNature: { type: 'string', example: 'Katon' },
            kg: { type: 'string', example: 'Aucun' },
            armyRank: { type: 'string', example: 'Genin Confirme' },
            epreuve1: { type: 'string', example: 'Reussie' },
            epreuve2: { type: 'string', example: 'Reussie' },
            epreuve3: { type: 'string', example: 'Non reussie' },
            commentaire: { type: 'string', example: 'Bonne tenue generale, vigilance a renforcer.' }
          }
        }),
        responses: {
          '200': jsonResponse('Candidat ajoute', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              row: { $ref: '#/components/schemas/PoliceAcademy' }
            },
            required: ['success', 'row']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Creation reservee aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Session de Police Academie introuvable', errorSchema),
          '409': jsonResponse('Cette Police Academie est deja finalisee, impossible d ajouter un candidat', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/{id}': {
      patch: {
        tags: ['Police Academie'],
        summary: 'Modifie un candidat Police Academie',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de candidat Police Academie', 'pa-ab12cd34xyz567')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            officerNom: { type: 'string', example: 'Akibane' },
            officerPrenom: { type: 'string', example: 'Joshi' },
            officerGradeSection: { type: 'string', example: 'Inspecteur' },
            candidateNom: { type: 'string', example: 'Uchiha' },
            candidatePrenom: { type: 'string', example: 'Shinra' },
            candidateAge: { type: 'string', example: '17' },
            chakraNature: { type: 'string', example: 'Katon' },
            kg: { type: 'string', example: 'Aucun' },
            armyRank: { type: 'string', example: 'Genin Confirme' },
            epreuve1: { type: 'string', example: 'Reussie' },
            epreuve2: { type: 'string', example: 'Reussie' },
            epreuve3: { type: 'string', example: 'Non reussie' },
            commentaire: { type: 'string', example: 'Bonne tenue generale, vigilance a renforcer.' }
          }
        }),
        responses: {
          '200': jsonResponse('Candidat modifie', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              academy: { $ref: '#/components/schemas/PoliceAcademy' }
            },
            required: ['success', 'academy']
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Modification reservee aux createurs de la session et aux administrateurs', errorSchema),
          '404': jsonResponse('Candidat Police Academie introuvable', errorSchema)
        }
      },
      delete: {
        tags: ['Police Academie'],
        summary: 'Supprime un candidat Police Academie',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de candidat Police Academie', 'pa-ab12cd34xyz567')],
        responses: {
          '200': jsonResponse('Candidat supprime', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              academy: { $ref: '#/components/schemas/PoliceAcademy' }
            },
            required: ['success', 'academy']
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Suppression reservee aux createurs de la session et aux administrateurs', errorSchema),
          '404': jsonResponse('Candidat Police Academie introuvable', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/session': {
      post: {
        tags: ['Police Academie'],
        summary: 'Legacy: ouvre ou reprend une ancienne session mono-candidat',
        deprecated: true,
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            officerNom: { type: 'string', example: 'Akibane' },
            officerPrenom: { type: 'string', example: 'Joshi' },
            officerGradeSection: { type: 'string', example: 'Inspecteur' }
          },
          required: ['officerNom', 'officerPrenom', 'officerGradeSection']
        }),
        responses: {
          '200': jsonResponse('Session legacy active', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              session: { $ref: '#/components/schemas/PoliceAcademy' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Creation reservee aux inspecteurs+ et administrateurs', errorSchema)
        }
      }
    },
    '/api/v1/police-academies/{id}/complete': {
      post: {
        tags: ['Police Academie'],
        summary: 'Legacy: cloture une ancienne Police Academie mono-candidat',
        deprecated: true,
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de session Police Academie', 'pa-ab12cd34xyz567')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            officerNom: { type: 'string', example: 'Akibane' },
            officerPrenom: { type: 'string', example: 'Joshi' },
            officerGradeSection: { type: 'string', example: 'Inspecteur' },
            candidateNom: { type: 'string', example: 'Uchiha' },
            candidatePrenom: { type: 'string', example: 'Shinra' },
            candidateAge: { type: 'string', example: '17' },
            chakraNature: { type: 'string', example: 'Katon' },
            kg: { type: 'string', example: 'Aucun' },
            armyRank: { type: 'string', example: 'Genin Confirme' },
            epreuve1: { type: 'string', example: 'Reussie' },
            epreuve2: { type: 'string', example: 'Reussie' },
            epreuve3: { type: 'string', example: 'Non reussie' },
            commentaire: { type: 'string', example: 'Bonne tenue generale, vigilance a renforcer.' }
          },
          required: ['officerNom', 'officerPrenom', 'officerGradeSection', 'candidateNom', 'candidatePrenom', 'candidateAge', 'chakraNature', 'kg', 'armyRank', 'epreuve1', 'epreuve2', 'epreuve3', 'commentaire']
        }),
        responses: {
          '200': jsonResponse('Police Academie cloturee', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              academy: { $ref: '#/components/schemas/PoliceAcademy' }
            }
          }),
          '400': jsonResponse('Validation echouee', errorSchema),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Creation reservee aux inspecteurs+ et administrateurs', errorSchema),
          '404': jsonResponse('Session introuvable ou deja cloturee', errorSchema)
        }
      }
    },
    '/api/v1/history': {
      get: {
        tags: ['Historique'],
        summary: 'Liste l audit log staff',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'action', schema: { type: 'string' } },
          { in: 'query', name: 'entityType', schema: { type: 'string' } },
          { in: 'query', name: 'actor', schema: { type: 'string' } },
          { in: 'query', name: 'entityId', schema: { type: 'string' } },
          { in: 'query', name: 'q', schema: { type: 'string' } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', example: '2026-04-01' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', example: '2026-04-08' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', example: 50 } }
        ],
        responses: {
          '200': jsonResponse('Historique filtre', {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/HistoryItem' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux lieutenants, commandants et administrateurs', errorSchema)
        }
      },
      delete: {
        tags: ['Historique'],
        summary: 'Efface entierement l historique staff',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Historique efface', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Seul un administrateur peut effacer l historique', errorSchema)
        }
      }
    },
    '/api/v1/service/me': {
      get: {
        tags: ['Service'],
        summary: 'Retourne la session active et l historique recent du policier courant',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Etat du service courant', {
            type: 'object',
            properties: {
              activeSession: {
                oneOf: [
                  { $ref: '#/components/schemas/ServiceSession' },
                  { type: 'null' }
                ]
              },
              history: {
                type: 'array',
                items: { $ref: '#/components/schemas/ServiceSession' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers', errorSchema)
        }
      }
    },
    '/api/v1/service/toggle': {
      post: {
        tags: ['Service'],
        summary: 'Demarre ou arrete la prise de service du policier courant',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Etat de service bascule', {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              status: { type: 'string', enum: ['started', 'stopped'], example: 'started' },
              session: { $ref: '#/components/schemas/ServiceSession' },
              activeSession: {
                oneOf: [
                  { $ref: '#/components/schemas/ServiceSession' },
                  { type: 'null' }
                ]
              },
              history: {
                type: 'array',
                items: { $ref: '#/components/schemas/ServiceSession' }
              }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux policiers', errorSchema)
        }
      }
    },
    '/api/v1/openapi.json': {
      get: {
        tags: ['Docs'],
        summary: 'Retourne cette specification OpenAPI',
        responses: {
          '200': jsonResponse('Specification OpenAPI', {
            type: 'object',
            additionalProperties: true
          })
        }
      }
    }
  });

  Object.assign(paths, {
    '/api/v1/dri/meta': {
      get: {
        tags: ['DRI'],
        summary: 'Retourne les options de referentiel DRI (rangs, clans, statuts, etc.)',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Meta DRI', { $ref: '#/components/schemas/DriMeta' }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
        }
      }
    },
    '/api/v1/dri/ninjas': {
      get: {
        tags: ['DRI'],
        summary: 'Liste les fiches ninja DRI',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Liste des fiches ninja', {
            type: 'object',
            properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DriNinja' } } }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
        }
      },
      post: {
        tags: ['DRI'],
        summary: 'Cree une fiche ninja',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            fullName: { type: 'string', example: 'Uchiha Madara' },
            category: { type: 'string', example: 'Deserteur (nukenin)' },
            clan: { type: 'string', example: 'Uchiha' },
            rank: { type: 'string', example: 'S' },
            section: { type: 'string', example: 'Forces Speciales' },
            nature: { type: 'string', example: 'Katon' },
            kekkaiGenkai: { type: 'string', example: 'Aucun' },
            artefact: { type: 'string', example: 'Aucun' },
            photoDataUrl: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true }
          },
          required: ['fullName', 'category', 'clan', 'rank', 'section', 'nature', 'kekkaiGenkai', 'artefact']
        }),
        responses: {
          '200': jsonResponse('Fiche creee', {
            type: 'object',
            properties: { success: { type: 'boolean' }, ninja: { $ref: '#/components/schemas/DriNinja' } }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
        }
      }
    },
    '/api/v1/dri/ninjas/{id}': {
      put: {
        tags: ['DRI'],
        summary: 'Met a jour une fiche ninja',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de la fiche ninja', 'nin-ab12cd34')],
        requestBody: jsonBody({ $ref: '#/components/schemas/DriNinja' }),
        responses: {
          '200': jsonResponse('Fiche mise a jour', {
            type: 'object',
            properties: { success: { type: 'boolean' }, ninja: { $ref: '#/components/schemas/DriNinja' } }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
          '404': jsonResponse('Fiche introuvable', errorSchema)
        }
      },
      delete: {
        tags: ['DRI'],
        summary: 'Supprime une fiche ninja',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de la fiche ninja', 'nin-ab12cd34')],
        responses: {
          '200': jsonResponse('Fiche supprimee', { type: 'object', properties: { success: { type: 'boolean' } } }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
          '404': jsonResponse('Fiche introuvable', errorSchema)
        }
      }
    },
    '/api/v1/dri/artifacts': {
      get: {
        tags: ['DRI'],
        summary: 'Liste les artefacts suivis par la DRI',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Liste des artefacts', {
            type: 'object',
            properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DriArtifact' } } }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
        }
      },
      post: {
        tags: ['DRI'],
        summary: 'Cree une fiche artefact',
        security: bearerSecurity(),
        requestBody: jsonBody({
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Samehada' },
            holderName: { type: 'string', nullable: true },
            status: { type: 'string', example: 'Perdu' },
            classification: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true }
          },
          required: ['name', 'status']
        }),
        responses: {
          '200': jsonResponse('Artefact cree', {
            type: 'object',
            properties: { success: { type: 'boolean' }, artifact: { $ref: '#/components/schemas/DriArtifact' } }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
        }
      }
    },
    '/api/v1/dri/artifacts/{id}': {
      put: {
        tags: ['DRI'],
        summary: 'Met a jour une fiche artefact',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de l artefact', 'art-ab12cd34')],
        requestBody: jsonBody({ $ref: '#/components/schemas/DriArtifact' }),
        responses: {
          '200': jsonResponse('Artefact mis a jour', {
            type: 'object',
            properties: { success: { type: 'boolean' }, artifact: { $ref: '#/components/schemas/DriArtifact' } }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
          '404': jsonResponse('Artefact introuvable', errorSchema)
        }
      },
      delete: {
        tags: ['DRI'],
        summary: 'Supprime une fiche artefact',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de l artefact', 'art-ab12cd34')],
        responses: {
          '200': jsonResponse('Artefact supprime', { type: 'object', properties: { success: { type: 'boolean' } } }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
          '404': jsonResponse('Artefact introuvable', errorSchema)
        }
      }
    }
  });

  function buildDriInvestigationPaths(prefix, typeLabel) {
    return {
      [`/api/v1/dri/${prefix}-investigations`]: {
        get: {
          tags: ['DRI'],
          summary: `Liste les enquetes DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [
            { in: 'query', name: 'q', schema: { type: 'string' } },
            { in: 'query', name: 'status', schema: { type: 'string' } },
            { in: 'query', name: 'assignedAgent', schema: { type: 'string' } },
            { in: 'query', name: 'sort', schema: { type: 'string', example: 'updated' } },
            { in: 'query', name: 'limit', schema: { type: 'integer', example: 50 } }
          ],
          responses: {
            '200': jsonResponse(`Enquetes ${typeLabel}`, {
              type: 'object',
              properties: { items: { type: 'array', items: { $ref: '#/components/schemas/DriInvestigation' } } }
            }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
          }
        },
        post: {
          tags: ['DRI'],
          summary: `Cree une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          requestBody: jsonBody({
            type: 'object',
            properties: {
              title: { type: 'string', example: 'Operation Sombre Horizon' },
              status: { type: 'string', example: 'En cours' },
              assignedAgents: { type: 'array', items: { type: 'string' } },
              summary: { type: 'string' },
              notes: { type: 'string' }
            },
            required: ['title', 'status']
          }),
          responses: {
            '200': jsonResponse('Enquete creee', {
              type: 'object',
              properties: { success: { type: 'boolean' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } }
            }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}`]: {
        get: {
          tags: ['DRI'],
          summary: `Retourne une enquete DRI ${typeLabel} avec ses details`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          responses: {
            '200': jsonResponse('Enquete DRI', { type: 'object', properties: { investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        },
        put: {
          tags: ['DRI'],
          summary: `Met a jour une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          requestBody: jsonBody({ $ref: '#/components/schemas/DriInvestigation' }),
          responses: {
            '200': jsonResponse('Enquete mise a jour', { type: 'object', properties: { success: { type: 'boolean' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        },
        delete: {
          tags: ['DRI'],
          summary: `Supprime une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          responses: {
            '200': jsonResponse('Enquete supprimee', { type: 'object', properties: { success: { type: 'boolean' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/updates`]: {
        post: {
          tags: ['DRI'],
          summary: `Ajoute un suivi a une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              kind: { type: 'string', example: 'Suivi' },
              content: { type: 'string', example: 'Surveillance renforcee dans le secteur nord.' }
            },
            required: ['kind', 'content']
          }),
          responses: {
            '200': jsonResponse('Suivi ajoute', { type: 'object', properties: { success: { type: 'boolean' }, entry: { $ref: '#/components/schemas/InvestigationUpdateRecord' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/links`]: {
        post: {
          tags: ['DRI'],
          summary: `Ajoute un lien a une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              linkType: { type: 'string', example: 'report' },
              linkedId: { type: 'string', example: 'rep-ab12cd34' },
              linkedLabel: { type: 'string', example: 'Rapport d incident' },
              linkedMeta: { type: 'object', additionalProperties: true }
            },
            required: ['linkType', 'linkedId', 'linkedLabel']
          }),
          responses: {
            '200': jsonResponse('Lien ajoute', { type: 'object', properties: { success: { type: 'boolean' }, link: { $ref: '#/components/schemas/InvestigationLinkRecord' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/links/{linkId}`]: {
        delete: {
          tags: ['DRI'],
          summary: `Supprime un lien d une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [
            pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`),
            pathParam('linkId', 'Identifiant du lien', 'lnk-ab12cd34')
          ],
          responses: {
            '200': jsonResponse('Lien supprime', { type: 'object', properties: { success: { type: 'boolean' }, removed: { $ref: '#/components/schemas/InvestigationLinkRecord' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Lien ou enquete introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/attachments`]: {
        post: {
          tags: ['DRI'],
          summary: `Ajoute une piece jointe a une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          requestBody: jsonBody({
            type: 'object',
            properties: {
              filename: { type: 'string', example: 'photo-suspect.jpg' },
              mimeType: { type: 'string', example: 'image/jpeg' },
              dataUrl: { type: 'string', example: 'data:image/jpeg;base64,...' },
              caption: { type: 'string', nullable: true }
            },
            required: ['filename', 'mimeType', 'dataUrl']
          }),
          responses: {
            '200': jsonResponse('Piece jointe ajoutee', { type: 'object', properties: { success: { type: 'boolean' }, attachment: { $ref: '#/components/schemas/InvestigationAttachmentRecord' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/attachments/{attachmentId}`]: {
        delete: {
          tags: ['DRI'],
          summary: `Supprime une piece jointe d une enquete DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [
            pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`),
            pathParam('attachmentId', 'Identifiant de la piece jointe', 'att-ab12cd34')
          ],
          responses: {
            '200': jsonResponse('Piece jointe supprimee', { type: 'object', properties: { success: { type: 'boolean' }, removed: { $ref: '#/components/schemas/InvestigationAttachmentRecord' }, investigation: { $ref: '#/components/schemas/DriInvestigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Piece jointe ou enquete introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/attachments/{attachmentId}/file`]: {
        get: {
          tags: ['DRI'],
          summary: `Telechargement direct d une piece jointe DRI ${typeLabel}`,
          security: bearerSecurity(),
          parameters: [
            pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`),
            pathParam('attachmentId', 'Identifiant de la piece jointe', 'att-ab12cd34')
          ],
          responses: {
            '200': { description: 'Fichier binaire', content: { 'image/*': { schema: { type: 'string', format: 'binary' } }, 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Acces reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Piece jointe introuvable', errorSchema)
          }
        }
      },
      [`/api/v1/dri/${prefix}-investigations/{id}/transfer-to-police`]: {
        post: {
          tags: ['DRI'],
          summary: `Transfère une enquete DRI ${typeLabel} vers le module Police`,
          security: bearerSecurity(),
          parameters: [pathParam('id', 'Identifiant de l enquete DRI', `dri-${prefix.slice(0, 3)}-ab12cd34`)],
          responses: {
            '200': jsonResponse('Enquete transferee', { type: 'object', properties: { success: { type: 'boolean' }, item: { $ref: '#/components/schemas/Investigation' } } }),
            '401': jsonResponse('Non authentifie', errorSchema),
            '403': jsonResponse('Reserve aux agents DRI', errorSchema),
            '404': jsonResponse('Enquete introuvable', errorSchema)
          }
        }
      }
    };
  }

  Object.assign(paths, buildDriInvestigationPaths('internal', 'internes'));
  Object.assign(paths, buildDriInvestigationPaths('external', 'externes'));

  Object.assign(paths, {
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Liste les notifications du compte courant',
        security: bearerSecurity(),
        parameters: [
          { in: 'query', name: 'limit', schema: { type: 'integer', example: 30 } }
        ],
        responses: {
          '200': jsonResponse('Notifications', {
            type: 'object',
            properties: {
              unreadCount: { type: 'integer', example: 2 },
              items: { type: 'array', items: { $ref: '#/components/schemas/Notification' } }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '403': jsonResponse('Notifications indisponibles pour ce profil', errorSchema)
        }
      }
    },
    '/api/v1/notifications/{id}/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Marque une notification comme lue',
        security: bearerSecurity(),
        parameters: [pathParam('id', 'Identifiant de la notification', 'notif-ab12cd34')],
        responses: {
          '200': jsonResponse('Notification marquee comme lue', {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              item: { $ref: '#/components/schemas/Notification' },
              unreadCount: { type: 'integer' }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema),
          '404': jsonResponse('Notification introuvable', errorSchema)
        }
      }
    },
    '/api/v1/notifications/read-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Marque toutes les notifications du compte comme lues',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Toutes les notifications marquees comme lues', {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              updated: { type: 'integer', example: 3 },
              unreadCount: { type: 'integer', example: 0 }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/api/v1/notifications/clear-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Supprime toutes les notifications du compte',
        security: bearerSecurity(),
        responses: {
          '200': jsonResponse('Toutes les notifications supprimees', {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              deleted: { type: 'integer', example: 5 },
              unreadCount: { type: 'integer', example: 0 }
            }
          }),
          '401': jsonResponse('Non authentifie', errorSchema)
        }
      }
    },
    '/api/login-hall/stream': {
      get: {
        tags: ['Login Hall'],
        summary: 'Flux SSE de presence en temps reel sur la page de connexion',
        description: 'Server-Sent Events. Le client recoit un evenement `peers` a chaque changement de presence dans le hall de connexion.',
        responses: {
          '200': {
            description: 'Flux SSE continu',
            content: {
              'text/event-stream': {
                schema: { type: 'string', example: 'data: {"peers":[...]}\n\n' }
              }
            }
          }
        }
      }
    },
    '/api/login-hall/snapshot': {
      get: {
        tags: ['Login Hall'],
        summary: 'Snapshot instantane de la presence dans le hall de connexion',
        responses: {
          '200': jsonResponse('Snapshot presence', {
            type: 'object',
            properties: {
              peers: { type: 'array', items: { $ref: '#/components/schemas/LoginHallEntry' } }
            }
          })
        }
      }
    },
    '/api/login-hall/presence': {
      post: {
        tags: ['Login Hall'],
        summary: 'Envoie un ping de presence dans le hall de connexion',
        requestBody: jsonBody({
          type: 'object',
          properties: {
            id: { type: 'string', example: 'peer-abc123' },
            pseudo: { type: 'string', nullable: true, example: 'Akirabane' },
            type: { type: 'string', enum: ['police', 'guest'], example: 'police' }
          },
          required: ['id', 'type']
        }),
        responses: {
          '200': jsonResponse('Presence enregistree', { type: 'object', properties: { ok: { type: 'boolean' } } }),
          '400': jsonResponse('Presence invalide', errorSchema)
        }
      }
    },
    '/api/login-hall/presence/{id}': {
      delete: {
        tags: ['Login Hall'],
        summary: 'Retire une entree de presence du hall de connexion',
        parameters: [pathParam('id', 'Identifiant de presence', 'peer-abc123')],
        responses: {
          '200': jsonResponse('Presence retiree', { type: 'object', properties: { ok: { type: 'boolean' } } })
        }
      }
    }
  });

  return {
    openapi: '3.0.3',
    info: {
      title: 'Police Militaire de Konoha - API',
      version: '2.12.0',
      description: 'API publique et endpoints proteges pour le registre, la presence, le status systeme, le code penal, l administration des comptes, les rapports, les plaintes, les enquetes, les dossiers, la prise de service, le dashboard hebdomadaire et le module Police Academie moderne par sessions.'
    },
    servers: [
      { url: 'https://zenkai-police.tech', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local' }
    ],
    tags,
    components,
    paths
  };
}

module.exports = { buildOpenApi };
