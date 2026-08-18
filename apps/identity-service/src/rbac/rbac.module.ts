import { Module } from '@nestjs/common';
import { InternalRbacController } from './internal-rbac.controller';
import { RbacService } from './rbac.service';

@Module({
  controllers: [InternalRbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
