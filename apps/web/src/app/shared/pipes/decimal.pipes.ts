import { Pipe, PipeTransform } from '@angular/core';
import { formatDecimal, formatQuantity } from '../utils/decimal.util';

@Pipe({ name: 'qty', standalone: true })
export class QuantityPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatQuantity(value);
  }
}

@Pipe({ name: 'decimalText', standalone: true })
export class DecimalTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatDecimal(value);
  }
}
