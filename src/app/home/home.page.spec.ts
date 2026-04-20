import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the easy remote call to action', () => {
    expect(fixture.nativeElement.textContent).toContain('EASY REMOTE');
  });

  it('renders the welcome copy and contact section', () => {
    expect(fixture.nativeElement.textContent).toContain('Hello! Thank you for choosing');
    expect(fixture.nativeElement.textContent).toContain('CONTACT US');
    expect(fixture.nativeElement.textContent).toContain('09063071291');
  });

  it('links the main action to the easy remote page', () => {
    const cta = fixture.nativeElement.querySelector('.remote-button') as HTMLAnchorElement;

    expect(cta.getAttribute('href')).toContain('/devices');
  });
});
