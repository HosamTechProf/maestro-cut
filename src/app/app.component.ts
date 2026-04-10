import { Component } from '@angular/core';
import { EditorComponent } from './features/editor/editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [EditorComponent],
  template: `<app-editor />`,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
  `],
})
export class AppComponent {}
