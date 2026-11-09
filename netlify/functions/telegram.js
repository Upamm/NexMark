// Telegram → Supabase comment counter. Set as the bot webhook (see README).
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID } = process.env;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const ok = { statusCode: 200, body: 'ok' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return ok;
  if (event.headers['x-telegram-bot-api-secret-token'] !== TELEGRAM_WEBHOOK_SECRET) return { statusCode: 401, body: 'unauthorized' };

  const m = JSON.parse(event.body || '{}').message;
  if (!m || !m.from || m.from.is_bot) return ok;
  if (!['group', 'supergroup'].includes(m.chat.type)) return ok;
  if (TELEGRAM_CHAT_ID && String(m.chat.id) !== String(TELEGRAM_CHAT_ID)) return ok;
  const text = m.text || m.caption || '';
  if (!text || text.startsWith('/')) return ok;

  const tgId = Number(m.from.id);
  const uname = (m.from.username || '').toLowerCase();
  const get = async (q) => (await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,telegram_id&status=eq.approved&${q}&limit=1`, { headers: H })).json();

  let rows = await get(`telegram_id=eq.${tgId}`);
  if (!rows.length && /^[a-z0-9_]{3,64}$/.test(uname)) {
    rows = await get(`telegram_username=eq.${uname}`);
    if (rows.length && !rows[0].telegram_id) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${rows[0].id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ telegram_id: tgId }) });
    }
  }
  if (!rows.length) return ok; // not a registered team member

  const day = new Date(m.date * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  await fetch(`${SUPABASE_URL}/rest/v1/comments_log?on_conflict=chat_id,message_id`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: rows[0].id, telegram_user_id: tgId, chat_id: m.chat.id, message_id: m.message_id, day })
  });
  return ok;
};
