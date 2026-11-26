const { isConfigured, sbFetch, findOrCreateUser } = require('../lib/supabase');
const makamesco = require('../lib/makamesco');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { username, phone, amount } = req.body || {};
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  const kesAmount = Math.round(Number(amount || 0));

  if (!username || !/^254[71]\d{8}$/.test(cleanPhone) || kesAmount < 300) {
    return res.status(400).json({ success: false, error: 'Valid username, 2547XXXXXXXX phone, and minimum deposit of KES 300 are required' });
  }

  const reference = 'MK-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);

  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Supabase is not configured yet' });
  }

  try {
    const user = await findOrCreateUser({ username, phone: cleanPhone });
    await sbFetch('transactions', {
      method: 'POST',
      body: {
        reference,
        user_id: user.id,
        username: user.username,
        phone: cleanPhone,
        type: 'deposit',
        amount: kesAmount,
        status: 'pending',
        gateway: 'makamescopay',
        note: 'MakamescoPay STK Push initiated'
      }
    });

    try {
      const gw = await makamesco.initiateStkPush({
        phoneNumber: cleanPhone,
        amount: kesAmount,
        accountReference: reference,
        transactionDesc: `EvermarkFX Deposit (${user.username})`
      });

      const checkoutRequestId = gw.checkoutRequestId || gw.CheckoutRequestID || gw.transactionId || gw.reference || reference;
      await sbFetch(`transactions?reference=eq.${encodeURIComponent(reference)}`, {
        method: 'PATCH',
        body: { checkout_request_id: checkoutRequestId, updated_at: new Date().toISOString() }
      });

      return res.status(200).json({
        success: true,
        reference,
        checkoutRequestId,
        gateway: 'makamescopay'
      });
    } catch (gwErr) {
      // Mark failed in Supabase so admin can manually credit from Admin Portal
      await sbFetch(`transactions?reference=eq.${encodeURIComponent(reference)}`, {
        method: 'PATCH',
        body: {
          status: 'failed',
          note: `MakamescoPay error: ${gwErr.message}`,
          updated_at: new Date().toISOString()
        }
      });
      return res.status(502).json({
        success: false,
        reference,
        error: gwErr.message
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
