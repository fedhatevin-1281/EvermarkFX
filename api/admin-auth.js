const { isConfigured, sbFetch } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  try {
    const body = req.body || {};
    const email = (body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Check if the email exists in the admin_users table and is active
    const rows = await sbFetch(
      `admin_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&limit=1`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Access denied. This email is not authorized for admin access.' });
    }

    const admin = rows[0];
    return res.status(200).json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name || admin.email
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
