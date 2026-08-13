import { randomUUID } from 'node:crypto';
import type { Database } from '../../shared-kernel/data-access';
import { ValidationError } from '../../shared-kernel/validation';

export type MessageChannel = 'email' | 'sms' | 'push' | 'in_app';
export type ConsentStatus = 'granted' | 'revoked';

export interface GuestRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  phone: string | null;
  email: string | null;
  social_handle: string | null;
  birthday: number | null;
  anniversary: number | null;
  city: string | null;
  occupation: string | null;
  notes: string | null;
  first_met_at: number | null;
  first_met_venue_id: string | null;
  is_favorite: number;
  is_regular: number;
  is_vip: number;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface VenueRow {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  city: string | null;
  venue_type: string | null;
  employment_status: string | null;
  start_date: number | null;
  end_date: number | null;
  is_current: number;
  typical_schedule: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface VisitRow {
  id: string;
  user_id: string;
  guest_id: string;
  venue_id: string | null;
  shift_id: string | null;
  visited_at: number;
  departure_at: number | null;
  seat_section: string | null;
  drinks: string | null;
  food: string | null;
  approximate_spend: number | null;
  approximate_tip: number | null;
  occasion: string | null;
  companions: string | null;
  notes: string | null;
  follow_up_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface GuestListRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  list_type: 'manual' | 'smart';
  rule_json: string | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface RecipientEligibility {
  guestId: string;
  channel: MessageChannel;
  eligible: boolean;
  status: 'eligible' | 'no_consent' | 'suppressed' | 'invalid_contact';
  contact: string | null;
}

function optionalString(value: unknown, max: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('Expected text value');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`Text must be ${max} characters or fewer`);
  return trimmed || null;
}

function requiredName(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required`, field);
  const trimmed = value.trim();
  if (trimmed.length > 120) throw new ValidationError(`${field} must be 120 characters or fewer`, field);
  return trimmed;
}

function optionalNonNegativeNumber(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field} must be a nonnegative number`, field);
  return n;
}

function boolInt(value: unknown): number {
  return value === true || value === 1 ? 1 : 0;
}

function assertChannel(value: unknown): MessageChannel {
  if (value === 'email' || value === 'sms' || value === 'push' || value === 'in_app') return value;
  throw new ValidationError('Invalid message channel', 'channel');
}

export class ConnectService {
  constructor(private readonly db: Database) {}

  createVenue(userId: string, input: Record<string, unknown>): VenueRow {
    const id = randomUUID();
    const now = Date.now();
    const name = requiredName(input.name, 'name');
    this.db.run(
      `INSERT INTO venues (id,user_id,name,address,city,venue_type,employment_status,start_date,end_date,is_current,typical_schedule,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, userId, name, optionalString(input.address, 240), optionalString(input.city, 120),
        optionalString(input.venueType, 80), optionalString(input.employmentStatus, 80),
        optionalNonNegativeNumber(input.startDate, 'startDate'), optionalNonNegativeNumber(input.endDate, 'endDate'),
        input.isCurrent === false ? 0 : 1, optionalString(input.typicalSchedule, 500), optionalString(input.notes, 2000), now, now,
      ]
    );
    return this.getVenue(userId, id) as VenueRow;
  }

  getVenue(userId: string, venueId: string): VenueRow | null {
    return this.db.get<VenueRow>('SELECT * FROM venues WHERE id = ? AND user_id = ?', [venueId, userId]) ?? null;
  }

  listVenues(userId: string): VenueRow[] {
    return this.db.all<VenueRow>('SELECT * FROM venues WHERE user_id = ? ORDER BY is_current DESC, created_at DESC', [userId]);
  }

  createGuest(userId: string, input: Record<string, unknown>): GuestRow {
    const id = randomUUID();
    const now = Date.now();
    const firstName = optionalString(input.firstName, 80);
    const lastName = optionalString(input.lastName, 80);
    const displayName = input.displayName ? requiredName(input.displayName, 'displayName') : [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!displayName) throw new ValidationError('Guest name is required', 'displayName');
    const firstMetVenueId = optionalString(input.firstMetVenueId, 80);
    if (firstMetVenueId && !this.getVenue(userId, firstMetVenueId)) throw new ValidationError('Venue not found', 'firstMetVenueId');

    this.db.run(
      `INSERT INTO guests (id,user_id,first_name,last_name,display_name,phone,email,social_handle,birthday,anniversary,city,occupation,notes,first_met_at,first_met_venue_id,is_favorite,is_regular,is_vip,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, userId, firstName, lastName, displayName, optionalString(input.phone, 40), optionalString(input.email, 320),
        optionalString(input.socialHandle, 120), optionalNonNegativeNumber(input.birthday, 'birthday'),
        optionalNonNegativeNumber(input.anniversary, 'anniversary'), optionalString(input.city, 120), optionalString(input.occupation, 120),
        optionalString(input.notes, 4000), optionalNonNegativeNumber(input.firstMetAt, 'firstMetAt'), firstMetVenueId,
        boolInt(input.isFavorite), boolInt(input.isRegular), boolInt(input.isVip), now, now,
      ]
    );
    return this.getGuest(userId, id) as GuestRow;
  }

  getGuest(userId: string, guestId: string): GuestRow | null {
    return this.db.get<GuestRow>('SELECT * FROM guests WHERE id = ? AND user_id = ?', [guestId, userId]) ?? null;
  }

  listGuests(userId: string, options: { search?: string; includeArchived?: boolean } = {}): GuestRow[] {
    const search = (options.search ?? '').trim();
    const params: unknown[] = [userId];
    let sql = 'SELECT * FROM guests WHERE user_id = ?';
    if (!options.includeArchived) sql += ' AND archived_at IS NULL';
    if (search) {
      sql += ' AND (LOWER(display_name) LIKE ? OR LOWER(COALESCE(email,\'\')) LIKE ? OR LOWER(COALESCE(phone,\'\')) LIKE ?)';
      const q = `%${search.toLowerCase()}%`;
      params.push(q, q, q);
    }
    sql += ' ORDER BY is_favorite DESC, is_regular DESC, display_name COLLATE NOCASE ASC';
    return this.db.all<GuestRow>(sql, params);
  }

  updateGuest(userId: string, guestId: string, input: Record<string, unknown>): GuestRow | null {
    const current = this.getGuest(userId, guestId);
    if (!current) return null;
    const now = Date.now();
    const firstName = input.firstName === undefined ? current.first_name : optionalString(input.firstName, 80);
    const lastName = input.lastName === undefined ? current.last_name : optionalString(input.lastName, 80);
    const displayName = input.displayName === undefined ? current.display_name : requiredName(input.displayName, 'displayName');
    this.db.run(
      `UPDATE guests SET first_name=?,last_name=?,display_name=?,phone=?,email=?,social_handle=?,city=?,occupation=?,notes=?,is_favorite=?,is_regular=?,is_vip=?,updated_at=?
       WHERE id=? AND user_id=?`,
      [
        firstName, lastName, displayName,
        input.phone === undefined ? current.phone : optionalString(input.phone, 40),
        input.email === undefined ? current.email : optionalString(input.email, 320),
        input.socialHandle === undefined ? current.social_handle : optionalString(input.socialHandle, 120),
        input.city === undefined ? current.city : optionalString(input.city, 120),
        input.occupation === undefined ? current.occupation : optionalString(input.occupation, 120),
        input.notes === undefined ? current.notes : optionalString(input.notes, 4000),
        input.isFavorite === undefined ? current.is_favorite : boolInt(input.isFavorite),
        input.isRegular === undefined ? current.is_regular : boolInt(input.isRegular),
        input.isVip === undefined ? current.is_vip : boolInt(input.isVip),
        now, guestId, userId,
      ]
    );
    return this.getGuest(userId, guestId);
  }

  archiveGuest(userId: string, guestId: string): boolean {
    const result = this.db.run('UPDATE guests SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL', [Date.now(), Date.now(), guestId, userId]);
    return result.changes > 0;
  }

  logVisit(userId: string, guestId: string, input: Record<string, unknown>): VisitRow {
    if (!this.getGuest(userId, guestId)) throw new ValidationError('Guest not found', 'guestId');
    const venueId = optionalString(input.venueId, 80);
    if (venueId && !this.getVenue(userId, venueId)) throw new ValidationError('Venue not found', 'venueId');
    const id = randomUUID();
    const now = Date.now();
    const visitedAt = input.visitedAt == null ? now : optionalNonNegativeNumber(input.visitedAt, 'visitedAt');
    if (visitedAt == null) throw new ValidationError('Visit date is required', 'visitedAt');
    this.db.run(
      `INSERT INTO visits (id,user_id,guest_id,venue_id,shift_id,visited_at,departure_at,seat_section,drinks,food,approximate_spend,approximate_tip,occasion,companions,notes,follow_up_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, userId, guestId, venueId, optionalString(input.shiftId, 80), visitedAt,
        optionalNonNegativeNumber(input.departureAt, 'departureAt'), optionalString(input.seatSection, 120), optionalString(input.drinks, 2000),
        optionalString(input.food, 2000), optionalNonNegativeNumber(input.approximateSpend, 'approximateSpend'),
        optionalNonNegativeNumber(input.approximateTip, 'approximateTip'), optionalString(input.occasion, 120), optionalString(input.companions, 1000),
        optionalString(input.notes, 4000), optionalNonNegativeNumber(input.followUpAt, 'followUpAt'), now, now,
      ]
    );
    return this.db.get<VisitRow>('SELECT * FROM visits WHERE id = ? AND user_id = ?', [id, userId]) as VisitRow;
  }

  listVisits(userId: string, guestId: string): VisitRow[] {
    if (!this.getGuest(userId, guestId)) return [];
    return this.db.all<VisitRow>('SELECT * FROM visits WHERE user_id = ? AND guest_id = ? ORDER BY visited_at DESC', [userId, guestId]);
  }

  createList(userId: string, input: Record<string, unknown>): GuestListRow {
    const id = randomUUID();
    const now = Date.now();
    const name = requiredName(input.name, 'name');
    const listType = input.listType === 'smart' ? 'smart' : 'manual';
    const ruleJson = listType === 'smart' ? optionalString(input.ruleJson, 4000) : null;
    this.db.run(
      'INSERT INTO guest_lists (id,user_id,name,description,list_type,rule_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, userId, name, optionalString(input.description, 1000), listType, ruleJson, now, now]
    );
    return this.db.get<GuestListRow>('SELECT * FROM guest_lists WHERE id = ? AND user_id = ?', [id, userId]) as GuestListRow;
  }

  listLists(userId: string): GuestListRow[] {
    return this.db.all<GuestListRow>('SELECT * FROM guest_lists WHERE user_id = ? AND archived_at IS NULL ORDER BY name COLLATE NOCASE ASC', [userId]);
  }

  addGuestToList(userId: string, listId: string, guestId: string): boolean {
    const list = this.db.get<GuestListRow>('SELECT * FROM guest_lists WHERE id = ? AND user_id = ?', [listId, userId]);
    if (!list || list.list_type !== 'manual' || !this.getGuest(userId, guestId)) return false;
    this.db.run('INSERT OR IGNORE INTO guest_list_memberships (list_id,guest_id,user_id,created_at) VALUES (?,?,?,?)', [listId, guestId, userId, Date.now()]);
    return true;
  }

  listGuestsInList(userId: string, listId: string): GuestRow[] {
    const list = this.db.get<GuestListRow>('SELECT * FROM guest_lists WHERE id = ? AND user_id = ?', [listId, userId]);
    if (!list) return [];
    if (list.list_type === 'smart') return this.evaluateSmartList(userId, list);
    return this.db.all<GuestRow>(
      `SELECT g.* FROM guests g JOIN guest_list_memberships m ON m.guest_id = g.id
       WHERE m.list_id = ? AND m.user_id = ? AND g.user_id = ? AND g.archived_at IS NULL
       ORDER BY g.display_name COLLATE NOCASE ASC`,
      [listId, userId, userId]
    );
  }

  private evaluateSmartList(userId: string, list: GuestListRow): GuestRow[] {
    let rule: { type?: string; days?: number } = {};
    try { rule = JSON.parse(list.rule_json ?? '{}') as { type?: string; days?: number }; } catch { return []; }
    if (rule.type === 'favorites') return this.db.all<GuestRow>('SELECT * FROM guests WHERE user_id = ? AND archived_at IS NULL AND is_favorite = 1 ORDER BY display_name', [userId]);
    if (rule.type === 'regulars') return this.db.all<GuestRow>('SELECT * FROM guests WHERE user_id = ? AND archived_at IS NULL AND is_regular = 1 ORDER BY display_name', [userId]);
    if (rule.type === 'recent_visitors') {
      const days = Math.max(1, Math.min(365, Number(rule.days) || 30));
      const cutoff = Date.now() - days * 86400000;
      return this.db.all<GuestRow>(
        `SELECT DISTINCT g.* FROM guests g JOIN visits v ON v.guest_id = g.id
         WHERE g.user_id = ? AND v.user_id = ? AND g.archived_at IS NULL AND v.visited_at >= ?
         ORDER BY g.display_name`, [userId, userId, cutoff]
      );
    }
    return [];
  }

  setConsent(userId: string, guestId: string, input: Record<string, unknown>): void {
    if (!this.getGuest(userId, guestId)) throw new ValidationError('Guest not found', 'guestId');
    const channel = assertChannel(input.channel);
    const consentType = requiredName(input.consentType ?? 'general_updates', 'consentType');
    const status: ConsentStatus = input.status === 'revoked' ? 'revoked' : 'granted';
    const source = requiredName(input.source ?? 'bartender_confirmed', 'source');
    const now = Date.now();
    const existing = this.db.get<{ id: string }>('SELECT id FROM guest_consents WHERE user_id=? AND guest_id=? AND consent_type=? AND channel=?', [userId, guestId, consentType, channel]);
    if (existing) {
      this.db.run(
        'UPDATE guest_consents SET status=?,source=?,language_version=?,granted_at=?,revoked_at=?,updated_at=? WHERE id=? AND user_id=?',
        [status, source, optionalString(input.languageVersion, 80), status === 'granted' ? now : null, status === 'revoked' ? now : null, now, existing.id, userId]
      );
    } else {
      this.db.run(
        `INSERT INTO guest_consents (id,user_id,guest_id,consent_type,channel,status,source,language_version,granted_at,revoked_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [randomUUID(), userId, guestId, consentType, channel, status, source, optionalString(input.languageVersion, 80), status === 'granted' ? now : null, status === 'revoked' ? now : null, now, now]
      );
    }
    if (status === 'revoked') this.suppress(userId, guestId, channel, 'consent_revoked');
  }

  suppress(userId: string, guestId: string, channelInput: unknown, reason = 'manual'): void {
    if (!this.getGuest(userId, guestId)) throw new ValidationError('Guest not found', 'guestId');
    const channel = assertChannel(channelInput);
    const existing = this.db.get<{ id: string }>('SELECT id FROM suppressions WHERE user_id=? AND guest_id=? AND channel=?', [userId, guestId, channel]);
    if (!existing) this.db.run('INSERT INTO suppressions (id,user_id,guest_id,channel,reason,created_at) VALUES (?,?,?,?,?,?)', [randomUUID(), userId, guestId, channel, reason.slice(0, 120), Date.now()]);
  }

  recipientEligibility(userId: string, guestId: string, channelInput: unknown, consentType = 'general_updates'): RecipientEligibility {
    const channel = assertChannel(channelInput);
    const guest = this.getGuest(userId, guestId);
    if (!guest || guest.archived_at != null) return { guestId, channel, eligible: false, status: 'invalid_contact', contact: null };
    const contact = channel === 'email' ? guest.email : channel === 'sms' ? guest.phone : guest.id;
    if (!contact) return { guestId, channel, eligible: false, status: 'invalid_contact', contact: null };
    const suppressed = this.db.get<{ id: string }>('SELECT id FROM suppressions WHERE user_id=? AND guest_id=? AND channel=?', [userId, guestId, channel]);
    if (suppressed) return { guestId, channel, eligible: false, status: 'suppressed', contact };
    const consent = this.db.get<{ status: ConsentStatus }>(
      'SELECT status FROM guest_consents WHERE user_id=? AND guest_id=? AND consent_type=? AND channel=?',
      [userId, guestId, consentType, channel]
    );
    if (!consent || consent.status !== 'granted') return { guestId, channel, eligible: false, status: 'no_consent', contact };
    return { guestId, channel, eligible: true, status: 'eligible', contact };
  }

  previewRecipients(userId: string, guestIds: string[], channelInput: unknown, consentType = 'general_updates'): RecipientEligibility[] {
    const unique = [...new Set(guestIds)].slice(0, 100);
    return unique.map((guestId) => this.recipientEligibility(userId, guestId, channelInput, consentType));
  }
}
