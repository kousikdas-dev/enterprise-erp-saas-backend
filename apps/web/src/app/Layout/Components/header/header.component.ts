import {Component, HostBinding, ChangeDetectionStrategy} from '@angular/core';
import {Observable} from 'rxjs';
import { ConfigService } from '../../../ThemeOptions/store/config.service';
import { ConfigState } from '../../../ThemeOptions/store/config.state';
import { faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import {ThemeOptions} from '../../../theme-options';
import {PageThemeService} from '../../services/page-theme.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,})
export class HeaderComponent {

  faEllipsisV = faEllipsisV;

  public config$: Observable<ConfigState>;
  public readonly activeModuleLabel;
  public readonly activeModuleIcon;
  public readonly activeModuleBgClass;
  public readonly activeModuleBadgeImage;

  constructor(
    public globals: ThemeOptions,
    private configService: ConfigService,
    private pageThemeService: PageThemeService,
  ) {
    this.config$ = this.configService.config$;
    this.activeModuleLabel = this.pageThemeService.activeModuleLabel;
    this.activeModuleIcon = this.pageThemeService.activeModuleIcon;
    this.activeModuleBgClass = this.pageThemeService.activeModuleBgClass;
    this.activeModuleBadgeImage = this.pageThemeService.activeModuleBadgeImage;
  }

  @HostBinding('class.isActive')
  get isActiveAsGetter() {
    return this.isActive;
  }

  isActive = false;

  toggleSidebarMobile() {
    this.globals.toggleSidebarMobile.set(!this.globals.toggleSidebarMobile());
  }

  toggleHeaderMobile() {
    this.globals.toggleHeaderMobile.set(!this.globals.toggleHeaderMobile());
  }

}
