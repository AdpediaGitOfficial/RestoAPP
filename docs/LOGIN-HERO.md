# Static assets

Served from the site root: `apps/web/public/foo.jpg` → `/foo.jpg`.

## login-hero.jpg

The photograph behind the left-hand panel on `/login`. It is **optional**:
the panel layers it under two scrims and over a gradient, so if the file is
absent the browser drops that one layer and the gradient carries the panel.
Drop the file in and it appears — no code change.

What works well:
  * A wide room shot, landscape, 2000px or wider.
  * Detail on the right, calm on the left — the headline sits over the left
    third, and the scrim is heaviest there.
  * Keep it under ~300 KB. To convert:
      npx sharp-cli -i room.jpg -o login-hero.jpg resize 2000 --fit inside -- jpeg --quality 78
