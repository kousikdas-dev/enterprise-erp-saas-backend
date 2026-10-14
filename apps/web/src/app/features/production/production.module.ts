import { NgModule } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { BomListComponent } from './boms/bom-list.component';
import { BomDetailComponent } from './boms/bom-detail.component';
import { OperationListComponent } from './operations/operation-list.component';
import { ProductionOrderListComponent } from './production-orders/production-order-list.component';
import { ProductionOrderDetailComponent } from './production-orders/production-order-detail.component';
import { RoutingListComponent } from './routings/routing-list.component';
import { RoutingDetailComponent } from './routings/routing-detail.component';
import { WorkCentreListComponent } from './work-centres/work-centre-list.component';
import { WorkCentreOverviewComponent } from './work-centres/work-centre-overview.component';
import { WorkOrderListComponent } from './work-orders/work-order-list.component';
import { WorkOrdersKanbanComponent } from './work-orders/work-orders-kanban.component';
import { WorkOrdersPlanningComponent } from './work-orders/work-orders-planning.component';

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
    path: 'routings',
    component: RoutingListComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'routings/:id',
    component: RoutingDetailComponent,
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
  {
    path: 'work-orders',
    component: WorkOrderListComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'work-orders/kanban',
    component: WorkOrdersKanbanComponent,
    data: { extraParameter: 'productionMenu', darkTheme: true },
  },
  {
    path: 'work-orders/planning',
    component: WorkOrdersPlanningComponent,
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
    RoutingListComponent,
    RoutingDetailComponent,
    WorkOrderListComponent,
    WorkOrdersKanbanComponent,
    WorkOrdersPlanningComponent,
  ],
  imports: [SharedModule, ListStateComponent, DragDropModule, RouterModule.forChild(routes)],
})
export class ProductionFeatureModule {}
