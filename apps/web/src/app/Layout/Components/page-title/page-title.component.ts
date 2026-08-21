import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faStar, faPlus } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-page-title',
  templateUrl: './page-title.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
})
export class PageTitleComponent {
  faStar = faStar;
  faPlus = faPlus;

  @Input() heading: string = '';
  @Input() subheading: string = '';
  @Input() icon: string = '';
  @Input() showActions = true;
  @Input() compact = false;
}
