import { redirect } from 'next/navigation';

/**
 * The root is the staff sign-in.
 *
 * This used to be a signpost page listing every staff screen, which meant an
 * extra click on the way to the only thing anyone opens the bare domain for,
 * and published a directory of /kitchen, /supervisor and /admin to whoever
 * reached the root. Guests never come through here — they arrive on
 * /t/<qr-token> from the code on their table.
 *
 * A temporary redirect, not a permanent one: browsers cache a 308 more or
 * less for ever, which would make putting anything else at the root later a
 * problem for every device that had visited before.
 */
export default function Home() {
  redirect('/login');
}
