const { isConfigured, sbFetch, sbRpc } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(200).json({ connected: false, error: 'Supabase not configured' });
  }

  try {
    if (req.method === 'GET') {
      const [users, ledger, audit] = await Promise.all([
        sbFetch('users?order=created_at.desc&limit=500'),
        sbFetch('transactions?order=created_at.desc&limit=300'),
        sbFetch('admin_audit_log?order=created_at.desc&limit=200')
      ]);
      return res.status(200).json({
        connected: true,
        users: (users || []).map(u => ({
          id: u.id,
          username: u.username,
          email: u.email || '',
          phone: u.phone || '',
          realBalance: Number(u.real_balance || 0),
          demoBalance: Number(u.demo_balance || 0),
          simAccess: Boolean(u.sim_access)
        })),
        ledger: (ledger || []).map(t => ({
          id: t.id,
          ref: t.reference,
          username: t.username,
          type: t.type,
          amount: Number(t.amount || 0),
          status: t.status,
          note: t.note || '',
          createdAt: t.created_at
        })),
        audit: (audit || []).map(a => ({
          ts: a.created_at,
          action: a.action,
          username: a.target_username,
          change: a.amount_or_change,
          note: a.note || ''
        }))
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { action } = body;

      if (action === 'manual_adjust') {
        const { username, type, amount, reason, ref, note } = body;
        const amt = Number(amount || 0);
        if (!username || amt <= 0) return res.status(400).json({ success: false, error: 'Invalid user or amount' });
        const delta = type === 'debit' ? -amt : amt;
        const newBal = await sbRpc('adjust_user_balance', { p_username: username, p_delta: delta, p_is_demo: false });
        const reference = ref || ('ADM-' + Date.now().toString().slice(-6));
        const status = type === 'debit' ? 'manual_debit' : 'manual_credit';

        await sbFetch('transactions', {
          method: 'POST',
          body: {
            reference,
            username,
            type: status,
            amount: amt,
            status,
            gateway: 'admin',
            note: note ? `${reason}: ${note}` : reason
          }
        });
        await sbFetch('admin_audit_log', {
          method: 'POST',
          body: {
            action: type === 'debit' ? 'Manual Debit' : 'Manual Credit',
            target_username: username,
            amount_or_change: `${type === 'debit' ? '-' : '+'}KES ${amt.toFixed(2)}`,
            note: `${reason} (${reference})`
          }
        });
        return res.status(200).json({ success: true, newBalance: Number(newBal) });
      }

      if (action === 'credit_failed') {
        const { txId } = body;
        const rows = await sbFetch(`transactions?id=eq.${encodeURIComponent(txId)}&limit=1`);
        const tx = Array.isArray(rows) ? rows[0] : null;
        if (!tx || tx.status !== 'failed') return res.status(404).json({ success: false, error: 'Failed transaction not found' });

        const newBal = await sbRpc('adjust_user_balance', { p_username: tx.username, p_delta: Number(tx.amount), p_is_demo: false });
        await sbFetch(`transactions?id=eq.${encodeURIComponent(txId)}`, {
          method: 'PATCH',
          body: {
            status: 'manual_credit',
            note: `${tx.note || ''} → Credited manually by admin`,
            updated_at: new Date().toISOString()
          }
        });
        await sbFetch('admin_audit_log', {
          method: 'POST',
          body: {
            action: 'Manual Gateway Recovery',
            target_username: tx.username,
            amount_or_change: `+KES ${Number(tx.amount).toFixed(2)}`,
            note: `Ref: ${tx.reference}`
          }
        });
        return res.status(200).json({ success: true, newBalance: Number(newBal) });
      }

      if (action === 'toggle_sim_access') {
        const { username, simAccess } = body;
        await sbFetch(`users?username=ilike.${encodeURIComponent(username)}`, {
          method: 'PATCH',
          body: { sim_access: Boolean(simAccess), updated_at: new Date().toISOString() }
        });
        await sbFetch('admin_audit_log', {
          method: 'POST',
          body: {
            action: '/simuted Access',
            target_username: username,
            amount_or_change: simAccess ? 'Granted' : 'Revoked',
            note: '80% win-rate simulation engine'
          }
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'add_user') {
        const { username, phone, email } = body;
        if (!username) return res.status(400).json({ success: false, error: 'username required' });
        await sbFetch('users', {
          method: 'POST',
          body: { username: username.trim(), phone: phone || null, email: email || null }
        });
        await sbFetch('admin_audit_log', {
          method: 'POST',
          body: {
            action: 'Trader Added',
            target_username: username.trim(),
            amount_or_change: 'KES 0.00',
            note: 'Created in admin portal'
          }
        });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'Unknown admin action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
