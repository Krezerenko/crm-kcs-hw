// Создаёт страницу BookStack при открытии Issue и обновляет её при изменении/закрытии.
// Связь Issue <-> страница: имя страницы начинается с "#<номер Issue> ".
import fs from 'node:fs';
import { marked } from 'marked';

const { BOOKSTACK_URL, BOOKSTACK_API_ID, BOOKSTACK_API_SECRET, BOOKSTACK_BOOK_ID } = process.env;
const { action, issue } = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

const base = BOOKSTACK_URL.replace(/\/+$/, '') + '/api';
const headers = {
  Authorization: `Token ${BOOKSTACK_API_ID}:${BOOKSTACK_API_SECRET}`,
  'Content-Type': 'application/json',
  'bypass-tunnel-reminder': '1', // нужно, если используется localtunnel (loca.lt)
};

async function api(method, path, body) {
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const prefix = `#${issue.number} `;
const status = issue.state === 'closed' ? 'Решено' : 'В работе';

const html =
  `<p><strong>Issue:</strong> <a href="${issue.html_url}">${issue.html_url}</a><br>` +
  `<strong>Статус:</strong> ${status}</p>\n` +
  marked.parse(issue.body || '_Нет описания_');

const page = {
  name: prefix + issue.title,
  html,
  tags: [
    { name: 'github-issue', value: String(issue.number) },
    { name: 'status', value: status },
    ...issue.labels.map((l) => ({ name: 'label', value: l.name })),
  ],
};

// Ищем уже созданную страницу этой Issue в нужной книге
const q = new URLSearchParams({
  'filter[book_id]': BOOKSTACK_BOOK_ID,
  'filter[name:like]': `${prefix}%`,
});
const { data } = await api('GET', `/pages?${q}`);
const existing = data.find((p) => p.name.startsWith(prefix));

if (existing) {
  await api('PUT', `/pages/${existing.id}`, page);
  console.log(`[${action}] Обновлена страница id=${existing.id}: ${page.name}`);
} else {
  const created = await api('POST', '/pages', { book_id: Number(BOOKSTACK_BOOK_ID), ...page });
  console.log(`[${action}] Создана страница id=${created.id}: ${page.name}`);
}
