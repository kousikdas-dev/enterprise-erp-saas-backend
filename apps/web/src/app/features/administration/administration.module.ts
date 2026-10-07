import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared.module';
import { ListStateComponent } from '../../shared/list-state/list-state.component';
import { PermissionListComponent } from './permissions/permission-list.component';
import { RoleListComponent } from './roles/role-list.component';
import { UserListComponent } from './users/user-list.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'users',
    component: UserListComponent,
    data: { extraParameter: 'adminMenu', darkTheme: true },
  },
  {
    path: 'roles',
    component: RoleListComponent,
    data: { extraParameter: 'adminMenu', darkTheme: true },
  },
  {
    path: 'permissions',
    component: PermissionListComponent,
    data: { extraParameter: 'adminMenu', darkTheme: true },
  },
];

@NgModule({
  declarations: [UserListComponent, RoleListComponent, PermissionListComponent],
  imports: [SharedModule, ListStateComponent, RouterModule.forChild(routes)],
})
export class AdministrationFeatureModule {}
