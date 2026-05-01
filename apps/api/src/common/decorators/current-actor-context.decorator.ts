import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { ActorContext } from '../types/actor-context';

/**
 * Injects the resolved ActorContext for the current request. Throws if invoked on
 * a route reachable without authentication (the interceptor only attaches context
 * when req.user is set).
 */
export const CurrentActorContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const req = ctx.switchToHttp().getRequest<{ actorContext?: ActorContext }>();
    if (!req.actorContext) {
      throw new InternalServerErrorException('Actor context is missing — apply JwtAuthGuard before using @CurrentActorContext');
    }
    return req.actorContext;
  },
);
