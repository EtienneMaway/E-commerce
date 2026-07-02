import {
  isUUID,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  IsNull,
  type FindOperator,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';
import type { ActorContext } from './types/actor-context';

/**
 * Sentinel actor-filter value meaning "only rows performed by the current
 * viewer". Distinct from a specific employee's UUID and from omitting the
 * filter (which means "all actors"). Viewer-relative:
 *   - owner viewing their own books → owner-performed rows (actor_id IS NULL)
 *   - employee viewing employer's books → that employee's rows (actor_id = viewer)
 */
export const ACTOR_FILTER_SELF = 'self';

/** A resolved actor filter: match NULL (owner) rows, a specific actor, or none. */
export type ActorCond = { kind: 'null' } | { kind: 'id'; id: string };

/**
 * Turn a raw `actorId` query value into a concrete, viewer-relative condition.
 *   - undefined / ''        → null (no actor filter, i.e. all actors)
 *   - 'self' + owner viewer → owner-performed rows (actor_id IS NULL)
 *   - 'self' + employee     → that employee's rows (actor_id = viewer id)
 *   - <uuid>                → that actor's rows
 */
export function resolveActorFilter(
  actorId: string | undefined,
  ctx: ActorContext,
): ActorCond | null {
  if (!actorId) return null;
  if (actorId === ACTOR_FILTER_SELF) {
    return ctx.actorId === ctx.effectiveOwnerId
      ? { kind: 'null' }
      : { kind: 'id', id: ctx.actorId };
  }
  return { kind: 'id', id: actorId };
}

/**
 * Apply a resolved actor condition to a QueryBuilder on `<column>` (e.g.
 * `'sale.actor_id'`). No-op when `cond` is null. Uses a unique param name so it
 * won't clash with other bindings on the same query.
 */
export function applyActorCondToQb<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  cond: ActorCond | null,
  paramName = 'actorFilterId',
): void {
  if (!cond) return;
  if (cond.kind === 'null') {
    qb.andWhere(`${column} IS NULL`);
  } else {
    qb.andWhere(`${column} = :${paramName}`, { [paramName]: cond.id });
  }
}

/**
 * Translate a resolved actor condition into a value for a TypeORM find-where
 * object (`where.actorId = ...`). Returns undefined when there is no filter so
 * callers can skip setting the key.
 */
export function actorCondToWhereValue(
  cond: ActorCond | null,
): FindOperator<string> | string | undefined {
  if (!cond) return undefined;
  return cond.kind === 'null' ? IsNull() : cond.id;
}

/**
 * Validates that a value is either a UUID or the literal `'self'` sentinel.
 * Drop-in replacement for `@IsUUID()` on actor-filter query params.
 */
export function IsUuidOrSelf(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isUuidOrSelf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            value === ACTOR_FILTER_SELF ||
            (typeof value === 'string' && isUUID(value))
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a UUID or '${ACTOR_FILTER_SELF}'`;
        },
      },
    });
  };
}
