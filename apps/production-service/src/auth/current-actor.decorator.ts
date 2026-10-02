import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorContext } from './actor-context';

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const request = ctx.switchToHttp().getRequest<{ actor: ActorContext }>();
    return request.actor;
  },
);
