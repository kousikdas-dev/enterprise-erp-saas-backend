import {Component, HostListener, OnDestroy, OnInit, afterNextRender, ChangeDetectionStrategy} from '@angular/core';
import {ThemeOptions} from '../../../theme-options';
import {Observable, Subscription} from 'rxjs';
import { filter } from 'rxjs/operators';
import { ConfigService } from '../../../ThemeOptions/store/config.service';
import { ConfigState } from '../../../ThemeOptions/store/config.state';
import {ActivatedRoute, NavigationEnd, Router} from '@angular/router';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* Override the existing styles with important to ensure animation works */
    .vsm-dropdown {
      max-height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out !important;
      position: relative !important;
    }

    .vsm-dropdown-show {
      max-height: 800px !important;
      opacity: 1 !important;
    }

    /* Arrow rotation - override existing transform */
    .vsm-item.has-sub .vsm-arrow {
      transition: transform 0.3s ease !important;
      transform: rotate(270deg) !important;  /* Point right */
    }

    .vsm-item.has-sub.vsm-open .vsm-arrow {
      transform: rotate(360deg) !important;  /* Point down */
    }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  public extraParameter: string | undefined;
  public openMenus: string[] = [];

  // ERP: dashboardMenu, salesMenu, purchaseMenu, inventoryMenu, adminMenu, auditMenu
  // Theme demo: dashboardsMenu, pagesMenu, elementsMenu, componentsMenu,
  // tablesMenu, formsMenu, chartsMenu, widgetsMenu

  public config$: Observable<ConfigState>;
  private routeSub?: Subscription;

  constructor(
    public globals: ThemeOptions,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private configService: ConfigService
  ) {
    this.config$ = this.configService.config$;

    afterNextRender(() => {
      this.innerWidth = window.innerWidth;
      if (this.innerWidth < 1200) {
        this.globals.toggleSidebar.set(true);
      }
    });
  }

  private newInnerWidth = 0;
  private innerWidth = 0;
  activeId = 'dashboardsMenu';

  toggleSidebar() {
    this.globals.toggleSidebar.set(!this.globals.toggleSidebar());
    if (this.globals.toggleSidebar()) {
      this.globals.sidebarHover.set(false);
    }
  }

  onSidebarMouseEnter() {
    if (this.globals.toggleSidebar()) {
      this.globals.sidebarHover.set(true);
    }
  }

  onSidebarMouseLeave() {
    if (this.globals.toggleSidebar()) {
      this.globals.sidebarHover.set(false);
    }
  }

  ngOnInit() {
    this.syncMenuFromRoute();
    this.routeSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.syncMenuFromRoute());
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  private syncMenuFromRoute() {
    this.extraParameter = this.findExtraParameter(this.activatedRoute);
    if (this.extraParameter && !this.openMenus.includes(this.extraParameter)) {
      this.openMenus = [this.extraParameter];
    }
  }

  private findExtraParameter(route: ActivatedRoute): string | undefined {
    let current: ActivatedRoute | null = route;
    let found: string | undefined;
    while (current) {
      const value = current.snapshot.data['extraParameter'];
      if (typeof value === 'string' && value.length > 0) {
        found = value;
      }
      current = current.firstChild;
    }
    return found;
  }

  toggleSubmenu(menuId: string) {
    // Toggle submenu: close if open, open if closed (and close all others)
    const index = this.openMenus.indexOf(menuId);
    if (index > -1) {
      this.openMenus.splice(index, 1);
    } else {
      this.openMenus = [menuId]; // Close others and open this one
    }
  }

  onNavigate() {
    if (window.innerWidth < 1200) {
      this.globals.toggleSidebarMobile.set(true);
      this.globals.sidebarHover.set(false);
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.newInnerWidth = (event.target as Window).innerWidth;
    this.globals.toggleSidebar.set(this.newInnerWidth < 1200);
  }
}
