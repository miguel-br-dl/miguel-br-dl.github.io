#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const { minify } = require('html-minifier-terser');

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const POSTS_DIR = path.join(SRC_DIR, 'posts');
const TEMPLATES_DIR = path.join(SRC_DIR, 'templates');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');
const BUILD_DIR = path.join(ROOT, 'build');
const REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const REPOSITORY_OWNER = process.env.GITHUB_REPOSITORY_OWNER || '';

const SITE = {
  name: 'Miguel Angelo Moutinho',
  description:
    'Blog e portfólio técnico sobre Java, Python e Inteligência Artificial para desenvolvedores.',
  origin: normalizeOrigin(process.env.SITE_URL || inferDefaultOrigin(REPOSITORY_OWNER)),
  basePath: normalizeBasePath(process.env.BASE_PATH || inferBasePathFromRepository(REPOSITORY)),
  adsClient: 'ca-pub-2236242824534513'
};

const REQUIRED_FRONTMATTER_FIELDS = [
  'title',
  'date',
  'category',
  'summary',
  'readingTime',
  'tags',
  'coverImage'
];

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language }).value}</code></pre>`;
    }

    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
  }
});

const defaultLinkRenderer =
  md.renderer.rules.link_open ||
  function defaultLinkOpen(tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href');
  if (isExternalLink(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }

  return defaultLinkRenderer(tokens, idx, options, env, self);
};

async function main() {
  await cleanBuildDir();

  const templates = await loadTemplates();
  const posts = await loadPosts();

  const pages = [
    { file: '/index.html', lastmod: new Date().toISOString() },
    { file: '/blog.html', lastmod: new Date().toISOString() },
    { file: '/projects.html', lastmod: new Date().toISOString() },
    { file: '/about.html', lastmod: new Date().toISOString() }
  ];

  await copyAssets();
  await copyAdsFile();

  const tagsMap = buildTagsMap(posts);
  const categories = Array.from(new Set(posts.map((post) => post.category))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

  await buildHomePage(templates, posts);
  await buildBlogPage(templates, posts, categories, tagsMap);
  await buildProjectsPage(templates);
  await buildAboutPage(templates);
  await buildPostPages(templates, posts, pages);
  await buildTagPages(templates, tagsMap, pages);

  await writeJson(path.join(BUILD_DIR, 'search-index.json'), buildSearchIndex(posts));
  await writeJson(path.join(BUILD_DIR, 'tags.json'), tagsMap);

  await writeSitemap(pages);
  await writeRobots();
  await writeRss(posts);

  console.log(`Build finalizado: ${posts.length} post(s), ${Object.keys(tagsMap).length} tag(s).`);
}

async function cleanBuildDir() {
  await fs.rm(BUILD_DIR, { recursive: true, force: true });
  await fs.mkdir(BUILD_DIR, { recursive: true });
}

async function loadTemplates() {
  const names = ['base', 'index', 'blog', 'post', 'projects', 'about', 'tag'];
  const templates = {};

  await Promise.all(
    names.map(async (name) => {
      const templatePath = path.join(TEMPLATES_DIR, `${name}.html`);
      templates[name] = await fs.readFile(templatePath, 'utf8');
    })
  );

  return templates;
}

async function loadPosts() {
  const files = (await fs.readdir(POSTS_DIR)).filter((file) => file.endsWith('.md'));
  const posts = [];

  for (const file of files) {
    const source = await fs.readFile(path.join(POSTS_DIR, file), 'utf8');
    const parsed = matter(source);

    validateFrontmatter(file, parsed.data);

    const slug = slugify(path.basename(file, '.md'));
    const date = new Date(parsed.data.date);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Data inválida em ${file}: ${parsed.data.date}`);
    }

    const tags = parsed.data.tags.map((tag) => String(tag).trim()).filter(Boolean);

    const tagSlugs = Object.fromEntries(tags.map((tag) => [tag, slugify(tag)]));
    const htmlContent = addLazyLoadingToImages(md.render(parsed.content));

    posts.push({
      slug,
      title: String(parsed.data.title).trim(),
      date,
      isoDate: date.toISOString(),
      formattedDate: formatDate(date),
      category: String(parsed.data.category).trim(),
      summary: String(parsed.data.summary).trim(),
      readingTime: String(parsed.data.readingTime).trim(),
      tags,
      tagSlugs,
      coverImage: toPublicUrl(parsed.data.coverImage),
      coverImageAbsolute: toAbsoluteUrl(parsed.data.coverImage),
      url: toPublicUrl(`/posts/${slug}.html`),
      absoluteUrl: toAbsoluteUrl(`/posts/${slug}.html`),
      htmlContent,
      plainText: stripHtml(htmlContent)
    });
  }

  return posts.sort((a, b) => b.date - a.date);
}

function validateFrontmatter(filename, data) {
  const missing = REQUIRED_FRONTMATTER_FIELDS.filter((field) => !(field in data));

  if (missing.length > 0) {
    throw new Error(`${filename} está sem os campos obrigatórios: ${missing.join(', ')}`);
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    throw new Error(`${filename} deve ter ao menos uma tag em "tags".`);
  }
}

async function copyAssets() {
  await fs.cp(ASSETS_DIR, path.join(BUILD_DIR, 'assets'), { recursive: true });
}

async function copyAdsFile() {
  const adsPath = path.join(ROOT, 'ads.txt');

  try {
    await fs.access(adsPath);
    await fs.copyFile(adsPath, path.join(BUILD_DIR, 'ads.txt'));
  } catch {
    // ads.txt opcional
  }
}

function buildTagsMap(posts) {
  const tagsMap = {};

  for (const post of posts) {
    for (const tag of post.tags) {
      if (!tagsMap[tag]) {
        tagsMap[tag] = [];
      }

      tagsMap[tag].push({
        title: post.title,
        summary: post.summary,
        category: post.category,
        date: post.formattedDate,
        url: post.url,
        coverImage: post.coverImage
      });
    }
  }

  const sorted = {};
  Object.keys(tagsMap)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach((tag) => {
      sorted[tag] = tagsMap[tag];
    });

  return sorted;
}

function buildSearchIndex(posts) {
  return posts.map((post) => ({
    title: post.title,
    summary: post.summary,
    tags: post.tags,
    category: post.category,
    url: post.url,
    date: post.formattedDate,
    coverImage: post.coverImage,
    tagSlugs: post.tagSlugs
  }));
}

async function buildHomePage(templates, posts) {
  const latestPosts = posts.slice(0, 3).map((post) => renderArticleCard(post)).join('');

  const content = renderTemplate(templates.index, {
    latestPosts,
    blogUrl: toPublicUrl('/blog.html'),
    projectsUrl: toPublicUrl('/projects.html'),
    adsClient: SITE.adsClient
  });

  const html = renderLayout(templates.base, {
    content,
    metaTitle: `${SITE.name} | Blog e Portfólio Técnico`,
    metaDescription: SITE.description,
    canonicalUrl: toAbsoluteUrl('/index.html'),
    ogTitle: `${SITE.name} | Blog e Portfólio Técnico`,
    ogDescription: SITE.description,
    ogImage: toAbsoluteUrl('/assets/images/about-profile.png'),
    ogType: 'website'
  });

  await writeHtml(path.join(BUILD_DIR, 'index.html'), html);
}

async function buildBlogPage(templates, posts, categories, tagsMap) {
  const categoryOptions = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join('');

  const tagOptions = Object.keys(tagsMap)
    .map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    .join('');

  const blogCards = posts.map((post) => renderArticleCard(post)).join('');

  const content = renderTemplate(templates.blog, {
    categoryOptions,
    tagOptions,
    blogCards,
    postsCount: String(posts.length)
  });

  const html = renderLayout(templates.base, {
    content,
    metaTitle: `Blog | ${SITE.name}`,
    metaDescription: 'Artigos sobre backend, frontend e IA com aplicação prática.',
    canonicalUrl: toAbsoluteUrl('/blog.html'),
    ogTitle: `Blog Técnico | ${SITE.name}`,
    ogDescription: 'Busca local por título, resumo, tags e categoria.',
    ogImage: toAbsoluteUrl('/assets/images/front-end-news.png'),
    ogType: 'website',
    pageScripts: `\n  <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js" defer></script>\n  <script src="${toPublicUrl('/assets/js/search.js')}" defer></script>`
  });

  await writeHtml(path.join(BUILD_DIR, 'blog.html'), html);
}

async function buildProjectsPage(templates) {
  const projectCards = [
    {
      title: 'Meme Generator Receita',
      stack: 'HTML · CSS · JavaScript',
      description:
        'Gerador de memes com templates customizáveis e interface otimizada para criação rápida.',
      url: 'https://miguel-br-dl.github.io/meme_generator_receita/',
      github: 'https://github.com/miguel-br-dl/meme_generator_receita'
    },
    {
      title: 'Pipeline de Conteúdo Estático',
      stack: 'Node.js · Markdown · CI/CD',
      description:
        'Automação de build para transformar Markdown em páginas HTML com SEO e distribuição contínua.',
      url: toPublicUrl('/blog.html'),
      github: 'https://github.com/miguel-br-dl'
    },
    {
      title: 'Laboratório de IA Aplicada',
      stack: 'Python · APIs · Automação',
      description:
        'Experimentos de produtividade para engenharia de software com integração de IA em fluxos reais.',
      url: toPublicUrl('/about.html'),
      github: 'https://github.com/miguel-br-dl'
    }
  ]
    .map(
      (project) => `
      <article class="project-card">
        <h2>${escapeHtml(project.title)}</h2>
        <p class="project-stack">${escapeHtml(project.stack)}</p>
        <p>${escapeHtml(project.description)}</p>
        <p><a href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer">Abrir projeto</a> · <a href="${escapeHtml(project.github)}" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </article>
    `
    )
    .join('');

  const content = renderTemplate(templates.projects, { projectCards });

  const html = renderLayout(templates.base, {
    content,
    metaTitle: `Projetos | ${SITE.name}`,
    metaDescription: 'Projetos técnicos com foco em engenharia de software e entregas profissionais.',
    canonicalUrl: toAbsoluteUrl('/projects.html'),
    ogTitle: `Projetos Técnicos | ${SITE.name}`,
    ogDescription: 'Cards de projetos com stack e links de código.',
    ogImage: toAbsoluteUrl('/assets/images/front-end-news.png'),
    ogType: 'website'
  });

  await writeHtml(path.join(BUILD_DIR, 'projects.html'), html);
}

async function buildAboutPage(templates) {
  const content = renderTemplate(templates.about, {});

  const html = renderLayout(templates.base, {
    content,
    metaTitle: `Sobre | ${SITE.name}`,
    metaDescription:
      'Perfil técnico de Miguel Angelo Moutinho com foco em arquitetura, backend, frontend e IA.',
    canonicalUrl: toAbsoluteUrl('/about.html'),
    ogTitle: `Sobre Miguel Angelo Moutinho`,
    ogDescription: 'Trajetória técnica e visão de engenharia aplicada.',
    ogImage: toAbsoluteUrl('/assets/images/about-profile.png'),
    ogType: 'profile'
  });

  await writeHtml(path.join(BUILD_DIR, 'about.html'), html);
}

async function buildPostPages(templates, posts, pages) {
  for (const post of posts) {
    const relatedPosts = findRelatedPosts(post, posts)
      .map((related) => renderRelatedCard(related))
      .join('');

    const tagLinks = post.tags
      .map(
        (tag) =>
          `<a class="tag-link" href="${toPublicUrl(`/tags/${post.tagSlugs[tag]}.html`)}">#${escapeHtml(
            tag
          )}</a>`
      )
      .join('');

    const structuredData = buildPostStructuredData(post);

    const content = renderTemplate(templates.post, {
      homeUrl: toPublicUrl('/index.html'),
      blogUrl: toPublicUrl('/blog.html'),
      postTitle: escapeHtml(post.title),
      postCategory: escapeHtml(post.category),
      postDate: escapeHtml(post.formattedDate),
      readingTime: escapeHtml(post.readingTime),
      postSummary: escapeHtml(post.summary),
      postCoverImage: escapeHtml(post.coverImage),
      tagLinks,
      postContent: post.htmlContent,
      relatedPosts:
        relatedPosts ||
        '<p class="empty-state">Em breve mais artigos relacionados para esta categoria.</p>',
      adsClient: SITE.adsClient
    });

    const html = renderLayout(templates.base, {
      content,
      metaTitle: `${post.title} | ${SITE.name}`,
      metaDescription: post.summary,
      canonicalUrl: post.absoluteUrl,
      ogTitle: `${post.title} | ${SITE.name}`,
      ogDescription: post.summary,
      ogImage: post.coverImageAbsolute,
      ogType: 'article',
      headExtra: `\n  <meta property="article:published_time" content="${post.isoDate}">\n  <meta property="article:section" content="${escapeHtml(post.category)}">\n  ${structuredData}`
    });

    const outputPath = path.join(BUILD_DIR, 'posts', `${post.slug}.html`);
    await writeHtml(outputPath, html);

    pages.push({ file: `/posts/${post.slug}.html`, lastmod: post.isoDate });
  }
}

async function buildTagPages(templates, tagsMap, pages) {
  const tagsDir = path.join(BUILD_DIR, 'tags');
  await fs.mkdir(tagsDir, { recursive: true });

  for (const [tagName, entries] of Object.entries(tagsMap)) {
    const slug = slugify(tagName);
    const cards = entries
      .map(
        (entry) => `
        <article class="article-card">
          <img class="card-cover" src="${escapeHtml(entry.coverImage)}" alt="Capa de ${escapeHtml(
            entry.title
          )}" loading="lazy">
          <div class="card-body">
            <p class="card-meta">${escapeHtml(entry.category)} · ${escapeHtml(entry.date)}</p>
            <h2 class="card-title"><a href="${escapeHtml(entry.url)}">${escapeHtml(entry.title)}</a></h2>
            <p class="card-summary">${escapeHtml(entry.summary)}</p>
          </div>
        </article>
      `
      )
      .join('');

    const content = renderTemplate(templates.tag, {
      tagName: `#${escapeHtml(tagName)}`,
      tagCount: String(entries.length),
      tagCards: cards
    });

    const html = renderLayout(templates.base, {
      content,
      metaTitle: `Tag: ${tagName} | ${SITE.name}`,
      metaDescription: `Artigos marcados com a tag ${tagName}.`,
      canonicalUrl: toAbsoluteUrl(`/tags/${slug}.html`),
      ogTitle: `Tag ${tagName} | ${SITE.name}`,
      ogDescription: `${entries.length} artigo(s) relacionado(s) com ${tagName}.`,
      ogImage: toAbsoluteUrl('/assets/images/front-end-news.png'),
      ogType: 'website'
    });

    await writeHtml(path.join(tagsDir, `${slug}.html`), html);
    pages.push({ file: `/tags/${slug}.html`, lastmod: new Date().toISOString() });
  }
}

function renderArticleCard(post) {
  const tags = post.tags
    .map(
      (tag) =>
        `<a class="tag-link" href="${toPublicUrl(`/tags/${post.tagSlugs[tag]}.html`)}">#${escapeHtml(
          tag
        )}</a>`
    )
    .join('');

  return `
    <article class="article-card">
      <img class="card-cover" src="${escapeHtml(post.coverImage)}" alt="Capa de ${escapeHtml(
        post.title
      )}" loading="lazy">
      <div class="card-body">
        <p class="card-meta">${escapeHtml(post.category)} · ${escapeHtml(post.formattedDate)}</p>
        <h2 class="card-title"><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h2>
        <p class="card-summary">${escapeHtml(post.summary)}</p>
        <div class="tags-row">${tags}</div>
      </div>
    </article>
  `;
}

function renderRelatedCard(post) {
  return `
    <article class="related-card">
      <p class="card-meta">${escapeHtml(post.category)}</p>
      <h3><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h3>
      <p>${escapeHtml(post.summary)}</p>
    </article>
  `;
}

function findRelatedPosts(current, posts) {
  const scored = [];

  for (const post of posts) {
    if (post.slug === current.slug) {
      continue;
    }

    const sharedTags = post.tags.filter((tag) => current.tags.includes(tag)).length;
    const categoryBonus = post.category === current.category ? 2 : 0;
    const score = sharedTags + categoryBonus;

    if (score > 0) {
      scored.push({ post, score });
    }
  }

  const ordered = scored
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.post.date - a.post.date))
    .map((item) => item.post)
    .slice(0, 3);

  if (ordered.length > 0) {
    return ordered;
  }

  return posts.filter((post) => post.slug !== current.slug).slice(0, 3);
}

function renderLayout(baseTemplate, params) {
  const defaultParams = {
    metaTitle: `${SITE.name} | Blog e Portfólio Técnico`,
    metaDescription: SITE.description,
    canonicalUrl: toAbsoluteUrl('/index.html'),
    ogTitle: `${SITE.name} | Blog e Portfólio Técnico`,
    ogDescription: SITE.description,
    ogImage: toAbsoluteUrl('/assets/images/about-profile.png'),
    ogType: 'website',
    content: '',
    adsClient: SITE.adsClient,
    stylesUrl: toPublicUrl('/assets/css/styles.css'),
    highlightStylesUrl: toPublicUrl('/assets/css/highlight.css'),
    mainJsUrl: toPublicUrl('/assets/js/main.js'),
    pageScripts: '',
    headExtra: '',
    homeUrl: toPublicUrl('/index.html'),
    blogUrl: toPublicUrl('/blog.html'),
    projectsUrl: toPublicUrl('/projects.html'),
    aboutUrl: toPublicUrl('/about.html'),
    basePath: SITE.basePath
  };

  return renderTemplate(baseTemplate, { ...defaultParams, ...params });
}

async function writeSitemap(pages) {
  const unique = [];
  const seen = new Set();

  for (const page of pages) {
    if (seen.has(page.file)) {
      continue;
    }

    seen.add(page.file);
    unique.push(page);
  }

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique
  .map(
    (page) =>
      `  <url>\n    <loc>${escapeXml(toAbsoluteUrl(page.file))}</loc>\n    <lastmod>${escapeXml(
        new Date(page.lastmod).toISOString()
      )}</lastmod>\n  </url>`
  )
  .join('\n')}
</urlset>`;

  await fs.writeFile(path.join(BUILD_DIR, 'sitemap.xml'), content, 'utf8');
}

async function writeRobots() {
  const content = `User-agent: *
Allow: /
Sitemap: ${toAbsoluteUrl('/sitemap.xml')}
`;

  await fs.writeFile(path.join(BUILD_DIR, 'robots.txt'), content, 'utf8');
}

async function writeRss(posts) {
  const items = posts
    .slice(0, 20)
    .map(
      (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <description>${escapeXml(post.summary)}</description>
      <link>${escapeXml(post.absoluteUrl)}</link>
      <guid>${escapeXml(post.absoluteUrl)}</guid>
      <pubDate>${new Date(post.isoDate).toUTCString()}</pubDate>
      <category>${escapeXml(post.category)}</category>
    </item>`
    )
    .join('');

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <description>${escapeXml(SITE.description)}</description>
    <link>${escapeXml(toAbsoluteUrl('/index.html'))}</link>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`;

  await fs.writeFile(path.join(BUILD_DIR, 'rss.xml'), content, 'utf8');
}

function buildPostStructuredData(post) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    image: post.coverImageAbsolute,
    author: {
      '@type': 'Person',
      name: SITE.name
    },
    publisher: {
      '@type': 'Organization',
      name: SITE.name
    },
    mainEntityOfPage: post.absoluteUrl,
    datePublished: post.isoDate,
    dateModified: post.isoDate
  };

  return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
}

function isExternalLink(href) {
  if (!href) {
    return false;
  }

  const value = String(href).trim();
  if (!value || value.startsWith('#') || value.startsWith('/')) {
    return false;
  }

  if (/^(mailto:|tel:|javascript:)/i.test(value)) {
    return false;
  }

  try {
    const linkUrl = new URL(value, SITE.origin);
    const siteOrigin = new URL(SITE.origin).origin;
    return linkUrl.origin !== siteOrigin;
  } catch {
    return false;
  }
}

function inferDefaultOrigin(repositoryOwner) {
  if (repositoryOwner) {
    return `https://${repositoryOwner}.github.io`;
  }

  return 'https://miguel-br-dl.github.io';
}

function inferBasePathFromRepository(repository) {
  const [owner, repo] = String(repository).split('/');
  if (!owner || !repo) {
    return '';
  }

  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return '';
  }

  return `/${repo}`;
}

function normalizeOrigin(origin) {
  return String(origin || '').replace(/\/+$/, '') || 'https://miguel-br-dl.github.io';
}

function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') {
    return '';
  }

  const clean = `/${String(basePath).trim().replace(/^\/+|\/+$/g, '')}`;
  return clean === '/' ? '' : clean;
}

function toPublicUrl(rawPath) {
  if (/^https?:\/\//i.test(String(rawPath))) {
    return String(rawPath);
  }

  const normalized = normalizePath(rawPath);
  const pathWithBase = `${SITE.basePath}${normalized}`;
  return pathWithBase || '/';
}

function toAbsoluteUrl(rawPath) {
  if (/^https?:\/\//i.test(String(rawPath))) {
    return String(rawPath);
  }

  const normalized = normalizePath(rawPath);
  const pathWithBase = `${SITE.basePath}${normalized}` || '/';
  return new URL(pathWithBase, SITE.origin).toString();
}

function normalizePath(rawPath) {
  const value = String(rawPath || '').trim();

  if (!value || value === '/') {
    return '/';
  }

  return value.startsWith('/') ? value : `/${value}`;
}

function renderTemplate(template, params) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function addLazyLoadingToImages(html) {
  return html.replace(/<img\s+/g, '<img loading="lazy" ');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

async function writeHtml(filepath, html) {
  const minified = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    removeRedundantAttributes: true,
    keepClosingSlash: true,
    caseSensitive: true
  });

  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, minified, 'utf8');
}

async function writeJson(filepath, data) {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
