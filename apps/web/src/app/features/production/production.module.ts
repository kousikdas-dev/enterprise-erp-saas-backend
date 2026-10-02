import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { BomListComponent } from './boms/bom-list.component';
import { OperationListComponent } from './operations/operation-list.component';
import { ProductionOrderListComponent } from './production-orders/production-order-list.component';
import { WorkCentreListComponent } from './work-centres/work-centre-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'boms' },
  {
    path: 'boms',
    component: BomListComponent,
    data: { extraParameter: 'productionMenu' },
  },
  {
    path: 'operations',
    component: OperationListComponent,
    data: { extraParameter: 'productionMenu' },
  },
  {
    path: 'work-centres',
    component: WorkCentreListComponent,
    data: { extraParameter: 'productionMenu' },
  },
  {
    path: 'production-orders',
    component: ProductionOrderListComponent,
    data: { extraParameter: 'productionMenu' },
  },
];

@NgModule({
  declarations: [
    BomListComponent,
    OperationListComponent,
    WorkCentreListComponent,
    ProductionOrderListComponent,
  ],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class ProductionFeatureModule {}
