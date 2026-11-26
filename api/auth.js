const { isConfigured, sbFetch, findOrCreateUser } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase not configured' });
  }
  try {
    const q = req.query || {};
    const username = q.username || (req.body && req.body.username) || '';
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const user = await findOrCreateUser({ username, email: q.email || '', phone: q.phone || '' });
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        balance: Number(user.real_balance),
        real_balance: Number(user.real_balance),
        demo_balance: Number(user.demo_balance),
        sim_access: Boolean(user.sim_access)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
