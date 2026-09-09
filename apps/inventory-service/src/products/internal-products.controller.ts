import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { InternalServiceGuard } from '../auth/internal-service.guard';
import { ProductUnitsService } from '../product-units/product-units.service';
import { UnitsService } from '../units/units.service';
import { ProductsService } from './products.service';

@Controller({ path: 'internal/products', version: '1' })
@UseGuards(InternalServiceGuard, ActorGuard)
export class InternalProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly productUnits: ProductUnitsService,
    private readonly units: UnitsService,
  ) {}

  @Get(':id/uom-options')
  async uomOptions(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const product = await this.products.getById(actor, id);
    const { items: productUnits } = await this.productUnits.list(actor, id);
    const { items: units } = await this.units.list(actor);
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));

    const baseUnit = unitsById.get(product.unitOfMeasureId);
    if (!baseUnit) {
      throw new NotFoundException('Unit of measure not found');
    }

    return {
      productId: product.id,
      base: {
        unitOfMeasureId: baseUnit.id,
        code: baseUnit.code,
        name: baseUnit.name,
      },
      alternatives: productUnits
        .filter((productUnit) => productUnit.isActive)
        .map((productUnit) => {
          const unit = unitsById.get(productUnit.unitOfMeasureId);
          if (!unit) {
            throw new NotFoundException('Unit of measure not found');
          }
          return {
            unitOfMeasureId: unit.id,
            code: unit.code,
            name: unit.name,
            conversionFactor: productUnit.conversionFactor,
            sellingPrice: productUnit.sellingPrice,
          };
        }),
    };
  }
}
