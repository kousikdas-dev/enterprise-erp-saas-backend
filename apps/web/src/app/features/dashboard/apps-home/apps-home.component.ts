import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NAV_ITEMS, TopNavItem } from '../../../Layout/nav-items';

@Component({
  selector: 'app-apps-home',
  templateUrl: './apps-home.component.html',
  styleUrl: './apps-home.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, RouterModule],
})
export class AppsHomeComponent {
  readonly apps: TopNavItem[] = NAV_ITEMS;
}
