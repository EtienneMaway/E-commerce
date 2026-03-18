import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../entities';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext): User | User[keyof User] => {
    const request = ctx.switchToHttp().getRequest<{ user: User }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);
