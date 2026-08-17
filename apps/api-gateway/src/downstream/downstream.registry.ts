import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DownstreamServiceName =
  | 'identity'
  | 'sales'
  | 'inventory'
  | 'accounting';

@Injectable()
export class DownstreamRegistry {
  constructor(private readonly config: ConfigService) {}

  getUrl(service: DownstreamServiceName): string {
    const key = `${service.toUpperCase()}_SERVICE_URL`;
    const url = this.config.get<string>(key);
    if (!url) {
      throw new Error(`Missing downstream URL for ${service} (${key})`);
    }
    return url;
  }

  list(): Record<DownstreamServiceName, string> {
    return {
      identity: this.getUrl('identity'),
      sales: this.getUrl('sales'),
      inventory: this.getUrl('inventory'),
      accounting: this.getUrl('accounting'),
    };
  }
}
