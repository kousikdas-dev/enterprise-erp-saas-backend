import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { PageTitleComponent } from './Layout/Components/page-title/page-title.component';
import { PlaceholderPageComponent } from './shared/placeholder-page/placeholder-page.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    NgbModule,
    FontAwesomeModule,
    PageTitleComponent,
    PlaceholderPageComponent,
  ],
  exports: [
    PageTitleComponent,
    PlaceholderPageComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    NgbModule,
    FontAwesomeModule,
  ],
})
export class SharedModule {}
