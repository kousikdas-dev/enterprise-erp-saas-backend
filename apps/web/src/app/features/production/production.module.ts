import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { BomListComponent } from './boms/bom-list.component';
import { BomDetailComponent } from './boms/bom-detail.component';
import { OperationListComponent } from './operations/operation-list.component';
import { ProductionOrderListComponent } from './production-orders/production-order-list.component';
import { ProductionOrderDetailComponent } from './production-orders/production-order-detail.component';
import { WorkCentreListComponent } from './work-centres/work-centre-list.component';
import { WorkCentreOverviewComponent } from './work-centres/work-centre-overview.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    component: WorkCentreOverviewComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'boms',
    component: BomListComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'boms/:id',
    component: BomDetailComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'operations',
    component: OperationListComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'work-centres',
    component: WorkCentreListComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'production-orders',
    component: ProductionOrderListComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'production-orders/:id',
    component: ProductionOrderDetailComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
];

@NgModule({
  declarations: [
    BomListComponent,
    BomDetailComponent,
    OperationListComponent,
    WorkCentreListComponent,
    WorkCentreOverviewComponent,
    ProductionOrderListComponent,
    ProductionOrderDetailComponent,
  ],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class ProductionFeatureModule {}
