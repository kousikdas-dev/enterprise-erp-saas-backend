import { Injectable, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NAV_ITEMS } from '../nav-items';

const DASHBOARD_ITEM = NAV_ITEMS.find((item) => item.id === 'dashboardMenu')!;

/**
 * Tracks route data for the currently active route tree so shared layout
 * pieces can stay in sync without each re-walking the route tree:
 * - `darkTheme: true` — dark gradient page theme (header, footer, page content).
 * - the active module (from `extraParameter`, matched against NAV_ITEMS) —
 *   its label and icon are shown as a badge in the header.
 */
@Injectable({ providedIn: 'root' })
export class PageThemeService {
  readonly darkTheme = signal(false);
  readonly activeModuleLabel = signal(DASHBOARD_ITEM.label);
  readonly activeModuleIcon = signal(DASHBOARD_ITEM.icon);
  readonly activeModuleBgClass = signal(DASHBOARD_ITEM.bgClass);
  readonly activeModuleBadgeImage = signal(DASHBOARD_ITEM.headerBadgeImage);

  constructor(private readonly router: Router) {
    this.sync();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.sync());
  }

  private sync(): void {
    let current: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let darkTheme = false;
    let extraParameter: string | undefined;
    while (current) {
      if (current.data['darkTheme']) {
        darkTheme = true;
      }
      if (typeof current.data['extraParameter'] === 'string' && current.data['extraParameter'].length > 0) {
        extraParameter = current.data['extraParameter'];
      }
      current = current.firstChild;
    }
    this.darkTheme.set(darkTheme);
    // Modals (ngb-modal-window) are appended to <body>, outside .app-container,
    // so a body-level class is how the dark theme reaches them too.
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('app-dark-theme', darkTheme);
    }
    const activeItem = NAV_ITEMS.find((item) => item.id === extraParameter) ?? DASHBOARD_ITEM;
    this.activeModuleLabel.set(activeItem.label);
    this.activeModuleIcon.set(activeItem.icon);
    this.activeModuleBgClass.set(activeItem.bgClass);
    this.activeModuleBadgeImage.set(activeItem.headerBadgeImage);
  }
}
