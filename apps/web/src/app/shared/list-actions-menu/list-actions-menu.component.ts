import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';

/**
 * Gear icon + actions dropdown shown next to a list page's title
 * (Import / Export / Knowledge / Dashboard / Spreadsheet). All items are
 * UI placeholders for now — wiring them up is a later phase.
 */
@Component({
  selector: 'app-list-actions-menu',
  templateUrl: './list-actions-menu.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, NgbDropdownModule],
})
export class ListActionsMenuComponent {
  /** Used for the trigger button's aria-label, e.g. "Quotations actions". */
  @Input() label = 'List';
}
