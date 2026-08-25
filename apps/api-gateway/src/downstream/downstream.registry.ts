import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DownstreamServiceName =
  | 'identity'
  | 'sales'
  | 'inventory'
  | 'accounting'
  | 'purchase'
  | 'master-data';

@Injectable()
export class DownstreamRegistry {
  constructor(private readonly config: ConfigService) {}

  getUrl(service: DownstreamServiceName): string {
    const keys: Record<DownstreamServiceName, string> = {
      identity: 'IDENTITY_SERVICE_URL',
      sales: 'SALES_SERVICE_URL',
      inventory: 'INVENTORY_SERVICE_URL',
      accounting: 'ACCOUNTING_SERVICE_URL',
      purchase: 'PURCHASE_SERVICE_URL',
      'master-data': 'MASTER_DATA_SERVICE_URL',
    };

    const key = keys[service];
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
      purchase: this.getUrl('purchase'),
      'master-data': this.getUrl('master-data'),
    };
  }
}