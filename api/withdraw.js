const { isConfigured, sbFetch, sbRpc } = require('../lib/supabase');
const makamesco = require('../lib/makamesco');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!isConfigured()) return res.status(503).json({ success: false, error: 'Supabase not configured' });

  const { username, amount, phone } = req.body || {};
  const kesAmount = Math.round(Number(amount || 0));
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!username || kesAmount < 1) {
    return res.status(400).json({ success: false, error: 'Valid username and amount required' });
  }

  const refNum = 'WD-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900);

  try {
    const newBalance = await sbRpc('adjust_user_balance', {
      p_username: username,
      p_delta: -kesAmount,
      p_is_demo: false
    });

    await sbFetch('transactions', {
      method: 'POST',
      body: {
        reference: refNum,
        username,
        phone: cleanPhone,
        type: 'withdrawal',
        amount: kesAmount,
        status: 'pending',
        gateway: 'makamescopay',
        note: 'MakamescoPay B2C payout requested'
      }
    });

    try {
      const gw = await makamesco.initiateB2CPayout({
        phoneNumber: cleanPhone,
        amount: kesAmount,
        accountReference: refNum,
        transactionDesc: `EvermarkFX Withdrawal (${username})`
      });
      await sbFetch(`transactions?reference=eq.${encodeURIComponent(refNum)}`, {
        method: 'PATCH',
        body: {
          status: 'completed',
          gateway_ref: gw.transactionId || gw.reference || refNum,
          note: 'MakamescoPay B2C payout dispatched',
          updated_at: new Date().toISOString()
        }
      });
      return res.status(200).json({ success: true, refNum, newBalance: Number(newBalance) });
    } catch (gwErr) {
      // Refund user balance if B2C payout fails immediately and mark failed in ledger
      const refundedBalance = await sbRpc('adjust_user_balance', {
        p_username: username,
        p_delta: kesAmount,
        p_is_demo: false
      });
      await sbFetch(`transactions?reference=eq.${encodeURIComponent(refNum)}`, {
        method: 'PATCH',
        body: {
          status: 'failed',
          note: `MakamescoPay B2C failed (balance refunded): ${gwErr.message}`,
          updated_at: new Date().toISOString()
        }
      });
      return res.status(502).json({
        success: false,
        error: gwErr.message,
        newBalance: Number(refundedBalance)
      });
    }
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};
