/**
 * The Qpab logo.
 *
 * Generated from public/logo.svg, which stays the canonical asset. It is
 * inlined rather than loaded through <img> for one reason: the ink parts are
 * `currentColor`, so the same markup reads correctly on the white staff
 * header, on the dark kitchen board and over the photograph on the sign-in
 * screen. An <img> cannot inherit colour, which would mean shipping and
 * maintaining a second, near-identical file.
 *
 * The red is fixed. Only the near-black parts follow the surface — the two
 * dark corner dots, the connecting bars and the wordmark — because at
 * #0f1014 they disappear against anything dark.
 */

const RED = '#fc1216';

export default function Logo({ variant = 'full', className, title = 'Qpab' }: {
  /** 'mark' drops the wordmark: use it wherever the 3.8:1 lockup would have
   *  to shrink past the point the word is readable. */
  variant?: 'full' | 'mark';
  className?: string;
  title?: string;
}) {
  const mark = (
    <g>
      <g>
      <circle fill={RED} cx="11.91" cy="11.91" r="11.91"/>
      <circle fill={RED} cx="72.54" cy="72.81" r="11.91"/>
      <circle fill="currentColor" cx="11.91" cy="72.81" r="11.91"/>
      <circle fill="currentColor" cx="72.54" cy="11.91" r="11.91"/>
      <path fill="currentColor" d="M28.4,10.07h28.21c.34,0,.61.27.61.61v1.96c0,.62-.5,1.12-1.12,1.12h-28.21c-.34,0-.61-.27-.61-.61v-1.96c0-.62.5-1.12,1.12-1.12Z"/>
      <path fill="currentColor" d="M28.4,71.02h28.21c.34,0,.61.27.61.61v1.96c0,.62-.5,1.12-1.12,1.12h-28.21c-.34,0-.61-.27-.61-.61v-1.96c0-.62.5-1.12,1.12-1.12Z"/>
      <path fill="currentColor" d="M60.85,40.7h27.04c.34,0,.61.27.61.61v1.42c0,.62-.5,1.12-1.12,1.12h-27.04c-.34,0-.61-.27-.61-.61v-1.42c0-.62.5-1.12,1.12-1.12Z" transform="translate(31.84 116.39) rotate(-90)"/>
      <path fill="currentColor" d="M-1.35,40.7h27.04c.34,0,.61.27.61.61v1.42c0,.62-.5,1.12-1.12,1.12H-1.86c-.34,0-.61-.27-.61-.61v-1.42c0-.62.5-1.12,1.12-1.12Z" transform="translate(-30.36 54.18) rotate(-90)"/>
      </g>
      <rect fill={RED} x="23.12" y="25.09" width="38.26" height="38.26"/>
      <rect fill="#fff" x="32.06" y="34.03" width="20.37" height="20.37"/>
    </g>
  );

  if (variant === 'mark') {
    return (
      // Cropped to the mark, with room for the bars that overhang the dots.
      <svg viewBox="-3 -3 95 91" className={className} role="img" aria-label={title}>
        {mark}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 347.56 90.86" className={className} role="img" aria-label={title}>
      {mark}
      <g fill="currentColor">
        <path d="M163.57,75.43h-34.65c-9.57,0-17.72-3.37-24.46-10.11-6.74-6.74-10.11-14.89-10.11-24.46s3.37-17.73,10.11-24.5c6.74-6.77,14.89-10.15,24.46-10.15s17.73,3.38,24.5,10.15c6.77,6.77,10.15,14.93,10.15,24.5,0,5.84-1.49,11.22-4.47,16.15-2.98,4.93-6.84,8.93-11.59,12l.18.27h15.88v6.14ZM108.89,20.61c-5.47,5.62-8.21,12.38-8.21,20.26s2.74,14.59,8.21,20.12c5.47,5.54,12.12,8.3,19.94,8.3s14.59-2.77,20.12-8.3c5.53-5.53,8.3-12.24,8.3-20.12s-2.78-14.63-8.35-20.26c-5.57-5.62-12.26-8.44-20.08-8.44s-14.47,2.81-19.94,8.44Z"/>
        <path d="M179.18,23.19v10.56h.18c2.35-3.49,5.37-6.38,9.07-8.66,3.7-2.29,7.99-3.43,12.86-3.43,7.58,0,14.02,2.69,19.31,8.08,5.29,5.38,7.94,11.93,7.94,19.63s-2.65,14.15-7.94,19.54c-5.29,5.38-11.73,8.08-19.31,8.08-4.93,0-9.24-1.13-12.9-3.38-3.67-2.26-6.68-5.16-9.02-8.71h-.18v25.99h-6.14V23.19h6.14ZM179.18,49.35c0,5.96,2.12,11.05,6.36,15.3,4.24,4.24,9.31,6.36,15.21,6.36s11.02-2.12,15.21-6.36c4.18-4.24,6.27-9.34,6.27-15.3s-2.09-11.14-6.27-15.39c-4.18-4.24-9.25-6.36-15.21-6.36s-10.96,2.12-15.21,6.36c-4.24,4.24-6.36,9.37-6.36,15.39Z"/>
        <path d="M281.24,39.43v36h-6.14v-8.84h-.18c-4.51,6.92-11.04,10.38-19.58,10.38-8,0-13.93-2.62-17.78-7.85-3.07-4.21-3.97-8.78-2.71-13.72,1.26-4.93,4.45-8.42,9.57-10.47,2.65-1.08,5.65-1.62,9.02-1.62h21.66v-3.88c0-3.67-1.31-6.56-3.93-8.66-2.62-2.11-6.54-3.16-11.78-3.16s-8.96.98-11.55,2.93c-2.59,1.96-3.88,4.53-3.88,7.72h-6.41c0-4.87,1.97-8.86,5.91-11.96,3.94-3.1,9.25-4.65,15.93-4.65s12.21,1.64,16.06,4.92c3.85,3.28,5.77,7.57,5.77,12.86ZM275.1,49.45h-21.66c-5.78,0-9.66,1.87-11.64,5.59-1.68,3.19-1.53,6.41.45,9.66,2.41,3.91,6.38,6.02,11.91,6.32h1.17c5.41,0,10.06-1.67,13.94-5.01s5.82-7.66,5.82-12.95v-3.61Z"/>
        <path d="M298.2,64.88v10.56h-6.14V7.76h6.14v25.99h.18c2.35-3.55,5.35-6.45,9.02-8.71,3.67-2.26,7.97-3.38,12.9-3.38,7.58,0,14.02,2.69,19.31,8.08,5.29,5.38,7.94,11.9,7.94,19.54s-2.65,14.24-7.94,19.63c-5.29,5.38-11.73,8.08-19.31,8.08-4.87,0-9.16-1.14-12.86-3.43-3.7-2.29-6.72-5.17-9.07-8.66h-.18ZM298.2,49.26c0,6.02,2.12,11.14,6.36,15.39,4.24,4.24,9.31,6.36,15.21,6.36s11.02-2.12,15.21-6.36c4.18-4.24,6.27-9.37,6.27-15.39s-2.09-11.05-6.27-15.3c-4.18-4.24-9.25-6.36-15.21-6.36s-10.96,2.12-15.21,6.36-6.36,9.34-6.36,15.3Z"/>
      </g>
    </svg>
  );
}
