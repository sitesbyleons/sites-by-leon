/* Progressive admin UI only. Existing forms, API requests and permissions stay intact. */
(() => {
  const boot = () => {
    const root = document.querySelector('.studio-admin');
    if (!root || root.dataset.workspaceEnhanced) return;
    root.dataset.workspaceEnhanced = 'true';
    const sidebar = root.querySelector('[data-admin-sidebar]');
    const main = root.querySelector('.studio-admin__main');
    const opener = root.querySelector('.admin-nav-open');
    const mobile = window.matchMedia('(max-width: 920px)');
    if (sidebar && main && opener) {
      sidebar.id = 'admin-navigation';
      opener.setAttribute('aria-controls', sidebar.id);
      const isOpen = () => mobile.matches && document.body.classList.contains('admin-nav-visible');
      let wasOpen = false;
      const sync = () => {
        const open = isOpen();
        opener.setAttribute('aria-expanded', String(open));
        main.inert = open;
        if (open && !wasOpen) sidebar.querySelector('button')?.focus();
        if (!open && wasOpen && mobile.matches) opener.focus();
        wasOpen = open;
      };
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      mobile.addEventListener('change', () => {
        if (!mobile.matches) document.body.classList.remove('admin-nav-visible');
        sync();
      });
      document.addEventListener('keydown', event => {
        if (!isOpen()) return;
        if (event.key === 'Escape') { event.preventDefault(); document.body.classList.remove('admin-nav-visible'); }
        if (event.key === 'Tab') {
          const controls = [...sidebar.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(el => el.getClientRects().length);
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      });
      sync();
    }
    const make = (tag, className, text) => {
      const element = document.createElement(tag);
      element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    const topbar = root.querySelector('.admin-topbar');
    if (location.hostname === 'test.leonsites.org') {
      topbar?.append(make('span', 'admin-environment', 'Test workspace'));
    }
    // Native dialog keeps the original form and its event listeners intact.
    const form = root.querySelector('[data-add-client]');
    const intro = root.querySelector('.admin-intro');
    const section = form?.closest('.admin-list-section');
    if (!form || !intro || !section || typeof HTMLDialogElement === 'undefined') return;
    root.classList.add('admin-users-workspace');
    const description = intro.querySelector(':scope > p');
    if (description) description.textContent = 'Manage accounts, connect clients, and launch their sites.';
    const heading = intro.querySelector(':scope > div');
    if (description && heading) heading.append(description);
    const add = make('button', 'admin-primary-action', '+ Add client');
    add.type = 'button';
    add.setAttribute('aria-haspopup', 'dialog');
    intro.append(add);
    const dialog = make('dialog', 'admin-client-dialog');
    dialog.setAttribute('aria-labelledby', 'admin-add-client-title');
    const close = make('button', 'admin-dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close add client');
    const title = section.querySelector('h2');
    if (title) { title.id = 'admin-add-client-title'; title.textContent = 'Add a client'; }
    const explainer = section.querySelector('header > p');
    if (explainer) explainer.textContent = 'Create their site with a name and billing email. You can connect their login now or later.';
    const linkLabel = form.querySelector('[name="owner_user_id"]')?.closest('label')?.querySelector('span');
    if (linkLabel) { linkLabel.textContent = 'Connect account '; linkLabel.append(make('em', '', 'optional')); }
    dialog.append(close, section);
    root.append(dialog);
    add.addEventListener('click', () => {
      dialog.showModal();
      document.body.classList.add('admin-dialog-open');
      form.querySelector('input[name="studio_name"]')?.focus();
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.body.classList.remove('admin-dialog-open');
      add.focus();
    });

    const table = root.querySelector('[aria-label="User accounts"]');
    const results = table?.closest('.admin-list-section');
    if (!table || !results) return;
    const rows = [...table.querySelectorAll('.business-table__row')];
    const connected = rows.filter(row => !row.querySelector('.user-connect-link'));
    const tabs = make('div', 'admin-directory-filters');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Filter displayed accounts');
    const status = make('p', 'admin-directory-status');
    status.setAttribute('role', 'status');
    const empty = make('p', 'admin-filter-empty', 'No accounts in this group. Try another filter.');
    empty.hidden = true;
    table.after(empty, status);
    const options = [
      ['all', 'All users', rows.length],
      ['connected', 'Connected', connected.length],
      ['unlinked', 'Needs a site', rows.length - connected.length],
    ];
    for (const [key, label, count] of options) {
      const button = make('button', 'admin-directory-filter', label);
      button.type = 'button';
      button.dataset.group = key;
      button.setAttribute('aria-pressed', String(key === 'all'));
      button.append(make('span', '', String(count)));
      button.addEventListener('click', () => {
        let visible = 0;
        rows.forEach(row => {
          const linked = !row.querySelector('.user-connect-link');
          row.hidden = key === 'connected' ? !linked : key === 'unlinked' ? linked : false;
          if (!row.hidden) visible++;
        });
        tabs.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        empty.hidden = visible !== 0 || rows.length === 0;
        status.textContent = visible + ' of ' + rows.length + ' matching accounts';
      });
      tabs.append(button);
    }
    const tools = root.querySelector('.admin-tools');
    if (tools) {
      const search = tools.querySelector('input[type="search"]');
      if (search) search.placeholder = 'Search name, email, or client…';
      const submit = tools.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Search';
      tools.before(tabs);
    }
    status.textContent = rows.length + ' matching accounts';
    const resultsTitle = results.querySelector('h2');
    if (resultsTitle) resultsTitle.textContent = 'User directory';
    rows.forEach(row => {
      const cells = row.querySelectorAll('[role="cell"]');
      const identity = cells[0];
      if (identity) {
        const name = identity.querySelector('strong')?.textContent || '';
        const avatar = make('span', 'admin-user-avatar', name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase());
        avatar.setAttribute('aria-hidden', 'true');
        identity.prepend(avatar);
        identity.classList.add('admin-user-identity');
      }
      const client = cells[1];
      if (client) {
        client.classList.add('admin-user-client');
        const badge = make('small', 'admin-connection-state', row.querySelector('.user-connect-link') ? 'Not connected' : 'Connected');
        badge.dataset.connected = String(!row.querySelector('.user-connect-link'));
        if (row.querySelector('.user-connect-link')) client.querySelector(':scope > span')?.remove();
        client.prepend(badge);
      }
      if (cells[2]) cells[2].classList.add('admin-user-joined');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
