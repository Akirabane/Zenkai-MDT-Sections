const { z } = require('zod');
const { getPasswordPolicyError } = require('../services/password-policy');

const pseudoSchema = z.string().trim().min(2, 'Le pseudo doit faire au moins 2 caracteres').max(30, 'Le pseudo doit faire au plus 30 caracteres');
const optionalTrimmed = z.string().optional().transform((value) => (value || '').trim());
const passwordSchema = z.string().superRefine((value, ctx) => {
  const error = getPasswordPolicyError(value);
  if (!error) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: error
  });
});

const registerSchema = z.object({
  pseudo: pseudoSchema,
  password: passwordSchema,
  secret: z.string().min(1, 'Code secret requis')
});

const loginSchema = z.object({
  pseudo: pseudoSchema,
  password: z.string().min(1, 'Mot de passe requis')
});

const avatarSchema = z.object({
  avatar: z.string().min(1, 'Donnees avatar invalides').max(600000, 'Image trop volumineuse (max ~450 Ko).')
});

const linkUserSchema = z.object({
  pseudoHRP: z.union([z.string().trim().min(1), z.null()]).optional().transform((value) => value || null)
});

const permissionSchema = z.object({
  permission: z.enum(['READ', 'UPDATE', 'ADMIN', 'JUSTICE'], 'Permission invalide')
});

const policeRoleSchema = z.object({
  policeRole: z.boolean()
});

const driRoleSchema = z.object({
  driRole: z.boolean()
});

const presencePingSchema = z.object({
  status: z.enum(['active', 'away', 'mobile']).default('active'),
  clientId: z.string().trim().min(1, 'clientId invalide').max(64, 'clientId invalide').optional()
});

const guestPingSchema = z.object({
  guestId: z.string().trim().min(1, 'guestId invalide').max(64, 'guestId invalide')
});

const membreSchema = z.object({
  pseudoHRP: z.string().trim().min(1, 'Chaque membre doit avoir un pseudo HRP'),
  nomRP: optionalTrimmed,
  grade: optionalTrimmed,
  chakra: optionalTrimmed,
  specialisation: optionalTrimmed,
  division: optionalTrimmed,
  rang: optionalTrimmed,
  dateArrivee: optionalTrimmed,
  notes: optionalTrimmed
});

const saveRegistrySchema = z.object({
  version: z.number().int().optional().default(1),
  lastUpdated: z.string().datetime().optional(),
  membres: z.array(membreSchema)
});

const updateMembreGradeSchema = z.object({
  discordPseudo: z.string().trim().min(1, 'Pseudo Discord requis'),
  grade: z.string().trim().min(1, 'Grade requis').max(100, 'Grade trop long')
});

// ── Column impact ──────────────────────────────────────────────────────────────
const codePenalColumnImpactSchema = z.object({
  displayInCasier: z.boolean().optional().default(false),
  autoFillInCasier: z.boolean().optional().default(false),
  usedInPenaltyCalc: z.boolean().optional().default(false),
  showInReports: z.boolean().optional().default(false),
  usedInStats: z.boolean().optional().default(false),
  exportToDocuments: z.boolean().optional().default(false)
}).optional().default({});

// ── Column definition ──────────────────────────────────────────────────────────
// key   = stable technical identifier, never changes after creation.
// label = display name, freely editable.
const codePenalColumnDefSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'La cle de colonne est requise')
    .max(64, 'Cle de colonne trop longue')
    .regex(/^[a-z0-9_]+$/i, 'La cle ne doit contenir que lettres, chiffres et underscores'),
  label: z.string().trim().min(1, 'Le label de colonne est requis').max(100, 'Label trop long'),
  type: z.enum(['text', 'number', 'money', 'duration', 'boolean', 'list', 'level', 'reference']).optional().default('text'),
  role: z.enum(['code', 'infraction', 'description', 'peine', 'status', 'notes', 'custom']).optional().default('custom'),
  impact: codePenalColumnImpactSchema,
  system: z.boolean().optional().default(false),
  required: z.boolean().optional().default(false),
  options: z.array(z.string().trim().min(1)).optional(),
  deletedAt: z.union([z.string(), z.null()]).optional().default(null)
});

// ── Row ────────────────────────────────────────────────────────────────────────
// .passthrough() keeps any custom column values (e.g. niveau_peine: 3) without
// stripping them. The system fields are still validated individually.
const codePenalRowSchema = z.object({
  uid: z.string().trim().max(64, 'uid trop long').optional().default(''),
  code: z.string().trim().min(1, 'Chaque ligne du code penal doit avoir un code'),
  infraction: z.string().trim().min(1, 'Chaque ligne du code penal doit avoir une infraction'),
  description: z.string().trim().min(1, 'Chaque ligne du code penal doit avoir une description'),
  peine: z.string().trim().min(1, 'Chaque ligne du code penal doit avoir une peine'),
  status: z.enum(['active', 'suspended', 'abrogated', 'provisional', 'temporary']).optional().default('active'),
  expiresAt: z.union([z.string(), z.null()]).optional().default(null),
  notes: z.string().trim().max(4000, 'Notes trop longues').optional().default('')
}).passthrough();

// ── Section ────────────────────────────────────────────────────────────────────
const codePenalSectionSchema = z.object({
  id: z.string().trim().min(1),
  cssClass: z.string().trim().min(1),
  title: z.string().trim().min(1),
  shortTitle: z.string().trim().min(1).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur de section invalide').optional(),
  codePrefix: z.string().trim().min(1).max(8).optional(),
  icon: z.string().trim().max(8).optional().default(''),
  preamble: z.string().trim().max(2000, 'Preambule de section trop long').optional().default(''),
  // Section-specific extra columns. Empty = use global columns only.
  columns: z.array(codePenalColumnDefSchema).optional().default([]),
  rows: z.array(codePenalRowSchema)
});

const codePenalLexiqueEntrySchema = z.object({
  label: optionalTrimmed,
  description: optionalTrimmed
});

const codePenalLexiqueSchema = z.object({
  detention: codePenalLexiqueEntrySchema.optional(),
  cellule: codePenalLexiqueEntrySchema.optional(),
  avertissement: codePenalLexiqueEntrySchema.extend({
    thresholdForSignalement: z.number().int().min(1).max(20).optional()
  }).optional(),
  signalement: codePenalLexiqueEntrySchema.extend({
    thresholdForJugement: z.number().int().min(1).max(20).optional()
  }).optional(),
  jugement: codePenalLexiqueEntrySchema.optional(),
  tig: codePenalLexiqueEntrySchema.optional(),
  rules: z.object({
    propagateEscalationToDossiers: z.boolean().optional()
  }).optional()
});

const codePenalSchema = z.object({
  schemaVersion: z.number().int().min(1).optional().default(1),
  // Global columns that apply to all sections unless a section defines its own.
  columns: z.array(codePenalColumnDefSchema).optional().default([]),
  sections: z.array(codePenalSectionSchema),
  lexique: codePenalLexiqueSchema.optional(),
  preamble: z.string().trim().max(4000, 'Preambule du document trop long').optional().default('')
});

// Partial schema for preview-impact requests — all top-level fields optional
// because the client may only send the columns without the full sections array.
const codePenalPreviewSchema = codePenalSchema.partial();

const codePenalPromoteColumnSchema = z.object({
  sectionId: z.string().trim().min(1, 'sectionId est requis').max(64),
  columnKey: z.string().trim().min(1, 'columnKey est requis').max(64).regex(/^[a-z0-9_]+$/i, 'columnKey invalide')
});

const complaintSchema = z.object({
  officerNom: z.string().trim().min(1, 'Nom du policier requis'),
  officerPrenom: z.string().trim().min(1, 'Prenom du policier requis'),
  officerGradeSection: z.string().trim().min(1, 'Grade section requis'),
  plaintiffNom: z.string().trim().min(1, 'Nom du plaignant requis'),
  plaintiffPrenom: z.string().trim().min(1, 'Prenom du plaignant requis'),
  plaintiffGrade: z.string().trim().min(1, 'Grade du plaignant requis'),
  accusedNom: z.string().trim().min(1, 'Nom de l accuse requis'),
  accusedPrenom: z.string().trim().min(1, 'Prenom de l accuse requis'),
  date: z.string().trim().min(1, 'Date des faits requise'),
  objet: z.string().trim().min(1, 'Objet de la plainte requis'),
  body: z.string().trim().min(10, 'Le corps de la plainte doit faire au moins 10 caracteres')
});

const complaintUpdateSchema = z.object({
  body: z.string().trim().min(10, 'Le corps de la plainte doit faire au moins 10 caracteres')
});

const investigationStatusOptions = [
  'En cours',
  'En attente de preuves',
  'En surveillance',
  'Transmise a la Justice',
  'Bouclee',
  'Suspendue'
];

const investigationUpdateKindOptions = [
  'Suivi',
  'Temoignage',
  'Note interne'
];

const assignedAgentNameSchema = z.string().trim().min(1, 'Agent attitre requis').max(80, 'Agent attitre trop long');

const investigationSchema = z.object({
  title: z.string().trim().min(3, 'Nom de l enquete requis').max(140, 'Nom de l enquete trop long'),
  status: z.enum(investigationStatusOptions).optional().default('En cours'),
  assignedAgent: assignedAgentNameSchema.optional(),
  assignedAgents: z.array(assignedAgentNameSchema).max(20, 'Trop d agents assignes').optional().default([]),
  summary: z.string().trim().max(600, 'Resume trop long').optional().default('')
});

const investigationUpdateSchema = z.object({
  title: z.string().trim().min(3, 'Nom de l enquete requis').max(140, 'Nom de l enquete trop long').optional(),
  status: z.enum(investigationStatusOptions).optional(),
  assignedAgent: assignedAgentNameSchema.optional(),
  assignedAgents: z.array(assignedAgentNameSchema).max(20, 'Trop d agents assignes').optional(),
  summary: z.string().trim().max(600, 'Resume trop long').optional()
});

const investigationEntrySchema = z.object({
  kind: z.enum(investigationUpdateKindOptions),
  content: z.string().trim().min(6, 'Le contenu du suivi est trop court').max(6000, 'Le contenu du suivi est trop long')
});

const investigationLinkSchema = z.object({
  linkType: z.enum(['dossier', 'complaint', 'incident_report', 'patrol_report']),
  linkedId: z.string().trim().min(1, 'Lien cible requis'),
  linkedLabel: z.string().trim().min(1, 'Libelle du lien requis').max(200, 'Libelle du lien trop long'),
  linkedMeta: z.record(z.any()).optional().default({})
});

const MAGIC_BYTES = {
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/webp': { riff: Buffer.from('RIFF'), webp: Buffer.from('WEBP') }
};

function validateMagicBytes(dataUrl, mimeType) {
  try {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return false;
    const buf = Buffer.from(base64.slice(0, 20), 'base64');
    if (mimeType === 'image/webp') {
      return buf.slice(0, 4).equals(MAGIC_BYTES['image/webp'].riff) &&
        buf.slice(8, 12).equals(MAGIC_BYTES['image/webp'].webp);
    }
    const magic = MAGIC_BYTES[mimeType];
    return magic ? buf.slice(0, magic.length).equals(magic) : false;
  } catch (_) {
    return false;
  }
}

const investigationAttachmentSchema = z.object({
  filename: z.string().trim().min(1, 'Nom de fichier requis').max(120, 'Nom de fichier trop long'),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp'], 'Type MIME image invalide'),
  dataUrl: z.string()
    .min(10, 'Donnees image requises')
    .max(14000000, 'Image trop volumineuse (max ~10 Mo)')
    .refine(
      (value) => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value),
      'Format image invalide'
    ),
  caption: z.string().trim().max(300, 'Legende trop longue').optional().default('')
}).refine(
  (data) => validateMagicBytes(data.dataUrl, data.mimeType),
  { message: 'Contenu du fichier invalide (magic bytes incorrects)', path: ['dataUrl'] }
);

const investigationTransferToDriSchema = z.object({
  targetType: z.enum(['internal', 'external'], 'Type de transfert DRI invalide')
});

const imageDataUrlSchema = z.string()
  .trim()
  .max(14000000, 'Image trop volumineuse (max ~10 Mo).')
  .refine(
    (value) => value === '' || /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value),
    'Format image invalide'
  );

const driNinjaSchema = z.object({
  fullName: z.string().trim().min(3, 'Nom RP requis').max(120, 'Nom RP trop long'),
  category: z.enum(['Membre de clan', 'Sans clan', 'Deserteur (nukenin)']),
  clan: z.enum(['Aucun', 'Uchiha', 'Senju', 'Hyugan', 'Akimichi', 'Nara', 'Hakumei', 'Hoki', 'Shirogane', 'Roran', 'Sabaku']),
  rank: z.enum(['D', 'C', 'B', 'A', 'S', 'X']),
  section: z.enum(['Aucune', 'Militaire', 'Diplomatie', 'Police', 'Medical', 'Strategie', 'Forces Speciales']),
  nature: z.enum(['Aucune', 'Doton', 'Katon', 'Suiton', 'Futon', 'Raiton']),
  kekkaiGenkai: z.enum(['Aucun', 'Deiton', 'Teiton', 'Yoton', 'Kiminari', 'Mokuton']),
  artefact: z.enum(['Aucun', 'Kubikiribocho', 'Samehada', 'Hiramekarei', 'Kiba', 'Nuibari', 'Kabutowari', 'Shibuki']),
  photoDataUrl: imageDataUrlSchema.optional().default(''),
  notes: z.string().trim().max(6000, 'Notes trop longues').optional().default('')
});

const driArtifactSchema = z.object({
  name: z.enum(['Kubikiribocho', 'Samehada', 'Hiramekarei', 'Kiba', 'Nuibari', 'Kabutowari', 'Shibuki']),
  holderName: z.string().trim().max(120, 'Detenteur trop long').optional().default(''),
  status: z.enum(['Localise', 'Sous surveillance', 'Perdu', 'Confisque', 'Detenu', 'Inconnu']),
  classification: z.string().trim().max(120, 'Classification trop longue').optional().default(''),
  notes: z.string().trim().max(4000, 'Notes trop longues').optional().default('')
});

const driInternalInvestigationSchema = z.object({
  title: z.string().trim().min(3, 'Titre requis').max(160, 'Titre trop long'),
  status: z.enum(['En cours', 'En attente de preuves', 'Sous couverture', 'En surveillance', 'Archivee', 'Cloturee']),
  assignedAgents: z.array(z.string().trim().min(1).max(80)).max(20, 'Trop d agents affectes').optional().default([]),
  linkedNinjaIds: z.array(z.string().trim().min(1).max(80)).max(40, 'Trop de fiches ninja liees').optional().default([]),
  summary: z.string().trim().max(1200, 'Resume trop long').optional().default(''),
  notes: z.string().trim().max(6000, 'Notes trop longues').optional().default('')
});

const driExternalInvestigationSchema = z.object({
  title: z.string().trim().min(3, 'Titre requis').max(160, 'Titre trop long'),
  status: z.enum(['En cours', 'En attente de preuves', 'Sous couverture', 'En surveillance', 'En territoire etranger', 'Archivee', 'Cloturee']),
  assignedAgents: z.array(z.string().trim().min(1).max(80)).max(20, 'Trop d agents affectes').optional().default([]),
  targetZone: z.string().trim().max(160, 'Zone cible trop longue').optional().default(''),
  summary: z.string().trim().max(1200, 'Resume trop long').optional().default(''),
  notes: z.string().trim().max(6000, 'Notes trop longues').optional().default('')
});

const reportSchema = z.object({
  reportType: z.enum(['incident', 'patrol']).optional().default('incident'),
  suspectNom: optionalTrimmed,
  suspectPrenom: optionalTrimmed,
  suspectGrade: optionalTrimmed,
  suspectPhoto: imageDataUrlSchema.optional(),
  agentNom: optionalTrimmed,
  agentPrenom: optionalTrimmed,
  agentGrade: optionalTrimmed,
  date: optionalTrimmed,
  rapport: optionalTrimmed,
  delits: z.array(z.string().trim().min(1, 'Chaque delit doit etre une chaine non vide')).default([]),
  peine: optionalTrimmed,
  graveEvent: z.boolean().optional().default(false),
  graveEventDetails: optionalTrimmed
}).superRefine((value, ctx) => {
  if (value.reportType === 'patrol' && value.graveEvent && !value.graveEventDetails) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['graveEventDetails'],
      message: 'Le detail de l evenement grave est requis'
    });
  }
});

module.exports = {
  avatarSchema,
  casierSchema: reportSchema,
  complaintSchema,
  complaintUpdateSchema,
  codePenalColumnDefSchema,
  codePenalColumnImpactSchema,
  codePenalPreviewSchema,
  codePenalPromoteColumnSchema,
  codePenalSchema,
  guestPingSchema,
  investigationSchema,
  investigationUpdateSchema,
  investigationEntrySchema,
  investigationLinkSchema,
  investigationAttachmentSchema,
  investigationTransferToDriSchema,
  driRoleSchema,
  linkUserSchema,
  loginSchema,
  permissionSchema,
  policeRoleSchema,
  driArtifactSchema,
  driExternalInvestigationSchema,
  driInternalInvestigationSchema,
  driNinjaSchema,
  registerSchema,
  reportSchema,
  saveRegistrySchema,
  updateMembreGradeSchema,
  presencePingSchema
};
