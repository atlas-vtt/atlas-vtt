import { MAX_CAMPAIGN_NAME } from '../campaignValidation';
import { QUEST_KINDS, QUEST_PROPERTY, QUEST_STATUSES, QUEST_TYPE, type Quest, type QuestKind, type QuestStatus } from './questTypes';

/** What Atlas reads of a quest note's frontmatter at most. */
export const QUEST_LIMITS = {
  /** Rewards read of one quest. */
  rewards: 8,
  /** Characters of one reward; a longer one is cut. */
  reward: 200,
  /** The most experience a quest brings. */
  experience: 1_000_000_000,
} as const;

/** A quest's id: 96 random bits in hex, as players' notes on it name it. */
export const QUEST_ID = /^[0-9a-f]{24}$/;

const WHOLE_NUMBER = /^\d{1,10}$/;
/** A link written into the property (`[[Name]]`, `[[Name|Shown]]`) names what it links to. */
const LINK = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/;

/** Frontmatter as Obsidian hands it over: anything a note's YAML can hold. Only own fields are read. */
type Frontmatter = Readonly<Record<string, unknown>>;

const field = (frontmatter: Frontmatter, key: string): unknown => (Object.hasOwn(frontmatter, key) ? frontmatter[key] : undefined);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value);
const word = (value: unknown): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Whether a note's frontmatter marks it as a quest. */
export function isQuestFrontmatter(frontmatter: unknown): frontmatter is Frontmatter {
  return typeof frontmatter === 'object' && frontmatter !== null && word(field(frontmatter as Frontmatter, QUEST_PROPERTY.type)) === QUEST_TYPE;
}

/** The campaign a note names: its text trimmed, a link read as what it links to; null for none. */
export function campaignOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const named = (LINK.exec(text)?.[1] ?? text).trim();
  return named !== '' && named.length <= MAX_CAMPAIGN_NAME * 4 ? named : null;
}

function experienceOf(value: unknown): number | undefined {
  const number = typeof value === 'string' && WHOLE_NUMBER.test(value.trim()) ? Number(value.trim()) : value;
  return typeof number === 'number' && Number.isInteger(number) && number >= 0 && number <= QUEST_LIMITS.experience ? number : undefined;
}

/** The rewards of a quest: a list of texts, or one text; what is no text is passed over. */
function rewardsOf(value: unknown): string[] {
  const list: readonly unknown[] = Array.isArray(value) ? value.slice(0, QUEST_LIMITS.rewards * 4) : [value];
  const rewards: string[] = [];
  for (const entry of list) {
    if (rewards.length === QUEST_LIMITS.rewards) break;
    const text = typeof entry === 'string' || typeof entry === 'number' ? String(entry).replace(/\s+/g, ' ').trim() : '';
    if (text !== '') rewards.push([...text.slice(0, QUEST_LIMITS.reward * 2)].slice(0, QUEST_LIMITS.reward).join(''));
  }
  return rewards;
}

/** The note's file as the vault knows it. */
export interface QuestFile {
  readonly path: string;
  readonly basename: string;
  readonly created: number;
  readonly modified: number;
}

/**
 * A quest note as Atlas reads its frontmatter, or null for a note that is no quest of a campaign.
 * Every value is read defensively: a status Atlas does not know is open, anything else that cannot
 * be read is unset.
 */
export function readQuest(file: QuestFile, frontmatter: unknown): Quest | null {
  if (!isQuestFrontmatter(frontmatter)) return null;
  const campaign = campaignOf(field(frontmatter, QUEST_PROPERTY.campaign));
  if (campaign === null) return null;
  const id = field(frontmatter, QUEST_PROPERTY.id);
  const kind = word(field(frontmatter, QUEST_PROPERTY.kind));
  const status = word(field(frontmatter, QUEST_PROPERTY.status));
  const experience = experienceOf(field(frontmatter, QUEST_PROPERTY.experience));
  return {
    path: file.path,
    title: file.basename,
    campaign,
    ...(typeof id === 'string' && QUEST_ID.test(id) && { id }),
    ...(oneOf<QuestKind>(QUEST_KINDS, kind) && { kind }),
    status: oneOf<QuestStatus>(QUEST_STATUSES, status) ? status : 'open',
    ...(experience !== undefined && { experience }),
    rewards: rewardsOf(field(frontmatter, QUEST_PROPERTY.rewards) ?? []),
    created: file.created,
    modified: file.modified,
  };
}

/** A quest's kind: a quest that names none waits beside the main quests. */
export const questKind = (quest: Pick<Quest, 'kind'>): QuestKind => quest.kind ?? 'side';

/** Main quests, then side quests; each by title. */
export function byQuestOrder(a: Quest, b: Quest): number {
  const rank = (quest: Quest): number => (questKind(quest) === 'main' ? 0 : 1);
  return rank(a) - rank(b) || a.title.localeCompare(b.title) || a.path.localeCompare(b.path);
}
