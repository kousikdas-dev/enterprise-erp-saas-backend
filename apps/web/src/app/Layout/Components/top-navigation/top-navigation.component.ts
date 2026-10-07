import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NAV_ITEMS, TopNavItem } from '../../nav-items';

@Component({
  selector: 'app-top-navigation',
  templateUrl: './top-navigation.component.html',
  styleUrls: ['./top-navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class TopNavigationComponent implements OnInit, OnDestroy {
  public activeModule: string | undefined;
  public openModule: string | undefined;

  public readonly items: TopNavItem[] = NAV_ITEMS;

  private routeSub?: Subscription;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.syncFromRoute();
    this.routeSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.syncFromRoute());
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  get openItem(): TopNavItem | undefined {
    return this.items.find((item) => item.id === this.openModule);
  }

  private syncFromRoute(): void {
    this.activeModule = this.findExtraParameter(this.activatedRoute);
    const activeItem = this.items.find((item) => item.id === this.activeModule);
    this.openModule =
      activeItem?.children || activeItem?.dropdownGroups || activeItem?.configItems
        ? this.activeModule
        : undefined;
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
}
