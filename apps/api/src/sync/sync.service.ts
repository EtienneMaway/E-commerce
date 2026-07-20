import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * One epoch-ms stamp per "inbox" channel. A client stores what it last saw and
 * refetches only the channels whose stamp moved.
 *
 * Epoch ms (not ISO strings) keeps the payload small and the client comparison a
 * plain `>` — these are polled, and the response also rides along on every other
 * response as a header, so bytes matter.
 *
 * 0 means "nothing has ever happened on this channel for this user", which is
 * the correct starting value: a client that has seen nothing compares 0 > 0 and
 * does not fetch.
 */
export interface InboxSignal {
  handovers: number;
  employment: number;
  consignments: number;
  salary: number;
}

/**
 * Per-channel source: the tables whose `updated_at` constitutes an event for
 * that channel, and the columns naming the users who care about it.
 *
 * Both sides of each pair are listed deliberately. For handovers the mini needs
 * to know their submission was approved/rejected and the owner needs to know one
 * arrived; keying on only one column would leave the other party stale.
 */
const CHANNELS = {
  handovers: [{ table: 'mini_settlements', columns: ['mini_id', 'owner_id'] }],
  employment: [
    { table: 'employments', columns: ['employee_id', 'employer_id'] },
  ],
  consignments: [
    { table: 'consignment_requests', columns: ['debtor_id', 'supplier_id'] },
  ],
  salary: [
    { table: 'salary_payments', columns: ['employee_id', 'employer_id'] },
  ],
} as const satisfies Record<
  string,
  ReadonlyArray<{ table: string; columns: readonly string[] }>
>;

type ChannelName = keyof typeof CHANNELS;

@Injectable()
export class SyncService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Read every channel's stamp for one user in a single round trip.
   *
   * Each column becomes its own scalar subquery rather than
   * `WHERE mini_id = $1 OR owner_id = $1` — an OR across two columns cannot use
   * either composite index and degrades to a sequential scan. GREATEST combines
   * them, and the (user_col, updated_at DESC) indexes from migration 022 make
   * each subquery an index-only scan that stops at the first row.
   *
   * `userId` is the actor (the human), never effectiveOwnerId: an inbox belongs
   * to a person, so a full employee acting on their employer's books still sees
   * their own events move.
   */
  async getSignal(userId: string): Promise<InboxSignal> {
    const names = Object.keys(CHANNELS) as ChannelName[];

    // Build one SELECT with a column per channel. The shape is fully derived
    // from the CHANNELS constant above — no user input reaches the SQL text,
    // only the single bound $1 parameter.
    const selects = names.map((name) => {
      const subqueries = CHANNELS[name].flatMap((src) =>
        src.columns.map(
          (col) =>
            `(SELECT MAX("updated_at") FROM "${src.table}" WHERE "${col}" = $1)`,
        ),
      );
      // COALESCE to epoch so a user with no rows yet reads 0 rather than null.
      const greatest =
        subqueries.length === 1
          ? subqueries[0]
          : `GREATEST(${subqueries.join(', ')})`;
      return `COALESCE(EXTRACT(EPOCH FROM ${greatest}) * 1000, 0)::bigint AS "${name}"`;
    });

    // Pin the row shape via the generic rather than an assertion, so nothing
    // downstream inherits `query`'s default `any`. This SELECT has no FROM, so
    // it always yields exactly one row.
    const [row] = await this.dataSource.query<[Record<ChannelName, string>]>(
      `SELECT ${selects.join(', ')}`,
      [userId],
    );

    // pg returns bigint as a string to avoid precision loss. These are
    // millisecond timestamps — far inside Number.MAX_SAFE_INTEGER — so the
    // conversion is lossless.
    return names.reduce<InboxSignal>(
      (acc, name) => ({ ...acc, [name]: Number(row[name]) }),
      { handovers: 0, employment: 0, consignments: 0, salary: 0 },
    );
  }
}
