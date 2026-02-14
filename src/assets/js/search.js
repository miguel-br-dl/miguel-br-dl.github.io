(function () {
  const root = document.querySelector('[data-search-page="blog"]');
  if (!root) {
    return;
  }

  if (typeof window.Fuse === 'undefined') {
    console.error('Fuse.js não foi carregado.');
    return;
  }

  const input = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const tagFilter = document.getElementById('tag-filter');
  const countEl = document.getElementById('search-count');
  const resultsEl = document.getElementById('blog-results');
  const emptyMessage = resultsEl?.dataset?.emptyMessage || 'Nenhum resultado.';
  const basePath = window.__SITE_BASE_PATH__ || '';

  const safePath = (path) => {
    if (!basePath) return path;
    return `${basePath}${path}`;
  };

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const toCardHtml = (post) => {
    const tags = (post.tags || [])
      .map((tag) => {
        const slug = (post.tagSlugs || {})[tag] || '';
        return `<a class="tag-link" href="${safePath(`/tags/${slug}.html`)}">#${esc(tag)}</a>`;
      })
      .join('');

    return `
      <article class="article-card">
        <img class="card-cover" src="${esc(post.coverImage || '')}" alt="Capa de ${esc(
          post.title
        )}" loading="lazy">
        <div class="card-body">
          <p class="card-meta">${esc(post.category)} · ${esc(post.date || '')}</p>
          <h2 class="card-title"><a href="${esc(post.url)}">${esc(post.title)}</a></h2>
          <p class="card-summary">${esc(post.summary || '')}</p>
          <div class="tags-row">${tags}</div>
        </div>
      </article>
    `;
  };

  const fetchJson = async (path) => {
    const response = await fetch(safePath(path));
    if (!response.ok) {
      throw new Error(`Erro ao buscar ${path}`);
    }
    return response.json();
  };

  const render = (posts) => {
    if (!resultsEl) return;

    if (!posts.length) {
      resultsEl.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
      countEl.textContent = '0 artigo(s)';
      return;
    }

    resultsEl.innerHTML = posts.map(toCardHtml).join('');
    countEl.textContent = `${posts.length} artigo(s)`;
  };

  Promise.all([fetchJson('/search-index.json'), fetchJson('/tags.json')])
    .then(([index, tagMap]) => {
      const fuse = new window.Fuse(index, {
        threshold: 0.35,
        includeScore: true,
        keys: [
          { name: 'title', weight: 0.45 },
          { name: 'summary', weight: 0.25 },
          { name: 'tags', weight: 0.2 },
          { name: 'category', weight: 0.1 }
        ]
      });

      const applyFilters = () => {
        const term = (input.value || '').trim();
        const category = categoryFilter.value;
        const tag = tagFilter.value;

        let scoped = index;

        if (category) {
          scoped = scoped.filter((post) => post.category === category);
        }

        if (tag) {
          scoped = scoped.filter((post) => (post.tags || []).includes(tag));
        }

        if (term) {
          const scopedUrls = new Set(scoped.map((post) => post.url));
          scoped = fuse
            .search(term)
            .map((item) => item.item)
            .filter((post) => scopedUrls.has(post.url));
        }

        render(scoped);
      };

      const tagsFromMap = Object.keys(tagMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      if (tagFilter.options.length <= 1) {
        tagFilter.insertAdjacentHTML(
          'beforeend',
          tagsFromMap.map((tag) => `<option value="${esc(tag)}">${esc(tag)}</option>`).join('')
        );
      }

      input.addEventListener('input', applyFilters);
      categoryFilter.addEventListener('change', applyFilters);
      tagFilter.addEventListener('change', applyFilters);

      applyFilters();
    })
    .catch((error) => {
      console.error(error);
      countEl.textContent = 'Busca indisponível.';
    });
})();
