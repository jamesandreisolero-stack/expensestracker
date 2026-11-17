/* SpendWise - expense tracker (frontend only, data kept in localStorage) */
(() => {
  'use strict';

  const EXPENSE_KEY = 'spendwise.expenses';
  const BUDGET_KEY = 'spendwise.budget';
  const CATEGORIES = ['Food', 'Transport', 'School', 'Bills', 'Shopping', 'Health', 'Other'];

  /* ---------- helpers ---------- */
  const peso = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
  const $ = (sel, root = document) => root.querySelector(sel);

  function todayStr() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function prettyDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ---------- storage ---------- */
  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (err) {
      console.warn('Could not read ' + key, err);
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Could not save ' + key, err);
      return false;
    }
  }
  const getExpenses = () => {
    const list = read(EXPENSE_KEY, []);
    return Array.isArray(list) ? list : [];
  };
  const saveExpenses = (list) => write(EXPENSE_KEY, list);
  const getBudget = () => Number(read(BUDGET_KEY, 0)) || 0;
  const saveBudget = (n) => write(BUDGET_KEY, n);

  const byNewest = (a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1);
  const sum = (list) => list.reduce((t, e) => t + e.amount, 0);

  /* ---------- shared form validation feedback ---------- */
  function showFieldMessages(form) {
    form.querySelectorAll('.form-control, .form-select').forEach((field) => {
      const box = field.parentElement.querySelector('.invalid-feedback');
      if (box) box.textContent = field.validationMessage;
    });
  }

  /* ---------- Dashboard ---------- */
  function initDashboard() {
    const monthKey = todayStr().slice(0, 7);
    const render = () => {
      const all = getExpenses();
      const month = all.filter((e) => e.date.startsWith(monthKey));
      const total = sum(month);
      const budget = getBudget();

      $('#monthName').textContent = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      $('#monthTotal').textContent = peso(total);

      // Budget meter
      const amount = $('#meterAmount');
      const bar = $('#meterBar');
      const status = $('#meterStatus');
      amount.className = 'meter-amount';
      bar.className = 'progress-bar';
      if (budget > 0) {
        const pct = Math.min(100, (total / budget) * 100);
        const left = budget - total;
        bar.style.width = pct + '%';
        bar.parentElement.setAttribute('aria-valuenow', Math.round(pct));
        amount.textContent = peso(Math.abs(left));
        if (left < 0) {
          amount.classList.add('is-over'); bar.classList.add('is-over');
          status.textContent = 'over your ' + peso(budget) + ' budget';
        } else if (pct >= 80) {
          amount.classList.add('is-warn'); bar.classList.add('is-warn');
          status.textContent = 'left of ' + peso(budget) + ' (close to the limit)';
        } else {
          status.textContent = 'left of ' + peso(budget);
        }
      } else {
        bar.style.width = '0%';
        bar.parentElement.setAttribute('aria-valuenow', 0);
        amount.textContent = peso(total);
        status.textContent = 'spent this month. Set a budget to track what is left.';
      }

      // Category breakdown
      const totals = {};
      month.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
      const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      $('#categoryList').innerHTML = rows.length
        ? rows.map(([cat, amt]) => `
            <div class="cat-row">
              <div class="d-flex justify-content-between"><span>${esc(cat)}</span><span>${peso(amt)}</span></div>
              <div class="cat-bar" aria-hidden="true"><span style="width:${(amt / total) * 100}%"></span></div>
            </div>`).join('')
        : '<p class="empty mb-0">No spending recorded this month.</p>';

      // Recent expenses
      const recent = [...all].sort(byNewest).slice(0, 5);
      $('#recentList').innerHTML = recent.length
        ? recent.map((e) => `
            <div class="exp-item">
              <div><div>${esc(e.description)}</div><div class="exp-meta">${esc(e.category)} | ${prettyDate(e.date)}</div></div>
              <div class="exp-amount">${peso(e.amount)}</div>
            </div>`).join('')
        : '<p class="empty mb-0">No expenses yet. <a href="pages/add-expense.html">Add your first expense</a>.</p>';
    };

    // Budget form
    const form = $('#budgetForm');
    const input = $('#budgetInput');
    input.value = getBudget() || '';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = parseFloat(input.value);
      input.setCustomValidity(!(value > 0) ? 'Enter a budget greater than 0.' : '');
      showFieldMessages(form);
      form.classList.add('was-validated');
      if (!form.checkValidity()) return;
      saveBudget(value);
      form.classList.remove('was-validated');
      $('#budgetMsg').textContent = 'Budget saved.';
      render();
    });
    input.addEventListener('input', () => input.setCustomValidity(''));

    render();
  }

  /* ---------- Add expense ---------- */
  function initAddExpense() {
    const form = $('#expenseForm');
    const date = $('#date');
    const category = $('#category');
    category.innerHTML = '<option value="">Choose a category</option>' +
      CATEGORIES.map((c) => `<option>${c}</option>`).join('');
    date.value = todayStr();
    date.max = todayStr();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const description = $('#description');
      const amount = $('#amount');

      description.setCustomValidity(description.value.trim() ? '' : 'Enter what you spent on.');
      const value = parseFloat(amount.value);
      amount.setCustomValidity(value > 0 && value <= 1000000 ? '' : 'Enter an amount from 0.01 to 1,000,000.');
      date.setCustomValidity(date.value && date.value > todayStr() ? 'The date cannot be in the future.' : '');
      showFieldMessages(form);
      form.classList.add('was-validated');

      const alertBox = $('#formAlert');
      if (!form.checkValidity()) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Fix the highlighted fields and try again.';
        return;
      }

      const list = getExpenses();
      list.push({
        id: Date.now(),
        description: description.value.trim(),
        amount: Math.round(value * 100) / 100,
        category: category.value,
        date: date.value
      });
      if (!saveExpenses(list)) {
        alertBox.className = 'alert alert-danger';
        alertBox.textContent = 'Could not save. Your browser may be blocking storage.';
        return;
      }
      form.reset();
      form.classList.remove('was-validated');
      date.value = todayStr();
      alertBox.className = 'alert alert-success';
      alertBox.innerHTML = 'Expense added. <a class="alert-link" href="history.html">View history</a>';
      description.focus();
    });

    // Clear custom errors as the user edits
    form.querySelectorAll('input, select').forEach((f) =>
      f.addEventListener('input', () => f.setCustomValidity('')));
  }

  /* ---------- History ---------- */
  function initHistory() {
    const search = $('#search');
    const filter = $('#filterCategory');
    const sort = $('#sortBy');
    const body = $('#expenseRows');
    const count = $('#resultCount');
    let pendingId = null;

    filter.innerHTML = '<option value="">All categories</option>' +
      CATEGORIES.map((c) => `<option>${c}</option>`).join('');

    const modalEl = $('#deleteModal');
    const modal = new bootstrap.Modal(modalEl);

    const render = () => {
      const q = search.value.trim().toLowerCase();
      let list = getExpenses().filter((e) =>
        (!filter.value || e.category === filter.value) &&
        (!q || e.description.toLowerCase().includes(q)));

      const sorters = {
        newest: byNewest,
        oldest: (a, b) => -byNewest(a, b),
        high: (a, b) => b.amount - a.amount,
        low: (a, b) => a.amount - b.amount
      };
      list.sort(sorters[sort.value] || byNewest);

      count.textContent = list.length + (list.length === 1 ? ' expense' : ' expenses') + ' | Total ' + peso(sum(list));
      body.innerHTML = list.length
        ? list.map((e) => `
            <tr>
              <td>${prettyDate(e.date)}</td>
              <td>${esc(e.description)}</td>
              <td>${esc(e.category)}</td>
              <td class="text-end">${peso(e.amount)}</td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" data-id="${e.id}"
                  aria-label="Delete ${esc(e.description)}">Delete</button>
              </td>
            </tr>`).join('')
        : '<tr><td colspan="5" class="empty">No expenses match. Try a different search or filter.</td></tr>';
    };

    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      pendingId = Number(btn.dataset.id);
      modal.show();
    });
    $('#confirmDelete').addEventListener('click', () => {
      saveExpenses(getExpenses().filter((x) => x.id !== pendingId));
      pendingId = null;
      modal.hide();
      render();
    });
    [search, filter, sort].forEach((el) => el.addEventListener('input', render));
    render();
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'dashboard') initDashboard();
    if (page === 'add') initAddExpense();
    if (page === 'history') initHistory();
  });
})();