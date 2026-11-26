const { isConfigured, sbFetch } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(200).json({
      source: 'defaults',
      target_win_rate: 45,
      demo_win_rate: 100,
      sim_win_rate: 80,
      force_outcome: 'auto',
      force_win_rate: 85,
      force_loss_rate: 85,
      min_stake: 10,
      max_stake: 50000,
      min_deposit: 300,
      min_withdrawal: 100,
      usd_rate: 129,
      user_outcomes: {}
    });
  }

  try {
    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = req.body || {};
      await sbFetch('platform_settings?id=eq.1', {
        method: 'PATCH',
        body: {
          ...(body.win_rate !== undefined ? { win_rate: Number(body.win_rate) } : {}),
          ...(body.demo_win_rate !== undefined ? { demo_win_rate: Number(body.demo_win_rate) } : {}),
          ...(body.force_outcome !== undefined ? { force_outcome: String(body.force_outcome) } : {}),
          updated_at: new Date().toISOString()
        }
      });
    }

    const [rows, outcomes] = await Promise.all([
      sbFetch('platform_settings?id=eq.1&limit=1'),
      sbFetch('user_outcomes?select=identifier,rule')
    ]);
    const cfg = (Array.isArray(rows) && rows[0]) || {};
    const user_outcomes = {};
    if (Array.isArray(outcomes)) {
      outcomes.forEach(o => { user_outcomes[o.identifier] = o.rule; });
    }

    return res.status(200).json({
      source: 'supabase',
      target_win_rate: Number(cfg.win_rate ?? 45),
      demo_win_rate: Number(cfg.demo_win_rate ?? 100),
      sim_win_rate: Number(cfg.sim_win_rate ?? 80),
      force_outcome: cfg.force_outcome || 'auto',
      force_win_rate: Number(cfg.force_win_rate ?? 85),
      force_loss_rate: Number(cfg.force_loss_rate ?? 85),
      min_stake: Number(cfg.min_stake ?? 10),
      max_stake: Number(cfg.max_stake ?? 50000),
      min_deposit: Number(cfg.min_deposit ?? 300),
      min_withdrawal: Number(cfg.min_withdrawal ?? 100),
      usd_rate: Number(cfg.usd_rate ?? 129),
      user_outcomes
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
