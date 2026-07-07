# miku-wwl.github.io

Personal site and portfolio for Weilai Wang.

Built with [Astro](https://astro.build/). The site uses a terminal-inspired design with dark and light themes, resume downloads, project notes, experience, certifications, and blog posts.

## Local development

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static build -> ./dist
npm run preview
```

## Project layout

- `src/pages/` — routes (`index`, `about`, `experience`, `certifications`, `projects`, `blog/`)
- `src/layouts/BlogPost.astro` — blog post layout
- `src/components/` — shared UI components
- `src/styles/global.css` — design tokens and themes
- `src/content/blog/` — Markdown posts
- `public/` — static assets

## License

Content © Weilai Wang. Code is provided as-is.
