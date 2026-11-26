const { isConfigured, sbFetch, sbRpc, findOrCreateUser } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Supabase not configured' });

  const body = req.body || {};
  const { action, username, stake, is_demo, is_simulated, trade_type, entry_rate, exit_rate, payout, won, trade_id } = body;
  if (!username || !trade_id) return res.status(400).json({ success: false, error: 'username and trade_id required' });

  try {
    const user = await findOrCreateUser({ username });
    const isDemo = Boolean(is_demo);

    if (action === 'place') {
      const s = Number(stake || 0);
      const newBalance = await sbRpc('adjust_user_balance', {
        p_username: user.username,
        p_delta: -s,
        p_is_demo: isDemo
      });
      await sbFetch('trades', {
        method: 'POST',
        body: {
          trade_id,
          user_id: user.id,
          username: user.username,
          is_demo: isDemo,
          is_simulated: Boolean(is_simulated),
          trade_type: trade_type === 'sell' ? 'sell' : 'buy',
          stake: s,
          entry_rate: Number(entry_rate || 0),
          status: 'open'
        }
      });
      return res.status(200).json({ success: true, new_balance: Number(newBalance) });
    }

    if (action === 'settle' || action === 'resolve') {
      const p = Number(payout || 0);
      let newBalance = isDemo ? Number(user.demo_balance) : Number(user.real_balance);
      if (won && p > 0) {
        newBalance = await sbRpc('adjust_user_balance', {
          p_username: user.username,
          p_delta: p,
          p_is_demo: isDemo
        });
      }
      await sbFetch(`trades?trade_id=eq.${encodeURIComponent(trade_id)}`, {
        method: 'PATCH',
        body: {
          exit_rate: exit_rate !== undefined ? Number(exit_rate) : null,
          payout: p,
          won: Boolean(won),
          status: 'settled',
          settled_at: new Date().toISOString()
        }
      });
      return res.status(200).json({ success: true, new_balance: Number(newBalance) });
    }

    return res.status(400).json({ success: false, error: 'Unknown trade action' });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};
