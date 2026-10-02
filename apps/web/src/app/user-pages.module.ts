import { NgModule } from '@angular/core';
import { SharedModule } from './shared.module';

// User Pages Components
import { LoginBoxedComponent } from './DemoPages/UserPages/login-boxed/login-boxed.component';

@NgModule({
  declarations: [
    LoginBoxedComponent
  ],
  imports: [
    SharedModule
  ],
  exports: [
    LoginBoxedComponent
  ]
})
export class UserPagesModule { }
