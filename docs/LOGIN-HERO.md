# Static assets

`apps/web/public` is served from the site root: `apps/web/public/foo.webp` →
`/foo.webp`. Everything in it is public, so keep notes like this one out.

## login-hero.webp

The photograph behind the left-hand panel on `/login`. 1800x1200, WebP
quality 58, ~182 KB — it sits under a 0.5–0.9 black scrim, so fine detail is
invisible and a low quality setting costs nothing visible while keeping the
sign-in screen light.

The panel layers it over a gradient, so if the file is ever missing or fails
to decode the browser drops that layer and the panel still reads.

To replace it, prefer a wide room shot with the detail on the right — the
headline sits over the left third, where the scrim is heaviest:

    node -e "require('sharp')('room.jpg')
      .resize(1800, null, { withoutEnlargement: true })
      .webp({ quality: 58 })
      .toFile('apps/web/public/login-hero.webp')"
