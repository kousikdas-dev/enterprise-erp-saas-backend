import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PageTitleComponent } from '../../Layout/Components/page-title/page-title.component';

@Component({
  selector: 'app-placeholder-page',
  templateUrl: './placeholder-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, PageTitleComponent],
})
export class PlaceholderPageComponent implements OnInit {
  @Input() heading = 'Page';
  @Input() subheading = '';
  @Input() icon = 'pe-7s-info';
  @Input() phaseMessage = 'Coming in a later Frontend Phase.';

  constructor(private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    const data = this.route.snapshot.data;
    if (data['heading']) {
      this.heading = data['heading'];
    }
    if (data['subheading']) {
      this.subheading = data['subheading'];
    }
    if (data['icon']) {
      this.icon = data['icon'];
    }
    if (data['phaseMessage']) {
      this.phaseMessage = data['phaseMessage'];
    }
  }
}
