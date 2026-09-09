/**
 * Searchable Select Component
 * Converts native <select> elements into accessible, searchable dropdowns.
 * Auto-initializes on elements with class 'searchable-select'.
 */
(function () {
  'use strict';

  function initSearchableSelect(select) {
    if (select.dataset.searchableInitialized === 'true') {
      if (select.__searchableSelect) {
        select.__searchableSelect.update();
      }
      return;
    }

    select.dataset.searchableInitialized = 'true';

    // Hide native select from view but keep it for form submission & validation
    select.style.position = 'absolute';
    select.style.opacity = '0';
    select.style.pointerEvents = 'none';
    select.style.width = '1px';
    select.style.height = '1px';
    select.tabIndex = -1;

    // Container
    const container = document.createElement('div');
    container.className = 'searchable-select-container relative w-full inline-block text-left text-sm';

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className =
      'searchable-trigger form-input flex items-center justify-between w-full text-left bg-white cursor-pointer px-3 py-2 rounded-lg border border-navy-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const triggerText = document.createElement('span');
    triggerText.className = 'truncate text-navy-800 font-medium';

    const triggerIcon = document.createElement('span');
    triggerIcon.className = 'ml-2 text-navy-400 pointer-events-none transition-transform duration-150';
    triggerIcon.innerHTML = '<i class="fa-solid fa-chevron-down text-xs"></i>';

    trigger.appendChild(triggerText);
    trigger.appendChild(triggerIcon);

    // Dropdown panel
    const dropdown = document.createElement('div');
    dropdown.className =
      'searchable-dropdown hidden absolute z-50 mt-1 w-full bg-white rounded-lg border border-navy-100 shadow-xl overflow-hidden py-1 transition-all';
    dropdown.style.minWidth = '200px';

    // Search header
    const searchHeader = document.createElement('div');
    searchHeader.className = 'p-2 border-b border-navy-100 bg-navy-50/60 sticky top-0 z-10';

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'relative flex items-center';

    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-magnifying-glass absolute left-2.5 text-xs text-navy-400 pointer-events-none';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className =
      'w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-navy-200 bg-white placeholder-navy-400 text-navy-800 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400';
    searchInput.placeholder = select.dataset.placeholder || 'Type to search...';
    searchInput.autocomplete = 'off';

    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);
    searchHeader.appendChild(searchWrapper);
    dropdown.appendChild(searchHeader);

    // Options list
    const optionsList = document.createElement('ul');
    optionsList.className = 'max-h-60 overflow-y-auto divide-y divide-navy-50 text-sm py-1';
    optionsList.setAttribute('role', 'listbox');
    dropdown.appendChild(optionsList);

    // Empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'hidden py-3 px-4 text-center text-xs text-navy-400';
    emptyState.textContent = 'No matching options found';
    dropdown.appendChild(emptyState);

    // Insert container into DOM
    select.parentNode.insertBefore(container, select);
    container.appendChild(trigger);
    container.appendChild(dropdown);
    container.appendChild(select);

    let isOpen = false;
    let activeIndex = -1;
    let visibleItems = [];

    function updateOptions() {
      optionsList.innerHTML = '';
      const options = Array.from(select.options);

      const selectedOpt = select.options[select.selectedIndex];
      if (selectedOpt && selectedOpt.value !== '') {
        triggerText.textContent = selectedOpt.textContent;
        triggerText.classList.remove('text-navy-400');
        triggerText.classList.add('text-navy-800');
      } else {
        const placeholder = select.getAttribute('placeholder') || (selectedOpt ? selectedOpt.textContent : 'Select an option');
        triggerText.textContent = placeholder;
        triggerText.classList.remove('text-navy-800');
        triggerText.classList.add('text-navy-400');
      }

      options.forEach((opt, idx) => {
        const li = document.createElement('li');
        li.className =
          'searchable-item px-3 py-2 cursor-pointer hover:bg-amber-50 hover:text-navy-900 transition-colors flex items-center justify-between text-navy-700 text-sm';
        li.dataset.value = opt.value;
        li.dataset.text = (opt.textContent || '').trim();
        li.setAttribute('role', 'option');

        if (opt.selected && opt.value !== '') {
          li.classList.add('bg-amber-50/70', 'font-semibold', 'text-amber-900');
          li.innerHTML = `<span>${opt.textContent}</span><i class="fa-solid fa-check text-xs text-amber-600"></i>`;
        } else {
          li.innerHTML = `<span>${opt.textContent}</span>`;
        }

        li.addEventListener('click', () => {
          selectOption(opt.value);
        });

        optionsList.appendChild(li);
      });

      filterOptions('');
    }

    function selectOption(val) {
      select.value = val;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeDropdown();
      updateOptions();
    }

    function filterOptions(query) {
      const q = (query || '').toLowerCase().trim();
      const items = Array.from(optionsList.querySelectorAll('.searchable-item'));
      let matchCount = 0;
      visibleItems = [];

      items.forEach((item) => {
        const text = (item.dataset.text || '').toLowerCase();
        if (!q || text.includes(q)) {
          item.classList.remove('hidden');
          visibleItems.push(item);
          matchCount++;
        } else {
          item.classList.add('hidden');
        }
      });

      if (matchCount === 0) {
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
      }

      activeIndex = -1;
      clearHighlights();
    }

    function clearHighlights() {
      visibleItems.forEach((item) => {
        item.classList.remove('bg-navy-100');
      });
    }

    function highlightItem(index) {
      clearHighlights();
      if (index >= 0 && index < visibleItems.length) {
        visibleItems[index].classList.add('bg-navy-100');
        visibleItems[index].scrollIntoView({ block: 'nearest' });
      }
    }

    function openDropdown() {
      if (select.disabled) return;
      isOpen = true;
      dropdown.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      triggerIcon.classList.add('rotate-180');
      searchInput.value = '';
      filterOptions('');
      setTimeout(() => searchInput.focus(), 50);
    }

    function closeDropdown() {
      if (!isOpen) return;
      isOpen = false;
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      triggerIcon.classList.remove('rotate-180');
      trigger.focus();
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen) closeDropdown();
      else openDropdown();
    });

    searchInput.addEventListener('input', (e) => {
      filterOptions(e.target.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (visibleItems.length > 0) {
          activeIndex = (activeIndex + 1) % visibleItems.length;
          highlightItem(activeIndex);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (visibleItems.length > 0) {
          activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
          highlightItem(activeIndex);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < visibleItems.length) {
          selectOption(visibleItems[activeIndex].dataset.value);
        } else if (visibleItems.length === 1) {
          selectOption(visibleItems[0].dataset.value);
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        closeDropdown();
      }
    });

    // Observe changes to select options
    const observer = new MutationObserver(() => {
      updateOptions();
    });
    observer.observe(select, { childList: true, subtree: true, attributes: true });

    // Initial build
    updateOptions();

    // Store API on element
    select.__searchableSelect = {
      update: updateOptions,
      open: openDropdown,
      close: closeDropdown,
      destroy: () => {
        observer.disconnect();
        container.parentNode.insertBefore(select, container);
        container.remove();
        select.style.position = '';
        select.style.opacity = '';
        select.style.pointerEvents = '';
        select.style.width = '';
        select.style.height = '';
        select.tabIndex = 0;
        delete select.dataset.searchableInitialized;
        delete select.__searchableSelect;
      },
    };
  }

  // Global helper
  window.initSearchableSelect = initSearchableSelect;

  window.initAllSearchableSelects = function (root) {
    const parent = root || document;
    parent.querySelectorAll('select.searchable-select').forEach(initSearchableSelect);
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.initAllSearchableSelects();
  });
})();
