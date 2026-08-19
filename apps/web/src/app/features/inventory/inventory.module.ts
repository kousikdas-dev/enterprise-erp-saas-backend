import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { DecimalTextPipe, QuantityPipe } from '../../shared/pipes/decimal.pipes';
import { CategoryListComponent } from './categories/category-list.component';
import { ProductListComponent } from './products/product-list.component';
import { StockListComponent } from './stock/stock-list.component';
import { StockMovementListComponent } from './stock-movements/stock-movement-list.component';
import { UnitListComponent } from './units/unit-list.component';
import { WarehouseListComponent } from './warehouses/warehouse-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  {
    path: 'products',
    component: ProductListComponent,
    data: { extraParameter: 'inventoryMenu' },
  },
  {
    path: 'categories',
    component: CategoryListComponent,
    data: { extraParameter: 'inventoryMenu' },
  },
  {
    path: 'units',
    component: UnitListComponent,
    data: { extraParameter: 'inventoryMenu' },
  },
  {
    path: 'warehouses',
    component: WarehouseListComponent,
    data: { extraParameter: 'inventoryMenu' },
  },
  {
    path: 'stock',
    component: StockListComponent,
    data: { extraParameter: 'inventoryMenu' },
  },
  {
    path: 'stock-movements',
    component: StockMovementListComponent,
    data: { extraParameter: 'inventoryMenu' },
  },
];

@NgModule({
  declarations: [
    ProductListComponent,
    CategoryListComponent,
    UnitListComponent,
    WarehouseListComponent,
    StockListComponent,
    StockMovementListComponent,
  ],
  imports: [
    SharedModule,
    ListStateComponent,
    QuantityPipe,
    DecimalTextPipe,
    RouterModule.forChild(routes),
  ],
})
export class InventoryFeatureModule {}
