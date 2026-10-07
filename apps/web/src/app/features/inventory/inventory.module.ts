import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { DecimalTextPipe, QuantityPipe } from '../../shared/pipes/decimal.pipes';
import { AttributeListComponent } from './attributes/attribute-list.component';
import { CategoryListComponent } from './categories/category-list.component';
import { OpeningStockListComponent } from './opening-stock/opening-stock-list.component';
import { ProductListComponent } from './products/product-list.component';
import { StockListComponent } from './stock/stock-list.component';
import { StockMovementListComponent } from './stock-movements/stock-movement-list.component';
import { UnitListComponent } from './units/unit-list.component';
import { UnspscCategoryListComponent } from './unspsc-categories/unspsc-category-list.component';
import { WarehouseListComponent } from './warehouses/warehouse-list.component';
import { InventorySettingsComponent } from './settings/inventory-settings.component';
import { InventoryOverviewComponent } from './overview/inventory-overview.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    component: InventoryOverviewComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'settings',
    component: InventorySettingsComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'products',
    component: ProductListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'categories',
    component: CategoryListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'attributes',
    component: AttributeListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'units',
    component: UnitListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'unspsc-categories',
    component: UnspscCategoryListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'warehouses',
    component: WarehouseListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'stock',
    component: StockListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'stock-movements',
    component: StockMovementListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
  {
    path: 'opening-stock',
    component: OpeningStockListComponent,
    data: { extraParameter: 'inventoryMenu', darkTheme: true },
  },
];

@NgModule({
  declarations: [
    InventoryOverviewComponent,
    ProductListComponent,
    CategoryListComponent,
    AttributeListComponent,
    UnitListComponent,
    UnspscCategoryListComponent,
    WarehouseListComponent,
    StockListComponent,
    StockMovementListComponent,
    OpeningStockListComponent,
    InventorySettingsComponent,
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
