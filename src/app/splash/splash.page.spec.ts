import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SplashPage } from './splash.page';

describe('SplashPage', () => {
  let component: SplashPage;
  let fixture: ComponentFixture<SplashPage>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplashPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SplashPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('renders the branded remote wordmark', () => {
    fixture.detectChanges();

    const wordmark = fixture.nativeElement.querySelector('.remote-wordmark') as HTMLElement;
    const logoLetter = fixture.nativeElement.querySelector('.wordmark-logo img') as HTMLImageElement;

    expect(wordmark.getAttribute('aria-label')).toBe('REMOTE');
    expect(logoLetter.getAttribute('src')).toContain('assets/logo.png');
  });

  it('navigates to home after two seconds', fakeAsync(() => {
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    fixture.detectChanges();
    tick(2000);

    expect(navigateSpy).toHaveBeenCalledWith('/home', { replaceUrl: true });
  }));
});
