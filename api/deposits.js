const { isConfigured, sbFetch } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase not configured' });
  }
  try {
    const q = req.query || {};
    const ref = q.reference || q.checkoutRequestId || '';
    if (!ref) return res.status(400).json({ success: false, error: 'reference required' });

    const rows = await sbFetch(
      `transactions?or=(reference.eq.${encodeURIComponent(ref)},checkout_request_id.eq.${encodeURIComponent(ref)})&limit=1`
    );
    const tx = Array.isArray(rows) ? rows[0] : null;
    if (!tx) return res.status(404).json({ success: false, status: 'not_found' });

    let balance = null;
    if (tx.status === 'completed' || tx.status === 'manual_credit') {
      const users = await sbFetch(`users?username=ilike.${encodeURIComponent(tx.username)}&limit=1`);
      if (Array.isArray(users) && users[0]) balance = Number(users[0].real_balance);
    }

    return res.status(200).json({
      success: true,
      reference: tx.reference,
      status: tx.status === 'manual_credit' ? 'completed' : tx.status,
      balance
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
