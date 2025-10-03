import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        'ios-src'?: string;
        poster?: string;
        ar?: boolean;
        'ar-modes'?: string;
        'ar-scale'?: string;
        'camera-controls'?: boolean;
        'shadow-intensity'?: number;
      };
    }
  }
}

export {};
