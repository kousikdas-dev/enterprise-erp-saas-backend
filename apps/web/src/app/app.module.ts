import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { configReducer } from './ThemeOptions/store/config.reducer.ngrx';
import { ConfigService } from './ThemeOptions/store/config.service';
import { environment } from '../environments/environment';
import { AppRoutingModule } from './app-routing.module';

import { CommonModule } from '@angular/common';
import { AppComponent } from './app.component';

import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { FormPagesModule } from './forms.module';
import { TablesModule } from './tables.module';
import { WidgetsModule } from './widgets.module';
import { ComponentsModule } from './components.module';
import { DashboardsModule } from './dashboards.module';
import { ElementsModule } from './elements.module';
import { UserPagesModule } from './user-pages.module';
import { ChartsModule } from './charts.module';
import { SharedModule } from './shared.module';

import { BaseLayoutComponent } from './Layout/base-layout/base-layout.component';
import { PagesLayoutComponent } from './Layout/pages-layout/pages-layout.component';

import { HeaderComponent } from './Layout/Components/header/header.component';
import { SearchBoxComponent } from './Layout/Components/header/elements/search-box/search-box.component';
import { UserBoxComponent } from './Layout/Components/header/elements/user-box/user-box.component';
import { NotificationsBoxComponent } from './Layout/Components/header/elements/notifications-box/notifications-box';
import { MessagesBoxComponent } from './Layout/Components/header/elements/messages-box/messages-box';

import { SidebarComponent } from './Layout/Components/sidebar/sidebar.component';
import { LogoComponent } from './Layout/Components/sidebar/elements/logo/logo.component';

import { FooterComponent } from './Layout/Components/footer/footer.component';

import { ThemeOptions } from './theme-options';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { ToastContainerComponent } from './shared/toast/toast-container.component';

@NgModule({
  declarations: [
    AppComponent,
    BaseLayoutComponent,
    PagesLayoutComponent,
    HeaderComponent,
    SearchBoxComponent,
    UserBoxComponent,
    NotificationsBoxComponent,
    MessagesBoxComponent,
    SidebarComponent,
    LogoComponent,
    FooterComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    RouterModule,
    BrowserAnimationsModule,
    StoreModule.forRoot({ config: configReducer }),
    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: environment.production,
    }),
    CommonModule,
    NgbModule,
    FontAwesomeModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    ToastContainerComponent,
    DashboardsModule,
    ElementsModule,
    UserPagesModule,
    ChartsModule,
    FormPagesModule,
    TablesModule,
    WidgetsModule,
    ComponentsModule,
  ],
  providers: [
    ConfigService,
    ThemeOptions,
    provideCharts(withDefaultRegisterables()),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
