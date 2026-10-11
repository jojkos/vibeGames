/* Shared markup for the variants with HTML catalogs, plus their no-JS snapshots.
   Run `node tools/sync-catalog.js` after editing games.js to refresh snapshots. */
(function (root, factory) {
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else {
    root.GameCatalog = catalog;
    document.querySelectorAll('[data-game-catalog]').forEach(function (host) {
      host.innerHTML = catalog.render(host.dataset.gameCatalog, root.GAMES, host.innerHTML);
    });
    document.querySelectorAll('[data-game-count]').forEach(function (el) {
      el.textContent = root.GAMES.length;
    });
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function render(type, games, previous) {
    var logs = {};
    if (type === 'log') {
      (previous || '').replace(/<article\b[^>]*data-name="([^"]+)"[^>]*>[\s\S]*?<\/article>/g, function (html, name) {
        logs[name] = html;
        return html;
      });
    }
    return games.map(function (g, i) {
      var n = String(i + 1).padStart(2, '0');
      var name = esc(g.name), title = esc(g.name.toUpperCase());
      var url = esc(g.url), img = esc(g.img), tag = esc(g.tag);
      var link = '<a href="' + url + '">' + name + '</a>';
      if (type === 'links') return link;
      if (type === 'list') return '<li>' + link + '</li>';
      if (type === 'tagged') return '<li>' + link + ' <span class="tag">— ' + tag.toLowerCase() + '</span></li>';
      if (type === 'rows') return '<a class="row" href="' + url + '" data-img="' + img + '">' +
        '<span class="row-index" aria-hidden="true">' + n + '</span>' +
        '<span class="row-media"><img src="' + img + '" alt="" loading="lazy"></span>' +
        '<h2 class="row-title">' + title + '</h2>' +
        '<span class="row-meta mono"><span class="tag">' + tag.toLowerCase() + '</span>' +
        '<span class="domain">' + esc(new URL(g.url, 'https://jojkos.github.io/vibeGames/').hostname) + '</span></span></a>';
      if (type === 'transmissions') return '<a class="row" href="' + url + '"><span class="n">' + n + '</span>' +
        '<img src="' + img + '" loading="lazy" alt="" width="84" height="48"><span class="nm">' + title + '</span>' +
        '<span class="tag">' + tag + '</span><span class="fq">' + (88.1 + i * 1.3).toFixed(1).padStart(5, '0') + '</span></a>';
      if (type === 'log') {
        // Keep the original authored patch notes when an entry already exists.
        if (logs[name]) return logs[name]
          .replace(/data-url="[^"]*"/, 'data-url="' + url + '"')
          .replace(/data-img="[^"]*"/, 'data-img="' + img + '"')
          .replace(/data-tag="[^"]*"/, 'data-tag="' + tag + '"')
          .replace(/(class="run" href=")[^"]*"/, '$1' + url + '"')
          .replace(/(<img src=")[^"]*"/, '$1' + img + '"')
          .replace(/id="e\d+"/, 'id="e' + n + '"')
          .replace(/(<div class="rail"[^>]*><span>)\d+(<\/span>)/, '$1' + n + '$2')
          .replace(/\[FIG \d+\]/, '[FIG ' + n + ']');
        return '<article class="entry" id="e' + n + '" data-name="' + name + '" data-tag="' + tag +
          '" data-url="' + url + '" data-img="' + img + '">' +
          '<div class="rail" aria-hidden="true"><span>' + n + '</span></div><div class="log">' +
          '<header class="loghead"><span class="ver">' + esc(g.createdAt.slice(0, 10)) + '</span>' +
          '<h2 class="title">' + title + '</h2><span class="tag">' + tag + '</span></header>' +
          '<p class="desc">' + esc(g.blurb) + '</p><p class="meta">' + g.meta.map(esc).join(' · ') + '</p>' +
          '<div class="actions"><button class="break-btn js-only" type="button">[ break ]</button>' +
          '<button class="rebuild-btn js-only" type="button" hidden>[ rebuild ]</button>' +
          '<a class="run" href="' + url + '">[ RUN ▸ ]</a></div></div><figure class="fig">' +
          '<img src="' + img + '" alt="' + name + ' screenshot" width="1024" height="640" decoding="async">' +
          '<figcaption>[FIG ' + n + '] · ' + esc(g.img.split('/').pop()) + ' · grayscale until noticed</figcaption></figure></article>';
      }
      throw new Error('Unknown catalog layout: ' + type);
    }).join('\n');
  }
  return { render: render };
});
