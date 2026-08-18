import { Global, Module } from '@nestjs/common';
import { DownstreamRegistry } from './downstream.registry';

@Global()
@Module({
  providers: [DownstreamRegistry],
  exports: [DownstreamRegistry],
})
export class DownstreamModule {}
