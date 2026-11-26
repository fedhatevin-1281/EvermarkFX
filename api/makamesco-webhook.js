const { isConfigured, sbFetch, sbRpc } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    const payload = req.body || {};
    const ref = payload.accountReference || payload.reference || payload.checkoutRequestId || payload.CheckoutRequestID || '';
    const statusRaw = String(payload.status || payload.ResultDesc || '').toLowerCase();
    const isSuccess = payload.success === true || payload.ResultCode === 0 || ['completed', 'success', 'successful', 'paid'].includes(statusRaw);
    const gatewayRef = payload.mpesaReceiptNumber || payload.MpesaReceiptNumber || payload.transactionId || null;

    if (!ref) return res.status(400).json({ error: 'Missing reference in webhook payload' });

    if (isSuccess) {
      const result = await sbRpc('complete_makamesco_deposit', {
        p_reference: ref,
        p_gateway_ref: gatewayRef
      });
      return res.status(200).json({ received: true, completed: true, result });
    }

    await sbFetch(`transactions?or=(reference.eq.${encodeURIComponent(ref)},checkout_request_id.eq.${encodeURIComponent(ref)})`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        note: `MakamescoPay callback failed: ${payload.message || payload.ResultDesc || 'Declined/Timeout'}`,
        updated_at: new Date().toISOString()
      }
    });
    return res.status(200).json({ received: true, completed: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
